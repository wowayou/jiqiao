// 交互专项：细调时间轴、聚焦、预设机位、相关展品链接、手机宽度无截断无溢出。
// 无头浏览器是软件渲染，零件多的展品单帧可达数秒——等待一律用 expect.poll / 状态断言，不用固定长 sleep。
import { expect, test, type Page } from '@playwright/test'
import { setRange, trackErrors } from './helpers'

async function openExhibit(page: Page, id: string) {
  await page.goto(`/#/e/${id}`)
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
  const play = page.getByTestId('play')
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
}

const num = async (loc: ReturnType<Page['getByTestId']>) => Number(await loc.inputValue())

// 三个长周期/多碓展品都有小循环与细调条
const FINE: { id: string; minor: number; unit: string; moment: string; readout: RegExp }[] = [
  { id: 'bai-zhong', minor: 2, unit: '摆', moment: '冲击 · 入瓦', readout: /冲击 · 入瓦/ },
  { id: 'jili-gu-che', minor: 2, unit: '圈', moment: '击鼓（一里）', readout: /击鼓/ },
  { id: 'shui-dui', minor: 5, unit: '次起落', moment: '碓头砸进臼里（碓一）', readout: /砸进臼里 \/ / },
]

for (const f of FINE) {
  test(`时间轴细调 · ${f.id}：细调条只覆盖当前小循环，单步是小循环的几十分之一，关键瞬间一点即到`, async ({ page }) => {
    const errors = trackErrors(page)
    await openExhibit(page, f.id)
    const fine = page.getByTestId('fine')
    const scrub = page.getByTestId('scrub')
    await setRange(scrub, 0)
    // 细调条的量程就是一个小循环
    const range = await fine.evaluate((el) => {
      const i = el as HTMLInputElement
      return [Number(i.min), Number(i.max), Number(i.step)]
    })
    expect(range[1] - range[0]).toBeCloseTo(f.minor, 6)
    expect(range[2]).toBeLessThanOrEqual(f.minor / 500)
    // 单步前进：前进量 = 小循环 / 步数，远小于粗调条一格
    const t0 = await num(fine)
    await page.getByTestId('step-fwd').click()
    const t1 = await num(fine)
    expect(t1 - t0).toBeGreaterThan(0)
    expect(t1 - t0).toBeLessThanOrEqual(f.minor / 20)
    // 后退一步回到原处
    await page.getByTestId('step-back').click()
    expect(Math.abs((await num(fine)) - t0)).toBeLessThan(f.minor / 400)
    // 细调条能拖到小循环内任意一点，数值显示随之变化
    const val = page.getByTestId('fine-val')
    await setRange(fine, range[0] + f.minor * 0.5)
    await expect(val).toContainText(`${(f.minor * 0.5).toFixed(2)} / ${f.minor}`)
    // 关键瞬间
    await page.getByTestId('moments').selectOption({ label: f.moment })
    await expect(page.getByTestId('readouts')).toContainText(f.readout)
    expect(errors).toEqual([])
  })
}

test('摆钟：默认 1× 慢放，滑块 1× 下会走；时间显示为时:分:秒', async ({ page }) => {
  await page.goto('/#/e/bai-zhong')
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
  await expect(page.getByTestId('speed')).toHaveValue('1')
  await expect(page.getByTestId('tval')).toHaveText(/^\d+:\d\d:\d\d \/ 12:00:00$/)
  // 细调条在 1× 下持续前进
  const fine = page.getByTestId('fine')
  const a = await num(fine)
  await expect.poll(async () => (await num(fine)) !== a, { timeout: 10_000 }).toBe(true)
})

test('摆钟：细调条停在冲击，粗调条跳到别的一摆时保留细调位置', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  await page.getByTestId('moments').selectOption({ label: '冲击 · 入瓦' })
  const inCell = (await num(page.getByTestId('fine'))) % 2
  await setRange(page.getByTestId('scrub'), 20_000)
  await expect(page.getByTestId('fine-name')).toContainText('第 10001 摆')
  expect(Math.abs(((await num(page.getByTestId('fine'))) % 2) - inCell)).toBeLessThan(0.01)
})
