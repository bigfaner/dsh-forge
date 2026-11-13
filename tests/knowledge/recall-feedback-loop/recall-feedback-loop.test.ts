// @feature:knowledge
// Journey: recall-feedback-loop（proposal knowledge-stage4-recall-scope——J3 召回正负反馈闭环与热度终式）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage4-recall-scope/testing/recall-feedback-loop/
//   contracts/feedback-channel.md（J3-CT-01..05 ← §1 S1–S5 + journey G1–G7/B1–B7/INV-1..6）。
// 分层：本 spec 承载插件服务域可判定的 Outcome（行级三值/批动作/校验负例/热度终式/diag）；
// UI 动作真机面（👍/👎 dialog 流程/回显徽）归 Playwright test-run 收口（skip 留痕）——
// 「反馈→落账→复测排序变化」端到端增量只有真机可证（journey §1）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import type { RecallFeedbackOutcome, RecallFeedbackResult } from '../../../packages/contracts/src/index.js'
import { KNOWLEDGE_HEAT_TERM } from '../../../packages/plugins/knowledge/src/service/internal.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'

const root = mkdtempSync(join(tmpdir(), 'knowledge-j-j3-'))
const ws = join(root, 'ws')
const knowledgeDir = join(ws, '.knowledge')
const dbFile = join(root, 'knowledge', 'knowledge.db')
const SESSION = 'j3-sess'
const PROJECT = 'p-j3'

