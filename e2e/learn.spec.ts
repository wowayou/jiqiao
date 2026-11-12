// 第二轮「看懂为先」：讲解、亲手驱动、迹线、零件显隐。桌面 1440 与手机 390 两个项目都会跑。
// 无头浏览器是软件渲染，零件多的展品单帧可达数秒——等待一律用状态断言或 expect.poll，不用固定长 sleep。
import { expect, test, type Page } from '@playwright/test'
import { setRange, trackErrors } from './helpers'

async function openExhibit(page: Page, id: string) {
  await page.goto(`/#/e/${id}`)
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
}

const stage = (page: Page) => page.getByTestId('stage')
const scrubT = async (page: Page) => Number(await page.getByTestId('scrub').inputValue())

// —— A1 讲解 ——

test('讲解：一环一环走，时间只在这一环的时间窗里循环；退出后恢复之前的设置', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'shi-mo')
  // 观众自己先拉开一点爆炸、开剖切
  await setRange(page.getByTestId('explode'), 0.4)
  await page.getByTestId('section').click()
  await expect(page.getByTestId('section')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('tour-start').click()
  const bar = page.getByTestId('tour-bar')
  await expect(bar).toBeVisible()
  await expect(page.getByTestId('tour-count')).toHaveText('1 / 7')
  await expect(page.getByTestId('tour-title')).toHaveText('推半程')
  await expect(stage(page)).toHaveAttribute('data-tour', 'push')
  // 每一环是一整套状态：复原爆炸、关剖切，这一环在协同链里点着
  await expect(page.getByTestId('explode')).toHaveValue('0')
  await expect(page.getByTestId('section')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-step="push"] button.chain-head')).toHaveAttribute('aria-pressed', 'true')

  // 下一环、键盘 ] [
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-title')).toHaveText('拉半程')
  await page.keyboard.press(']')
  await expect(page.getByTestId('tour-title')).toHaveText('越过死点')
  // 「越过死点」的时间窗是 0 前后 0.22 秒：播放中时间只在窗里循环
  await expect(page.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'true')
  for (let i = 0; i < 4; i++) {
    const t = await scrubT(page)
    expect(t < 0.3 || t > 3.7, `t=${t} 跑出了时间窗`).toBe(true)
    await page.waitForTimeout(400)
  }
  await page.keyboard.press('[')
  await expect(page.getByTestId('tour-title')).toHaveText('拉半程')

  // 拖时间轴：循环暂停；按播放继续（从窗头开始）
  await setRange(page.getByTestId('scrub'), 3)
  await expect(page.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('tour-play').click()
  await expect(page.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'true')

  // 退出：爆炸与剖切回到进讲解之前
  await page.getByTestId('tour-exit').click()
  await expect(bar).toHaveCount(0)
  await expect(stage(page)).toHaveAttribute('data-tour', '')
  await expect(page.getByTestId('explode')).toHaveValue('0.4')
  await expect(page.getByTestId('section')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('讲解：协同链面板顶部也能开始；讲解中点任一环直接讲到那一环，并用这一环的预设机位；Esc 退出', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  await page.getByRole('tab', { name: '协同链' }).click()
  await page.getByTestId('tour-start-panel').click()
  await expect(page.getByTestId('tour-count')).toHaveText(/^1 \/ \d+$/)
  await page.locator('[data-step="impulse-entry"] button.chain-head').click()
  await expect(stage(page)).toHaveAttribute('data-tour', 'impulse-entry')
  await expect(page.locator('[data-view="escapement"]')).toHaveAttribute('aria-pressed', 'true')
  // 冲击 · 入瓦 的时间窗在一摆之内：细调条读数在窗里
  await expect.poll(async () => Number(await page.getByTestId('fine').inputValue()) % 2, { timeout: 20_000 }).toBeLessThan(0.75)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tour-bar')).toHaveCount(0)
  await expect(page.getByTestId('tour-start-panel')).toBeVisible()
})

test('讲解：推导不到的环（第 100 圈的击鼓）按展品写的时间窗跳过去', async ({ page }) => {
  await openExhibit(page, 'jili-gu-che')
  await page.getByTestId('tour-start').click()
  await page.locator('[data-step="drum"] button.chain-head').click()
  await expect(stage(page)).toHaveAttribute('data-tour', 'drum')
  // 第 100 圈附近
  await expect(page.getByTestId('fine-name')).toContainText(/第 (100|101) 圈/)
})

test('讲解：减少动效时不自动循环，给播放按钮；相机直接到位', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${process.env.E2E_PORT ?? 5183}` })
  const page = await ctx.newPage()
  await openExhibit(page, 'shi-mo')
  await page.getByTestId('tour-start').click()
  await expect(page.getByTestId('tour-play')).toHaveAttribute('aria-pressed', 'false')
  const t0 = await scrubT(page)
  await page.waitForTimeout(800)
  expect(await scrubT(page)).toBe(t0)
  const anims: string[] = []
  for (let i = 0; i < 6; i++) {
    anims.push((await page.locator('canvas').getAttribute('data-cam-anim')) ?? '')
    await page.waitForTimeout(150)
  }
  expect(anims).not.toContain('1')
  await page.getByTestId('tour-play').click()
  await expect.poll(() => scrubT(page), { timeout: 10_000 }).not.toBe(t0)
  await ctx.close()
})

test('讲解条在舞台下面，不压在模型上；手机宽度按钮点得到、不溢出', async ({ page }) => {
  await openExhibit(page, 'shui-dui')
  await page.getByTestId('tour-start').click()
  const bar = (await page.getByTestId('tour-bar').boundingBox())!
  const wrap = (await stage(page).boundingBox())!
  expect(bar.y).toBeGreaterThanOrEqual(wrap.y + wrap.height - 1)
  const bad = await page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('.tour-bar button, .stage-overlay button')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push(`${el.textContent} 越界`)
      if (r.height < 28) out.push(`${el.textContent} 太矮`)
    }
    return out
  })
  expect(bad).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

// —— A2 亲手驱动 ——

type Anchor = { part: string; x: number; y: number }
/** 可拖零件提示点的屏幕位置；等它连续两次读数相同（画面已按最新的时间与相机画出）再返回 */
async function anchorOf(page: Page, part: string): Promise<Anchor> {
  let a: Anchor | undefined
  let last = ''
  await expect
    .poll(
      async () => {
        const list = JSON.parse((await page.locator('canvas').getAttribute('data-drive-anchors')) ?? '[]') as Anchor[]
        a = list.find((x) => x.part === part)
        const key = JSON.stringify(a)
        const same = Boolean(a) && key === last
        last = key
        return same
      },
      { timeout: 30_000, intervals: [300] },
    )
    .toBe(true)
  return a!
}

/** 从 (x, y) 拖到 (x+dx, y+dy)：桌面用鼠标，手机用触屏事件 */
async function dragOnCanvas(page: Page, isMobile: boolean, from: { x: number; y: number }, dx: number, dy: number) {
  const box = (await page.locator('canvas').boundingBox())!
  const x = box.x + from.x
  const y = box.y + from.y
  const n = 10
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) })
    await touch('touchStart', [{ x, y }])
    for (let i = 1; i <= n; i++) await touch('touchMove', [{ x: x + (dx * i) / n, y: y + (dy * i) / n }])
    await touch('touchEnd', [])
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= n; i++) await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n)
    await page.mouse.up()
  }
}

async function pauseAt(page: Page, t: number) {
  const play = page.getByTestId('play')
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  await setRange(page.getByTestId('scrub'), t)
}

const camSettled = (page: Page) => expect.poll(async () => page.locator('canvas').getAttribute('data-cam-anim'), { timeout: 20_000 }).toBe('0')

test('亲手驱动：抓住石磨横把拖动，时间跟着走、横把朝手的方向移动；相机不转、不误选；提示标记交互一次后消失', async ({ page, isMobile }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'shi-mo')
  await pauseAt(page, 1)
  await page.locator('.stage-wrap').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-drive="push-rod"]')).toBeVisible()
  await camSettled(page)
  const a0 = await anchorOf(page, 'push-rod')
  const az0 = await page.locator('canvas').getAttribute('data-cam-az')
  const t0 = await scrubT(page)
  const [dx, dy] = isMobile ? [30, 10] : [60, 20]
  await dragOnCanvas(page, isMobile, a0, dx, dy)
  await expect.poll(() => scrubT(page)).not.toBe(t0)
  // 横把的屏幕位置比拖动前更靠近手指 / 鼠标：方向与手一致
  const target = { x: a0.x + dx, y: a0.y + dy }
  await expect
    .poll(async () => {
      const a1 = await anchorOf(page, 'push-rod')
      return Math.hypot(a1.x - target.x, a1.y - target.y) < Math.hypot(a0.x - target.x, a0.y - target.y) * 0.5
    })
    .toBe(true)
  expect(await page.locator('canvas').getAttribute('data-cam-az')).toBe(az0)
  await expect(stage(page)).toHaveAttribute('data-selected', '')
  await expect(page.getByTestId('play')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-drive="push-rod"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('亲手驱动：拆开（爆炸）时不可拖，按在零件上照常转视角', async ({ page, isMobile }) => {
  await openExhibit(page, 'shi-mo')
  await pauseAt(page, 1)
  await page.locator('.stage-wrap').scrollIntoViewIfNeeded()
  await setRange(page.getByTestId('explode'), 0.02)
  await expect(page.locator('[data-drive="push-rod"]')).toHaveCount(0)
  await camSettled(page)
  const a = await anchorOf(page, 'push-rod')
  const az0 = await page.locator('canvas').getAttribute('data-cam-az')
  const t0 = await scrubT(page)
  await dragOnCanvas(page, isMobile, a, 60, 0)
  await expect.poll(async () => page.locator('canvas').getAttribute('data-cam-az'), { timeout: 20_000 }).not.toBe(az0)
  expect(await scrubT(page)).toBe(t0)
})

test('亲手驱动：悬停可拖零件显示提示语、光标变手形；原地点一下仍是选中', async ({ page, isMobile }) => {
  test.skip(isMobile, '触屏没有悬停')
  await openExhibit(page, 'shi-mo')
  await pauseAt(page, 1)
  await camSettled(page)
  const a = await anchorOf(page, 'push-rod')
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + a.x, box.y + a.y)
  await page.mouse.move(box.x + a.x + 1, box.y + a.y)
  await expect(page.getByTestId('hover-tip')).toContainText('推拉横把')
  await expect.poll(() => page.locator('canvas').evaluate((c) => (c as HTMLElement).style.cursor)).toBe('grab')
  await page.mouse.click(box.x + a.x + 1, box.y + a.y)
  await expect(stage(page)).toHaveAttribute('data-selected', 'push-rod')
})

test('亲手驱动：透榫的横料只在第一步动——楔打着时拖不动，拔出楔之后能拖', async ({ page, isMobile }) => {
  await openExhibit(page, 'tou-sun')
  await page.locator('.stage-wrap').scrollIntoViewIfNeeded()
  await pauseAt(page, 1)
  await camSettled(page)
  const a = await anchorOf(page, 'rail')
  await dragOnCanvas(page, isMobile, a, 50, 0)
  await page.waitForTimeout(300)
  expect(await scrubT(page)).toBe(1)
  // 装配进度 25%：横料正在进卯眼，拖得动
  await setRange(page.getByTestId('scrub'), 0.25)
  await expect.poll(async () => (await anchorOf(page, 'rail')).x).not.toBe(a.x)
  const b = await anchorOf(page, 'rail')
  await dragOnCanvas(page, isMobile, b, 40, 0)
  await expect.poll(() => scrubT(page)).not.toBe(0.25)
})

// —— A3 迹线 ——

test('迹线：时间轴上方每条一行、直接标名称与当前值；游标与细调条对齐；在图上点等同于拖时间轴', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'bai-zhong')
  await pauseAt(page, 0)
  const traces = page.getByTestId('traces')
  await expect(traces).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('[data-trace-label="pendulum"]')).toContainText('摆角')
  await expect(page.locator('[data-trace-label="escape"]')).toContainText('擒纵轮转角')
  // 细调条拖到这一摆的一半：游标竖线的横坐标对上滑块的中点
  const fine = page.getByTestId('fine')
  const min = Number(await fine.getAttribute('min'))
  await setRange(fine, min + 1)
  const fb = (await fine.boundingBox())!
  await expect
    .poll(async () => {
      const x = Number(await page.locator('.trace-cursor').getAttribute('x1'))
      const tb = (await traces.boundingBox())!
      return Math.abs(tb.x + x - (fb.x + fb.width / 2))
    })
    .toBeLessThan(10)
  // 在曲线上点 3/4 处：时间跳到这一摆的 3/4（1.5 秒）
  const svg = page.locator('.trace-svg')
  const sb = (await svg.boundingBox())!
  const x0 = fb.x + 8 - sb.x
  const x1 = fb.x + fb.width - 8 - sb.x
  await svg.click({ position: { x: x0 + (x1 - x0) * 0.75, y: 10 } })
  await expect.poll(async () => Number(await fine.inputValue()) - min).toBeCloseTo(1.5, 1)
  await expect(page.getByTestId('play')).toHaveAttribute('aria-pressed', 'false')
  // 擒纵轮转角是台阶：曲线上有一段一段水平的线
  const d = (await page.locator('[data-trace="escape"] path').getAttribute('d'))!
  const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]))
  const flat = ys.filter((y, i) => i > 0 && Math.abs(y - ys[i - 1]) < 0.05).length
  expect(flat).toBeGreaterThan(ys.length * 0.5)
  // 「怎么读」写明每条线
  await page.getByText(/怎么读这/).click()
  await expect(traces).toContainText('台阶')
  expect(errors).toEqual([])
})

test('迹线：控件值变了重算（独轮车货物位置挪向轮轴，人手承担整条变低）', async ({ page }) => {
  await openExhibit(page, 'muniu-dulun')
  await pauseAt(page, 10)
  const traces = page.getByTestId('traces')
  await expect(traces).toHaveAttribute('data-ready', 'true')
  const path = page.locator('[data-trace="hand"] path')
  const d0 = await path.getAttribute('d')
  const label0 = await page.locator('[data-trace-label="hand"]').innerText()
  await setRange(page.locator('.stage-overlay input[type="range"]').nth(1), 100)
  await expect.poll(() => path.getAttribute('d')).not.toBe(d0)
  await expect(page.locator('[data-trace-label="hand"]')).not.toHaveText(label0)
})

test('迹线：每个展品都有，横轴在手机宽度下不溢出', async ({ page }) => {
  for (const id of ['shi-mo', 'tou-sun']) {
    await openExhibit(page, id)
    await expect(page.getByTestId('traces')).toHaveAttribute('data-ready', 'true')
    expect(await page.locator('.trace-label').count()).toBeGreaterThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  }
})
