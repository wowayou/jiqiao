// 展品契约与工具（浏览器可用）。
// 测试专用：./testing（describeExhibitAudits）、./claims（读原文文件，仅 Node）。
export * from './types'
export * from './scene'
export { validateExhibit, allClaims } from './validate'
export * from './audit'
export { exhibitMetas, exhibitLoaders, loadExhibit, getMeta } from './registry'
