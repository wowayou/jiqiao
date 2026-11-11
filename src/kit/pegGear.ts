// 木齿轮零件：销齿（圆木销）、冠销（平行于轴的销）、拨齿星轮、轮缘凸轮。
// 古代木齿轮不是渐开线齿轮：这里的齿都是插在轮缘上的圆销，啮合关系见 kinematics/pegGear.ts。
//
// 共同约定（与 kinematics/gears.ts 一致）：
//   - 轮轴沿局部 +Y；平面图坐标 (u, v) = (x, −z)，平面角逆时针为正 = 绕 +Y 的转角。
//   - 第 j 个齿位于平面角 2πj/z（转角 0 时 0 号齿在 +X 方向）。
//   - 竖直放置的轮（轴沿世界 Z），姿态用 rotZ(θ)·rotX(π/2)：局部 y → 世界 z，平面 (u, v) → 世界 (x, y)。
// 全部返回局部坐标系下的 Solid（mm）。须在 kernel.scope 内调用。
import type { Kernel, Solid } from '../kernel'
import type { Vec3 } from '../kinematics/vec'

const TAU = Math.PI * 2

/** 平面角 a、半径 r、高 y 处的局部点 */
export const planPoint = (r: number, a: number, y: number): Vec3 => [r * Math.cos(a), y, -r * Math.sin(a)]

export interface WheelBodyOpts {
  /** 轮缘（辋）内外半径 */
  rimIn: number
  rimOut: number
  /** 轮缘的高度范围（沿 Y） */
  rimY0: number
  rimY1: number
  /** 辐条数与宽度（辐条与轮缘等高） */
  spokes: number
  spokeW: number
  /** 毂：半径与高度范围；中心孔半径（0 为实心） */
  hubR: number
  hubY0: number
  hubY1: number
  holeR?: number
  /** 圆周分段数 */
  segments?: number
}

/** 轮身：轮缘 + 辐条 + 毂（带轴孔）。辐条按 2πi/spokes 排布。 */
export function wheelBody(k: Kernel, o: WheelBodyOpts): Solid {
  const seg = o.segments ?? 96
  const rim = k.revolve(
    [
      [o.rimIn, o.rimY0],
      [o.rimOut, o.rimY0],
      [o.rimOut, o.rimY1],
      [o.rimIn, o.rimY1],
    ],
    seg,
  )
  const hub = k.revolve(
    [
      [o.holeR ?? 0, o.hubY0],
      [o.hubR, o.hubY0],
      [o.hubR, o.hubY1],
      [o.holeR ?? 0, o.hubY1],
    ],
    48,
  )
  const parts: Solid[] = [rim, hub]
  const h = o.rimY1 - o.rimY0
  for (let i = 0; i < o.spokes; i++) {
    const a = (TAU * i) / o.spokes
    const len = o.rimIn - o.hubR + 6
    parts.push(
      k
        .boxFromTo([o.hubR - 3, o.rimY0 + h * 0.15, -o.spokeW / 2], [o.hubR - 3 + len, o.rimY1 - h * 0.15, o.spokeW / 2])
        .rotate([0, 1, 0], a),
    )
  }
  let s = k.union(parts)
  if (o.holeR) s = s.subtract(k.cylinder({ r: o.holeR, h: o.hubY1 - o.hubY0 + 4, center: false, segments: 48 }).translate([0, o.hubY0 - 2, 0]))
  return s
}

export interface RadialPegWheelOpts extends WheelBodyOpts {
  /** 齿数 */
  z: number
  /** 销半径；销轴线从 pegIn 到 pegOut（离轮心），位于高度 pegY */
  pegR: number
  pegIn: number
  pegOut: number
  pegY: number
}

/** 径向销齿轮：轮缘上沿半径插出 z 根圆木销（销齿）。 */
export function radialPegWheel(k: Kernel, o: RadialPegWheelOpts): Solid {
  const pegs: Solid[] = []
  for (let j = 0; j < o.z; j++) {
    const a = (TAU * j) / o.z
    pegs.push(k.rod(planPoint(o.pegIn, a, o.pegY), planPoint(o.pegOut, a, o.pegY), o.pegR, 20))
  }
  return wheelBody(k, o).add(k.union(pegs))
}

export interface CrownPinWheelOpts extends WheelBodyOpts {
  z: number
  /** 销所在圆半径（节圆） */
  pitchR: number
  pinR: number
  /** 销沿 Y 的范围：pinY0 < pinY1。冠销向下垂时 pinY1 = 轮缘底面（销插进轮缘一点） */
  pinY0: number
  pinY1: number
}

