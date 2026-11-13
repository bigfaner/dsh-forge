// stage④ 1.5 服务面单测：召回写入点扩展（turn_seq/trigger_snap/score/content_snap 四新列族）
// + read/browse 召回写入点 + search hint 回填 + 会话归因派生参数贯通 + 反馈三值应用层
// （feedback.ts：落账/撤销/事件批更不覆盖已👍行/请求级拒收）+ write scope='global'。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload, RecallFeedbackOutcome, RecallFeedbackResult } from '@dsh-forge/contracts'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService, truncateTriggerSnap } from './service.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let service: BrowseKnowledgeService
let projectId: string
let wsDir: string
let knowledgeDir: string
let db: import('better-sqlite3').Database
let apiEntryId: number

const rowsOf = (where = ''): Record<string, unknown>[] =>
  db.prepare(`SELECT * FROM knowledge_recall_logs ${where}`).all() as Record<string, unknown>[]

/** RecallFeedbackOutcome 判别联合收窄（results 变体提取——rejected-request 变体即非预期） */
const resultsOf = (o: RecallFeedbackOutcome): readonly RecallFeedbackResult[] => {
  if (!('results' in o)) throw new Error(`请求级拒收（非预期）：${o.code} ${o.message}`)
  return o.results
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-recall-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(join(knowledgeDir, 'backend'), { recursive: true })
  writeFileSync(
    join(knowledgeDir, 'backend', 'api.md'),
    '---\ntitle: API\nid: kb-api\nstatus: confirmed\nsummary: 接口规范\nkeywords: [api]\n---\nAPI 正文全文内容',
    'utf8',
  )
  projectId = 'p-recall'
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir, projectId)
  service = createKnowledgeService({ db, resolveWsPath: () => undefined })
  await service.rebuildIndex(projectId)
  apiEntryId = (await service.search({ projectId, sessionId: 'seed' })).find((h) => h.frontmatterId === 'kb-api')!.entryId
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('search 写入点扩展（turn_seq/trigger_snap/score + callId + hint 回填）', () => {
  it('派生值贯通落账：turn_seq/trigger_snap/score 逐列落行；无派生键 = NULL（legacy 同形）', async () => {
    const before = rowsOf().length
    await service.search({
      projectId,
      sessionId: 's-attr',
      text: 'api',
      callId: 'call-attr-1',
      turnSeq: 12,
      triggerText: '帮我检索 knowledge 热读口径',
    })
    const rows = rowsOf(`WHERE call_id = 'call-attr-1'`)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row['turn_seq']).toBe(12)
      expect(row['trigger_snap']).toBe('帮我检索 knowledge 热读口径')
      expect(row['verb']).toBe('search')
      if (row['entry_id'] !== null) expect(row['score']).toBeTypeOf('number')
      else expect(row['score']).toBeNull()
    }
    // 无派生键调用 = 双 NULL（web/RPC 径 legacy 同形）
    await service.search({ projectId, sessionId: 's-attr', text: 'api' })
    const legacyRows = rowsOf(`WHERE session_id = 's-attr' AND call_id != 'call-attr-1'`)
    expect(legacyRows.length).toBeGreaterThan(0)
    expect(legacyRows.every((r) => r['turn_seq'] === null && r['trigger_snap'] === null)).toBe(true)
    expect(rowsOf().length).toBe(before + rows.length + legacyRows.length)
  })

  it('trigger_snap 2000 字符单点截断（含尾部标记——总长 ≤2000）', async () => {
    await service.search({ projectId, sessionId: 's-trunc', text: 'api', triggerText: 'x'.repeat(5000), turnSeq: 1 })
    const row = rowsOf(`WHERE session_id = 's-trunc'`)[0]!
    expect(String(row['trigger_snap']).length).toBe(2000)
    expect(String(row['trigger_snap'])).toContain('[trigger truncated]')
  })

  it('truncateTriggerSnap 单元：界内原样 / 超界切至 2000 含标记', () => {
    expect(truncateTriggerSnap('abc')).toBe('abc')
    const out = truncateTriggerSnap('y'.repeat(2001))
    expect(out.length).toBe(2000)
    expect(out.endsWith('[trigger truncated]')).toBe(true)
    expect(truncateTriggerSnap('z'.repeat(2000)).length).toBe(2000)
  })

  it('annotateSearchHint：hint 落同 call 行 query_json 快照键（零新列）；null 撤键', async () => {
    await service.search({ projectId, sessionId: 's-hint', text: 'nope-nothing', callId: 'call-hint-1' })
    service.annotateSearchHint({ callId: 'call-hint-1', hint: 'zero hits. You may reword once and retry with retry=true.' })
    const rows = rowsOf(`WHERE call_id = 'call-hint-1'`)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const snap = JSON.parse(String(row['query_json'])) as Record<string, unknown>
      expect(snap['hint']).toContain('zero hits')
    }
    service.annotateSearchHint({ callId: 'call-hint-1', hint: null })
    for (const row of rowsOf(`WHERE call_id = 'call-hint-1'`)) {
      expect('hint' in (JSON.parse(String(row['query_json'])) as Record<string, unknown>)).toBe(false)
    }
  })
})

