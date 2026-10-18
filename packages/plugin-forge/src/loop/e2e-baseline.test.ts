// 改进7（dispatch-loop-hardening · e2e 取证债）· 红灯基线门纯逻辑单测：
// parseE2eRedSpecs（FAIL 行解析/去重/排序/噪音滤除）、runE2eBaseline（成功 + 执行故障
// fail-soft）、attributionTaskInput（三分流归因卡载荷形状）。
import { describe, expect, it } from 'vitest'
import { attributionTaskInput, baselineForHead, parseE2eRedSpecs, runE2eBaseline } from './e2e-baseline.js'

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

describe('baselineForHead（disc-2 · HEAD 键控基线缓存）', () => {
  it('HEAD 一致：复用缓存（零套件执行——成本约束）', async () => {
    const cache = { commit: 'c1', redSpecs: ['e2e/specs/a.spec.ts'] }
    let runs = 0
    const r = await baselineForHead('c1', cache, async () => {
      runs += 1
      return ''
    })
    expect(runs).toBe(0)
    expect(r).toBe(cache)
  })

  it('commit 落地漂移：重算并更新缓存键（简报不再烤死于循环启动时点）', async () => {
    const cache = { commit: 'c1', redSpecs: ['e2e/specs/old.spec.ts'] }
    const r = await baselineForHead('c2', cache, async () => 'FAIL e2e/specs/new.spec.ts > suite')
    expect(r).toEqual({ commit: 'c2', redSpecs: ['e2e/specs/new.spec.ts'] })
  })

  it('重算故障 fail-soft：空清单 + error 留痕，键仍记当前 HEAD（不阻循环）', async () => {
    const r = await baselineForHead('c2', undefined, async () => {
      throw new Error('boom')
    })
    expect(r).toEqual({ commit: 'c2', redSpecs: [], error: 'boom' })
  })

  it('HEAD 不可得（两侧 undefined）：首算一次后恒复用（无 worktree = 无漂移可判）', async () => {
    let runs = 0
    const first = await baselineForHead(undefined, undefined, async () => {
      runs += 1
      return 'FAIL x.spec.ts'
    })
    const second = await baselineForHead(undefined, first, async () => {
      runs += 1
      return ''
    })
    expect(runs).toBe(1)
    expect(second).toBe(first)
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
