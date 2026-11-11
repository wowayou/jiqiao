// 齿轮系的纯数学：速比、中心距、定位、啮合相位。
//
// 齿位约定（所有齿轮零件都必须遵守，见 docs/AUTHORING.md）：
//   齿轮自身转角为 0 时，0 号齿的齿中心线位于该齿轮局部转动坐标系的 0 角方向；
//   第 j 号齿位于 2πj/z。转角正方向 = 绕齿轮轴右手定则。
//   这样「啮合相位」只取决于两轮转角与接触方向，和具体齿形（渐开线、销齿、木齿）无关，
//   后续的渐开线齿轮、销轮、冠齿轮都可以复用 meshAngle。
import { TAU, v2, type Vec2 } from './vec'
import { circleIntersections } from './linkage'

export type MeshKind = 'external' | 'internal'

/** 速比：从动轮角速度 / 主动轮角速度的大小 = z主 / z从。 */
export function speedRatio(zDriver: number, zDriven: number): number {
  return zDriver / zDriven
}

/** 一串啮合（每对 [z主, z从]）的总速比；同轴的两轮之间不计入。 */
export function trainRatio(pairs: Array<[number, number]>): number {
  return pairs.reduce((acc, [a, b]) => acc * speedRatio(a, b), 1)
}

export function pitchRadius(module: number, z: number): number {
  return (module * z) / 2
}

/** 中心距：外啮合 m(z1+z2)/2；内啮合（z2 为内齿圈）m(z2−z1)/2。 */
export function centerDistance(module: number, z1: number, z2: number, kind: MeshKind = 'external'): number {
  return kind === 'external' ? (module * (z1 + z2)) / 2 : (module * (z2 - z1)) / 2
}

/**
 * 两圆求交定位第三轮：第三轮中心到 A 距离 dA、到 B 距离 dB（一般各为对应中心距）。
 * side = 1 取 A→B 方向左侧的解，-1 取右侧。无解时抛错（说明尺寸不自洽）。
 */
export function placeThirdGear(cA: Vec2, dA: number, cB: Vec2, dB: number, side: 1 | -1 = 1): Vec2 {
  const pts = circleIntersections(cA, dA, cB, dB)
  if (pts.length === 0) throw new Error('第三轮无法同时与两轮啮合：中心距不满足三角不等式')
  if (pts.length === 1) return pts[0]
  const ab = v2.sub(cB, cA)
  const s0 = Math.sign(v2.cross(ab, v2.sub(pts[0], cA)))
  return s0 === side ? pts[0] : pts[1]
}

export interface MeshInput {
  /** 主动轮齿数 */
  zA: number
  /** 主动轮转角（rad） */
  angleA: number
  /** 接触点方向在主动轮局部转动坐标系中的角度 */
  contactA: number
  /** 从动轮齿数 */
  zB: number
  /** 接触点方向在从动轮局部转动坐标系中的角度 */
  contactB: number
  /** 外啮合两轮反向，内啮合同向 */
  kind?: MeshKind
}

/**
 * 啮合相位：给定主动轮转角，求从动轮转角，使主动轮的齿正好对着从动轮的齿槽。
 * 外啮合 θB = cB + π/zB − (zA/zB)(θA − cA)
 * 内啮合 θB = cB + π/zB + (zA/zB)(θA − cA)
 * 检验：θA = cA（主动轮 0 号齿对准接触点）时，从动轮在接触方向正好是齿槽中心。
 */
export function meshAngle(m: MeshInput): number {
  const sense = (m.kind ?? 'external') === 'external' ? -1 : 1
  return m.contactB + Math.PI / m.zB + sense * (m.zA / m.zB) * (m.angleA - m.contactA)
}

/**
 * 同一平面内两轮（都绕平面法向 +Z 转，角度从 +X 量起）的啮合相位。
 * 外啮合：接触方向从 A 看是 A→B，从 B 看是 B→A。
 * 内啮合：B 为内齿圈，接触方向从两轮看都是 B→A 的延长方向。
 */
export function meshPlanar(
  driver: { z: number; center: Vec2; angle: number },
  driven: { z: number; center: Vec2 },
  kind: MeshKind = 'external',
): number {
  if (kind === 'external') {
    const phi = v2.angle(v2.sub(driven.center, driver.center))
    return meshAngle({ zA: driver.z, angleA: driver.angle, contactA: phi, zB: driven.z, contactB: phi + Math.PI, kind })
  }
  const phi = v2.angle(v2.sub(driver.center, driven.center))
  return meshAngle({ zA: driver.z, angleA: driver.angle, contactA: phi, zB: driven.z, contactB: phi, kind })
}

/**
 * 齿相位：接触方向上是齿还是槽。返回 [0,1)：0 = 齿中心正对接触点，0.5 = 齿槽中心。
 * 用于测试啮合是否对相位。
 */
export function toothPhase(z: number, angle: number, contact: number): number {
  const pitch = TAU / z
  const x = (contact - angle) / pitch
  return x - Math.floor(x)
}
