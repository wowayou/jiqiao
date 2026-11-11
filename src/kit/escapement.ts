// 锚形擒纵零件 → Solid：擒纵轮、叉瓦、擒纵叉（叉身）。几何来自 kinematics/escapement.ts 的同一份轮廓，
// 所以求解器算出的接触就是画面里的接触。轴沿局部 Z，截面在 (x, y)。须在 kernel.scope 内调用。
//
// mirror = true：沿 x 镜像（顺时针转的擒纵轮，如直接带秒针的轮）。此时世界转角取 −ψ（轮）、−φ（叉）。
import type { Kernel, Region, Solid } from '../kernel'
import { mirrorOutlineX, outlinePolygon, type GrahamGeometry, type Outline } from '../kinematics/escapement'
import { v2, type Vec2 } from '../kinematics/vec'
import { crossingWindows, type CrossingOpts } from './involuteGear'

const maybeMirror = (s: Solid, mirror?: boolean) => (mirror ? s.mirror([1, 0, 0]) : s)

export interface EscapeWheelOpts {
  thickness: number
  z0?: number
  bore?: number
  crossing?: CrossingOpts
  mirror?: boolean
}

/** 擒纵轮：轮辋（齿根圆）+ 全部齿，局部原点在轮心。 */
export function escapeWheel(k: Kernel, g: GrahamGeometry, o: EscapeWheelOpts): Solid {
  const teeth: Region[] = []
  for (let j = 0; j < g.teeth; j++) teeth.push(k.polygon(g.tooth).rotate(j * g.pitch))
  let region = k.regionUnion([k.circle(g.rootR, 120), ...teeth])
  if (o.crossing) {
    const win = crossingWindows(k, g.rootR - o.crossing.rim, o.crossing)
    if (win) region = region.subtract(win)
  }
  if (o.bore) region = region.subtract(k.circle(o.bore, 32))
  return maybeMirror(region.extrude(o.thickness, 'z').translate([0, 0, o.z0 ?? 0]), o.mirror)
}

export interface PalletOpts {
  thickness: number
  z0?: number
  mirror?: boolean
}

/** 叉瓦：局部原点在擒纵叉支点（叉角 0 时的位置）。which: 0 = 入瓦，1 = 出瓦。 */
export function pallet(k: Kernel, g: GrahamGeometry, which: 0 | 1, o: PalletOpts): Solid {
  const outline: Outline = g.pallets[which]
  const poly = outlinePolygon(outline, 0.004)
  return maybeMirror(k.polygon(poly).extrude(o.thickness, 'z').translate([0, 0, o.z0 ?? 0]), o.mirror)
}

export interface AnchorOpts {
  thickness: number
  z0?: number
  /** 叉身中心的轮毂半径 */
  hubR: number
  /** 叉臂宽 */
  armWidth: number
  /** 轴孔半径（0 = 实心） */
  bore?: number
  mirror?: boolean
}

/** 叉瓦在叉臂一端的连接边（叉的局部坐标）：取轮廓里离支点最远、标为 body 的径向边。 */
function palletRoot(outline: Outline): [Vec2, Vec2] {
  let best: [Vec2, Vec2] | null = null
  let bestR = -1
  for (const e of outline.edges) {
    if (e.kind !== 'seg' || e.tag !== 'body') continue
    const ang = Math.abs(Math.atan2(e.a[1], e.a[0]) - Math.atan2(e.b[1], e.b[0]))
    if (ang > 1e-6) continue // 只要径向边
    const r = Math.max(v2.len(e.a), v2.len(e.b))
    if (r > bestR) {
      bestR = r
      best = [e.a, e.b]
    }
  }
  if (!best) throw new Error('叉瓦轮廓里找不到连接边')
  return best
}

/** 擒纵叉叉身：轮毂 + 两条叉臂，叉臂末端正好接在两块叉瓦的尾端。局部原点在支点。 */
export function anchorBody(k: Kernel, g: GrahamGeometry, o: AnchorOpts): Solid {
  const parts: Region[] = [k.circle(o.hubR, 48)]
  for (const outline of g.pallets) {
    const [a, b] = palletRoot(outline)
    const tailAng = Math.atan2(a[1], a[0])
    const work = outline.edges.find((e) => e.tag === 'impulse')!
    const workAng = work.kind === 'seg' ? Math.atan2(work.a[1] + work.b[1], work.a[0] + work.b[0]) : tailAng
    const sgn = Math.sign(Math.atan2(Math.sin(tailAng - workAng), Math.cos(tailAng - workAng)))
    // 1) 叉瓦尾端沿同一圆弧带再延伸一段（叉臂下端），2) 一条直臂从轮毂连到这段圆弧带的末端
    const r0 = Math.min(v2.len(a), v2.len(b))
    const r1 = Math.max(v2.len(a), v2.len(b))
    const ext = (sgn * o.armWidth * 1.6) / r1
    const band: Vec2[] = []
    const n = 12
    for (let i = 0; i <= n; i++) band.push(v2.polar(r1, tailAng + (ext * i) / n))
    for (let i = n; i >= 0; i--) band.push(v2.polar(r0, tailAng + (ext * i) / n))
    parts.push(k.polygon(band))
    const endMid = v2.polar((r0 + r1) / 2, tailAng + ext)
    const len = v2.len(endMid)
    parts.push(
      k
        .rect(len, o.armWidth, false)
        .translate([0, -o.armWidth / 2])
        .rotate(Math.atan2(endMid[1], endMid[0])),
    )
    parts.push(k.circle(o.armWidth / 2, 24).translate(endMid))
  }
  let region = k.regionUnion(parts)
  if (o.bore) region = region.subtract(k.circle(o.bore, 32))
  return maybeMirror(region.extrude(o.thickness, 'z').translate([0, 0, o.z0 ?? 0]), o.mirror)
}

export { mirrorOutlineX }
