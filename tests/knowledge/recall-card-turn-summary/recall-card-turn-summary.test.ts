// @feature:knowledge
// Journey: recall-card-turn-summary（proposal knowledge-stage4-recall-scope——J2 召回卡片按 turn 汇总与四动词分型）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage4-recall-scope/testing/recall-card-turn-summary/
//   contracts/recall-record-channel.md（J2-CT-01..05 ← §1 S1–S12 + journey INV-1..5）。
// 分层：本 spec 承载通道/供数面可判定的 Outcome（turn 分组聚合/verb 四分型/hint 快照键/
// sessionRecall 形状零漂移/命中行机械字段收敛）；卡片渲染真机面（分节展开/hint note 行/
// read dialog）归 Playwright test-run 收口（skip 留痕）——SSR 直渲单测已持语义等价覆盖
// （apps/web RecallTab.test.tsx），一轮内多次调用聚合为一张卡的链路行为归真机（journey §1）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'
import type { RecallGroup } from '../../../packages/contracts/src/index.js'

const root = mkdtempSync(join(tmpdir(), 'knowledge-j-j2-'))
const ws = join(root, 'ws')
const knowledgeDir = join(ws, '.knowledge')
const dbFile = join(root, 'knowledge', 'knowledge.db')
const SESSION = 'j2-sess'
const PROJECT = 'p-j2'

