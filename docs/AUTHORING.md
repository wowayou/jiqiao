# 展品作者手册

读者：波次 2 并行新增展品的代理。目标：拿着本文件和两个样板（机械类 `src/exhibits/shi-mo/`、榫卯类 `src/exhibits/tou-sun/`），半天内加出一个完整展品——只写「数据 + 纯函数」，不碰渲染代码，不改公共文件。

硬性约束以 [PLAN.md](PLAN.md) 第 6 节为准，验收以第 7 节为准。本文件记录引擎的具体约定，以及对 PLAN 4.1 契约的全部调整（见第 9 节）。

---

## 1. 五分钟上手

```bash
cp -r src/exhibits/tou-sun src/exhibits/<你的id>     # 榫卯类从 tou-sun 起步
cp -r src/exhibits/shi-mo  src/exhibits/<你的id>     # 机械类从 shi-mo 起步
# 改 meta.ts 里的 id（必须等于目录名，小写短横线），然后：
npm run dev -- --port <你的端口>    # 打开 http://localhost:<端口>/#/e/<你的id>
npm test                             # 结构校验 + 出处审计 + 实体审计 + 干涉审计 + 你的模型测试
```

注册表用 `import.meta.glob` 自动发现 `src/exhibits/*/meta.ts` 与 `index.ts`：**新增展品不需要改任何公共文件**，首页、路由、e2e 都会自动覆盖它。

## 2. 文件结构

```
src/exhibits/<id>/
  meta.ts        元信息（首页列表用，立即加载；要小，不要 import 别的东西）
  model.ts       真值模型：simulate(t, c) → 状态 S；尺寸常量；位姿函数
  parts.ts       零件：几何（kit/kernel）+ 位姿 + 爆炸路径
  content.ts     全部文字：intro、零件名/作用/陈述、sources
  index.ts       export default defineExhibit({...})：组装上面几项 + 协同链 + 读数
  audit.test.ts  describeExhibitAudits(exhibit)   ← 必须有（注册表测试会检查）
  model.test.ts  运动学审计、协同链与画面一致性、计算陈述的验证
```

`index.ts` 是懒加载入口；`meta.ts` 必须被 `index.ts` 引用为同一个对象（`import { meta } from './meta'`），注册表测试会检查。

### 文件归属（波次 2）

只写自己的 `src/exhibits/<id>/`，以及分配给你的**新增** `src/kit/*.ts`、`src/kinematics/*.ts` 文件。不要改 `kit/index.ts`、`kinematics/index.ts` 等公共文件——展品里直接按路径 import 你的新文件即可（`import { involute } from '../../kinematics/involute'`）。发现引擎缺陷写进交付说明，由验收方统一处理。

## 3. 单位与坐标

| 项 | 约定 |
|---|---|
| 长度 | 毫米（mm） |
| 角度 | 弧度（rad）。唯一例外：`Solid.rotateDeg` 用角度制 |
| 坐标系 | 右手系，**Y 轴朝上**（three.js 习惯） |
| 转角正方向 | 绕轴右手定则。绕 +Y 转 θ 时，+X 转向 −Z（`rotY(π/2)` 把 [1,0,0] 变成 [0,0,−1]） |
| 平面图坐标 | 俯视平面 `(u, v) = (x, −z)`：这样平面里逆时针为正，正好等于绕 +Y 的转角。`kit/stone.ts`、石磨模型都用它 |
| 四元数 | `[x, y, z, w]`，与 three.js 一致 |
| 时间 | 机械：模型时间（秒），时间轴 `[0, period)` 循环；榫卯：装配进度 `t ∈ [0, 1]` |

`kernel.extrude(profile, depth, axis)` 的截面坐标 `(a, b)` 与拉伸方向 `h` 的对应（都是纯旋转、不镜像）：

| axis | (a, b, h) → 世界 |
|---|---|
| `'z'`（默认） | (x, y, z) |
| `'x'` | (y, z, x) |
| `'y'` | (z, x, y) ← 截面是 **(z, x)**，不是 (x, z)，最容易错 |

平面图 (u, v) 的区域要拉伸成竖直实体时，用 `planToYSection(region)`（逆时针转 90°）再 `extrude(..., 'y')`，见 `kit/stone.ts`。

`kernel.revolve(profile)` 绕 **Y 轴**旋转成型，截面点是 `(半径, 高度)`，半径须 ≥ 0。

## 4. 几何：Kernel、Solid 与内存

```ts
solid: (k) => k.box([80, 520, 80]).subtract(mortiseCutter(k, {...}).translate([40, 0, 0]))
```

