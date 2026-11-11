// 石件：磨扇（含磨齿沟槽、磨眼、磨脐孔、磨膛）、承粉槽（磨盘）。
//
// 平面坐标约定：(u, v) = (x, −z)，即从上往下看时逆时针为正，与绕 +Y 的转角一致。
// 磨齿图案 groovePattern 是纯函数（不需要内核），几何与「磨齿外赶」的计算测试共用它。
import type { Kernel, Region, Solid } from '../kernel'
import { TAU, v2, type Vec2 } from '../kinematics/vec'

export interface GroovePattern {
  /** 分区数（如八区） */
  zones: number
  /** 沟槽起始半径（中心留给磨脐/磨膛） */
  rIn: number
  /** 沟槽外缘半径（≥ 磨扇半径时沟槽通到边缘） */
  rOut: number
  /** 同区相邻沟槽的间距 */
  pitch: number
  /** 沟宽 */
  width: number
  /** 沟深 */
  depth: number
  /** 斜度：沟槽方向相对本区中线（径向）逆时针偏转的角度（rad）。须 > π/zones 的一半以上才能全区外赶 */
  slant: number
}

export interface GrooveLine {
  zone: number
  /** 直线上离原点最近的点（平面坐标） */
  point: Vec2
  /** 单位方向（指向外） */
  dir: Vec2
}

/** 区 k 的中线角。 */
export function zoneAngle(p: GroovePattern, k: number): number {
  return ((k + 0.5) * TAU) / p.zones
}

/**
 * 磨齿沟槽中心线（从磨面正对着看）。每区一组平行直线，方向 = 区中线逆时针偏 slant。
 * mirrored = true 给翻过来朝下的上扇用：从上往下看，它的图案是镜像（v → −v）。
 */
export function grooveLines(p: GroovePattern, mirrored = false): GrooveLine[] {
  const out: GrooveLine[] = []
  const half = Math.PI / p.zones
  for (let k = 0; k < p.zones; k++) {
    const a = zoneAngle(p, k)
    const dir = v2.polar(1, a + p.slant)
    const nrm: Vec2 = [-dir[1], dir[0]]
    // 本区扇环上各点在法向上的投影范围
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i <= 16; i++) {
      const ang = a - half + (2 * half * i) / 16
      for (const r of [p.rIn, p.rOut]) {
        const d = v2.dot(v2.polar(r, ang), nrm)
        lo = Math.min(lo, d)
        hi = Math.max(hi, d)
      }
    }
    for (let j = Math.ceil(lo / p.pitch); j * p.pitch <= hi; j++) {
      const c = j * p.pitch
      if (c - lo < p.width / 2 || hi - c < p.width / 2) continue
      const point = v2.scale(nrm, c)
      out.push(mirrored ? { zone: k, point: [point[0], -point[1]], dir: [dir[0], -dir[1]] } : { zone: k, point, dir })
    }
  }
  return out
}

/** 直线是否穿过某区扇环（用于判断两条沟是否在同一处交叉）。 */
export function lineCross(a: GrooveLine, b: GrooveLine): Vec2 | null {
  const den = v2.cross(a.dir, b.dir)
  if (Math.abs(den) < 1e-12) return null
  const t = v2.cross(v2.sub(b.point, a.point), b.dir) / den
  return v2.add(a.point, v2.scale(a.dir, t))
}

function sector(k: Kernel, center: number, half: number, rIn: number, rOut: number, seg = 24): Region {
  const pts: Vec2[] = []
  for (let i = 0; i <= seg; i++) pts.push(v2.polar(rOut, center - half + (2 * half * i) / seg))
  for (let i = seg; i >= 0; i--) pts.push(v2.polar(rIn, center - half + (2 * half * i) / seg))
  return k.polygon(pts)
}

/** 沟槽的平面区域（平面坐标 (u, v)）。 */
export function grooveRegion(k: Kernel, p: GroovePattern, mirrored = false): Region {
  const lines = grooveLines(p, mirrored)
  const zones: Region[] = []
  for (let z = 0; z < p.zones; z++) {
    const strips = lines
      .filter((l) => l.zone === z)
      .map((l) => k.rect(p.width, 4 * p.rOut).rotate(v2.angle(l.dir) - Math.PI / 2).translate(l.point))
    if (strips.length === 0) continue
    const a = zoneAngle(p, z)
    const sec = sector(k, mirrored ? -a : a, Math.PI / p.zones, p.rIn, p.rOut)
    zones.push(k.regionUnion(strips).intersect(sec))
  }
  return k.regionUnion(zones)
}

