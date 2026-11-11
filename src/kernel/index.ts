// 几何内核：初始化、Solid/Region、审计用的体积计算。
// 转 three 几何在 ./geometry（会引入 three），审计测试不需要它。
export { getKernel } from './init'
export { createKernel, type Kernel, type CylinderOpts } from './kernel'
export { Solid, Region, AXIS_MAT, type Axis, type Box3 } from './solid'
export { scopeDepth } from './arena'