- manifold 的 WASM 对象不会被 GC 回收。引擎用**作用域（scope）**管理：所有 `Solid`/`Region` 只能在 `k.scope(() => …)` 内创建，作用域结束时除返回值外全部释放。
- `PartDef.solid` 由引擎在作用域内调用，**你不用管内存**，直接链式写即可。
- 在测试里直接用 kit 时要自己包：`k.scope(() => { … })`。返回值（Solid、Solid 数组、对象的一层属性）会保留，最外层的需要你 `.delete()`。
- 作用域外创建几何会立即抛错；使用已释放的对象也会抛错——这两个错误都意味着写法有问题，不要绕过。
- `solid.raw` 是底层 manifold 对象，属逃生口：用它直接造出的新 manifold 要么自己 delete，要么 `new Solid(m)` 包回来登记。
- 几何**只建一次**：`solid` 里不要读状态 `s`。会动的东西靠 `pose(s)`。

常用 API（`src/kernel/kernel.ts` 有完整签名）：

| 构造 | 布尔与变换 | 查询 |
|---|---|---|
| `box(size, center=true)`、`boxFromTo(a, b)` | `add(...)`、`subtract(...)`、`intersect` | `volume()`、`bbox()`、`genus()` |
| `cylinder({ r, h, r2?, axis='y', center=true })` | `translate`、`rotate(axis, rad)`、`rotateDeg` | `status()`、`isEmpty()` |
| `rod(from, to, r)`、`sphere`、`torus` | `place(pose)`、`mirror`、`scale` | `k.intersectionVolume(a, b, poseA, poseB)` |
| `extrude`、`revolve`、`polygon`、`rect`、`circle` | `trim(normal, offset)`：平面裁切 | |

二维 `Region` 有 `add/subtract/intersect/offset/rotate/translate/extrude/revolve`。多边形用 EvenOdd 填充规则，顶点顺/逆时针都可以；多轮廓（外框 + 孔）按奇偶处理。

### 零件库 kit（`src/kit/`）

| 文件 | 内容 |
|---|---|
| `basic.ts` | `disc`（圆盘，可带孔与倒角）、`shaft`（轴/销）、`handle`（竖直手柄/木橛）、`linkBar`（两端带孔的平板连杆）、`pole`（两点间圆杆）、`rope`（折线绳）、`eyeRing`（杆端圆环） |
| `wood.ts` | `beamX`（长方料）、`tenon`（榫头）、`kerfCutter`（V 形锯缝刀具）、`wedgeFor`（与锯缝同形的楔）、`railWithTenon`（带榫横料）、`mortiseCutter`（卯眼刀具，可带出口放大段、可盲卯）、`postWithMortise`、`wedge`、`fourLegStand`（四腿木架） |
| `stone.ts` | `GroovePattern` + `grooveLines`/`lineCross`（磨齿图案，纯函数）、`grooveRegion`、`millstone`（磨扇：磨齿、磨眼、中心孔、磨膛、顶面浅盘）、`trough`（带边沿的承槽） |

木作坐标约定：带榫的料沿 +X，肩在 x = 0，榫头朝 −X；卯眼刀具入口在 x = 0、沿 −X。装好时两者只差一个平移。

### 配合间隙

刚体模型里两面完全重合时，布尔求交可能出现数值噪声。约定：**配合面每侧留 0.1 mm**（`FIT_CLEARANCE`），转动配合（轴与孔）留 0.3–1 mm。间隙是模型简化，要在 claims 里标 `model`。刀具一律伸出被切面 1 mm，保证切得干净。

## 5. 契约逐项（`src/exhibit/types.ts`）

### ExhibitDef

