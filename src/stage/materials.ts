// 工笔图解风格的材质：克制的自然色 + 细墨线；全场只有一个强调色（朱砂）。
import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  DoubleSide,
  DecrementWrapStencilOp,
  FrontSide,
  IncrementWrapStencilOp,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  type Material,
  type Plane,
} from 'three'
import type { MaterialKey } from '../exhibit/types'

export const ACCENT = '#c8402a' // 朱砂

export const PALETTE: Record<MaterialKey, { color: string; roughness: number; metalness: number }> = {
  'wood-light': { color: '#d2ad78', roughness: 0.85, metalness: 0 },
  'wood-dark': { color: '#9a6a40', roughness: 0.85, metalness: 0 },
  'wood-end': { color: '#6f4a2c', roughness: 0.8, metalness: 0 },
  stone: { color: '#b3aea3', roughness: 0.95, metalness: 0 },
  'stone-dark': { color: '#8f8a80', roughness: 0.95, metalness: 0 },
  iron: { color: '#55565c', roughness: 0.55, metalness: 0.35 },
  brass: { color: '#b8913f', roughness: 0.45, metalness: 0.5 },
  rope: { color: '#b49a6c', roughness: 0.95, metalness: 0 },
  grain: { color: '#d9a441', roughness: 0.7, metalness: 0 },
  flour: { color: '#efe6d0', roughness: 1, metalness: 0 },
  water: { color: '#7ea6b8', roughness: 0.3, metalness: 0 },
  steel: { color: '#8b8f96', roughness: 0.4, metalness: 0.55 },
  hide: { color: '#e3d3b0', roughness: 0.9, metalness: 0 },
  cloth: { color: '#c9bb9a', roughness: 1, metalness: 0 },
  earth: { color: '#b8a888', roughness: 1, metalness: 0 },
  lacquer: { color: '#3a2e2a', roughness: 0.35, metalness: 0.05 },
  dial: { color: '#f1ece0', roughness: 0.8, metalness: 0 },
}

/** 让开（半透明）的零件：表面与棱线一起淡下去。棱线不透明度与表面同量级，免得「实线框架套着空壳」盖在要看的零件上 */
export const FADED_SURFACE = 0.07
export const FADED_LINE = 0.13

export type Variant = 'normal' | 'accent' | 'faded'

export interface SceneTheme {
  ink: string
  fadedInk: string
}

export const THEMES: Record<'light' | 'dark', SceneTheme> = {
  light: { ink: '#2b2622', fadedInk: '#b9b2a6' },
  dark: { ink: '#14110f', fadedInk: '#5d574f' },
}

/** 一个展台用一套材质库；剖切开关时统一改 clippingPlanes。 */
export class MaterialLibrary {
  private surfaces = new Map<string, MeshStandardMaterial>()
  private caps = new Map<string, MeshBasicMaterial>()
  private lines = new Map<string, LineBasicMaterial>()
  readonly stencilBack: MeshBasicMaterial
  readonly stencilFront: MeshBasicMaterial
  private clip: Plane[] = []

  constructor(private theme: SceneTheme) {
    const mk = (side: typeof FrontSide | typeof BackSide, op: typeof IncrementWrapStencilOp | typeof DecrementWrapStencilOp) =>
      new MeshBasicMaterial({
        side,
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        stencilWrite: true,
        stencilFunc: AlwaysStencilFunc,
        stencilFail: op,
        stencilZFail: op,
        stencilZPass: op,
      })
    this.stencilBack = mk(BackSide, IncrementWrapStencilOp)
    this.stencilFront = mk(FrontSide, DecrementWrapStencilOp)
  }

  surface(key: MaterialKey, v: Variant): MeshStandardMaterial {
    const id = `${key}:${v}`
    let m = this.surfaces.get(id)
    if (!m) {
      const p = PALETTE[key]
      const color = new Color(p.color)
      if (v === 'accent') color.lerp(new Color(ACCENT), 0.72)
      m = new MeshStandardMaterial({
        color,
        roughness: p.roughness,
        metalness: p.metalness,
        transparent: v === 'faded',
        opacity: v === 'faded' ? FADED_SURFACE : 1,
        depthWrite: v !== 'faded',
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
      if (v === 'accent') m.emissive = new Color(ACCENT).multiplyScalar(0.12)
      m.clippingPlanes = this.clip
      this.surfaces.set(id, m)
    }
    return m
  }

  /** 截面颜色：比表面略深，选中时用强调色 */
  cap(key: MaterialKey, accent: boolean): MeshBasicMaterial {
    const id = `${key}:${accent}`
    let m = this.caps.get(id)
    if (!m) {
      const color = new Color(PALETTE[key].color).multiplyScalar(0.78)
      if (accent) color.lerp(new Color(ACCENT), 0.7)
      m = new MeshBasicMaterial({
        color,
        side: DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: NotEqualStencilFunc,
        stencilFail: ReplaceStencilOp,
        stencilZFail: ReplaceStencilOp,
        stencilZPass: ReplaceStencilOp,
      })
      // 剖面线：屏幕空间 45° 细斜线，像工程图的剖面填充
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n  if (mod(gl_FragCoord.x + gl_FragCoord.y, 7.0) < 1.4) gl_FragColor.rgb *= 0.55;',
        )
      }
      m.customProgramCacheKey = () => 'jiqiao-cap-hatch'
      this.caps.set(id, m)
    }
    return m
  }

  line(v: Variant | 'hover'): LineBasicMaterial {
    let m = this.lines.get(v)
    if (!m) {
      const color = v === 'accent' || v === 'hover' ? ACCENT : v === 'faded' ? this.theme.fadedInk : this.theme.ink
      m = new LineBasicMaterial({
        color,
        transparent: v === 'faded',
        opacity: v === 'faded' ? FADED_LINE : v === 'normal' ? 0.75 : 1,
        depthWrite: v !== 'faded',
      })
      m.clippingPlanes = this.clip
      this.lines.set(v, m)
    }
    return m
  }

  /** 开关剖切：所有表面、墨线与模板材质共享同一组裁切平面 */
  setClipping(plane: Plane | null) {
    this.clip = plane ? [plane] : []
    const all: Material[] = [...this.surfaces.values(), ...this.lines.values(), this.stencilBack, this.stencilFront]
    for (const m of all) {
      m.clippingPlanes = this.clip
      m.needsUpdate = true
    }
  }

  get clipping(): Plane[] {
    return this.clip
  }

  dispose() {
    for (const m of [...this.surfaces.values(), ...this.caps.values(), ...this.lines.values(), this.stencilBack, this.stencilFront]) m.dispose()
  }
}
