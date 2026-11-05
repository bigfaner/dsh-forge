// @feature:knowledge
// 召回基线（knowledge-stage2-write-gateway/1.7——提案 §2.5「死亡螺旋防线」）：
// ≥100 题题库（真实会话沉淀抽取为主 + 人工补题，按知识域分层）+ 自动判分
// （Top-5 含任一标准 id 即命中）+ 首轮基线跑批 + 零污染起步 + RECALL_LOGS 观测面。
// 回归形态：题库快照（questions.json 人工定标一次）+ 真实 .knowledge 语料临时装配
// 复跑判分——确定性排序（同分 entryId 升序）保证快照可回归。
// 目标口径：Top-5 ≥70%（连续两轮达标固化基线——baseline-floor.json 即固化锚）；
// 不达标不红，报告携带归因（zero-hit = 检索路由 / rank-miss = 排序与词条质量）。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { baselineDir, disposeMounts, mountRealCorpus } from './harness.js'
import { loadBank, reportDestinationDir, runBaseline, type BaselineReport } from './scoring.js'

const TARGET_HIT_RATE = 0.7

afterAll(disposeMounts)

describe('召回基线题库（快照面）', () => {
  const bank = loadBank(baselineDir)

  it('题库 ≥100 题，按知识域分层且双题源（真实会话沉淀抽取为主）', () => {
    expect(bank.questions.length).toBeGreaterThanOrEqual(100)
    const domains = new Set(bank.questions.map((q) => q.domain))
    expect(domains).toEqual(new Set(['conventions', 'examples', 'lessons']))
    for (const d of domains) {
      expect(bank.questions.filter((q) => q.domain === d).length).toBeGreaterThanOrEqual(15)
    }
    const sources = new Set(bank.questions.map((q) => q.source))
    expect(sources).toEqual(new Set(['session-log', 'manual']))
    expect(bank.questions.filter((q) => q.source === 'session-log').length).toBeGreaterThan(
      bank.questions.filter((q) => q.source === 'manual').length,
    )
  })

  it('每题锁定非空标准答案 id 集且查询非空（人工定标形状）', () => {
    const qids = new Set<string>()
    for (const q of bank.questions) {
      expect(qids.has(q.qid), `重复 qid: ${q.qid}`).toBe(false)
      qids.add(q.qid)
      expect(q.answerIds.length, `${q.qid} answerIds 空`).toBeGreaterThan(0)
      expect(
        q.query.keywords !== undefined || q.query.text !== undefined || q.query.domain_prefix !== undefined,
        `${q.qid} 查询空`,
      ).toBe(true)
      expect(q.question.length, `${q.qid} 题干空`).toBeGreaterThan(0)
    }
  })
})

describe('首轮基线跑批（自动判分 + 零污染 + 观测面）', () => {
  it('Top-5 判分：零污染起步，命中率 ≥ 固化 floor，报告落盘', { timeout: 120_000 }, async () => {
    const bank = loadBank(baselineDir)
    const mount = await mountRealCorpus('recall-baseline')
    // 语料规模自证：121 篇收编快照，入索引 ≥100（零污染起步的语料面）
    expect(mount.indexed).toBeGreaterThanOrEqual(100)

    const report: BaselineReport = await runBaseline(mount, bank)

    expect(report.total).toBe(bank.questions.length)
    // 零污染门：题库锚全部在索引内（悬空 id = 污染，硬红）
    expect(report.pollution, `悬空标准 id：${report.pollution.join(', ')}`).toEqual([])
    // 观测面在场（数据源 = KNOWLEDGE_RECALL_LOGS）：调用数 = 题数；条目热度账可读
    expect(report.observation.recallLogCalls).toBe(bank.questions.length)
    expect(report.observation.distinctEntriesRecalled).toBeGreaterThan(0)

    const floor = loadFloor()
    expect(
      report.hitRate,
      `基线命中率 ${fmt(report.hitRate)} 低于固化 floor ${fmt(floor)}——回归破坏，先归因（zero-hit=检索路由 / rank-miss=排序与词条质量）再复测`,
    ).toBeGreaterThanOrEqual(floor)

    const dest = join(reportDestinationDir(), 'recall-baseline-report.json')
    writeFileSync(dest, JSON.stringify(report, null, 2), 'utf8')
    console.log(
      `[recall-baseline] total=${report.total} hit=${report.hitCount} (${fmt(report.hitRate)})` +
        ` target=${fmt(TARGET_HIT_RATE)} met=${report.hitRate >= TARGET_HIT_RATE}` +
        ` | byDomain=${JSON.stringify(report.byDomain)}` +
        ` | misses=${report.misses.length} (${report.misses.filter((m) => m.attribution === 'zero-hit').length} zero-hit / ${report.misses.filter((m) => m.attribution === 'rank-miss').length} rank-miss)` +
        ` | report=${dest}`,
    )
  })
})

function loadFloor(): number {
  const floorJson = JSON.parse(readFileSync(join(baselineDir, 'baseline-floor.json'), 'utf8')) as { floor: number }
  return floorJson.floor
}

function fmt(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}
