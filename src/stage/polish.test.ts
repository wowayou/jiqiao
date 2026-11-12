// 第二轮 B：半透明零件棱线同步变淡；曲面分面线不描。只测渲染参数与棱线生成，不涉及任何展品几何。
import { beforeAll, describe, expect, test } from 'vitest'
import { EdgesGeometry } from 'three'
import { getKernel, type Kernel } from '../kernel'
import { toBufferGeometry } from '../kernel/geometry'
import { EDGE_ANGLE } from './buildGeometry'
import { FADED_LINE, FADED_SURFACE, MaterialLibrary, THEMES } from './materials'

let k: Kernel
beforeAll(async () => {
  k = await getKernel()
})

describe('半透明零件', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}：让开的零件表面与棱线都很淡，棱线不比表面「实」很多；正常零件不受影响`, () => {
      const lib = new MaterialLibrary(THEMES[theme])
      const faded = lib.surface('brass', 'faded')
      const fadedLine = lib.line('faded')
      expect(faded.transparent).toBe(true)
      expect(faded.opacity).toBe(FADED_SURFACE)
      expect(fadedLine.opacity).toBe(FADED_LINE)
      // 表面不超过 8%、棱线不超过 15%；两者同量级（棱线不超过表面的 2.5 倍），不再是「淡壳套全亮线框」
      expect(faded.opacity).toBeLessThanOrEqual(0.08)
      expect(fadedLine.opacity).toBeLessThanOrEqual(0.15)
      expect(fadedLine.opacity / faded.opacity).toBeLessThanOrEqual(2.5)
      // 正常与强调的零件仍是实的
      expect(lib.surface('brass', 'normal').opacity).toBe(1)
      expect(lib.line('normal').opacity).toBeGreaterThanOrEqual(0.7)
      expect(lib.line('accent').opacity).toBe(1)
      lib.dispose()
    })
  }
})

describe('棱线生成阈值', () => {
  const edgeCount = (make: () => ReturnType<Kernel['box']>) => new EdgesGeometry(k.scope(() => toBufferGeometry(k, make())), EDGE_ANGLE).getAttribute('position').count / 2

  test('方块的 12 条棱照画', () => {
    expect(edgeCount(() => k.box([10, 10, 10]))).toBe(12)
  })
  test('分面夹角 36° 的粗圆柱（10 段）侧面不描分面线，只剩上下两圈边', () => {
    // 10 段：两端各 10 条边；侧面 10 条竖线（夹角 36°）不描
    expect(edgeCount(() => k.cylinder({ r: 10, h: 20, segments: 10 }))).toBe(20)
  })
  test('细分曲面（48 段）侧面同样不描分面线', () => {
    expect(edgeCount(() => k.cylinder({ r: 10, h: 20, segments: 48 }))).toBe(96)
  })
  test('分面夹角 60° 的六棱柱（真实的棱）仍然描', () => {
    expect(edgeCount(() => k.cylinder({ r: 10, h: 20, segments: 6 }))).toBe(6 * 3)
  })
})