/** 冠销轮：在节圆上立 z 根平行于轮轴的圆销（向下垂或向上立，由 pinY0/pinY1 决定）。 */
export function crownPinWheel(k: Kernel, o: CrownPinWheelOpts): Solid {
  const pins: Solid[] = []
  const len = o.pinY1 - o.pinY0
  for (let j = 0; j < o.z; j++) {
    const [x, , zz] = planPoint(o.pitchR, (TAU * j) / o.z, 0)
    pins.push(k.cylinder({ r: o.pinR, h: len, center: false, segments: 16 }).translate([x, o.pinY0, zz]))
  }
  return wheelBody(k, o).add(k.union(pins))
}

export interface ArmStarOpts {
  /** 拨齿数 */
  arms: number
  /** 拨齿：平面里的胶囊，轴线从 rootR 到 tipR，半宽 armR；高度范围 armY0–armY1 */
  rootR: number
  tipR: number
  armR: number
  armY0: number
  armY1: number
  /** 毂 */
  hubR: number
  hubY0: number
  hubY1: number
}

/**
 * 拨齿星轮（如三齿旋风轮）：毂上伸出 arms 根拨齿，每根拨齿在平面里是两端圆头的条（胶囊），
 * 与 kinematics/pegGear.ts 的 solveArmPinDrive 用同一形状求接触，故模型与几何严格一致。
 * 0 号拨齿指向平面角 0。
 */
export function armStar(k: Kernel, o: ArmStarOpts): Solid {
  const parts: Solid[] = [k.cylinder({ r: o.hubR, h: o.hubY1 - o.hubY0, center: false, segments: 48 }).translate([0, o.hubY0, 0])]
  const h = o.armY1 - o.armY0
  for (let i = 0; i < o.arms; i++) {
    const a = (TAU * i) / o.arms
    // 截面在 (z, x) 平面（extrude 'y' 的约定）：先在 x 轴上造胶囊，再转到 a
    const stadium = k.regionUnion([
      k.circle(o.armR, 32).translate([0, o.rootR]),
      k.circle(o.armR, 32).translate([0, o.tipR]),
      k.rect(2 * o.armR, o.tipR - o.rootR, false).translate([-o.armR, o.rootR]),
    ])
    parts.push(stadium.extrude(h, 'y').translate([0, o.armY0, 0]).rotate([0, 1, 0], a))
  }
  return k.union(parts)
}

export interface RimCamOpts {
  /** 凸轮块在轮缘上的半径范围 */
  r0: number
  r1: number
  /** 低端与高端的平面角（低端先到从动件；高端是陡落的一面） */
  aLow: number
  aHigh: number
  /** 底面高度与最大升程 */
  y0: number
  height: number
  /** 低端留的最小厚度（避免零厚度边） */
  minH?: number
  slices?: number
}

/**
 * 轮缘斜坡凸轮（拨子）：从低端到高端高度线性升到 height，高端是竖直落面。
 * 从动件（提杆的圆脚）沿斜坡被慢慢顶起，越过高端后落下。
 * 高度只随平面角变化（同一角度上径向等高），故从动件的升程可用 kinematics/pegGear.ts 的 restOnProfile 精确求出。
 */
export function rimCam(k: Kernel, o: RimCamOpts): Solid {
  const n = o.slices ?? 40
  const minH = o.minH ?? 0.6
  const pieces: Solid[] = []
  for (let i = 0; i < n; i++) {
    const a0 = o.aLow + ((o.aHigh - o.aLow) * i) / n
    const a1 = o.aLow + ((o.aHigh - o.aLow) * (i + 1)) / n
    const h0 = minH + ((o.height - minH) * i) / n
    const h1 = minH + ((o.height - minH) * (i + 1)) / n
    const pts: Vec3[] = []
    for (const [a, h] of [
      [a0, h0],
      [a1, h1],
    ])
      for (const r of [o.r0, o.r1]) {
        pts.push(planPoint(r, a, o.y0))
        pts.push(planPoint(r, a, o.y0 + h))
      }
    pieces.push(k.hull(pts))
  }
  return k.union(pieces)
}

/** 凸轮在从动件所在半径处的轮廓（弧长 s, 高度），s 从低端量起；高端为竖直落面。供 restOnProfile 使用。 */
export function rimCamProfile(o: RimCamOpts, atR: number): [number, number][] {
  const span = Math.abs(o.aHigh - o.aLow) * atR
  const minH = o.minH ?? 0.6
  return [
    [-1e6, 0],
    [0, 0],
    [0, minH],
    [span, o.height],
    [span, 0],
    [1e6, 0],
  ]
}
