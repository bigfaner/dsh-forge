// 召回反馈应用层（stage④ 1.5——提案 §2.3 / 契约正本
// testing/recall-feedback-loop/contracts/feedback-channel.md §1 S2–S5）：
// · 三值应用层校验入口：feedback ∈ {1,-1,0}（batch 仅 -1|0）；-1 必附 note（空/缺席 =
//   逐行 failure note-required）；feedback ∈ {1,0} 时 note 须缺席或空（应用层保证
//   feedback=0 时 note/at 双 NULL）；反馈入口仅 confirmed（unconfirmed 行 = 逐行
//   failure unconfirmed——UI 入口缺席是第一防线，本层兜底）。
// · 落账/撤销/事件批更：withImmediateTransaction 短事务；并发最后写胜出；
//   同 call 全行批更不覆盖已 👍 行（J3-CT-03 硬语义）；批撤销只清批内已 👎 行
//   （行级独立 👍 不受牵连——J3-CT-03 O3）；callId 未命中 = results 空数组（非错误）。
// · 全动作 diag（含撤销；note 原文不入 diag——只记 notePresent）。
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { KNOWLEDGE_FEEDBACK_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from '../storage/diag.js'
import type { RecallFeedbackOutcome, RecallFeedbackRequest, RecallFeedbackResult } from './types.js'

/** 反馈网关依赖（service 工厂注入） */
export interface RecallFeedbackDeps {
  readonly db: Database.Database
  readonly emit?: DiagEmitter
}

/** 反馈行投影（recall_logs 单行 + 条目 status 联查判定面） */
interface FeedbackRow {
  id: number
  entry_id: number | null
  feedback: number
}

/** 三值校验（应用层——通道层形状防线之后的业务闸；越界 = 请求级拒收） */
function isValidFeedback(v: unknown): v is 1 | -1 | 0 {
  return v === 1 || v === -1 || v === 0
}

export function createRecallFeedbackGateway(deps: RecallFeedbackDeps) {
  const { db, emit } = deps
  const selectRow = db.prepare<[number], FeedbackRow>(
    `SELECT id, entry_id, feedback FROM knowledge_recall_logs WHERE id = ?`,
  )
  const selectCallRows = db.prepare<[string, string], FeedbackRow>(
    `SELECT id, entry_id, feedback FROM knowledge_recall_logs WHERE project_id = ? AND call_id = ? ORDER BY id`,
  )
  // 反馈入口仅 confirmed：行级联查条目权威投影 status（entry_id = rowid；哨兵行
  // entry_id NULL 无条目 → 同 unconfirmed 口径拒）
  const selectEntryStatus = db.prepare<[number], { status: string }>(
    `SELECT status FROM knowledge_entries WHERE rowid = ?`,
  )
  const updateFeedback = db.prepare<[number, string | null, string | null, number]>(
    `UPDATE knowledge_recall_logs SET feedback = ?, feedback_note = ?, feedback_at = ? WHERE id = ?`,
  )

  function confirmedOf(row: FeedbackRow): boolean {
    if (row.entry_id === null) return false
    return selectEntryStatus.get(row.entry_id)?.status === 'confirmed'
  }

  function noteOf(q: { feedback: 1 | -1 | 0; note?: string }): { ok: true; note: string | null } | { ok: false } {
    const note = typeof q.note === 'string' ? q.note : ''
    if (q.feedback === -1) return note.trim() === '' ? { ok: false } : { ok: true, note }
    // 👍/撤销：note 必须缺席或空（应用层保证 feedback=0 双 NULL / 👍 零 note）
    return note.trim() === '' ? { ok: true, note: null } : { ok: false }
  }

  /** 单行应用（校验 + UPDATE；在调用方事务内或独立短事务——row 径独立事务） */
  function applyRow(rowId: number, feedback: 1 | -1 | 0, note?: string): RecallFeedbackResult {
    const row = selectRow.get(rowId)
    if (row === undefined) {
      return { rowId, outcome: 'failure', code: 'not-found', message: `recall 行未命中：${rowId}` }
    }
    if (!confirmedOf(row)) {
      return { rowId, outcome: 'failure', code: 'unconfirmed', message: `反馈入口仅 confirmed（行 ${rowId} 非 confirmed 条目）` }
    }
    const n = noteOf({ feedback, note })
    if (!n.ok) {
      return {
        rowId,
        outcome: 'failure',
        code: 'note-required',
        message: feedback === -1 ? '负反馈必附说明（说明为空 = note-required）' : 'feedback ∈ {1,0} 时 note 必须缺席或空',
      }
    }
    // feedback=0（撤销）→ 置回未反馈态：feedback 0 + note/at 双 NULL；±1 → 落当前时点
    const at = feedback === 0 ? null : new Date().toISOString()
    updateFeedback.run(feedback, n.note, at, rowId)
    return { rowId, outcome: 'success' }
  }

  /**
   * 反馈应用入口（三值校验 + 落账/撤销/批更）。全动作 diag（含撤销；note 原文不入——
   * notePresent 计数）。
   */
  function apply(q: RecallFeedbackRequest): RecallFeedbackOutcome {
    if (typeof q !== 'object' || q === null || typeof (q as { projectId?: unknown }).projectId !== 'string') {
      return { outcome: 'rejected-request', code: 'invalid-request', message: 'projectId 缺失或类型不符' }
    }
    if (q.action === 'row') {
      if (!isValidFeedback(q.feedback) || typeof q.rowId !== 'number' || !Number.isInteger(q.rowId)) {
        return { outcome: 'rejected-request', code: 'invalid-request', message: 'row 径要求 rowId 整数 + feedback 三值 {1,-1,0}' }
      }
      const result = withImmediateTransaction(db, () => applyRow(q.rowId, q.feedback, q.note))
      emitStorageDiag(
        emit,
        storageDiag(
          result.outcome === 'success' ? 'info' : 'warn',
          KNOWLEDGE_FEEDBACK_EVENT,
          `召回反馈（行级）：row ${q.rowId} → ${q.feedback}${result.outcome === 'failure' ? `（${result.code}）` : ''}${typeof q.note === 'string' && q.note.trim() !== '' ? '（notePresent）' : ''}`,
          { projectId: q.projectId },
        ),
      )
      return { results: [result] }
    }
    if (q.action === 'batch') {
      // 事件级 👍 不存在（S2 封闭联合——正反馈无批动作语义）
      if ((q.feedback !== -1 && q.feedback !== 0) || typeof q.callId !== 'string' || q.callId === '') {
        return { outcome: 'rejected-request', code: 'invalid-request', message: 'batch 径要求 callId 非空 + feedback ∈ {-1,0}（事件级 👍 不存在）' }
      }
      const rows = selectCallRows.all(q.projectId, q.callId)
      const notePresent = typeof q.note === 'string' && q.note.trim() !== ''
      if (q.feedback === -1 && !notePresent) {
        emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_FEEDBACK_EVENT, `召回反馈批更拒收：note-required（call ${q.callId}）`, { projectId: q.projectId }))
        return {
          results: rows.map((r): RecallFeedbackResult => ({ rowId: r.id, outcome: 'failure', code: 'note-required', message: '负反馈必附说明' })),
        }
      }
      const note = notePresent ? (q.note as string) : undefined
      const results = withImmediateTransaction(db, () =>
        rows.map((r): RecallFeedbackResult => {
          // 批 👎：已显式 👍 的行不被覆盖；批撤销：只清批内已 👎 行（行级 👍 不受牵连）
          if (q.feedback === -1 && r.feedback === 1) return { rowId: r.id, outcome: 'success' }
          if (q.feedback === 0 && r.feedback !== -1) return { rowId: r.id, outcome: 'success' }
          return applyRow(r.id, q.feedback, note)
        }),
      )
      emitStorageDiag(
        emit,
        storageDiag('info', KNOWLEDGE_FEEDBACK_EVENT, `召回反馈（事件级批）：call ${q.callId} → ${q.feedback}（${rows.length} 行${notePresent ? '，notePresent' : ''}）`, {
          projectId: q.projectId,
        }),
      )
      return { results }
    }
    return { outcome: 'rejected-request', code: 'invalid-request', message: 'action 非法（row | batch）' }
  }

  return { apply }
}
