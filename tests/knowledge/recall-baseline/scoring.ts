// 自动判分（提案 §2.5 判分口径）：
// · 每题锁定标准答案条目 id 集（questions.json 人工定标一次）
// · 命中 = search Top-5 含任一标准 id（rank = 首个标准 id 的位次，1 基；未入 Top-5 = -1）
// · 零污染门：题库一切 answerId 必须在索引内（锚有效）；跑批库为临时库，不触持久层
// · 观测面：判分统计源 = KNOWLEDGE_RECALL_LOGS（search 执行点逐调用落账——三问通过
//   条目当前 = 全量 unconfirmed 收编语料；观测面按条目聚合命中频次与调用数）
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { SearchHit } from '../../../packages/plugins/knowledge/src/service/types.js'
import type { BaselineMount } from './harness.js'

export interface BankQuestion {
  readonly qid: string
  readonly domain: 'conventions' | 'examples' | 'lessons'
  readonly source: 'session-log' | 'manual'
  readonly sourceRef: string
  readonly question: string
  readonly query: { readonly keywords?: readonly string[]; readonly text?: string; readonly domain_prefix?: string }
  readonly answerIds: readonly string[]
}

export interface RecallBank {
  readonly version: number
  readonly calibratedAt: string
  readonly questions: readonly BankQuestion[]
}

export function loadBank(dir: string): RecallBank {
  return JSON.parse(readFileSync(join(dir, 'questions.json'), 'utf8')) as RecallBank
}

export interface QuestionResult {
  readonly qid: string
  readonly domain: string
  readonly source: string
  readonly hit: boolean
  /** 首个标准 id 的 Top-5 位次（1 基；未入 Top-5 或零命中 = -1） */
  readonly rank: number
  readonly top5: readonly string[]
  readonly expected: readonly string[]
}

/** 未命中归因分类：zero-hit = 检索路由未召回（零候选）；rank-miss = 召回在但排序挤出 */
export type MissAttribution = 'zero-hit' | 'rank-miss'

export interface BaselineReport {
  readonly total: number
  readonly hitCount: number
  readonly hitRate: number
  readonly byDomain: Readonly<Record<string, { total: number; hit: number }>>
  readonly bySource: Readonly<Record<string, { total: number; hit: number }>>
  readonly misses: readonly {
    qid: string
    question: string
    expected: readonly string[]
    top5: readonly string[]
    query: unknown
    attribution: MissAttribution
  }[]
  readonly pollution: readonly string[]
  readonly observation: RecallObservation
}

/** 三问通过条目命中率观测面（数据源 = KNOWLEDGE_RECALL_LOGS，非判分内存态） */
export interface RecallObservation {
  readonly recallLogCalls: number
  readonly distinctEntriesRecalled: number
  readonly entryRecallHeat: readonly { id: string; heat: number }[]
}

/** 跑批判分：逐题 search(limit topN) → Top-5 含任一标准 id 即命中 */
export async function runBaseline(mount: BaselineMount, bank: RecallBank, topN = 5): Promise<BaselineReport> {
  const results: QuestionResult[] = []
  for (const q of bank.questions) {
    const hits: SearchHit[] = await mount.service.search({
      projectId: mount.projectId,
      sessionId: mount.sessionId,
      ...(q.query.keywords !== undefined ? { keywords: [...q.query.keywords] } : {}),
      ...(q.query.text !== undefined ? { text: q.query.text } : {}),
      ...(q.query.domain_prefix !== undefined ? { domainPrefix: q.query.domain_prefix } : {}),
      limit: topN,
    })
    const top5 = hits.map((h) => h.frontmatterId ?? `#${h.entryId}`)
    const rankIdx = top5.findIndex((id) => q.answerIds.includes(id))
    results.push({
      qid: q.qid,
      domain: q.domain,
      source: q.source,
      hit: rankIdx >= 0,
      rank: rankIdx >= 0 ? rankIdx + 1 : -1,
      top5,
      expected: q.answerIds,
    })
  }

  // 零污染门（锚有效性）：题库一切 answerId 须在索引内
  const indexed = new Set(
    (mount.db.prepare('SELECT id FROM knowledge_entries').all() as { id: string }[]).map((r) => r.id),
  )
  const pollution = [...new Set(bank.questions.flatMap((q) => q.answerIds).filter((id) => !indexed.has(id)))]

  const byDomain: Record<string, { total: number; hit: number }> = {}
  const bySource: Record<string, { total: number; hit: number }> = {}
  for (const r of results) {
    const d = (byDomain[r.domain] ??= { total: 0, hit: 0 })
    d.total += 1
    if (r.hit) d.hit += 1
    const s = (bySource[r.source] ??= { total: 0, hit: 0 })
    s.total += 1
    if (r.hit) s.hit += 1
  }

  const misses = results
    .filter((r) => !r.hit)
    .map((r) => {
      const q = bank.questions.find((x) => x.qid === r.qid)
      const attribution: MissAttribution = r.top5.length === 0 ? 'zero-hit' : 'rank-miss'
      return { qid: r.qid, question: q?.question ?? '', expected: r.expected, top5: r.top5, query: q?.query ?? {}, attribution }
    })

  return {
    total: results.length,
    hitCount: results.filter((r) => r.hit).length,
    hitRate: results.length === 0 ? 0 : results.filter((r) => r.hit).length / results.length,
    byDomain,
    bySource,
    misses,
    pollution,
    observation: observeFromRecallLogs(mount.db, mount.projectId, mount.sessionId),
  }
}

/** 观测面：直读 KNOWLEDGE_RECALL_LOGS——调用数 + 条目命中热度（frontmatter_id 聚合） */
export function observeFromRecallLogs(db: Database.Database, projectId: string, sessionId: string): RecallObservation {
  const calls = db
    .prepare('SELECT COUNT(DISTINCT call_id) AS n FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ?')
    .get(projectId, sessionId) as { n: number }
  const heat = db
    .prepare(
      `SELECT frontmatter_id AS id, COUNT(DISTINCT call_id) AS heat FROM knowledge_recall_logs
       WHERE project_id = ? AND session_id = ? AND frontmatter_id IS NOT NULL
       GROUP BY frontmatter_id ORDER BY heat DESC, id`,
    )
    .all(projectId, sessionId) as { id: string; heat: number }[]
  return { recallLogCalls: calls.n, distinctEntriesRecalled: heat.length, entryRecallHeat: heat }
}

/** 判分报告落盘目录（KNOWLEDGE_BASELINE_REPORT_DIR 指位；缺省临时目录——复跑不脏仓） */
export function reportDestinationDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.KNOWLEDGE_BASELINE_REPORT_DIR ?? tmpdir()
}