| 字段 | 说明 |
|---|---|
| `meta` | 来自 `meta.ts`。`category`: `'mechanism' \| 'clock' \| 'joinery'`；`hypothesis: true` 时页面顶部明示「复原假说」；`order` 同类排序；`related` 相关展品 id：展品页顶部显示成链接，指向注册表里尚不存在的展品（如还没做的 `muniu-buxing`）时静默略过，不显示死链也不报错，所以可以提前写上 |
| `intro` | 展品页「说明与出处」的导言陈述，`Claim[]` |
| `controls` / `defaults` | 控件定义与初值。控件只影响 `simulate`，**不得影响几何** |
| `timeline` | `{ kind: 'cyclic', period, speeds, defaultSpeed?, minor?, moments? }` 或 `{ kind: 'assembly', duration, speeds, defaultSpeed? }`。`minor`（小循环）与 `moments`（关键瞬间）见下方「长周期展品的时间轴」 |
| `simulate(t, c)` | 真值模型，纯函数。读数、位姿、协同链点亮全部只读它的返回值 |
| `parts` | 见下 |
| `chain` | 协同链，见下 |
| `readouts` | `{ label, value: (s) => string, provenance, cite? }` |
| `sources` | `{ [key]: { title, file?, quote?, url? } }`。史料陈述引用这里的键 |
| `view?` | `{ dir?: 相机相对目标的方向, target?: 取景中心 }`。默认自动取景（装配态与完全爆炸态都在画面内） |
| `views?` | 预设机位 `ViewPreset[]`，界面上一排一点即达的按钮；见下方「预设机位」。「全景」由界面自带，不要写 |
| `drive?` | 亲手驱动：`{ part, hint, anchor?, scale?, seek? }[]`，观众可以抓住拖动的零件；见下方「亲手驱动」 |
| `traces?` | 迹线：`{ id, label, unit?, value: (s) => number, provenance, cite?, note?, wrap? }[]`，1–3 条；见下方「迹线」 |
| `section?` | 默认剖切平面 `{ normal, offset, label? }`：保留 `normal·x ≥ offset` 一侧，相机应在被切掉的一侧。**榫卯必填** |
| `audit?` | `{ contacts?: [a, b][], phases?, ignore?: string[] }`。机械必须列出接触零件对 |

### 长周期展品的时间轴（`timeline.minor` / `timeline.moments`）

周期很长（摆钟 12 小时、记里鼓车 6000 秒）时，主进度条一格就是几十秒，拖不到某一个节拍、某一齿。给 cyclic 时间轴加两个可选字段：

| 字段 | 含义 |
|---|---|
| `minor: { period, unit, offset?, steps? }` | **小循环**：值得一眼看清的最小重复单元。`period` 秒（必须整除 `timeline.period`），`unit` 是计数单位（界面显示「第 n {unit}」，如 `'摆'`、`'圈'`、`'次起落'`）；`offset` 让格线错开，使「一次完整动作」落在同一格里而不被格线切开（默认 0）；`steps` 是单步按钮把一格切成几步（默认 40） |
| `moments: { t, label }[]` | **关键瞬间**，界面里「跳到关键瞬间…」下拉一点即到（`0 ≤ t < period`）。用于「击鼓前一刻」「拨板刚压上碓尾」这类用滑块很难精确停住的时刻 |

给了 `minor`：主进度条下多一条**细调条**，量程只覆盖「当前这个小循环」；单步按钮（← →）走 `minor.period / steps`，Shift+← → 整格走。小循环多于 50 个时，主进度条按小循环取整（跳到别的一格时保留格内位置，细调不丢）；否则主条仍是周期的 1/1000。长周期的时间读法自动换成「时:分:秒」。选法：摆钟取摆一次来回（2 s），记里鼓车取足轮一圈（T_F），水碓取一个碓的一次起落（周期 / 每碓拨板数）。不要为了「看得清」把 `defaultSpeed` 调到快进——默认速度应当是适合观察节拍的值。

### 预设机位（`views`）

小零件（擒纵叉瓦只有几毫米宽）、藏在里面的零件（记里鼓车车箱里的旋风轮）、被挡住的零件（水碓的拨板与碓尾），默认全景下看不清。`views` 让作者预设几个「看哪里、怎么看」，观众一点就到——相机平滑飞过去，同时把挡视线的东西让开。一个机位是**一整套状态**，不继承用户之前的爆炸、剖切或选中：

| 字段 | 含义 |
|---|---|
| `id`、`label`、`note?` | 唯一 id（`'all'` 保留给界面自带的「全景」）、按钮文字（2–6 字）、一句话说明（显示在机位条上方，说清「让开了什么、看什么」） |
| `target`、`size` | 注视点（世界坐标 mm）与想看清的范围直径（mm）。相机按 `size` 取距离，窄屏自动拉远，保证这个范围整个入画。取景会避开界面浮层，不必为工具条留余量 |
| `dir?` | 相机相对注视点的方向，缺省沿用 `view.dir` |
| `explode?` | 爆炸量 0–1，缺省 0 |
| `fade?: string[]` | **让开**：这些零件半透明（也不会被点选），露出后面的东西。适合表盘、前夹板、车架这类「挡在前面但不想拆掉」的零件 |
| `section?` | `true` 用展品的 `section`；或自带平面 `{ normal, offset, label? }`（保留 `normal·x ≥ offset` 一侧）。缺省关闭剖切。需要「揭去上面几层」「在两个碓之间切开」时用它，截面带剖面线 |
| `select?` | 选中（强调色）的零件或 `'part#feature'`。多数机位不需要：协同链「此刻」会自动点亮正在起作用的零件 |