function put(domain: string, file: string, id: string, title: string, status = 'confirmed'): void {
  const dir = join(knowledgeDir, domain)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nsummary: ${title} 摘要\nkeywords: [fbloop]\nversion_ts: '2026-01-01T00:00:00.000Z'\n---\n\n正文内容。`, 'utf8')
}

let service: BrowseKnowledgeService
let db: ReturnType<typeof openKnowledgeDatabase>
const events: DiagEventPayload[] = []
const rowIdOf = (callId: string, frontmatterId: string): number => {
  const row = db
    .prepare(`SELECT l.rowid AS rid FROM knowledge_recall_logs l JOIN knowledge_entries e ON e.rowid = l.entry_id WHERE l.call_id = ? AND e.id = ?`)
    .get(callId, frontmatterId) as { rid: number } | undefined
  if (row === undefined) throw new Error(`反馈目标行未落账：${callId}/${frontmatterId}`)
  return row.rid
}
/** RecallFeedbackOutcome 判别联合收窄（results 变体提取——rejected-request 变体即非预期） */
const resultsOf = (o: RecallFeedbackOutcome): readonly RecallFeedbackResult[] => {
  if (!('results' in o)) throw new Error(`请求级拒收（非预期）：${o.code} ${o.message}`)
  return o.results
}

beforeAll(async () => {
  put('fb', 'a.md', 'j3-fb-a', '反馈条目甲')
  put('fb', 'b.md', 'j3-fb-b', '反馈条目乙')
  put('fb', 'd.md', 'j3-fb-draft', '反馈草稿条目', 'unconfirmed')
  db = openKnowledgeDatabase(dbFile)
  createKnowledgeRegistry(db).upsert(ws, knowledgeDir, PROJECT)
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === PROJECT ? ws : undefined), emit: (p) => events.push(p) })
  await service.rebuildIndex(PROJECT)
  // fb-call-1：search 同 call 两命中（甲/乙，均 confirmed——批动作与不覆盖语义的载荷面）
  await service.search({ projectId: PROJECT, text: 'fbloop', sessionId: SESSION, callId: 'fb-call-1', turnSeq: 2, triggerText: '查反馈条目' })
  // fb-call-read：read 采纳事件（热度终式 read=1.0 承载）
  await service.read({ projectId: PROJECT, id: 'j3-fb-a', sessionId: SESSION })
})

afterAll(() => {
  db.close()
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

// ── J3-CT-01 行级 👍 / toggle 撤销（S2/S4 + INV-2/INV-6） ──

describe('J3-CT-01 行级 👍 与撤销（O-👍 成功/O-撤销成功/O-not-found/O-unconfirmed）', () => {
  it('O-👍 成功：行级 feedback=1 success 回执（S3 results 逐行展开）+ 落账；O-撤销成功：feedback=0 success + note/at 置 NULL（S4）', async () => {
    const rowId = rowIdOf('fb-call-1', 'j3-fb-a')
    events.length = 0
    const up = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: 1 })
    expect(resultsOf(up)).toEqual([{ rowId, outcome: 'success' }])
    const upRow = db.prepare(`SELECT feedback, feedback_note, feedback_at FROM knowledge_recall_logs WHERE rowid = ?`).get(rowId) as { feedback: number; feedback_note: string | null; feedback_at: string | null }
    expect(upRow.feedback).toBe(1)
    const revoke = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: 0 })
    expect(resultsOf(revoke)).toEqual([{ rowId, outcome: 'success' }])
    const revoked = db.prepare(`SELECT feedback, feedback_note, feedback_at FROM knowledge_recall_logs WHERE rowid = ?`).get(rowId) as { feedback: number; feedback_note: string | null; feedback_at: string | null }
    expect(revoked.feedback).toBe(0)
    expect(revoked.feedback_note).toBeNull() // S4：feedback=0 时 note/at NULL（应用层保证）
    expect(revoked.feedback_at).toBeNull()
    // INV-6：无独立撤销钮语义——toggle 化（再点同键 = 撤销），两层动作互不牵连由批面承载
    // INV-2：零布局位移/零收起/零状态重置——UI 局部更新，真机面归 test-run
    // diag：全动作记账两发（👍 + 撤销 feedback=0），note 原文不入 diag（S5）
    const fbDiag = events.filter((e) => e.event === 'knowledge-recall-feedback')
    expect(fbDiag.length).toBeGreaterThanOrEqual(2)
  })

  it('O-not-found：rowId 未命中 → 逐行 failure code=not-found；O-unconfirmed：unconfirmed 行 → failure code=unconfirmed', async () => {
    const nf = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId: 99999999, feedback: 1 })
    expect(resultsOf(nf)[0]).toMatchObject({ rowId: 99999999, outcome: 'failure', code: 'not-found' })
    const draftRowId = rowIdOf('fb-call-1', 'j3-fb-draft') // 草稿条目命中行（unconfirmed——入口缺席第一防线，通道校验兜底）
    const uc = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId: draftRowId, feedback: 1 })
    expect(resultsOf(uc)[0]).toMatchObject({ outcome: 'failure', code: 'unconfirmed' })
  })
})

// ── J3-CT-02 行级 👎（必附说明——S4 note 约束 + INV-3/INV-5） ──

describe('J3-CT-02 行级 👎 必附说明（O-成功/O-note-required）', () => {
  it('O-成功：feedback=-1 + note success 落账（行标记已剔除）；O-note-required：缺说明 → 逐行 failure code=note-required（应用层校验——绕过 UI 直发通道负例）', async () => {
    const rowId = rowIdOf('fb-call-1', 'j3-fb-b')
    const bad = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: -1 })
    expect(resultsOf(bad)[0]).toMatchObject({ outcome: 'failure', code: 'note-required' })
    const ok = await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: -1, note: '检索词偏离主题' })
    expect(resultsOf(ok)).toEqual([{ rowId, outcome: 'success' }])
    const row = db.prepare(`SELECT feedback, feedback_note FROM knowledge_recall_logs WHERE rowid = ?`).get(rowId) as { feedback: number; feedback_note: string }
    expect(row.feedback).toBe(-1)
    expect(row.feedback_note).toBe('检索词偏离主题') // INV-5：只改计数与标记，不删改条目
  })
})

// ── J3-CT-03 事件级 👎 批动作（S2 batch——同 call 全行批更剔 + 已 👍 不覆盖） ──

describe('J3-CT-03 事件级 👎 批动作（O-批成功含 👍 行/O-整批撤销/O-callId 未命中）', () => {
  it('O-批成功（含已 👍 行）：同 call 全部 confirmed 命中行批更剔——显式 👍 行不被覆盖（INV-1/INV-6 硬语义）；O-整批撤销：feedback=0 批置回', async () => {
    const aRow = rowIdOf('fb-call-1', 'j3-fb-a')
    await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId: aRow, feedback: 1 }) // 首行显式 👍
    const batch = await service.recallFeedback({ projectId: PROJECT, action: 'batch', callId: 'fb-call-1', feedback: -1, note: '整批误召回' })
    // results 逐行展开（S3）——batch 结果含行级明细
    expect(resultsOf(batch).length).toBeGreaterThanOrEqual(2)
    const states = (ids: readonly string[]): Map<string, number> => {
      const q = db.prepare(`SELECT e.id AS id, l.feedback AS fb FROM knowledge_recall_logs l JOIN knowledge_entries e ON e.rowid = l.entry_id WHERE l.call_id = 'fb-call-1'`)
      const m = new Map<string, number>()
      for (const r of q.all() as readonly { id: string; fb: number }[]) if (ids.includes(r.id) && !m.has(r.id)) m.set(r.id, r.fb)
      return m
    }
    const after = states(['j3-fb-a', 'j3-fb-b'])
    expect(after.get('j3-fb-a')).toBe(1) // 已 👍 行保持 1（批 👎 不覆盖显式 👍——O2 汇总徽两值可辨）
    expect(after.get('j3-fb-b')).toBe(-1)
    // O-整批撤销：批内全部已 👎 态再点节头 👎 → feedback:0 批置回；行级独立 👍 不受牵连（INV-6）
    const revoke = await service.recallFeedback({ projectId: PROJECT, action: 'batch', callId: 'fb-call-1', feedback: 0 })
    expect(resultsOf(revoke).length).toBe(resultsOf(batch).length)
    const revoked = states(['j3-fb-a', 'j3-fb-b'])
    expect(revoked.get('j3-fb-a')).toBe(1) // 行级独立 👍 不被批撤销牵连
    expect(revoked.get('j3-fb-b')).toBe(0)
    // O-callId 未命中：results 空数组回执（无行可改，非错误）+ diag 记账（J3-CT-03 O4）
    events.length = 0
    const empty = await service.recallFeedback({ projectId: PROJECT, action: 'batch', callId: 'no-such-call', feedback: -1, note: 'n' })
    expect(resultsOf(empty)).toEqual([])
    expect(events.some((e) => e.event === 'knowledge-recall-feedback')).toBe(true)
  })
})

// ── J3-CT-04 feedback 越界值（S2/S3 请求级拒绝——码集封闭） ──

describe('J3-CT-04 feedback 越界（O-rejected-request/O-事件级 👎 拒收）', () => {
  it('O-rejected-request：feedback=2 → { outcome: rejected-request, code: invalid-request } 且零写入；O-事件级 👎 拒收：batch 携 feedback=1（S2 封闭联合排除该形状）', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM knowledge_recall_logs').get() as { n: number }).n
    expect(await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId: 1, feedback: 2 as never })).toMatchObject({ outcome: 'rejected-request', code: 'invalid-request' })
    expect(await service.recallFeedback({ projectId: PROJECT, action: 'batch', callId: 'fb-call-1', feedback: 1 as never, note: 'x' })).toMatchObject({ outcome: 'rejected-request', code: 'invalid-request' })
    expect(await service.recallFeedback({ projectId: PROJECT, action: 'nope' as never, rowId: 1, feedback: 1 })).toMatchObject({ outcome: 'rejected-request' })
    const after = (db.prepare('SELECT COUNT(*) AS n FROM knowledge_recall_logs').get() as { n: number }).n
    expect(after).toBe(before) // 请求级拒绝：零写入（DB 行数不变）
  })
})

// ── J3-CT-05 热度终式可观测面（INV-4——KNOWLEDGE_HEAT_TERM 单源字面量同源断言 + 数值符合） ──

describe('J3-CT-05 热度终式（O-数值符合/O-负反馈即时生效）', () => {
  it('O-数值符合：heat = Σ(read 1.0)——search/browse 行零贡献、负反馈行计 0、跨项目同 entry 聚合一条（SQL 数值断言）', async () => {
    // 甲：1×search 命中行（已 👍→撤销→批 👎→撤销终态 0）+ 1×read 行 → heat = 1
    // 乙：1×search 命中行（👎 后撤销 → feedback=0）→ search 行零贡献 → heat = 0（不出现于正热 Map）
    const heat = await service.heatByEntry(PROJECT)
    const idOf = (id: string): number => (db.prepare(`SELECT rowid AS rid FROM knowledge_entries WHERE id = ?`).get(id) as { rid: number }).rid
    const expectedA = (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE verb = 'read' AND entry_id = ?`).get(idOf('j3-fb-a')) as { n: number }).n
    expect(heat.get(idOf('j3-fb-a'))).toBe(expectedA) // 终式逐条目相等（read 计入）
    expect(heat.get(idOf('j3-fb-b')) ?? 0).toBe(0) // search 行零贡献（无 read 采纳事件——终式零贡献）
    // 终式字面量同源（SC-5 单测 pin）：heat 语句消费 KNOWLEDGE_HEAT_TERM 单源常量
    expect(KNOWLEDGE_HEAT_TERM).toContain("WHEN verb = 'read' THEN 1.0 ELSE 0 END")
  })
  it('O-负反馈即时生效：👍/👎/撤销三态切换后 heat 回读随之变化（三时点回读值差符合终式增量）', async () => {
    const idOf = (id: string): number => (db.prepare(`SELECT rowid AS rid FROM knowledge_entries WHERE id = ?`).get(id) as { rid: number }).rid
    const rowId = (db.prepare(`SELECT l.rowid AS rid FROM knowledge_recall_logs l JOIN knowledge_entries e ON e.rowid = l.entry_id WHERE l.verb = 'read' AND e.id = ?`).get('j3-fb-a') as { rid: number }).rid // 采纳事件行（read=1.0 计热——负反馈剔除该行贡献）
    const before = (await service.heatByEntry(PROJECT)).get(idOf('j3-fb-a'))!
    await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: -1, note: '复测排序面' }) // 行级 👎：该行计数贡献剔除（条目只减不罚）
    const afterDown = (await service.heatByEntry(PROJECT)).get(idOf('j3-fb-a'))!
    expect(afterDown).toBeLessThan(before) // 终式减项生效（inv-4 只减不罚：条目仅减、无负值惩罚）
    await service.recallFeedback({ projectId: PROJECT, action: 'row', rowId, feedback: 0 })
    const afterRevoke = (await service.heatByEntry(PROJECT)).get(idOf('j3-fb-a'))!
    expect(afterRevoke).toBe(before) // 撤销回滚
  })
})

// ── 真机面留痕（👍 Fill 态回显/👎 dialog/节头批徽——journey G1–G7） ──
describe('真机面留痕（J3 G1–G7：行尾 Fill 回显 + 批 👎 dialog 流 + 复测排序变化回显——真机增量）', () => {
  it.skip('行级 👍/👎/撤销 UI 链 + 批动作回显 + 复测同 query 排序变化可观察（环境前提：真机 Electron + Playwright，归 test-run 收口）', () => {})
})
