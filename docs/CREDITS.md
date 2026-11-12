# 致谢与思路来源

本项目不复制第三方代码，不引入外部模型文件。下列项目只借鉴了**思路**（依据 [PLAN.md](PLAN.md) 第 2 节的调研结论；波次 1 实现时未逐行查看它们的源码）。

| 来源 | 许可证 | 借鉴的思路 | 在本项目中的体现 |
|---|---|---|---|
| [RealTube/calibre-m01-tourbillon](https://github.com/RealTube/calibre-m01-tourbillon) | MIT | 程序化生成机械；一个时间值驱动全部零件；齿轮啮合要对相位，不只对速比 | `simulate(t)` 是唯一运动来源；`kinematics/gears.ts` 的 `meshAngle`/`toothPhase` 与相位测试 |
| [csciuto/calibre-bench](https://github.com/csciuto/calibre-bench) | MIT | 每条陈述标注出处类别；擒纵等用几何求解 | `Provenance` 五类标签、出处审计 |
| [wheresryan22/anatomy-figures](https://github.com/wheresryan22/anatomy-figures) | MIT | 图解站点的表达方法：真值模型先行，画面只有一个强调色给当前该看的东西 | 单一强调色（朱砂）规则、读数与文字都读同一模型 |
| [hoveychen/zhinanche](https://github.com/hoveychen/zhinanche) | 代码 Apache-2.0，模型 CC-BY-SA-4.0 | 指南车的模型约定（第二期参考） | 本轮未使用 |

## 实物对照的三维模型

「说明与出处」页的「实物对照」嵌入下列他人在 [Sketchfab](https://sketchfab.com) 上以 CC0 或 CC BY 4.0 发布的三维模型。本站**不下载、不自托管**：读者点「加载三维实物」后，浏览器才直接从 sketchfab.com 加载；署名与链接在页面上一直显示。本站自己的模型不受它们影响。

| 展品 | 模型 | 作者 | 许可 | 链接 |
|---|---|---|---|---|
| 石磨 | Stone mill（石磨） | 小明一米七 | CC BY 4.0 | [模型](https://sketchfab.com/3d-models/ed0bd32c425143e6a3e623a499fb8ea4) · [作者](https://sketchfab.com/2251387929a) |
| 水碓 | Trip hammer | Skebobruks museum | CC BY 4.0 | [模型](https://sketchfab.com/3d-models/c9b552475cb94d03ac60d3e486dc1520) · [作者](https://sketchfab.com/skebobruks_museum) |
| 记里鼓车 | Pedometer | Virtual Museums of Małopolska | CC0 | [模型](https://sketchfab.com/3d-models/06da2877dcd54192bb9bd692b4737d8c) · [作者](https://sketchfab.com/WirtualneMuzeaMalopolski) |
| 木牛流马 · 独轮车说 | Day 236: Antique child wheelbarrow - 1scanaday | Emm | CC BY 4.0 | [模型](https://sketchfab.com/3d-models/bc84c709f8744a54b282d6df115106f0) · [作者](https://sketchfab.com/edemaistre) |
| 锚式擒纵摆钟 | Galileo's escapement pendulum clock | erastoten | CC BY 4.0 | [模型](https://sketchfab.com/3d-models/7cbfd12d44ac4436a6d81796ae76fe90) · [作者](https://sketchfab.com/erastoten) |
| 透榫（带破头楔） | Otoshi-ari-hozo-shikuchi | thejoinery | CC BY 4.0 | [模型](https://sketchfab.com/3d-models/269f0b5a914e437ba10c0aed445711df) · [作者](https://sketchfab.com/thejoinery) |

许可全文：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。这些模型是否合适、与本站模型有何异同，由各展品的 `realObjects[].differs` 如实写明；它们不是史料，也不是本站所依据的那件器物。

使用的开源依赖（按 package.json）：three、@react-three/fiber、@react-three/drei、manifold-3d（Apache-2.0）、react、zustand、wouter、vite、vitest、playwright。

公开方法：

- 剖切截面用「裁切平面 + 模板缓冲（stencil）计数补面」的通用图形学技巧（three.js 官方示例 `webgl_clipping_stencil` 演示过同一思路），本项目自行实现于 `src/stage/`。
- 两圆求交、曲柄滑块、四杆机构、格拉肖夫判别等为公开的数学公式，自行实现于 `src/kinematics/`。

史料原文见 [docs/sources/](sources/README.md)（摘自中文维基文库，未与纸本校勘）。