写法建议：先用 `section` 或 `fade` 让出视线，再用 `target`/`size` 框住要看的范围；`size` 取目标零件的 1.2–2 倍。每个机位都要在桌面 1440 与手机 390 各看一眼截图，确认「点一下就真的看得清」。校验会检查 id 唯一、`fade`/`select` 引用存在、`section: true` 时展品确有 `section`。

### 亲手驱动（`drive`）

观众抓住可拖零件上的一点拖动，机构跟着手走。**拖动只改时间 `t`**：零件仍按 `simulate` 给出的轨迹运动，算法通用（`src/stage/drive.ts`，纯函数，有单元测试），不为展品写代码——抓取点在 t 与 t±h 的屏幕位置之差是屏幕速度 v，取 `dt = (指针位移 · v) / |v|²`，走一步若没离指针更近就把步长减半；折返点（摆到最高处）往回拉跟着走、往外推不动。

| 字段 | 含义 |
|---|---|
| `part` | 零件 id（有副本时任一副本都可抓） |
| `hint` | 提示语（动词开头，2–8 字，如「推拉横把」「拨动摆锤」），悬停与首次进入时显示 |
| `anchor?` | 提示标记的位置（零件局部坐标），应在零件实体内、运动明显、默认机位下看得见的地方。省略时取运动幅度最大的顶点 |
| `scale?` | 求速度的时间尺度。零件一步一停（分针随擒纵一跳一跳）时设为一个小循环的长度，否则停着的那几刻拖不动 |
| `seek?` | 零件此刻停着时，最多往前、往后各找这么长的模型时间，跳到它开始顺着手动的那一刻再接着拖（两侧都有时取往前的一侧）。独轮车停车时往上提车把，跳过「加力」直接进入「抬平」 |

此刻不动的零件默认拖不动。停着只是在等别的动作做完时（独轮车的车把只在抬平、放把时动），写 `seek` 让观众一拖就动；停着本身就是要讲的事时不要写（透榫的横料在楔打着时不动——要先拔楔），并在 `hint` 或协同链里说清楚。提示圆圈本身也可以按住拖（圈住的点被别的零件挡着时照样抓得住）。爆炸量 > 0 时不可拖。选大零件（整块磨盘）当可拖件会让「在它上面按下去转视角」变成拖零件，优先选把手、轮、摆锤这类小而运动明显的零件。

### 迹线（`traces`）

时间轴上方画出这台机器最关键的一两个量随时间的曲线，游标与画面同步。原理往往就是一条曲线的形状：摆角是正弦而擒纵轮转角是台阶；旋风轮匀速而中平轮一拨一停；水轮匀速而碓头是锯齿。

| 字段 | 含义 |
|---|---|
| `id`、`label`、`unit?` | 展品内唯一；名称直接标在线旁（不用图例），与当前值一起显示 |
| `value(s)` | 数值，**只能读 `simulate` 的状态**；出处一般是 `calc` |
| `note?` | 一句「怎么读这条线」，收在「怎么读这几条线」里。要说的是形状（台阶、斜直线、锯齿）与它说明的原理 |
| `wrap?` | 值的周期（转角写 360）：取样时展开成连续曲线，从 359° 到 0° 不画成竖线；当前值仍按原值显示 |

画的那一段：有小循环画当前小循环（横轴与细调条对齐），否则整个周期 / 装配进度（与主进度条对齐）。每条约 240 个点，各自按取样的最小、最大值定纵轴；台阶照样本画折线，不平滑。取样按「这一段的起点 + 控件值」缓存（`src/stage/traces.ts`），分片计算、片间让出主线程，`simulate` 慢的展品也不卡画面。挑量的标准：曲线的形状本身就在讲原理；单调递增、跨很多圈的量（擒纵轮累计转角）取模并写 `wrap`。

### PartDef

