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
