# 机巧

可拆解、可慢放的三维图解：从石磨到钟表的机械传动，以及榫卯结构。

## 命令

- `npm run dev`：开发服务器
- `npm run build`：生产构建（输出 `dist/`）
- `npm run typecheck`：类型检查
- `npm test`：单元测试与几何审计（Vitest；看审计数值加 `--silent=false`）
- `npm run e2e`：浏览器测试（Playwright，需先 `npm run build`，使用 5183 端口；自动遍历所有展品，桌面 1440 与手机 390 两种宽度）

## 结构

```
src/
  kernel/       几何内核：manifold 初始化（浏览器/Node 同一 API）、Solid/Region 与作用域内存管理、
                体积与交集、平面裁切、转 three BufferGeometry（geometry.ts）
  kinematics/   纯数学（不依赖 three）：向量与位姿、齿轮系（速比/中心距/定位/啮合相位）、
                连杆（两圆交点/二杆组/曲柄滑块/四杆）、装配序列
  kit/          参数化零件：圆盘/轴/手柄/连杆/绳杆（basic）、木料与榫卯（wood）、磨扇与承槽（stone）
  exhibit/      展品契约（types）、场景求值（scene）、注册表（registry，import.meta.glob 自动发现）、
                结构校验（validate）、几何审计（audit）、出处审计（claims，仅 Node）、测试入口（testing）
  stage/        三维展台：状态（store）、材质（工笔风格、单一强调色）、几何构建、拾取、
                爆炸、带截面的剖切（stencil）、协同链高亮、取景
  ui/           页面：展厅首页、展品页（展台 + 时间轴 + 读数 + 协同链/零件/说明面板）、主题、样式令牌
  exhibits/<id>/  每个展品一个目录：meta.ts、model.ts、parts.ts、content.ts、index.ts、*.test.ts
e2e/            Playwright：按注册表遍历全部展品
docs/
  PLAN.md       方案与验收标准
  AUTHORING.md  新增展品的作者手册（契约、坐标约定、审计测试、常见坑）
  CREDITS.md    思路来源
  sources/      核实过的史料原文（只读）
```

现有展品：石磨（`shi-mo`，机械类样板）、透榫带破头楔（`tou-sun`，榫卯类样板）。

方案与验收标准见 [docs/PLAN.md](docs/PLAN.md)；新增展品见 [docs/AUTHORING.md](docs/AUTHORING.md)。