| 字段 | 说明 |
|---|---|
| `id` | 展品内唯一，不得含 `#` 或 `:` |
| `name` / `role` | 中文名；一句话说它在本模型里做什么（只写功能，史实写进 claims） |
| `group` | `'base' \| 'structure' \| 'mechanism' \| 'control' \| 'subject'`（subject = 被加工的东西，如粮粒） |
| `material` | `wood-light/wood-dark/wood-end/stone/stone-dark/iron/steel/brass/rope/hide/cloth/earth/lacquer/dial/grain/flour/water`。不够用时不要自己加，写进交付说明 |
| `solid(k)` | 局部坐标下的实体，只建一次 |
| `rest` | 装配完成、初始状态的位姿 |
| `pose?(s, copy)` | 运动零件的位姿（世界坐标）。没有就固定在 `rest` |
| `copies?` | 同一几何的副本数（颗粒、齿销……）；`pose`/`visible` 的第二个参数是副本序号 |
| `visible?(s, copy)` | 显示与否（纯函数） |
| `explode` | `{ dir, distance, order, frame?, with?, hide? }`，见第 6 节 |
| `claims?` | 陈述（带出处） |
| `features?` | 零件上的具名特征（孔、槽、榫头…）：`{ id, name, role, anchor: 局部坐标, claims? }`。在零件面板可点选，在画面里显示标注 |

### ChainStep（协同链的一环）

| 字段 | 说明 |
|---|---|
| `parts` | 零件 id，或 `'partId#featureId'`。**特征引用只显示标注、不给整件着色**（避免强调色铺满大零件）；要给整件着色就写零件 id |
| `text` + `provenance` (+ `cite`) | 这一环的说明及其出处类别 |
| `active?(s)` | 此刻是否在起作用。省略 = 常态说明，不随运行点亮。点亮规则：选中零件 > 用户点住的环 > 所有实时点亮的环 |
| `locks?` + `locksProvenance` | 榫卯：这一步之后**新**锁住的自由度（`'+x' '-x' '+y' '-y' '+z' '-z' 'rx' 'ry' 'rz'`，相对被装配的基准件）。面板显示累计状态 |
| `window?: [t0, t1]` | **讲解**时这一环循环播放的时间段（机械：模型秒，可写负的 `t0` 跨过周期起点；榫卯：装配进度）。省略时自动推导，见下方「讲解」 |
| `view?` | 讲解到这一环时用的预设机位 id（`views` 里的）。省略时镜头从展品默认方向（`view.dir`）凑近这一环的零件在整个时间窗里扫过的范围，并让开挡在视线中央的零件（只查视线中央一条线，侧面的遮挡要靠 `view`） |
| `speed?` | 讲解循环的速度倍数（与 `timeline.speeds` 同义）。省略时让一次循环约 5 秒 |

### 讲解（`window` / `view` / `speed`）

观众点「讲解」后一环一环看：时间只在这一环的时间窗里循环、这一环的零件着强调色、镜头到位、舞台下缘只显示这一环的文字。三样都由数据决定（`src/exhibit/tour.ts`，纯函数）：

- **时间窗**：写了 `window` 用它；没写时在**一个小循环**里推导（有 `timeline.minor` 用它；周期 ≤ 120 秒用整个周期；更长又没有小循环只看开头 120 秒；榫卯是整个装配进度）——采样 400 点的 `active`，取第一段连续为真的区间，前后各留「区间长 1/4、至少范围 2%」的余量（不超过范围本身）；首尾都为真的区间按跨过格线接起来。没有 `active` 的常态说明循环整个推导范围。
- **推导不到就必须写 `window`**：只在第 100 圈才击鼓、只在最后 30 分钟上弦这类事，小循环里看不到，结构校验会报错。写的时候让这一段「在动、速度看得清」：慢的过程（提杆 20 秒才顶高 28 mm）给长窗、自动快进；快的瞬间（槌 0.1 秒落下）给短窗、自动慢放。
- **速度**：按窗长自动取，让一次循环约 5 秒；确有需要再写 `speed`。
- `src/exhibit/tour.test.ts` 对所有展品检查：每一环都有时间窗、有 `active` 的环窗内确有采样点为真、这一环的零件在窗内确实在动、一次循环 1–15 秒。写完在桌面 1440 与手机 390 各截一遍每一环，确认「要看的零件在画面里、没被挡、着了强调色、在动、文字说的就是画面里的事」；看不清就给这一环配一个 `view`（必要时新加一个预设机位）。

## 6. 运动、爆炸与装配

- **运动只来自 `simulate`**：位姿 = `pose(simulate(t, c), copy)`。不要在任何地方读时钟、用 `Math.random`、存可变状态。结构校验会对同一 `t` 求两次比较。
- 展台每帧：`t → simulate → evaluateScene → 改位姿`；几何从不重建。审计用同一个 `evaluateScene`，所以**审计的就是看到的**。
- **爆炸 = 倒放装配**（`kinematics/assembly.ts`）：`order` 小的先装；爆炸量 e 等价于装配进度 1 − e，后装的先拆出。各 order 平分进度条，段内平滑缓动。
  - `frame: 'local'`：方向随零件当前姿态转（转动件上的附件向外拆）。
  - `with: '另一零件'`：先跟随那个零件的爆炸偏移，再叠加自己的（附件随主体走）。
  - `hide: true`：爆炸时隐藏（颗粒、水流等示意物）。