describe('read / read-abstract / browse 召回写入点（verb 四值）', () => {
  it('read：verb=read 行落账 + content_snap 全文快照不截断；denied 径零落账', async () => {
    const before = rowsOf().length
    const outcome = await service.read({ projectId, sessionId: 's-read', id: 'kb-api', turnSeq: 5, triggerText: '读一下 API 规范' })
    expect(outcome.outcome).toBe('read')
    const rows = rowsOf(`WHERE session_id = 's-read'`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ verb: 'read', entry_id: apiEntryId, frontmatter_id: 'kb-api', turn_seq: 5, trigger_snap: '读一下 API 规范', score: null })
    expect(rows[0]!['content_snap']).toBe('---\ntitle: API\nid: kb-api\nstatus: confirmed\nsummary: 接口规范\nkeywords: [api]\n---\nAPI 正文全文内容')
    // denied（unconfirmed 条目）零落账
    await service.read({ projectId, sessionId: 's-read', id: 'no-such-entry' })
    expect(rowsOf().length).toBe(before + 1)
  })

  it('browseEntries：verb=browse 页内条目锚落账 + domain/offset/limit/order 落 query_json 快照键', async () => {
    await service.browseEntries({ projectId, sessionId: 's-browse', domain: 'backend', offset: 0, limit: 1, order: 'created', turnSeq: 3, triggerText: '浏览 backend' })
    const rows = rowsOf(`WHERE session_id = 's-browse'`)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row).toMatchObject({ verb: 'browse', turn_seq: 3, trigger_snap: '浏览 backend' })
    const snap = JSON.parse(String(row['query_json'])) as Record<string, unknown>
    expect(snap).toMatchObject({ domain: 'backend', offset: 0, limit: 1, order: 'created' })
    // 页内条目锚：limit=1 → 恰 1 命中行（browse 不计热——heat 终式 read=1.0 其余 0）
    expect(row['hit_count']).toBe(1)
    expect(row['entry_id']).toBeTypeOf('number')
    expect(row['content_snap']).toBeNull()
  })
})

