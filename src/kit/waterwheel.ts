// 立式水轮：两圈轮辋 + 毂 + 每圈一组辐条 + 一圈叶板（盛水或受水冲的板）。
// 轮轴沿 Z，轮心在原点；轮盘平行于 XY 平面。须在 kernel.scope 内调用。
import type { Kernel, Solid } from '../kernel'

export interface WaterwheelOpts {
  /** 轮辋外径（叶板根部）。叶板向外再伸出 bladeDepth */
  outerR: number
  /** 轮辋径向宽 */
  rimW: number
  /** 单圈轮辋的轴向厚度 */
  rimT: number
  /** 两圈轮辋外侧面之间的总宽（轴向） */
  width: number
  /** 毂半径 */
  hubR: number
  /** 轴孔半径（0 = 无孔） */
  bore: number
  /** 每圈辐条数 */
  spokes: number
  /** 辐条切向宽 */
  spokeW: number
  /** 叶板数 */
  blades: number
  /** 叶板在轮辋外伸出的径向长度 */
  bladeDepth: number
  /** 叶板厚（切向） */
  bladeT: number
  /** 整轮绕轴的初始转角（rad），默认 0：0 号辐条与 0 号叶板指向 +X */
  phase?: number
}

/** 叶板外缘半径（整个水轮的最大半径）。 */
export const waterwheelRadius = (o: WaterwheelOpts) => o.outerR + o.bladeDepth

/** 第 i 块叶板的方向角（rad，绕 +Z 逆时针）。叶板均匀分布。 */
export const bladeAngle = (o: WaterwheelOpts, i: number) => (o.phase ?? 0) + (i * 2 * Math.PI) / o.blades

/** 单圈轮辋中心所在的轴向位置（z = ±此值）。 */
export const rimZ = (o: WaterwheelOpts) => o.width / 2 - o.rimT / 2

export function waterwheel(k: Kernel, o: WaterwheelOpts): Solid {
  if (o.rimW <= 0 || o.rimT * 2 >= o.width) throw new Error('waterwheel：轮辋尺寸不合理')
  const inner = o.outerR - o.rimW
  const phase = o.phase ?? 0
  const parts: Solid[] = []

  // 轮辋：两圈圆环
  const ring = k.circle(o.outerR, 96).subtract(k.circle(inner, 96))
  for (const sign of [1, -1]) parts.push(ring.extrude(o.rimT, 'z', true).translate([0, 0, sign * rimZ(o)]))

  // 毂：贯穿整个宽度
  parts.push(k.cylinder({ r: o.hubR, h: o.width, axis: 'z', segments: 48 }))

  // 辐条：从毂伸到轮辋中线，每圈一组，厚度同轮辋
  const spokeLen = inner + o.rimW / 2 - o.hubR * 0.7
  for (const sign of [1, -1]) {
    for (let i = 0; i < o.spokes; i++) {
      const a = phase + (i * 2 * Math.PI) / o.spokes
      parts.push(
        k
          .boxFromTo([o.hubR * 0.7, -o.spokeW / 2, -o.rimT / 2], [o.hubR * 0.7 + spokeLen, o.spokeW / 2, o.rimT / 2])
          .translate([0, 0, sign * rimZ(o)])
          .rotate([0, 0, 1], a),
      )
    }
  }

  // 叶板：径向板，横跨两圈轮辋，根部嵌进轮辋，向外伸出 bladeDepth
  for (let i = 0; i < o.blades; i++) {
    parts.push(
      k
        .boxFromTo([inner + o.rimW * 0.4, -o.bladeT / 2, -o.width / 2], [o.outerR + o.bladeDepth, o.bladeT / 2, o.width / 2])
        .rotate([0, 0, 1], bladeAngle(o, i)),
    )
  }

  let wheel = k.union(parts)
  if (o.bore > 0) wheel = wheel.subtract(k.cylinder({ r: o.bore, h: o.width + 2, axis: 'z', segments: 48 }))
  return wheel
}