- **榫卯的装配路径必须就是爆炸路径**：`pose(s).p = rest.p + assemblyOffsets(爆炸定义, t)`。结构校验会逐点核对。写法见 `tou-sun/model.ts`：把 `ASSEMBLY` 定义在 model 里，parts 用 `explodeOf(id)` 取同一份数据。

## 7. 出处（PLAN 第 6 节第 1 条）

每条陈述带 `provenance`：

| 值 | 页面标签 | 何时用 |
|---|---|---|
| `source` | 史料 | 只能引 `docs/sources/` 里核实过的原文。必须 `cite` 一个带 `file` + `quote` 的来源；**`quote` 必须逐字出现在该文件里**（出处审计会检查，异体字、标点都要一致） |
| `reconstruction` | 通行复原 | 学界或民间通行的复原/做法 |
| `hypothesis` | 假说 | 尚无定论的解释 |
| `model` | 本站设定 | 尺寸、形制、简化、示意放大 |
| `calc` | 计算所得 | 由模型算出——**必须有测试**验证它（例：石磨「交叉点外移」见 `kit/kit.test.ts`；透榫「第 1 步锁住 8 个自由度」见 `tou-sun/model.test.ts`） |

`docs/sources/` 没有的东西一律不标 `source`。注意每个原文文件的「原文未载」小节。`docs/sources/` 只读，不要改。

## 8. 审计测试

最少写法（`audit.test.ts`）：

```ts
import { describeExhibitAudits } from '../../exhibit/testing'
import exhibit from './index'
describeExhibitAudits(exhibit)            // 机械可传 { phases: 120 }，榫卯可传 { perStep: 30 }
```

它会跑：结构校验、出处审计、实体审计（每个零件 `status = NoError`、非空、体积 > 0；manifold 的 NoError 即保证封闭）、干涉审计——

- 榫卯（`timeline.kind = 'assembly'`）：全部零件两两（`audit.ignore` 除外），装配路径每步 ≥ 20 个采样点（含装配完成态），交集 < 较小者体积的 **0.1%**。
- 机械（`'cyclic'`）：`audit.contacts` 中的零件对，每周期 ≥ 60 个相位，交集 < **0.5%**。只列真正接触或可能相碰的对；会经过别的零件的（如推杆越过磨面）也要列上。

阈值写死在 `THRESHOLD`，**不得放宽**；审计不过就改几何或模型。审计数值以 `[audit]` 前缀打印，交付说明要如实引用：`npx vitest run src/exhibits/<id> --silent=false`。

更多工具（`src/exhibit/audit.ts`）：

| 函数 | 用途 |
|---|---|
| `jointDistances(def, times, {part, local}, {part, local})` | 两零件上各一个局部点的世界距离序列。连杆长度不变（< 1e-6）、铰点重合都用它 |
| `cycleTimes(def, n)` | 一周期内均匀 n 个时刻 |
| `probeDof(k, def, t, movingParts, dofs)` | 把一组零件沿某自由度推 2 mm / 转 0.02 rad，量与其余零件的交集。> 1 mm³ 为被挡住，< 1e-6 为自由。用来验证 `locks` |
| `auditInterference(k, def, { times, pairs, threshold })` | 自定义采样的干涉审计 |
| `buildParts(k, def)` | 一次建好全部实体供多个审计复用，用完 `dispose()` |

**刚体模型做不到的事要如实写进测试**：例如透榫的楔锁依赖木材变形，`tou-sun/model.test.ts` 断言「横料连同楔整体外拉在几何上不受阻」，协同链对应环标 `model`/`reconstruction`。

## 9. 对 PLAN 4.1 契约的调整（逐条）