describe('recallFeedback（feedback.ts 三值应用层）', () => {
  /** 造一轮 search 召回（3 confirmed 命中行不存在——fixture 只有 1 条目；用行级直插补齐） */
  function seedCallRows(callId: string): number[] {
    const insert = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, created_at)
       VALUES (?, ?, 'fb', 'search', ?, 'kb-api', 'API', 'backend', '{}', 1, ?)`,
    )
    const ids: number[] = []
    for (let i = 0; i < 3; i += 1) {
      ids.push(Number(insert.run(projectId, callId, apiEntryId, new Date().toISOString()).lastInsertRowid))
    }
    return ids
  }

  it('行级 👍 落账 → toggle 撤销（feedback=0 + note/at 双 NULL）', async () => {
    const [rowId] = seedCallRows('fb-call-1')
    const r1 = await service.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: 1 })
    expect(r1).toEqual({ results: [{ rowId, outcome: 'success' }] })
    expect(rowsOf(`WHERE id = ${rowId}`)[0]).toMatchObject({ feedback: 1, feedback_note: null })
    const r2 = await service.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: 0 })
    expect(r2).toEqual({ results: [{ rowId, outcome: 'success' }] })
    expect(rowsOf(`WHERE id = ${rowId}`)[0]).toMatchObject({ feedback: 0, feedback_note: null, feedback_at: null })
  })

  it('行级 👎 必附说明：空 note = note-required 不落账；带 note 落账（note 原文入行）', async () => {
    const [rowId] = seedCallRows('fb-call-2')
    const bad = await service.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: -1 })
    expect(bad).toEqual({ results: [{ rowId, outcome: 'failure', code: 'note-required', message: expect.any(String) }] })
    expect(rowsOf(`WHERE id = ${rowId}`)[0]).toMatchObject({ feedback: 0, feedback_note: null })
    const ok = await service.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: -1, note: '检索词偏离主题' })
    expect(resultsOf(ok)[0]).toEqual({ rowId, outcome: 'success' })
    expect(rowsOf(`WHERE id = ${rowId}`)[0]).toMatchObject({ feedback: -1, feedback_note: '检索词偏离主题' })
    expect(rowsOf(`WHERE id = ${rowId}`)[0]!['feedback_at']).toBeTypeOf('string')
  })

  it('👍/撤销携 note = note-required（应用层保证 feedback∈{1,0} 零 note）', async () => {
    const [rowId] = seedCallRows('fb-call-3')
    const bad = await service.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: 1, note: '不该有' })
    expect(resultsOf(bad)[0]).toMatchObject({ outcome: 'failure', code: 'note-required' })
  })

  it('rowId 未命中 = not-found；unconfirmed 条目行 = unconfirmed（入口仅 confirmed）', async () => {
    const nf = await service.recallFeedback({ projectId, action: 'row', rowId: 999999, feedback: 1 })
    expect(resultsOf(nf)[0]).toMatchObject({ outcome: 'failure', code: 'not-found' })
    const insert = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, created_at)
       VALUES (?, 'fb-call-4', 'fb', 'search', NULL, NULL, NULL, NULL, '{}', 0, ?)`,
    )
    const sentinel = Number(insert.run(projectId, new Date().toISOString()).lastInsertRowid)
    const uc = await service.recallFeedback({ projectId, action: 'row', rowId: sentinel, feedback: 1 })
    expect(resultsOf(uc)[0]).toMatchObject({ outcome: 'failure', code: 'unconfirmed' })
  })

  it('事件级批 👎：同 call 全行批更；已显式 👍 的行不被覆盖；批撤销只清已👎行（行级 👍 不受牵连）', async () => {
    const ids = seedCallRows('fb-call-5')
    await service.recallFeedback({ projectId, action: 'row', rowId: ids[0]!, feedback: 1 }) // 首行显式 👍
    const batch = await service.recallFeedback({ projectId, action: 'batch', callId: 'fb-call-5', feedback: -1, note: '整批误召回' })
    expect(resultsOf(batch).map((r) => r.outcome)).toEqual(['success', 'success', 'success'])
    expect(rowsOf(`WHERE id = ${ids[0]}`)[0]).toMatchObject({ feedback: 1, feedback_note: null }) // 👍 行不被覆盖
    expect(rowsOf(`WHERE id = ${ids[1]}`)[0]).toMatchObject({ feedback: -1, feedback_note: '整批误召回' })
    expect(rowsOf(`WHERE id = ${ids[2]}`)[0]).toMatchObject({ feedback: -1 })
    // 批撤销：行级 👍 不受牵连
    const revoke = await service.recallFeedback({ projectId, action: 'batch', callId: 'fb-call-5', feedback: 0 })
    expect(resultsOf(revoke).every((r) => r.outcome === 'success')).toBe(true)
    expect(rowsOf(`WHERE id = ${ids[0]}`)[0]).toMatchObject({ feedback: 1 })
    expect(rowsOf(`WHERE id = ${ids[1]}`)[0]).toMatchObject({ feedback: 0, feedback_note: null, feedback_at: null })
  })

  it('请求级拒收：batch 携 👍 / feedback 越界 / action 非法（零写入）', async () => {
    const before = rowsOf().length
    expect(await service.recallFeedback({ projectId, action: 'batch', callId: 'x', feedback: 1 as never })).toMatchObject({ outcome: 'rejected-request', code: 'invalid-request' })
    expect(await service.recallFeedback({ projectId, action: 'row', rowId: 1, feedback: 2 as never })).toMatchObject({ outcome: 'rejected-request', code: 'invalid-request' })
    expect(await service.recallFeedback({ projectId, action: 'nope' as never, rowId: 1, feedback: 1 })).toMatchObject({ outcome: 'rejected-request', code: 'invalid-request' })
    expect(rowsOf().length).toBe(before)
  })

  it('callId 未命中 = results 空数组回执（无行可更，非错误）；全动作 diag（含撤销）', async () => {
    const collect: DiagEventPayload[] = []
    const svc = createKnowledgeService({ db, resolveWsPath: () => undefined, emit: (p) => collect.push(p) })
    const empty = await svc.recallFeedback({ projectId, action: 'batch', callId: 'no-such-call', feedback: -1, note: 'n' })
    expect(empty).toEqual({ results: [] })
    const [rowId] = seedCallRows('fb-call-6')
    await svc.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: 1 })
    await svc.recallFeedback({ projectId, action: 'row', rowId: rowId!, feedback: 0 })
    const fbDiags = collect.filter((d) => d.event === 'knowledge-recall-feedback')
    expect(fbDiags.length).toBeGreaterThanOrEqual(3) // 批 + 👍 + 撤销
    expect(fbDiags.every((d) => !JSON.stringify(d.message).includes('不该有'))).toBe(true)
  })
})

describe('write scope=global（全局库写入——网关签名零改）', () => {
  it('scope=global：经全局注册行 knowledgeDir 落盘；未注册 = fail-loud', async () => {
    const dataRoot = join(home, 'data')
    const globalDir = join(dataRoot, 'knowledge-global')
    createKnowledgeRegistry(db).registerGlobalIfAbsent(globalDir)
    const out = await service.write({
      projectId,
      sessionId: 's-global',
      title: 'global note',
      summary: '全局条目',
      keywords: ['global'],
      body: '全局正文',
      scope: 'global',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(out.outcome).toBe('written')
    expect((out as { filePath: string }).filePath.startsWith(globalDir)).toBe(true)
    // 未注册环境 fail-loud（裸错——与 requireProject 同语义）
    const bare = openKnowledgeDatabase(join(home, 'bare.db'))
    const bareSvc = createKnowledgeService({ db: bare, resolveWsPath: () => undefined })
    await expect(bareSvc.write({
      projectId,
      title: 'x', summary: 'x', keywords: ['x'], body: 'x',
      scope: 'global',
      necessity: { stable: true, nonTrivial: true, value: true },
    })).rejects.toThrow(/全局知识库未注册/)
    bare.close()
    db.prepare(`DELETE FROM knowledge_registry WHERE scope = 'global'`).run()
  })
})
