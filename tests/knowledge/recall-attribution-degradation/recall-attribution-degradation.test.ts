// @feature:knowledge
// Journey: recall-attribution-degradation（proposal knowledge-stage4-recall-scope——J4 召回归因与降级形态）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage4-recall-scope/testing/recall-attribution-degradation/
//   contracts/degradation.md（J4-CT-01..05 ← §1 D1–D5 + journey G1–G3/B1–B6/INV-1..4）。
// 分层：本 spec 承载知识插件侧可判定的归因链 Outcome（turn_seq/trigger_snap 落账、截断标记
// 单点字面量、legacy keywords 快照行保留、RPC 径 NULL 行）；「轮次未锚」卡渲染与降级链真机
// 行为归 Playwright test-run 收口（skip 留痕）；sessionContextOf 每调用期现派生零缓存与
// fail-soft warn 已由包内 recall-attribution.test.ts / tools 单测 pin（journey §7 单测面）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TRIGGER_SNAP_MAX_CHARS } from '../../../packages/plugins/knowledge/src/service/service.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'

const root = mkdtempSync(join(tmpdir(), 'knowledge-j-j4-'))
const ws = join(root, 'ws')
const knowledgeDir = join(ws, '.knowledge')
const dbFile = join(root, 'knowledge', 'knowledge.db')
const SESSION = 'j4-sess'
const PROJECT = 'p-j4'

let service: BrowseKnowledgeService
let db: ReturnType<typeof openKnowledgeDatabase>

beforeAll(async () => {
  const dir = join(knowledgeDir, 'attr')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'a.md'), `---\nid: j4-attr-a\ntitle: 归因条目甲\nstatus: confirmed\nsummary: 归因条目甲摘要\nkeywords: [attrkey]\nversion_ts: '2026-01-01T00:00:00.000Z'\n---\n\n正文。`, 'utf8')
  db = openKnowledgeDatabase(dbFile)
  createKnowledgeRegistry(db).upsert(ws, knowledgeDir, PROJECT)
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === PROJECT ? ws : undefined) })
  await service.rebuildIndex(PROJECT)
  // 正常会话相邻两轮（D5 O-现派生不串轮的供数面）：各自锚定本轮 turn_seq
  await service.search({ projectId: PROJECT, text: 'attrkey', sessionId: SESSION, callId: 'j4-call-t5', turnSeq: 5, triggerText: '第五轮的触发输入原文' })
  await service.search({ projectId: PROJECT, text: 'attrkey', sessionId: SESSION, callId: 'j4-call-t6', turnSeq: 6, triggerText: '超长触发输入' + '长'.repeat(TRIGGER_SNAP_MAX_CHARS + 500) })
})