| # | 调整 | 理由 |
|---|---|---|
| 1 | `meta` 拆到独立的 `meta.ts`，`index.ts` 引用同一对象 | 首页只需元信息，展品主体（几何、模型）按需懒加载 |
| 2 | `PartDef.pose` 签名为 `(s, copy) => Pose`；新增 `copies`、`visible` | 颗粒、齿销等同形多件；粮粒「落入磨盘后消失」需要可见性 |
| 3 | `explode` 增加 `frame`、`with`、`hide` | 转动件上的附件要随姿态向外拆、随主体走；示意物爆炸时应隐藏 |
| 4 | 新增 `PartDef.features` 与链环的 `'part#feature'` 引用 | 磨眼、磨齿、榫头、锯缝是零件上的特征，不是独立实体；需要能点选、能在画面标注 |
| 5 | `ChainStep` 增加必填 `provenance`（+ `cite`），以及 `locks`/`locksProvenance` | 链环文字也是陈述，须带出处；榫卯每环要说明锁住了哪个方向，且锁定是否经几何验证要分开标 |
| 6 | `Readout` 增加可选 `cite` | 与陈述一致 |
| 7 | `SourceRef` 增加 `file`、`quote` | 出处审计逐字核对原文 |
| 8 | `ExhibitDef` 新增 `intro`、`defaults`、`view`、`section`、`audit` | 导言陈述；控件初值；取景；榫卯默认剖面；机械接触对 |
| 9 | `timeline`：cyclic 用 `period`，assembly 用 `duration`（秒），均可给 `defaultSpeed` | 装配进度固定为 [0,1]，需要另给播放时长 |
| 10 | 坐标约定 Y 朝上、mm、rad；平面图 (u,v) = (x,−z) | PLAN 未规定，统一后审计与展台共用 |
| 11 | `Claim.cite` 指向 `sources` 的键 | PLAN 写法未定 |
| 12 | `timeline`（cyclic）新增可选的 `minor`（小循环）与 `moments`（关键瞬间） | 周期 12 小时的摆钟、6000 秒的记里鼓车，周期 1/1000 的滑块步长拖不到一个节拍；见第 5 节「长周期展品的时间轴」 |
| 13 | `ExhibitDef` 新增可选 `views`（预设机位，`ViewPreset[]`） | 小零件、被遮挡的零件默认全景下看不清；机位 = 相机 + 让开 + 剖切 + 爆炸的一整套状态；见第 5 节「预设机位」 |
| 14 | `ChainStep` 新增可选 `window`、`view`、`speed`（第二轮 A1 讲解） | 讲解把「文字说的」和「画面里正在发生的」绑在同一时刻：每一环的时间段、机位、速度由数据决定；长周期里推导不到的环须显式写时间窗；见第 5 节「讲解」 |
| 15 | `ExhibitDef` 新增可选 `drive`（第二轮 A2 亲手驱动） | 自己推一下磨、拨一下摆比看播放更能建立因果感；拖动只改时间，运动仍只来自 `simulate`；见第 5 节「亲手驱动」 |
| 16 | `ExhibitDef` 新增可选 `traces`（第二轮 A3 迹线，`TraceDef<S>[]`） | 原理往往就是一条曲线的形状；数值只出自 `simulate`；见第 5 节「迹线」 |

## 10. 展台行为（不用写代码，但要知道）

