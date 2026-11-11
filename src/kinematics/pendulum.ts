// 摆的纯数学：单摆周期、摆长、有限振幅修正。单位 mm、s、rad。

/** 标准重力加速度（mm/s²） */
export const G_STD = 9806.65

/** 小角度单摆周期 T = 2π√(L/g) */
export function pendulumPeriod(lengthMm: number, g = G_STD): number {
  return 2 * Math.PI * Math.sqrt(lengthMm / g)
}

/** 给定周期的单摆摆长 L = g·T²/(4π²) */
export function pendulumLength(period: number, g = G_STD): number {
  return (g * period * period) / (4 * Math.PI * Math.PI)
}

/** 算术-几何平均 */
export function agm(a: number, b: number): number {
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]
  return a
}

/** 有限振幅 θ0（rad）时单摆的精确周期：T = T0 / AGM(1, cos(θ0/2)) */
export function pendulumPeriodExact(lengthMm: number, amplitude: number, g = G_STD): number {
  return pendulumPeriod(lengthMm, g) / agm(1, Math.cos(amplitude / 2))
}

/** 小角度简谐近似下的摆角：θ(t) = −A·cos(2πt/T)（t = 0 在负向最远处） */
export function pendulumAngle(t: number, amplitude: number, period: number): number {
  return -amplitude * Math.cos((2 * Math.PI * t) / period)
}
