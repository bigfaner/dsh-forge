// 热度终式单测（stage④ 1.3——SC-5 pin 基准，用户裁决 2026-11-20）：
// · ① read = 1.0（最终采纳动作）；search/read-abstract/browse = 0（过程动词）；
// · ② feedback = -1 行计 0（负反馈剔除计数贡献——条目热度只减不罚）；
// · ③ 跨项目同 entry 两行聚合为一条 heat（热度 SQL 零 project 维度）；
// · 双语句字面量同源断言（prepareHeatByEntry / service selectHeatByFrontmatterId 均消费
//   internal.ts KNOWLEDGE_HEAT_TERM 单源常量——防双写漂移）；
// · selectSessionRows project 过滤豁免回归钉（roundtable2 M2 防误改——归因行集恒收窄）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import { KNOWLEDGE_HEAT_TERM, prepareHeatByEntry } from './internal.js'

let home: string
let db: Database.Database

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-heat-'))
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  // sessionRecall 两级解析第一级注册行锚（projectId 'p1' 供 heat.test 主项目使用）
  createKnowledgeRegistry(db).upsert(join(home, 'ws'), join(home, 'ws', '.knowledge'), 'p1')
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** 直插召回行（绕过服务写径——热度 SQL 纯读面单测供数） */
function insertRecall(o: {
  projectId: string
  entryId?: number | null
  frontmatterId?: string | null
  verb: string
  feedback?: number
}): void {
  db.prepare(
    `INSERT INTO knowledge_recall_logs (
       project_id, call_id, session_id, verb, entry_id, frontmatter_id, hit_count, feedback, created_at
     ) VALUES (?, ?, 'heat-test', ?, ?, ?, 1, ?, '2026-01-01T00:00:00Z')`,
  ).run(o.projectId, `c-${Math.random()}`, o.verb, o.entryId ?? null, o.frontmatterId ?? null, o.feedback ?? 0)
}

describe('热度终式（SC-5——prepareHeatByEntry 单表聚合面）', () => {
  it('① read = 1.0；search / read-abstract / browse = 0（过程动词不计热）', () => {
    insertRecall({ projectId: 'p1', entryId: 101, verb: 'read' })
    insertRecall({ projectId: 'p1', entryId: 102, verb: 'search' })
    insertRecall({ projectId: 'p1', entryId: 102, verb: 'read-abstract' })
    insertRecall({ projectId: 'p1', entryId: 102, verb: 'browse' })
    const heat = new Map(prepareHeatByEntry(db).all().map((r) => [r.entry_id, r.heat]))
    expect(heat.get(101)).toBe(1)
    expect(heat.get(102)).toBe(0)
  })

  it('② feedback = -1 行计 0（负反馈剔除计数贡献——含 read 行同剔）', () => {
    insertRecall({ projectId: 'p1', entryId: 103, verb: 'read', feedback: -1 })
    insertRecall({ projectId: 'p1', entryId: 104, verb: 'read', feedback: 1 })
    insertRecall({ projectId: 'p1', entryId: 104, verb: 'search', feedback: -1 })
    const heat = new Map(prepareHeatByEntry(db).all().map((r) => [r.entry_id, r.heat]))
    expect(heat.get(103)).toBe(0) // 负反馈的 read 行 → 0
    expect(heat.get(104)).toBe(1) // 正反馈 = 保持计数 + 无增益；负反馈 search 行计 0
  })

  it('③ 跨项目同 entry 两行 read 聚合为一条 heat（零 project 维度）', () => {
    insertRecall({ projectId: 'p-a', entryId: 105, verb: 'read' })
    insertRecall({ projectId: 'p-b', entryId: 105, verb: 'read' })
    const rows = prepareHeatByEntry(db).all()
    expect(rows.filter((r) => r.entry_id === 105)).toEqual([{ entry_id: 105, heat: 2 }])
  })
})

describe('双语句字面量同源（SC-5 pin——internal.ts 单源常量）', () => {
  it('prepareHeatByEntry SQL 消费 KNOWLEDGE_HEAT_TERM 字面量（同源防双写漂移）', () => {
    expect(prepareHeatByEntry(db).source).toContain(KNOWLEDGE_HEAT_TERM)
  })

  it('service selectHeatByFrontmatterId 消费同一常量：frontmatter 维度 heat = read 行 1.0 / 负反馈 0', async () => {
    const service = createKnowledgeService({ db, resolveWsPath: () => undefined })
    insertRecall({ projectId: 'p1', frontmatterId: 'kb-fm-1', verb: 'read' })
    insertRecall({ projectId: 'p1', frontmatterId: 'kb-fm-2', verb: 'read', feedback: -1 })
    insertRecall({ projectId: 'p1', frontmatterId: 'kb-fm-2', verb: 'search' })
    // 经 sessionRecall 命中行 heat 读回（frontmatter 维度兜底路径 = selectHeatByFrontmatterId 供数）
    const groups = await service.sessionRecall({ projectId: 'p1', sessionId: 'heat-test' })
    const heatById = new Map(groups.flatMap((g) => g.hits).map((h) => [h.frontmatterId, h.heat]))
    expect(heatById.get('kb-fm-1')).toBe(1)
    expect(heatById.get('kb-fm-2')).toBe(0)
    expect(service.heatByEntry('p1')).toBeDefined()
  })
})

describe('selectSessionRows project 过滤豁免回归钉（roundtable2 M2）', () => {
  it('同 session_id 跨项目：sessionRecall 行集恒收窄至调用方 project——热度全局聚合不串归因', async () => {
    const wsA = join(home, 'ws-a')
    const wsB = join(home, 'ws-b')
    createKnowledgeRegistry(db).upsert(wsA, join(wsA, '.knowledge'), 'p-a')
    createKnowledgeRegistry(db).upsert(wsB, join(wsB, '.knowledge'), 'p-b')
    insertRecall({ projectId: 'p-a', frontmatterId: 'kb-a-1', verb: 'search' })
    insertRecall({ projectId: 'p-b', frontmatterId: 'kb-b-1', verb: 'search' })
    const service = createKnowledgeService({ db, resolveWsPath: () => undefined })
    const groupsA = await service.sessionRecall({ projectId: 'p-a', sessionId: 'heat-test' })
    const frontmatterIds = groupsA.flatMap((g) => g.hits).map((h) => h.frontmatterId)
    expect(frontmatterIds).toContain('kb-a-1')
    expect(frontmatterIds).not.toContain('kb-b-1')
  })
})