- 取景：装配态与完全爆炸态的并集一定在画面内；中心偏向装配态，可用 `view.target` 指定。取景会扣掉工具条、机位条占去的画布边缘，并把模型挪到剩下的可用区域中央，所以装配态和爆炸态都不会钻到浮层底下。
- 悬停零件时鼠标旁显示零件名；画布下方有一行操作提示，机位条里的「?」列出鼠标、触屏、键盘的全部操作。窄屏（≤ 960 px）下工具条收成一行（爆炸、剖切、孤立 +「更多」），展品自己的控件与旋转/缩放按钮收在「更多」里；标题允许换行，不截断。
- 相机：滚轮朝鼠标所指处缩放；左键旋转、右键平移；触屏单指旋转、双指缩放与平移（画布 `touch-action: none`，页面不跟着滚）。选中零件后「凑近看」（按钮、`F` 键、双击零件）让相机平滑凑近并围绕它转；挡在前面的零件自动半透明，点「恢复遮挡」或 `Esc` 恢复。点协同链一环时，若这一环的零件在画面里很小或被挡住，相机会自动带过去（链环上的「看这里」则一定带过去）。`prefers-reduced-motion` 下相机直接到位、不做缓动。
- 强调色（朱砂）只给：选中零件 > 点住的链环 > 实时点亮的链环。其余零件保持材质色。
- 孤立：选中零件后可让其余零件半透明。
- 剖切：GPU 裁切平面 + 模板缓冲补截面（截面带 45° 剖面线），零件运动时截面实时正确，几何不重建。展品给推荐平面；用户可改为 X/Y/Z、移动、反向。
- `prefers-reduced-motion` 下机械展品默认暂停；榫卯展品默认停在「装好」状态，点播放从拆开开始装。
- 讲解：舞台工具条最左的「讲解」与协同链面板顶部的按钮进入，键盘 `]` 也可。讲解条在舞台下缘（不压在模型上）：「n / 共几环 · 标题」+ 这一环的文字 + 上一环 / 播放 / 下一环 / 退出，键盘 `[` `]`。进入某一环 = 时间跳到窗头并循环、这一环点住（强调色）、取消选中与孤立；有 `view` 套用机位，否则爆炸复原、剖切关闭、镜头从默认方向凑近并让开遮挡。讲解中不显示亲手驱动的提示标记。讲解中仍可旋转、缩放、拖时间轴、点零件、换机位（这一环仍点着）；拖过时间轴循环暂停，按播放从窗头继续。讲解中点协同链的任一环直接讲到那一环。退出（按钮、`Esc`）恢复进讲解前的爆炸、剖切、让开、选中、点住的环、孤立与播放状态，相机与时间留在原处。`prefers-reduced-motion` 下不自动循环，等观众按播放。
- 亲手驱动：可拖零件悬停时光标变手形、旁边显示提示语；首次进入展品时抓取处有一个墨色细圈与提示语（同一句提示只标一处），拖过一次后不再出现（记在本机浏览器里）。按在可拖零件上挪动 3 px 以上才算拖（原地点一下仍是选中），拖动时暂停播放（讲解中即暂停循环）、不转视角，松手后保持暂停。手指落在可拖零件上是拖零件，落在别处是转视角。爆炸量 > 0 时不可拖。
- 迹线：时间轴上方每条一行，名称与当前值标在线旁（宽屏在滑块左边，窄屏在曲线左上角）；朱红竖线与圆点是此刻。在图上点或拖动等同于拖时间轴（暂停播放）。换到下一个小循环或改了控件值时重新取样，取完之前旧线变淡。
- 零件显隐（不需要展品配置）：选中零件后「隐藏」（机位条的按钮、零件详情里的按钮、`H` 键），隐藏选中的零件同时取消选中；隐藏的零件不画、不能点、不挡视线，在零件面板里标「已隐藏」，点开可单独「显示」；「全部显示 (n)」一键恢复。预设机位、全景、讲解换环与退出讲解都不清掉观众隐藏的零件，只有「全部显示」清掉；讲解到某一环时，这一环要看的零件即使被隐藏也照常显示（离开这一环后恢复隐藏）。
- 键盘：空格播放/暂停，←→ 逐步（有小循环时按小循环的 1/steps），Shift+←→ 整格走，E 爆炸/复原，S 剖切，F 凑近看选中的零件，H 隐藏选中的零件，R 回全景，数字键 1–9 切预设机位，`[` `]` 讲解上一环 / 下一环，Esc 取消选中（讲解中为退出讲解）；所有功能也都有按钮。

## 11. 本地预览与检查

```bash
npm run dev -- --port <端口>   # 浏览器打开 /#/e/<id>；同机多个代理请各用各的端口
npm run typecheck
npm test                         # 或只跑自己的：npx vitest run src/exhibits/<id> --silent=false
npm run build && npm run e2e     # e2e 用 5183 端口，自动遍历所有展品、两种宽度
```

无头浏览器里 WebGL 走软件渲染，帧率不代表真实设备。

## 12. 常见坑

1. **截面坐标**：`extrude(..., 'y')` 的截面是 (z, x)。用错会得到转了 90° 的零件。
2. **面面重合**：配合面留 0.1 mm；刀具伸出 1 mm。审计里出现 1e-10 量级的交集是噪声，量级在 mm³ 以上才是真穿模。
3. **几何里读状态**：`solid(k)` 只调用一次，读 `s` 毫无效果。
4. **在 simulate 外做动画**：任何零件都不能自己随时间动，结构校验和审计都假定纯函数。
5. **周期不闭合**：cyclic 时间轴到 `period` 会绕回 0。所有随时间变化的量（含颗粒路线）周期必须整除 `period`，否则绕回时跳变。
6. **史料引文差一个字**：`quote` 要从 `docs/sources/*.md` 原样复制（繁体、异体字、全角标点）。
7. **协同链与画面不一致**：`active(s)` 与 `pose(s)` 读同一个状态；在 `model.test.ts` 里断言「任一时刻点亮的环」与模型阶段一致（参考 `shi-mo/model.test.ts`）。
8. **啮合相位**（齿轮作者）：齿位约定是「齿轮转角为 0 时 0 号齿中心在局部 0 角方向」；用 `kinematics/gears.ts` 的 `meshAngle`/`meshPlanar` 求从动轮转角，用 `toothPhase` 写相位测试。渐开线齿形、凸轮、擒纵请各自建新文件。
9. **大零件着色**：链环引用大零件（如上扇）会让整件变红；如果只想指出它上面的某处，引用特征 `'upper-stone#eye'`。
