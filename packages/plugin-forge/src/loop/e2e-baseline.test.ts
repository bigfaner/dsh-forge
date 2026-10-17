// 改进7（dispatch-loop-hardening · e2e 取证债）· 红灯基线门纯逻辑单测：
// parseE2eRedSpecs（FAIL 行解析/去重/排序/噪音滤除）、runE2eBaseline（成功 + 执行故障
// fail-soft）、attributionTaskInput（三分流归因卡载荷形状）。
import { describe, expect, it } from 'vitest'
import { attributionTaskInput, parseE2eRedSpecs, runE2eBaseline } from './e2e-baseline.js'

describe('parseE2eRedSpecs（套件输出 → 红灯 spec 清单）', () => {
  it('FAIL 行提取 + 去重 + 字母序', () => {
    const output = [
      'FAIL  e2e/specs/b.spec.ts > suite > case',
      'PASS  e2e/specs/green.spec.ts > suite > case',
      'FAIL e2e/specs/a.spec.ts > suite > case',
      'FAIL  e2e/specs/b.spec.ts > suite > case-2',
    ].join('\n')
    expect(parseE2eRedSpecs(output)).toEqual(['e2e/specs/a.spec.ts', 'e2e/specs/b.spec.ts'])
  })

  it('非 spec 路径滤除 + 空输出零清单', () => {
    expect(parseE2eRedSpecs('FAIL packages/core/src/x.ts\n✗ something else')).toEqual([])
    expect(parseE2eRedSpecs('')).toEqual([])
  })
})

describe('runE2eBaseline（基线跑批）', () => {
  it('成功：ranAt + 红灯清单', async () => {
    const r = await runE2eBaseline(async () => 'FAIL e2e/specs/x.spec.ts > s')
    expect(r.redSpecs).toEqual(['e2e/specs/x.spec.ts'])
    expect(r.error).toBeUndefined()
    expect(Number.isNaN(Date.parse(r.ranAt))).toBe(false)
  })

  it('套件执行故障：fail-soft 空清单 + error 留痕（不阻循环）', async () => {
    const r = await runE2eBaseline(async () => {
      throw new Error('harness missing')
    })
    expect(r.redSpecs).toEqual([])
    expect(r.error).toBe('harness missing')
  })
})

describe('attributionTaskInput（三分流归因卡载荷）', () => {
  it('test-run 卡 + 三分流指示 + BASELINE_SPEC var', () => {
    const input = attributionTaskInput({ kind: 'feature', slug: 'feat-x' }, 'e2e/specs/a.spec.ts', { projectId: 'p-1' })
    expect(input).toMatchObject({
      projectId: 'p-1',
      source: { kind: 'feature', slug: 'feat-x' },
      title: 'e2e 基线红灯归因：e2e/specs/a.spec.ts',
      type: 'test-run',
      priority: 'P1',
      vars: { BASELINE_SPEC: 'e2e/specs/a.spec.ts' },
    })
    expect(input.taskDesc).toContain('环境')
    expect(input.taskDesc).toContain('陈旧断言')
    expect(input.taskDesc).toContain('真回归')
    expect(input.taskDesc).toContain('recordBug')
  })
})