/** 平面坐标 (u, v) 的区域 → 适合 extrude(axis 'y') 的截面坐标 (z, x) = (−v, u)：逆时针转 90°。 */
export function planToYSection(r: Region): Region {
  return r.rotate(Math.PI / 2)
}

export interface MillstoneOpts {
  radius: number
  thickness: number
  /** 磨面（刻磨齿的一面）：下扇朝上 'top'，上扇朝下 'bottom' */
  face: 'top' | 'bottom'
  pattern?: GroovePattern
  chamfer?: number
  /** 中心孔：下扇装磨脐的孔、上扇套磨脐的盲孔（从磨面起算深度） */
  centerHole?: { r: number; depth: number }
  /** 磨眼：贯穿的进料孔，位置为平面坐标 */
  eye?: { r: number; at: Vec2 }
  /** 磨膛：磨面中心的浅锥形空腔，粮食先落到这里 */
  hollow?: { r: number; depth: number }
  /** 顶面浅盘：上扇顶面的凹槽，盛放待磨的粮食 */
  dish?: { r: number; depth: number }
  segments?: number
}

/** 磨扇：局部坐标底面 y = 0、顶面 y = thickness，轴心为 Y 轴。 */
export function millstone(k: Kernel, o: MillstoneOpts): Solid {
  const R = o.radius
  const T = o.thickness
  const c = o.chamfer ?? 6
  const seg = o.segments ?? 128
  let s = k.revolve(
    [
      [0, 0],
      [R - c, 0],
      [R, c],
      [R, T - c],
      [R - c, T],
      [0, T],
    ],
    seg,
  )
  const faceY = o.face === 'top' ? T : 0
  const into = o.face === 'top' ? -1 : 1 // 从磨面指向石内的方向
  const cutters: Solid[] = []
  if (o.pattern) {
    const p = o.pattern
    const region = planToYSection(grooveRegion(k, p, o.face === 'bottom'))
    const slab = region.extrude(p.depth + 1, 'y')
    // slab 占 y ∈ [0, depth+1]；放到磨面，伸出面外 1 mm
    cutters.push(o.face === 'top' ? slab.translate([0, T - p.depth, 0]) : slab.translate([0, -1, 0]))
  }
  if (o.hollow) {
    const { r, depth } = o.hollow
    const cone = k.revolve(
      [
        [0, -1],
        [r, -1],
        [r, 0],
        [0, depth],
      ],
      seg / 2,
    )
    cutters.push(o.face === 'top' ? cone.mirror([0, 1, 0]).translate([0, T, 0]) : cone)
  }
  if (o.centerHole) {
    const { r, depth } = o.centerHole
    const h = depth + 1
    cutters.push(k.cylinder({ r, h, center: false, segments: 32 }).translate([0, into > 0 ? faceY - 1 : faceY - depth, 0]))
  }
  if (o.eye) {
    const [u, v] = o.eye.at
    cutters.push(k.cylinder({ r: o.eye.r, h: T + 2, center: false, segments: 32 }).translate([u, -1, -v]))
  }
  if (o.dish) {
    const { r, depth } = o.dish
    const topY = o.face === 'top' ? T : T
    cutters.push(
      k
        .revolve(
          [
            [0, -depth],
            [r - depth, -depth],
            [r, 0],
            [r, 1],
            [0, 1],
          ],
          seg,
        )
        .translate([0, topY, 0]),
    )
  }
  if (cutters.length) s = s.subtract(...cutters)
  return s
}

export interface TroughOpts {
  /** 外半径 */
  r: number
  /** 边沿厚 */
  rim: number
  /** 底板厚 */
  floor: number
  /** 总高 */
  height: number
  segments?: number
}

/** 承粉槽（圆盘形，带一圈边沿）：底面 y = 0，底板上表面 y = floor。 */
export function trough(k: Kernel, o: TroughOpts): Solid {
  const ri = o.r - o.rim
  const ch = Math.min(4, o.rim / 4)
  return k.revolve(
    [
      [0, 0],
      [o.r - ch, 0],
      [o.r, ch],
      [o.r, o.height - ch],
      [o.r - ch, o.height],
      [ri + ch, o.height],
      [ri, o.height - ch],
      [ri, o.floor],
      [0, o.floor],
    ],
    o.segments ?? 128,
  )
}