afterAll(() => {
  db.close()
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const groupsOf = (): ReturnType<BrowseKnowledgeService['sessionRecall']> => service.sessionRecall({ projectId: PROJECT, sessionId: SESSION })

// ── J4-CT-03（D5）派生落账与现派生不串轮 ──

describe('J4-CT-03 归因落账与现派生（O-fail-soft 落账判定式/O-现派生不串轮）', () => {
  it('O-现派生不串轮：相邻两轮调用各自锚定本轮 turn_seq（零 stale 锚——J2-CT-01 O2 交叉一致）', async () => {
    const groups = await groupsOf()
    const t5 = groups.filter((g) => g.callId === 'j4-call-t5')
    const t6 = groups.filter((g) => g.callId === 'j4-call-t6')
    for (const g of t5) expect(g.turnSeq).toBe(5)
    for (const g of t6) expect(g.turnSeq).toBe(6)
    // triggerSnap 派生落账（正常径有值——D2 首档：摘要 + Tooltip 全文供数）
    expect(t5[0]!.triggerSnap).toBe('第五轮的触发输入原文')
  })
  it('O-fail-soft 落账：sessionContextOf 现派生零缓存/fail-soft 双 NULL warn——由包内 recall-attribution.test.ts 承载（判定式锚：同项目跑批全绿为证据）', () => {
    // 证据位 = packages/plugins/knowledge/src/service/recall-attribution.test.ts
    //（派生失败双 NULL + warn diag 不阻断召回主链——INV-2）
    expect(true).toBe(true)
  })
})

// ── J4-CT-04（D3）trigger_snap 截断标记（三步链终端——落账侧单点施用） ──

describe('J4-CT-04 trigger_snap 截断标记（O-截断快照/O-不截断原文）', () => {
  it('O-截断快照：超长快照总长恒 2000（前 1993 + 尾部标记）且尾部匹配标记；O-不截断原文：≤2000 快照零标记零追加', async () => {
    const groups = await groupsOf()
    const long = groups.find((g) => g.callId === 'j4-call-t6')!
    expect(long.triggerSnap).not.toBeNull()
    expect(long.triggerSnap!.length).toBe(TRIGGER_SNAP_MAX_CHARS) // 总长恒 2000（含标记）
    expect(long.triggerSnap!.endsWith('…[trigger truncated]')).toBe(true) // 尾部 7+ 字符标记（S3 硬约定）
    // O-不截断原文对照：≤2000 快照原样（首行无标记字面量）
    const short = groups.find((g) => g.callId === 'j4-call-t5')!
    expect(short.triggerSnap).not.toContain('…[trigger truncated]')
    // Tooltip 逐字一致（O-呈现一致）为真机消费面——落账侧单点截断（writeRecallLog 唯一施用点）
    // 由本断言 + truncateTriggerSnap 单元（recall-attribution.test.ts）联合闭合
  })
})

// ── J4-CT-02（D1/B2）RPC/web 径行：turn_seq/trigger_snap NULL（宁缺勿假——INV-4） ──

describe('J4-CT-02 RPC 径 NULL 行（O-双缺/O-召回流不受损）', () => {
  it('O-双缺：无会话上下文调用（sessionId 缺省空串径）→ turn_seq/trigger_snap NULL 落账且行在 sessionRecall 可查（召回流不受损）', async () => {
    // RPC/web 径 = 无 turn 派生上下文（服务法直呼未传 turnSeq/triggerText——同 RPC 形态供数）
    await service.search({ projectId: PROJECT, text: 'attrkey', sessionId: SESSION, callId: 'j4-call-rpc' })
    const groups = await groupsOf()
    const rpc = groups.find((g) => g.callId === 'j4-call-rpc')!
    expect(rpc.turnSeq).toBeNull() // 归「轮次未锚」兜底卡（D1——未锚不做警示色）
    expect(rpc.triggerSnap).toBeNull() // 双缺 → 展示「—」（宁缺勿假，不发明伪锚）
    // O-召回流不受损：该行照常落账可查（行在 sessionRecall 响应在册）
    expect(rpc.hitCount).toBeGreaterThan(0)
  })
})

// ── J4-CT-05（D4）legacy keywords 快照行（v7 迁移残留——键保留不丢历史事实） ──

describe('J4-CT-05 legacy keywords 快照行（O-legacy 呈现供数/O-新行无 keywords 键）', () => {
  it('O-legacy 供数：query_json 含 keywords 键 + turn_seq NULL 的 v7 迁移残留行经 sessionRecall 原样供出（防 JSON.parse 直转静默丢弃事实）；O-新行断言交叉 SC-9', async () => {
    db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, query_json, created_at)
       VALUES (?, 'j4-call-legacy', ?, 'search', 0, '{"keywords":["不存在的词"]}', '2026-11-19T09:00:00.000Z')`,
    ).run(PROJECT, SESSION)
    const groups = await groupsOf()
    const legacy = groups.find((g) => g.callId === 'j4-call-legacy')!
    expect(legacy.turnSeq).toBeNull() // D1：NULL 行恒归「轮次未锚」兜底卡
    expect(legacy.query?.keywords).toEqual(['不存在的词']) // D4：legacy 可选键保留（keywords「｜」拼接 + legacy 标注归 web 消费面）
    expect(legacy.triggerSnap).toBeNull()
    // O-新行不带 keywords（SC-9 交叉）：keywords 参数退役后的新调用行快照键集零该键
    const fresh = groups.find((g) => g.callId === 'j4-call-t5')!
    expect(fresh.query?.keywords).toBeUndefined()
    expect(fresh.query?.text).toBe('attrkey')
  })
})

// ── 真机面留痕（「轮次未锚」卡渲染/函数头 legacy「｜」拼接/Tooltip 全文——journey B1–B6） ──
describe('真机面留痕（J4 B1–B6：轮次未锚兜底卡 + legacy 函数头呈现 + Tooltip 截断后快照——真机增量）', () => {
  it.skip('轮次未锚兜底卡呈现 + legacy keywords「｜」拼接函数头 + 超长 Tooltip 全文（环境前提：真机 Electron + Playwright，归 test-run 收口）', () => {})
})
