// 展品作者的审计入口：在自己的 src/exhibits/<id>/audit.test.ts 里写
//
//   import { describeExhibitAudits } from '@/exhibit/testing'
//   import exhibit from './index'
//   describeExhibitAudits(exhibit)
//
// 即得到 PLAN 第 7 节的结构校验、出处审计、实体审计、干涉审计（榫卯/机械自动区分）。
// 审计数值会打印到控制台（[audit] 前缀），交付说明里请如实引用。
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getKernel, type Kernel } from '../kernel'
import { auditAssembly, auditMotion, auditSolids, buildParts, type BuiltParts, type InterferenceReport } from './audit'
import { auditClaims } from './claims'
import type { AnyExhibit } from './types'
import { validateExhibit } from './validate'

export interface AuditOptions {
  /** 机械展品的相位采样数（≥ 60） */
  phases?: number
  /** 榫卯每步采样数（≥ 20） */
  perStep?: number
  /** 单个测试的超时（ms），默认 120 s */
  timeout?: number
}

export function formatReport(id: string, r: InterferenceReport): string {
  const w = r.worst
  return (
    `[audit] ${id}: 采样 ${r.samples} 个时刻，检查 ${r.pairChecks} 个实例对，布尔求交 ${r.booleanChecks} 次；` +
    `最大交集占比 ${(r.maxRatio * 100).toExponential(2)}%（阈值 ${(r.threshold * 100).toFixed(1)}%）` +
    (w ? `，出现在 ${w.a} × ${w.b}，t=${w.t.toFixed(4)}，交集 ${w.volume.toExponential(2)} mm³` : '')
  )
}

export function describeExhibitAudits(def: AnyExhibit, opts: AuditOptions = {}) {
  const timeout = opts.timeout ?? 120_000
  describe(`展品审计 · ${def.meta.id}`, () => {
    let k: Kernel
    let built: BuiltParts
    beforeAll(async () => {
      k = await getKernel()
      built = buildParts(k, def)
    }, timeout)
    afterAll(() => built?.dispose())

    test('结构校验', () => {
      expect(validateExhibit(def)).toEqual([])
    })
    test('出处审计：史料引文逐字见于 docs/sources/', () => {
      expect(auditClaims(def)).toEqual([])
    })
    test('实体审计：每个零件是封闭实体且体积 > 0', () => {
      const reports = auditSolids(k, def)
      const bad = reports.filter((r) => !r.ok)
      console.info(
        `[audit] ${def.meta.id}: 实体 ${reports.length} 个，` +
          reports.map((r) => `${r.id}=${Math.round(r.volume)}mm³/${r.triangles}△`).join('，'),
      )
      expect(bad).toEqual([])
    })
    if (def.timeline.kind === 'assembly') {
      test(
        '干涉审计（榫卯）：装配态与装配路径上两两交集 < 0.1%',
        () => {
          const r = auditAssembly(k, def, opts.perStep, built)
          console.info(formatReport(def.meta.id, r))
          expect(r.failures).toEqual([])
        },
        timeout,
      )
    } else {
      test(
        '干涉审计（机械）：每周期 ≥ 60 相位，接触零件对交集 < 0.5%',
        () => {
          const r = auditMotion(k, def, opts.phases, built)
          console.info(formatReport(def.meta.id, r))
          expect(r.samples).toBeGreaterThanOrEqual(60)
          expect(r.failures).toEqual([])
        },
        timeout,
      )
    }
  })
}