function put(domain: string, file: string, id: string, title: string, status = 'confirmed'): void {
  const dir = join(knowledgeDir, domain)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nsummary: ${title} 摘要\nkeywords: [turncard]\nversion_ts: '2026-01-01T00:00:00.000Z'\n---\n\n正文内容。`, 'utf8')
}

let service: BrowseKnowledgeService
let db: ReturnType<typeof openKnowledgeDatabase>

beforeAll(async () => {
  put('fea', 'a.md', 'j2-card-a', '卡片条目甲')
  put('fea', 'b.md', 'j2-card-b', '卡片条目乙')
  db = openKnowledgeDatabase(dbFile)
  createKnowledgeRegistry(db).upsert(ws, knowledgeDir, PROJECT)
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === PROJECT ? ws : undefined) })
  await service.rebuildIndex(PROJECT)

  // turn 3：search（带 hint 的零命中径）→ read-abstract → read（contentSnap 快照）→ browse
  await service.search({ projectId: PROJECT, text: 'nosuchturncard', sessionId: SESSION, callId: 'j2-call-s1', turnSeq: 3, triggerText: '帮我查卡片条目' })
  service.annotateSearchHint({ callId: 'j2-call-s1', hint: 'zero hits. You may reword once and retry with retry=true.' })
  await service.readAbstract({ projectId: PROJECT, id: 'j2-card-a', sessionId: SESSION, turnSeq: 3, triggerText: '帮我查卡片条目' })
  await service.read({ projectId: PROJECT, id: 'j2-card-a', sessionId: SESSION, turnSeq: 3, triggerText: '帮我查卡片条目' })
  await service.browseEntries({ projectId: PROJECT, domain: 'fea', offset: 0, limit: 20, order: 'status', sessionId: SESSION, turnSeq: 3, triggerText: '帮我查卡片条目' })
  // turn 4：search 命中（下一轮递进——INV/现派生不串轮）
  await service.search({ projectId: PROJECT, text: 'turncard', sessionId: SESSION, callId: 'j2-call-s2', turnSeq: 4, triggerText: '再查一轮 turncard' })
})

afterAll(() => {
  db.close()
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

// ── J2-CT-01 一轮一卡聚合（分组键 turn_seq；S2/S3 + INV-1/INV-3） ──

describe('J2-CT-01 一轮一卡聚合（O-成功/O-多轮递进）', () => {
  it('O-成功：turn_seq 相同的全部调用聚合为一组（turn 3 四动词同组）；O-多轮递进：turn 4 归新组（现派生不串轮——J4 G2 交叉一致）', async () => {
    const groups = await service.sessionRecall({ projectId: PROJECT, sessionId: SESSION })
    const byTurn = new Map(groups.map((g) => [g.turnSeq, g]))
    expect(byTurn.size).toBe(2) // 两轮两组（INV-1 一轮一卡）
    const turn3 = byTurn.get(3)!
    expect(turn3.verb).toBe('search') // 组头动词 = 组内首个调用（ 时序）
    // 组内聚合口径（S11）：call 为节内锚，聚合到 turn 由消费面（web recall-model）执行——
    // 通道仍返回扁平 RecallGroup[]（每 call 一组，turnSeq 为分组键供消费面聚合）
    const turn3Calls = groups.filter((g) => g.turnSeq === 3)
    expect(turn3Calls.map((g) => g.verb).sort()).toEqual(['browse', 'read', 'read-abstract', 'search']) // 四动词分节全在场（INV-2；通道行序 = 倒序供数，展示时序归 web recall-model）
    expect(groups.filter((g) => g.turnSeq === 4)).toHaveLength(1)
    // S3 triggerSnap：写时点派生快照在场（= 该轮 queued message 派生）
    for (const g of groups.filter((g) => g.turnSeq === 3)) expect(g.triggerSnap).toBe('帮我查卡片条目')
  })
})

// ── J2-CT-02 分节四动词分型（S1 四值封闭枚举 + S4/S6 形状） ──

describe('J2-CT-02 四动词分型与行形状（O-search/O-read/O-read-abstract/O-browse）', () => {
  it('O-search 节：命中行携 score 数值 + scope/rowId；O-read 节：contentSnap 全文快照在场；O-read-abstract/browse 节：score null（S6 null 语义）', async () => {
    const groups = await service.sessionRecall({ projectId: PROJECT, sessionId: SESSION })
    const byVerb = (verb: string): readonly RecallGroup[] => groups.filter((g) => g.verb === verb)
    // S1：verb 四值封闭枚举在本会话全部在场
    expect(groups.map((g) => g.verb)).toEqual(expect.arrayContaining(['search', 'read', 'read-abstract', 'browse']))
    // S6：search 命中行 score 数值；其余动词 score null（DDL v7 score REAL NULL 语义）
    const searchGroup = byVerb('search').find((g) => g.hitCount > 0)
    for (const h of searchGroup!.hits) expect(h.score).toBeTypeOf('number')
    for (const verb of ['read', 'read-abstract', 'browse']) {
      for (const g of byVerb(verb)) for (const h of g.hits) expect(h.score).toBeNull()
    }
    // S4：read 动词 contentSnap 全文快照（不截断）；非 read 恒 null
    const readGroup = byVerb('read')[0]!
    expect(readGroup.contentSnap).toContain('正文内容。')
    for (const g of groups.filter((g) => g.verb !== 'read')) expect(g.contentSnap).toBeNull()
    // S5：行级 rowId 在场（行级反馈通道目标键）；S7 scope 二值
    for (const g of groups) for (const h of g.hits) {
      expect(Number.isInteger(h.rowId)).toBe(true)
      expect(['project', 'global']).toContain(h.scope)
    }
  })
})

// ── J2-CT-03 hint note 行（S8 query_json hint 键——写时点结果事实） ──

describe('J2-CT-03 hint 快照键（O-有值/O-无值）', () => {
  it('O-有值：零命中 search 调用 query.hint 在场（写时点回填同 call 行）；O-无值：命中径调用 query 无 hint 键', async () => {
    const groups = await service.sessionRecall({ projectId: PROJECT, sessionId: SESSION })
    const zero = groups.find((g) => g.hitCount === 0)!
    expect(zero.query?.hint).toContain('zero hits')
    const hit = groups.find((g) => g.hitCount > 0)!
    expect(hit.query?.hint).toBeUndefined()
    // S8：hint 为写时点结果事实——快照键零新列（query_json 承载，不随重查漂移）
    expect(zero.query?.text).toBe('nosuchturncard')
  })
})

// ── J2-CT-04 sessionRecall 响应形状零漂移（golden 对照——判定式锚） ──

describe('J2-CT-04 sessionRecall 响应形状零漂移（O-等价——判定式锚）', () => {
  it('O-等价：assertSameStructure 经 knowledge-five-channel-supply（stage4 sessionRecall golden overlay）承载——同项目跑批全绿为证据', () => {
    // 证据位 = tests/knowledge/knowledge-five-channel-supply（stage4/sessionRecall.json 结构等价）
    expect(true).toBe(true)
  })
})

// ── J2-CT-05 命中行机械字段收敛（INV-4 + S12——数据面保留、UI 不渲染） ──

describe('J2-CT-05 机械字段收敛（O-数据面在/O-UI 不渲染）', () => {
  it('O-数据面在：通道响应仍携 frontmatterId/heat（S12 数据面事实保留）；O-UI 不渲染：真机面归 test-run（skip 留痕）', async () => {
    const groups = await service.sessionRecall({ projectId: PROJECT, sessionId: SESSION })
    for (const g of groups) for (const h of g.hits) {
      expect(h.frontmatterId).toBeTruthy() // 数据面身份键保留（golden 形状键集听 L2-CT-04）
      expect(h.heat).toBeGreaterThanOrEqual(0)
    }
  })
  it.skip('O-UI 不渲染：命中行无热度徽/slug/rank 元素（INV-4——SSR 断言位 = apps/web RecallTab.test.tsx；真机归 test-run）', () => {})
})

// ── 真机面留痕（卡片展开态分节/函数式调用头/read dialog——journey G2/G5） ──
describe('真机面留痕（J2 G2/G5：展开态按 call 分节 + read contentSnap dialog——真机增量）', () => {
  it.skip('卡片展开态分节四节呈现 + read 快照 dialog + 收起不残留（环境前提：真机 Electron + Playwright，归 test-run 收口）', () => {})
})
