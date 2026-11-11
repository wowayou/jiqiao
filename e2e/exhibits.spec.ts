// 按注册表自动遍历所有展品（新增展品自动被覆盖），在桌面 1440 与手机 390 两种宽度下检查：
// 加载无控制台错误；画布非空白；播放/暂停、调速、爆炸、点选零件、协同链高亮、剖切可用。
import { expect, test } from '@playwright/test'
import { canvasShot, distinctColors, expectCanvasChanged, exhibitIds, setRange, trackErrors } from './helpers'

const ids = exhibitIds()

test('首页按类别列出全部展品，且无控制台错误', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '机巧', level: 1 })).toBeVisible()
  const listed = await page.locator('a[data-exhibit]').evaluateAll((as) => as.map((a) => a.getAttribute('data-exhibit')).sort())
  expect(listed).toEqual(ids)
  // 无横向溢出
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

for (const id of ids) {
  test(`展品 ${id}：加载、画布、播放、调速、爆炸、点选、协同链、剖切`, async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.locator(`a[data-exhibit="${id}"]`).click()
    await expect(page).toHaveURL(new RegExp(`#/e/${id}$`))
    const stage = page.getByTestId('stage')
    await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 45_000 })
    const canvas = stage.locator('canvas')
    await expect(canvas).toBeVisible()
    await page.waitForTimeout(500)

    // 画布非空白
    expect(await distinctColors(page, canvas)).toBeGreaterThan(50)

    // 播放 / 暂停
    const play = page.getByTestId('play')
    const scrub = page.getByTestId('scrub')
    if ((await play.getAttribute('aria-pressed')) === 'true') await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    await setRange(scrub, 0)
    const t0 = Number(await scrub.inputValue())
    await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).not.toBe(t0)
    await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'false')

    // 调速
    const speed = page.getByTestId('speed')
    const options = await speed.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    expect(options.length).toBeGreaterThan(1)
    await speed.selectOption(options[0])
    await expect(speed).toHaveValue(options[0])

    // 拖动进度 → 读数随之变化
    const readouts = page.getByTestId('readouts')
    const r0 = await readouts.innerText()
    const max = Number(await scrub.getAttribute('max'))
    await setRange(scrub, max * 0.37)
    await expect.poll(() => readouts.innerText()).not.toBe(r0)

    // 爆炸
    let before = await canvasShot(canvas)
    await setRange(page.getByTestId('explode'), 1)
    await expectCanvasChanged(page, canvas, before)
    await setRange(page.getByTestId('explode'), 0)

    // 点选零件（从零件面板），画面高亮
    await page.getByRole('tab', { name: '零件' }).click()
    const firstPart = page.locator('[data-part]').first()
    const partId = await firstPart.getAttribute('data-part')
    before = await canvasShot(canvas)
    await firstPart.click()
    await expect(page.getByTestId('part-detail')).toBeVisible()
    await expect(stage).toHaveAttribute('data-selected', partId!)
    await expectCanvasChanged(page, canvas, before)
    await page.keyboard.press('Escape')
    await expect(stage).toHaveAttribute('data-selected', '')

    // 协同链：点一环 → 固定高亮
    await page.getByRole('tab', { name: '协同链' }).click()
    const chain = page.getByTestId('chain')
    const steps = chain.locator('button.chain-head')
    expect(await steps.count()).toBeGreaterThan(0)
    await steps.first().click()
    await expect(steps.first()).toHaveAttribute('aria-pressed', 'true')
    await steps.first().click()
    await expect(steps.first()).toHaveAttribute('aria-pressed', 'false')
    // 运行中有环实时点亮
    await play.click()
    await expect.poll(() => chain.locator('[data-active="true"]').count(), { timeout: 10_000 }).toBeGreaterThan(0)
    await play.click()

    // 剖切（带截面）
    const section = page.getByTestId('section')
    before = await canvasShot(canvas)
    await section.click()
    await expect(section).toHaveAttribute('aria-pressed', 'true')
    await expectCanvasChanged(page, canvas, before)
    expect(await distinctColors(page, canvas)).toBeGreaterThan(50)

    // 无横向溢出
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(errors).toEqual([])
  })
}
