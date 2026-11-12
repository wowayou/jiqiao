// 首页缩略图：从真实渲染截取每个展品一张（浅色、深色主题各一张），提交为静态图片放在 public/thumbs/。
// 手动运行，不进 CI；只用仓库已有的 Playwright，不加依赖。
//
//   先起一个开发或预览服务（端口自选），再：
//   THUMB_BASE=http://localhost:5184 node scripts/thumbnails.mjs [展品id ...]
//
// 做法：浏览器里强制 600×400 的舞台、隐藏浮层与提示，只截三维画面（保留各主题的舞台底色，所以在深浅两种
// 卡片上都看得清）。榫卯类展品拉开一半爆炸，能看出由几块拼成。输出 JPEG，单张控制在 60 KB 以内。
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.THUMB_BASE ?? 'http://localhost:5184'
const root = resolve(process.cwd(), 'src/exhibits')
const all = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name, 'meta.ts')) && existsSync(resolve(root, d.name, 'index.ts')))
  .map((d) => d.name)
  .sort()
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all
const out = resolve(process.cwd(), 'public/thumbs')
mkdirSync(out, { recursive: true })

const HIDE = `
  .stage-overlay, .stage-views, .stage-status, .hover-tip, .feature-pin, .drive-pin, .no-hit { display: none !important; }
  .site-header, .hypo-banner, .aside, .stage-tip, .traces, .timeline, .readouts, .tour-bar { display: none !important; }
  .exhibit { display: block !important; height: auto !important; }
  .stage-col { display: block !important; border: 0 !important; }
  .stage-wrap { width: 600px !important; height: 400px !important; min-height: 0 !important; flex: none !important; }
`

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let total = 0
for (const theme of ['light', 'dark']) {
  for (const id of ids) {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 600 }, colorScheme: theme, reducedMotion: 'reduce' })
    await ctx.addInitScript((t) => localStorage.setItem('jiqiao-theme', t), theme)
    const page = await ctx.newPage()
    await page.goto(`${base}/#/e/${id}`)
    await page.addStyleTag({ content: HIDE })
    const stage = page.getByTestId('stage')
    await page.waitForFunction(() => document.querySelector('[data-testid=stage]')?.getAttribute('data-ready') === 'true', null, { timeout: 120_000 })
    const play = page.getByTestId('play')
    if ((await play.getAttribute('aria-pressed')) === 'true') await play.click()
    // 榫卯：装配完成后拉开一半；机械：停在初始时刻
    const isAssembly = await page.getByTestId('scrub').evaluate((el) => (el).max === '1')
    const setRange = (testid, v) =>
      page.getByTestId(testid).evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
    if (isAssembly) {
      await setRange('scrub', 1)
      await setRange('explode', 0.5)
    }
    // 舞台被强制改了尺寸、浮层也藏了：按 R（回全景）按现在的画布大小重新取景
    await page.waitForTimeout(500)
    await page.keyboard.press('r')
    // 画面稳定：相机到位后再等几帧（软件渲染很慢）
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camAnim === '0', null, { timeout: 60_000 })
    await page.waitForTimeout(3000)
    const file = resolve(out, `${id}-${theme}.jpg`)
    await stage.screenshot({ path: file, type: 'jpeg', quality: 72 })
    const kb = statSync(file).size / 1024
    total += kb
    console.log(`${id}-${theme}.jpg  ${kb.toFixed(1)} KB${kb > 60 ? '  超过 60 KB！' : ''}`)
    await ctx.close()
  }
}
console.log(`合计 ${total.toFixed(1)} KB`)
await browser.close()
