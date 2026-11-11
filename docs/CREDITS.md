# 致谢与思路来源

本项目不复制第三方代码，不引入外部模型文件。下列项目只借鉴了**思路**（依据 [PLAN.md](PLAN.md) 第 2 节的调研结论；波次 1 实现时未逐行查看它们的源码）。

| 来源 | 许可证 | 借鉴的思路 | 在本项目中的体现 |
|---|---|---|---|
| [RealTube/calibre-m01-tourbillon](https://github.com/RealTube/calibre-m01-tourbillon) | MIT | 程序化生成机械；一个时间值驱动全部零件；齿轮啮合要对相位，不只对速比 | `simulate(t)` 是唯一运动来源；`kinematics/gears.ts` 的 `meshAngle`/`toothPhase` 与相位测试 |
| [csciuto/calibre-bench](https://github.com/csciuto/calibre-bench) | MIT | 每条陈述标注出处类别；擒纵等用几何求解 | `Provenance` 五类标签、出处审计 |
| [wheresryan22/anatomy-figures](https://github.com/wheresryan22/anatomy-figures) | MIT | 图解站点的表达方法：真值模型先行，画面只有一个强调色给当前该看的东西 | 单一强调色（朱砂）规则、读数与文字都读同一模型 |
| [hoveychen/zhinanche](https://github.com/hoveychen/zhinanche) | 代码 Apache-2.0，模型 CC-BY-SA-4.0 | 指南车的模型约定（第二期参考） | 本轮未使用 |

使用的开源依赖（按 package.json）：three、@react-three/fiber、@react-three/drei、manifold-3d（Apache-2.0）、react、zustand、wouter、vite、vitest、playwright。

公开方法：

- 剖切截面用「裁切平面 + 模板缓冲（stencil）计数补面」的通用图形学技巧（three.js 官方示例 `webgl_clipping_stencil` 演示过同一思路），本项目自行实现于 `src/stage/`。
- 两圆求交、曲柄滑块、四杆机构、格拉肖夫判别等为公开的数学公式，自行实现于 `src/kinematics/`。

史料原文见 [docs/sources/](sources/README.md)（摘自中文维基文库，未与纸本校勘）。
