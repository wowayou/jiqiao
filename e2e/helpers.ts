import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

/** 与注册表同一规则：src/exhibits/<id>/ 下同时有 meta.ts 和 index.ts 即为展品。 */
export function exhibitIds(): string[] {
  const root = resolve(process.cwd(), 'src/exhibits')
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name, 'meta.ts')) && existsSync(resolve(root, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort()
}

/** 收集控制台错误与未捕获异常。 */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

/** 画布截图中的不同颜色数（纯色画面只有 1 种）。 */
export async function distinctColors(page: Page, canvas: Locator): Promise<number> {
  const png = (await canvas.screenshot()).toString('base64')
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const seen = new Set<number>()
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
    return seen.size
  }, png)
}

export async function canvasShot(canvas: Locator): Promise<Buffer> {
  return canvas.screenshot()
}

/** 两次截图之间画面确实变了 */
export async function expectCanvasChanged(page: Page, canvas: Locator, before: Buffer) {
  await expect.poll(async () => !(await canvas.screenshot()).equals(before), { timeout: 10_000 }).toBe(true)
}

export async function setRange(input: Locator, value: number) {
  await input.evaluate((el, v) => {
    const i = el as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(v))
    i.dispatchEvent(new Event('input', { bubbles: true }))
    i.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}
