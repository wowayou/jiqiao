// 第二轮 B「视觉精修」的浏览器测试。桌面 1440 与手机 390 两个项目都会跑。
// 无头浏览器是软件渲染：等待一律用状态断言或 expect.poll，不用固定长 sleep。
import { expect, test, type Page } from '@playwright/test'
import { distinctColors, exhibitIds, trackErrors } from './helpers'

const ids = exhibitIds()

async function openExhibit(page: Page, id: string) {
  await page.goto(`/#/e/${id}`)
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const stageRatio = (page: Page) =>
  page.evaluate(() => document.querySelector('.stage-wrap')!.getBoundingClientRect().height / window.innerHeight)

// —— 第一组：桌面舞台占比 ——

for (const [w, h, min] of [
  [1440, 900, 0.55],
  [1280, 720, 0.5],
] as const) {
  for (const id of ids) {
    test(`舞台占比 ${w}×${h} · ${id}：讲解中与非讲解都不小于视口高度的 ${min * 100}%，无横向滚动`, async ({ page, isMobile }) => {
      test.skip(isMobile, '桌面（≥961px）才有这条要求')
      test.setTimeout(240_000)
      await page.setViewportSize({ width: w, height: h })
      await openExhibit(page, id)
      expect(await stageRatio(page)).toBeGreaterThanOrEqual(min)
      expect(await noOverflow(page)).toBeLessThanOrEqual(0)
      await page.getByTestId('tour-start').click()
      const n = Number((await page.getByTestId('tour-count').innerText()).split('/')[1])
      // 每一环的说明条长短不同：逐环都量
      for (let i = 0; i < n; i++) {
        await expect(page.getByTestId('tour-count')).toHaveText(`${i + 1} / ${n}`)
        const r = await stageRatio(page)
        expect(r, `第 ${i + 1} 环 ${(r * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(min)
        if (i < n - 1) await page.getByTestId('tour-next').click()
      }
      expect(await noOverflow(page)).toBeLessThanOrEqual(0)
    })
  }
}

test('讲解中：操作提示行收起、读数折成一行；点一下展开，再点收起；退出讲解后恢复默认', async ({ page, isMobile }) => {
  test.skip(isMobile, '桌面 1440×900：非讲解时读数默认展开')
  await openExhibit(page, 'bai-zhong')
  const readouts = page.getByTestId('readouts')
  const toggle = page.getByTestId('readouts-toggle')
  await expect(page.locator('.stage-tip')).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(readouts.locator('.readout-grid dt')).not.toHaveCount(0)
  await page.getByTestId('tour-start').click()
  await expect(page.locator('.stage-tip')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(readouts.locator('.readout-grid')).toHaveCount(0)
  // 折叠时仍然看得到读数（一行摘要）
  await expect(readouts.locator('.readout-brief')).toContainText('钟面时间')
  const folded = (await readouts.boundingBox())!.height
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(await readouts.locator('.readout-grid dt').count()).toBeGreaterThanOrEqual(6)
  expect((await readouts.boundingBox())!.height).toBeGreaterThan(folded)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('tour-exit').click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.stage-tip')).toBeVisible()
})

test('手机宽度：舞台高度不变（62vh），讲解中也不横向溢出', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅手机宽度')
  await openExhibit(page, 'shui-dui')
  const r0 = await stageRatio(page)
  expect(r0).toBeGreaterThan(0.55)
  await page.getByTestId('tour-start').click()
  expect(Math.abs((await stageRatio(page)) - r0)).toBeLessThan(0.01)
  expect(await noOverflow(page)).toBeLessThanOrEqual(0)
})

test('展品页加载与讲解无控制台错误（第一组改动后）', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'shi-mo')
  await page.getByTestId('tour-start').click()
  await page.getByTestId('tour-next').click()
  expect(errors).toEqual([])
})

// —— 第二组：读数出处标记、协同链折叠、特征标注、工具条与触屏目标 ——

async function pauseAt(page: Page, t: number) {
  const play = page.getByTestId('play')
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  const scrub = page.getByTestId('scrub')
  await scrub.evaluate((el, v) => {
    const i = el as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(v))
    i.dispatchEvent(new Event('input', { bubbles: true }))
    i.dispatchEvent(new Event('change', { bubbles: true }))
  }, t)
}

test('读数：栅格里每项都有一字出处标记，全称在 aria-label 与 title；图例在「说明与出处」页', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  const toggle = page.getByTestId('readouts-toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  const cells = page.locator('.readout-grid > div')
  const n = await cells.count()
  expect(n).toBeGreaterThanOrEqual(6)
  // 每格：标签 + 数值 + 恰好一个一字标记
  expect(await page.locator('.readout-grid .prov-mark').count()).toBe(n)
  const marks = await page.locator('.readout-grid .prov-mark').evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent, label: e.getAttribute('aria-label'), title: e.getAttribute('title'), prov: e.getAttribute('data-prov') })),
  )
  const FULL: Record<string, [string, string]> = { source: ['史', '史料'], reconstruction: ['复', '通行复原'], hypothesis: ['假', '假说'], model: ['设', '本站设定'], calc: ['算', '计算所得'] }
  for (const m of marks) {
    expect(m.text!.length).toBe(1)
    const [ch, full] = FULL[m.prov!]
    expect(m.text).toBe(ch)
    expect(m.label).toContain(full)
    expect(m.title).toContain(full)
  }
  // 数值用等宽数字
  expect(await page.locator('.readout-grid dd').first().evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain('tabular-nums')
  // 图例：五类各有一字标记与全称
  await page.getByRole('tab', { name: '说明与出处' }).click()
  const legend = page.getByTestId('prov-legend')
  for (const [ch, full] of Object.values(FULL)) {
    const item = legend.locator('li', { hasText: full })
    await expect(item).toHaveCount(1)
    await expect(item.locator('.prov-mark')).toHaveText(ch)
  }
})

test('协同链：默认只展开「此刻」的一环；点标题行（固定）展开；右侧箭头按钮（aria-expanded）单独展开 / 收起，键盘可达', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  await pauseAt(page, 0)
  const chain = page.getByTestId('chain')
  const steps = chain.locator('li.chain-step')
  const total = await steps.count()
  // 展开的恰好是此刻点亮的环；其余只剩标题行
  await expect.poll(async () => (await chain.locator('[data-active="true"]').count()) > 0).toBe(true)
  const openIds = await chain.locator('li[data-open="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step')))
  const activeIds = await chain.locator('li[data-active="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step')))
  expect(openIds.sort()).toEqual(activeIds.sort())
  expect(openIds.length).toBeLessThan(total)
  // 折叠的环：说明不可见；展开的环：说明可见
  const sid = (await chain.locator('li[data-open="false"]').first().getAttribute('data-step'))!
  const collapsed = chain.locator(`li[data-step="${sid}"]`)
  await expect(collapsed.locator('.chain-text')).toBeHidden()
  await expect(chain.locator('li[data-open="true"] .chain-text').first()).toBeVisible()
  // 箭头按钮：键盘聚焦 + 回车展开
  const btn = chain.locator(`[data-toggle="${sid}"]`)
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await btn.focus()
  await page.keyboard.press('Enter')
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  await expect(collapsed.locator('.chain-text')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await expect(collapsed.locator('.chain-text')).toBeHidden()
  // 点标题行：固定这一环，同时展开
  const oid = (await chain.locator('li[data-open="false"]').last().getAttribute('data-step'))!
  const other = chain.locator(`li[data-step="${oid}"]`)
  await other.locator('button.chain-head').click()
  await expect(other.locator('button.chain-head')).toHaveAttribute('aria-pressed', 'true')
  await expect(other).toHaveAttribute('data-open', 'true')
  await expect(chain.locator(`[data-toggle="${oid}"]`)).toHaveAttribute('aria-expanded', 'true')
  await expect(other.locator('.chain-text')).toBeVisible()
})

test('特征标注：实时点亮的环不冒标注；点住这一环才显示', async ({ page }) => {
  await openExhibit(page, 'jili-gu-che')
  await pauseAt(page, 1)
  await expect.poll(async () => page.getByTestId('chain').locator('[data-active="true"]').count()).toBeGreaterThan(0)
  await page.waitForTimeout(800)
  await expect(page.locator('.feature-pin')).toHaveCount(0)
  // 逐环点住，直到出现带特征的环
  const heads = page.getByTestId('chain').locator('button.chain-head')
  const n = await heads.count()
  let found = false
  for (let i = 0; i < n && !found; i++) {
    await heads.nth(i).click()
    await expect(heads.nth(i)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(400)
    found = (await page.locator('.feature-pin').count()) > 0
  }
  expect(found).toBe(true)
})

test('工具条：每个按钮都有提示（title），图标按钮是统一的 SVG 图标', async ({ page, isMobile }) => {
  await openExhibit(page, 'muniu-dulun')
  if (isMobile) await page.getByTestId('more-tools').click()
  const bad = await page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('.stage-overlay button, .stage-overlay select, .stage-overlay label, .stage-views button')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      const hasTip = el.getAttribute('title') || el.closest('[title]')
      if (!hasTip) out.push(`${el.tagName} ${el.textContent?.trim() || el.getAttribute('aria-label')} 没有 title`)
    }
    return out
  })
  expect(bad).toEqual([])
  const group = page.getByRole('group', { name: '视角' })
  await expect(group.locator('button svg.icon')).toHaveCount(4)
})

test('点击目标：触屏（pointer: coarse）下按钮、下拉、滑块不小于 44 px；桌面不撑大', async ({ page, isMobile }) => {
  await openExhibit(page, 'muniu-dulun')
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
  // 手机项目开了触屏模拟，必须命中 coarse；桌面项目必须不命中
  expect(coarse).toBe(isMobile)
  if (isMobile) await page.getByTestId('more-tools').click()
  const sizes = await page.evaluate(() => {
    const out: { what: string; h: number }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('button, select, input[type="range"], summary')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      out.push({ what: `${el.tagName}.${el.className} ${el.textContent?.trim().slice(0, 12) ?? ''}`, h: Math.round(r.height * 10) / 10 })
    }
    return out
  })
  expect(sizes.length).toBeGreaterThan(10)
  if (coarse) expect(sizes.filter((s) => s.h < 43.5)).toEqual([])
  else expect(sizes.filter((s) => s.h > 40 && /\bbtn\b/.test(s.what) && !/chain-head/.test(s.what))).toEqual([])
})

// —— 第四组：缩略图、加载状态、过渡动效、暗色主题 ——

test('首页：每张卡片有缩略图，当前主题那张加载成功，另一主题那张不显示；无横向溢出', async ({ page }) => {
  const errors = trackErrors(page)
  // 只在第一次设（重新加载时保留测试中途改的偏好）
  await page.addInitScript(() => {
    if (!localStorage.getItem('jiqiao-theme')) localStorage.setItem('jiqiao-theme', 'light')
  })
  await page.goto('/')
  const cards = page.locator('a.card')
  expect(await cards.count()).toBe(ids.length)
  for (const id of ids) {
    const card = page.locator(`a.card[data-exhibit="${id}"]`)
    await card.scrollIntoViewIfNeeded()
    const light = card.locator('img.thumb-light')
    await expect(light).toBeVisible()
    await expect(card.locator('img.thumb-dark')).toBeHidden()
    await expect.poll(() => light.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100)
  }
  expect(await noOverflow(page)).toBeLessThanOrEqual(0)
  // 切到深色：换成深色那张
  await page.evaluate(() => {
    localStorage.setItem('jiqiao-theme', 'dark')
  })
  await page.reload()
  const card = page.locator(`a.card[data-exhibit="${ids[0]}"]`)
  await expect(card.locator('img.thumb-dark')).toBeVisible()
  await expect(card.locator('img.thumb-light')).toBeHidden()
  await expect.poll(() => card.locator('img.thumb-dark').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100)
  expect(errors).toEqual([])
})

test('加载状态：几何生成中显示「第几个零件」与名称和进度条，而不是空白', async ({ page }) => {
  // 把几何生成里「让出主线程」的 setTimeout(0) 拉长到 120 ms，生成过程才停得住让测试看到
  await page.addInitScript(() => {
    const orig = window.setTimeout
    // @ts-expect-error 测试里替换全局函数
    window.setTimeout = (fn: TimerHandler, ms?: number, ...rest: unknown[]) => orig(fn, ms === 0 ? 120 : ms, ...rest)
  })
  await page.goto('/#/e/bai-zhong')
  const status = page.getByTestId('stage-status')
  await expect(status).toContainText(/正在生成第 \d+ \/ \d+ 个零件：\S+/)
  const first = Number(await status.getAttribute('data-done'))
  await expect.poll(async () => Number((await status.getAttribute('data-done')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(first)
  await expect(status.locator('.build-bar span')).toBeAttached()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
  await expect(status).toHaveCount(0)
})

test('过渡动效 150–250 ms；减少动效下全部关闭', async ({ browser, baseURL }) => {
  const ms = (s: string) => s.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000))
  for (const reduce of [false, true]) {
    const ctx = await browser.newContext({ reducedMotion: reduce ? 'reduce' : 'no-preference', viewport: { width: 1440, height: 900 }, baseURL })
    const page = await ctx.newPage()
    await page.goto('/')
    const durations = await page.evaluate(() => {
      const card = document.querySelector('a.card')!
      const btn = document.querySelector('.btn')!
      return { card: getComputedStyle(card).transitionDuration, thumb: getComputedStyle(document.querySelector('.thumb')!).transitionDuration, btn: getComputedStyle(btn).transitionDuration }
    })
    for (const d of Object.values(durations)) {
      for (const v of ms(d)) {
        if (reduce) expect(v).toBe(0)
        else {
          expect(v).toBeGreaterThanOrEqual(150)
          expect(v).toBeLessThanOrEqual(250)
        }
      }
    }
    await ctx.close()
  }
})

test('暗色主题：文字、强调色对背景的对比度不低于 4.5:1，按钮边框不低于 3:1', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jiqiao-theme', 'dark'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const out: Record<string, string> = {}
    for (const k of ['paper', 'paper-2', 'paper-3', 'ink', 'ink-2', 'ink-3', 'accent', 'line-strong']) out[k] = cs.getPropertyValue(`--${k}`).trim()
    return out
  })
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  // 小字常出现在 paper、paper-2（卡片、讲解条、协同链）上；paper-3 只用于少数强调块，给 ink-3 以外的文字色验
  for (const fg of ['ink', 'ink-2', 'ink-3', 'accent']) {
    for (const bg of ['paper', 'paper-2']) expect(ratio(tokens[fg], tokens[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  }
  for (const fg of ['ink', 'ink-2', 'ink-3']) expect(ratio(tokens[fg], tokens['paper-3']), `${fg} on paper-3`).toBeGreaterThanOrEqual(4.5)
  expect(ratio(tokens['line-strong'], tokens.paper)).toBeGreaterThanOrEqual(3)
})

// —— 第五组：讲解自动取景（没有预设机位的环）——
// data-fit-max：讲解取景框住的那一环的角点（整个时间窗里所有零件的包围盒角点）投影到画布后，离中心最远的归一化坐标。
// ≤ 1：这一环没有零件出画；≥ 0.6：框得紧（改前，石磨第 1–3 环只有 0.37 左右、摆钟「摆定节拍」0.58）。
for (const id of ids) {
  test(`讲解自动取景 · ${id}：没有预设机位的环，零件全在画内且取景够紧`, async ({ page }) => {
    test.setTimeout(240_000)
    await openExhibit(page, id)
    await page.getByTestId('tour-start').click()
    const n = Number((await page.getByTestId('tour-count').innerText()).split('/')[1])
    let checked = 0
    for (let i = 0; i < n; i++) {
      await expect(page.getByTestId('tour-count')).toHaveText(`${i + 1} / ${n}`)
      const preset = (await page.locator('[data-view][aria-pressed="true"]').count()) > 0
      if (!preset) {
        // 相机到位、读数出来
        await expect.poll(async () => page.locator('canvas').getAttribute('data-cam-anim'), { timeout: 30_000 }).toBe('0')
        await expect.poll(async () => page.locator('canvas').getAttribute('data-fit-max'), { timeout: 30_000 }).not.toBeNull()
        const v = Number(await page.locator('canvas').getAttribute('data-fit-max'))
        expect(v, `第 ${i + 1} 环 fitMax=${v}`).toBeLessThanOrEqual(1)
        expect(v, `第 ${i + 1} 环 fitMax=${v}`).toBeGreaterThanOrEqual(0.6)
        checked++
      }
      if (i < n - 1) await page.getByTestId('tour-next').click()
    }
    expect(checked).toBeGreaterThan(0)
  })
}

// —— 第三组：半透明零件 ——

test('摆钟「擒纵」机位：表盘等让开（半透明），可一键恢复；画布非空白、无控制台错误', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'bai-zhong')
  await page.locator('[data-view="escapement"]').click()
  await expect(page.locator('[data-view="escapement"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('clear-fade')).toContainText('恢复遮挡')
  await expect.poll(async () => page.locator('canvas').getAttribute('data-cam-anim'), { timeout: 30_000 }).toBe('0')
  expect(await distinctColors(page, page.locator('canvas'))).toBeGreaterThan(50)
  expect(errors).toEqual([])
})
