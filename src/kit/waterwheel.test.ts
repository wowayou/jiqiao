import { beforeAll, describe, expect, test } from 'vitest'
import { getKernel, type Kernel } from '../kernel'
import { bladeAngle, rimZ, waterwheel, waterwheelRadius, type WaterwheelOpts } from './waterwheel'

let k: Kernel
beforeAll(async () => {
  k = await getKernel()
})

const O: WaterwheelOpts = {
  outerR: 900,
  rimW: 70,
  rimT: 40,
  width: 360,
  hubR: 140,
  bore: 86,
  spokes: 8,
  spokeW: 70,
  blades: 14,
  bladeDepth: 100,
  bladeT: 26,
}

describe('水轮', () => {
  test('封闭实体；外径、总宽与参数一致', () =>
    k.scope(() => {
      const w = waterwheel(k, O)
      expect(w.status()).toBe('NoError')
      expect(w.volume()).toBeGreaterThan(0)
      const b = w.bbox()
      expect(b.max[0]).toBeCloseTo(waterwheelRadius(O), 0)
      expect(b.min[0]).toBeCloseTo(-waterwheelRadius(O), 0)
      expect(b.max[2]).toBeCloseTo(O.width / 2, 3)
      expect(b.min[2]).toBeCloseTo(-O.width / 2, 3)
    }))
  test('轴孔：与略细的轴不干涉，与略粗的轴干涉', () =>
    k.scope(() => {
      const w = waterwheel(k, O)
      const thin = k.cylinder({ r: O.bore - 0.5, h: 600, axis: 'z' })
      const thick = k.cylinder({ r: O.bore + 5, h: 600, axis: 'z' })
      expect(k.intersectionVolume(w, thin)).toBeLessThan(1e-6)
      expect(k.intersectionVolume(w, thick)).toBeGreaterThan(1000)
    }))
  test('叶板数与角度：整圈均匀；叶板方向上有实体、半个节距处是空的', () =>
    k.scope(() => {
      const w = waterwheel(k, O)
      expect(bladeAngle(O, O.blades) - bladeAngle(O, 0)).toBeCloseTo(2 * Math.PI)
      const probe = (ang: number) => {
        const r = waterwheelRadius(O) - 20
        const box = k.box([30, 10, 20]).translate([r, 0, 0]).rotate([0, 0, 1], ang)
        return k.intersectionVolume(w, box)
      }
      expect(probe(bladeAngle(O, 3))).toBeGreaterThan(100)
      expect(probe(bladeAngle(O, 3) + Math.PI / O.blades)).toBeLessThan(1e-6)
    }))
  test('轮辋位于 ±rimZ；辐条越多体积越大', () =>
    k.scope(() => {
      expect(rimZ(O)).toBe(160)
      const a = waterwheel(k, { ...O, spokes: 6 }).volume()
      const b = waterwheel(k, { ...O, spokes: 10 }).volume()
      expect(b).toBeGreaterThan(a)
    }))
})
