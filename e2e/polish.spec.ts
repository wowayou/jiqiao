// 第二轮 B「视觉精修」的浏览器测试。桌面 1440 与手机 390 两个项目都会跑。
// 无头浏览器是软件渲染：等待一律用状态断言或 expect.poll，不用固定长 sleep。
import { expect, test, type Page } from '@playwright/test'
import { exhibitIds, trackErrors } from './helpers'

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
