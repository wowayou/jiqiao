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

// —— 相机：凑近看、预设机位、缩放、协同链「看这里」 ——
const camDist = async (page: Page) => Number(await page.locator('canvas').getAttribute('data-cam-dist'))
const camTarget = async (page: Page) => (await page.locator('canvas').getAttribute('data-cam-target'))!
/** 相机读数稳定（连续两次相同）后返回距离；动画与软件渲染都慢，所以轮询而不是睡眠 */
async function settledDist(page: Page): Promise<number> {
  let last = -1
  await expect
    .poll(
      async () => {
        const d = await camDist(page)
        const same = Math.abs(d - last) < 0.5 && (await page.locator('canvas').getAttribute('data-cam-anim')) === '0'
        last = d
        return same
      },
      { timeout: 30_000, intervals: [400] },
    )
    .toBe(true)
  return last
}

test('预设机位：一点即达，让开挡视线的零件；全景恢复', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'bai-zhong')
  const overview = await settledDist(page)
  await page.locator('[data-view="escapement"]').click()
  await expect(page.locator('[data-view="escapement"]')).toHaveAttribute('aria-pressed', 'true')
  const near = await settledDist(page)
  expect(near).toBeLessThan(overview / 3)
  // 表盘、前夹板、指针让开：恢复按钮上有计数
  await expect(page.getByTestId('clear-fade')).toContainText('恢复遮挡')
  await page.getByTestId('clear-fade').click()
  await expect(page.getByTestId('clear-fade')).toHaveCount(0)
  await page.getByTestId('reset-view').click()
  await expect(page.getByTestId('reset-view')).toHaveAttribute('aria-pressed', 'true')
  expect(Math.abs((await settledDist(page)) - overview)).toBeLessThan(overview * 0.02)
  expect(errors).toEqual([])
})

test('预设机位自带剖切：水碓「拨板压碓尾」打开剖切，没写 section 的机位关闭剖切', async ({ page }) => {
  await openExhibit(page, 'shui-dui')
  await page.locator('[data-view="peg"]').click()
  await expect(page.getByTestId('section')).toHaveAttribute('aria-pressed', 'true')
  await settledDist(page)
  await page.locator('[data-view="strike"]').click()
  // 没写 section 的机位关闭剖切：机位是一整套状态
  await expect(page.getByTestId('section')).toHaveAttribute('aria-pressed', 'false')
})

test('选中零件后凑近看（按钮、F 键），相机目标移到零件上；Esc 清掉让开', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  const overview = await settledDist(page)
  const t0 = await camTarget(page)
  await page.getByRole('tab', { name: '零件' }).click()
  await expect(page.getByTestId('focus-part')).toBeDisabled()
  await page.locator('[data-part="escape-wheel"]').click()
  await page.getByTestId('focus-part').click()
  const d1 = await settledDist(page)
  expect(d1).toBeLessThan(overview / 3)
  expect(await camTarget(page)).not.toBe(t0)
  // 回全景，再用 F 键
  await page.getByTestId('reset-view').click()
  await settledDist(page)
  await page.keyboard.press('f')
  const d2 = await settledDist(page)
  expect(d2).toBeLessThan(overview / 3)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('stage')).toHaveAttribute('data-selected', '')
  await expect(page.getByTestId('clear-fade')).toHaveCount(0)
})

test('协同链「看这里」把相机带到这一环的零件', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  const overview = await settledDist(page)
  await page.locator('[data-look="impulse-entry"]').click()
  const d = await settledDist(page)
  expect(d).toBeLessThan(overview / 3)
  await expect(page.locator('[data-step="impulse-entry"] button.chain-head')).toHaveAttribute('aria-pressed', 'true')
})

test('滚轮朝鼠标所指处缩放：目标点跟着鼠标走，距离变小', async ({ page, isMobile }) => {
  test.skip(isMobile, '桌面滚轮')
  await openExhibit(page, 'bai-zhong')
  const d0 = await settledDist(page)
  const t0 = await camTarget(page)
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.3)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300)
  await expect.poll(async () => camDist(page), { timeout: 20_000 }).toBeLessThan(d0 * 0.9)
  expect(await camTarget(page)).not.toBe(t0)
})

test('prefers-reduced-motion：相机直接到位，不做缓动', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${process.env.E2E_PORT ?? 5183}` })
  const page = await ctx.newPage()
  await openExhibit(page, 'bai-zhong')
  // 减少动效下默认不自动播放
  await expect(page.getByTestId('play')).toHaveAttribute('aria-pressed', 'false')
  const seen: string[] = []
  await page.locator('[data-view="train"]').click()
  const start = Date.now()
  while (Date.now() - start < 6000) {
    seen.push((await page.locator('canvas').getAttribute('data-cam-anim')) ?? '')
    await page.waitForTimeout(200)
  }
  expect(seen).not.toContain('1')
  await ctx.close()
})

test('双击零件：选中并凑近', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  await page.locator('[data-view="escapement"]').click()
  const d0 = await settledDist(page)
  const box = (await page.locator('canvas').boundingBox())!
  // 机位把画面中央留给擒纵一带；双击中央的零件（具体是哪个不重要）
  await page.locator('canvas').dblclick({ position: { x: box.width * 0.5, y: box.height * 0.5 }, delay: 30 })
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-selected', '', { timeout: 30_000 })
  // 相机飞到被双击的零件：距离随零件大小变，不再是机位给的那个距离
  await expect.poll(async () => Math.abs((await settledDist(page)) - d0) > d0 * 0.03, { timeout: 30_000 }).toBe(true)
})

test('点空白处取消选中；拖动旋转结束时不会误选零件', async ({ page }) => {
  await openExhibit(page, 'bai-zhong')
  await page.getByRole('tab', { name: '零件' }).click()
  await page.locator('[data-part="backboard"]').click()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-selected', 'backboard')
  await page.locator('.stage-wrap').scrollIntoViewIfNeeded()
  const box = (await page.locator('canvas').boundingBox())!
  // 在背板上按下、拖到空白处松开：只是旋转，选中不变
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 10, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('stage')).toHaveAttribute('data-selected', 'backboard')
  // 点空白（画布右下角空处）取消选中
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.45)
  await expect(page.getByTestId('stage')).toHaveAttribute('data-selected', '')
})

test('触屏：单指拖动旋转、双指张开缩放，页面不跟着滚动', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅手机宽度')
  await openExhibit(page, 'bai-zhong')
  const d0 = await settledDist(page)
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd',  pts: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) })
  const az0 = Number(await page.locator('canvas').getAttribute('data-cam-az'))
  // 单指横向拖动 = 旋转；竖向也不得让页面滚动
  await touch('touchStart', [{ x: cx, y: cy }])
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: cx + i * 12, y: cy - i * 14 }])
  await touch('touchEnd', [])
  await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-cam-az')), { timeout: 20_000 }).not.toBe(az0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  // 双指张开 = 放大
  await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }])
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: cx - 30 - i * 14, y: cy }, { x: cx + 30 + i * 14, y: cy }])
  await touch('touchEnd', [])
  await expect.poll(async () => camDist(page), { timeout: 20_000 }).toBeLessThan(d0 * 0.8)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('相关展品：指向尚未制作的展品时不显示死链、不报错', async ({ page }) => {
  const errors = trackErrors(page)
  await openExhibit(page, 'muniu-dulun')
  // meta.related = ['muniu-buxing']，该展品还没做：没有任何相关展品链接
  await expect(page.locator('[data-related]')).toHaveCount(0)
  await expect(page.locator('a[href="#/e/muniu-buxing"]')).toHaveCount(0)
  expect(errors).toEqual([])
})
