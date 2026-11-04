// stage② distill 归并执行面（提案 §2.6 裁决 #8：自动执行 + 全程可回滚）。
// 归并四件套经服务面单点承载（fix 6ca979cf：台账落账无通道、hash 中止/驳回逆向
// 无实现——此前仅 SKILL 组装、测试手工合成台账行）：
// ① loser 正本回写 merged_into（frontmatter 写径——文件为正本权威，rebuild 可再生）；
// ② KNOWLEDGE_MERGE_LEDGER 落行 actor=agent（生产写径）；
// ③ revertMerge 驳回逆向（actor=human）：loser 解除 redirect 恢复检索地位，
//    winner 融合正文不回退；逆向不可凭空回滚（台账行缺失拒绝）；
// ④ 写前 content_hash 校验中止（失配即中止该项，INV-F——绝不基于陈旧内容归并）。
// CAS 与 confirm 交错防护：loser 已带 merged_into → merge 拒（cas-failed）；
// merge 先到 → confirm 侧既有 merged CAS 拒（write.ts confirm 前置）。loser 权威版
// 为 confirmed 时归并同笔降 superseded（保留 confirmed_at 曾审标记）——终态无
// confirmed+redirect 并存（INV-D），且「已审面意外缺失」的 warn purge 口径成立（CT-DI-07）。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { deriveEffectiveRank, type EntryStatus } from '../storage/rebuild.js'
import { KNOWLEDGE_MERGE_EVENT, emitStorageDiag, storageDiag, type DiagEmitter } from '../storage/diag.js'
import type { KnowledgeMergeOutcome, KnowledgeMergeQuery, KnowledgeRevertOutcome, KnowledgeRevertQuery } from './types.js'

/** 归并面依赖（service 工厂注入） */
export interface MergeGatewayDeps {
  readonly db: Database.Database
  readonly emit?: DiagEmitter
}

/** entries 投影行（merge 面消费列） */
interface MergeEntryRow {
  id: string
  status: string
  confirmed_version_id: string | null
  merged_into: string | null
}

/** 版本行 */
interface VersionRow {
  version_ts: string
  file_path: string
}

/** 权威版本选择（rebuild.ts pickAuthority 同口径：confirmed 指针优先，否则最新 version_ts——
 *  confirmed 指针取自 entries 投影行，免逐文件解析） */
function pickAuthority(versions: readonly VersionRow[], confirmedVersionId: string | null): VersionRow {
  const pool = confirmedVersionId !== null ? versions.filter((v) => v.version_ts === confirmedVersionId) : []
  const candidates = pool.length > 0 ? pool : versions
  return candidates.reduce((a, b) => (a.version_ts >= b.version_ts ? a : b))
}

/** 归并/逆向面工厂（service.ts 注入 db/emit；条目解析每调用期现查——无缓存快照） */
export function createMergeGateway(deps: MergeGatewayDeps) {
  const { db, emit } = deps
  const selectEntry = db.prepare<[string], MergeEntryRow>(
    `SELECT id, status, confirmed_version_id, merged_into FROM knowledge_entries WHERE id = ?`,
  )
  const selectVersions = db.prepare<[string], VersionRow>(
    `SELECT version_ts, file_path FROM knowledge_entry_versions WHERE id = ?`,
  )
  const selectLatestAgentLedger = db.prepare<[string], { seq: number; winner_id: string }>(
    `SELECT seq, winner_id FROM knowledge_merge_ledger WHERE loser_id = ? AND actor = 'agent' ORDER BY seq DESC LIMIT 1`,
  )
  const insertLedger = db.prepare(
    `INSERT INTO knowledge_merge_ledger (winner_id, loser_id, reason, actor, merged_at) VALUES (?, ?, ?, ?, ?)`,
  )

  /** 正本文件读取（亡/不可读 = cas-failed 回执面，非裸错） */
  function readAuthority(loserId: string, confirmedVersionId: string | null): { raw: string; authority: VersionRow } | undefined {
    const versions = selectVersions.all(loserId)
    if (versions.length === 0) return undefined
    const authority = pickAuthority(versions, confirmedVersionId)
    try {
      return { raw: readFileSync(authority.file_path, 'utf8'), authority }
    } catch {
      return undefined
    }
  }

  /** ④ 写前 content_hash 校验（评估期快照 vs 当前文件 sha256——失配中止该项） */
  function hashMatches(raw: string, expected: string | undefined): boolean {
    if (expected === undefined) return true
    return createHash('sha256').update(raw, 'utf8').digest('hex') === expected
  }

  async function merge(q: KnowledgeMergeQuery): Promise<KnowledgeMergeOutcome> {
    const casFailed = (detail: string, reason: 'merged' | 'not-found' = 'merged'): KnowledgeMergeOutcome => {
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_MERGE_EVENT, `归并 CAS 拒：${detail}`, { cwd: q.loserId }))
      return { outcome: 'cas-failed', loserId: q.loserId, reason, detail }
    }
    if (q.loserId === q.winnerId) return casFailed('winner 与 loser 同 id——自归并拒绝')
    const loser = selectEntry.get(q.loserId)
    if (loser === undefined) return casFailed(`loser 未命中：${q.loserId}`, 'not-found')
    if (loser.merged_into !== null && loser.merged_into !== '') {
      return casFailed(`loser 已归并至 ${loser.merged_into}——重复归并拒（CAS 前置）`)
    }
    const winner = selectEntry.get(q.winnerId)
    if (winner === undefined) return casFailed(`winner 未命中：${q.winnerId}`, 'not-found')
    const read = readAuthority(q.loserId, loser.confirmed_version_id)
    if (read === undefined) return casFailed(`loser 权威文件不可读/无版本行：${q.loserId}`)
    // ④ INV-F：写前 content_hash 校验——失配即中止该项（评估期间被手改）
    if (!hashMatches(read.raw, q.expectedLoserHash)) {
      const detail = `content_hash 失配（评估期快照 ≠ 当前文件）——中止该项，绝不基于陈旧内容归并：${q.loserId}`
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_MERGE_EVENT, `归并中止：${detail}`, { cwd: read.authority.file_path }))
      return { outcome: 'aborted', loserId: q.loserId, reason: 'hash-mismatch', detail }
    }
    // ① 正本回写（文件面先行——正本权威）：merged_into + confirmed 降 superseded（保 confirmed_at）
    const parsed = matter(read.raw)
    const data = { ...parsed.data } as Record<string, unknown>
    const wasConfirmed = data.status === 'confirmed'
    data.merged_into = q.winnerId
    if (wasConfirmed) data.status = 'superseded'
    const serialized = matter.stringify(parsed.content, data)
    writeFileSync(read.authority.file_path, serialized, 'utf8')
    const newStatus: EntryStatus = wasConfirmed ? 'superseded' : (loser.status === 'confirmed' ? 'superseded' : (loser.status as EntryStatus))
    const mergedAt = new Date().toISOString()
    // ② 台账落行（同事务随 entries 投影更新——业务账，rebuild 永不波及）
    withImmediateTransaction(db, () => {
      db.prepare(
        `UPDATE knowledge_entries SET status = ?, effective_rank = ?, merged_into = ?, updated_at = ? WHERE id = ?`,
      ).run(newStatus, deriveEffectiveRank(newStatus, q.winnerId, false), q.winnerId, mergedAt, q.loserId)
      insertLedger.run(q.winnerId, q.loserId, q.reason ?? null, 'agent', mergedAt)
    })
    emitStorageDiag(
      emit,
      storageDiag(
        'info',
        KNOWLEDGE_MERGE_EVENT,
        `归并执行：${q.loserId} → ${q.winnerId}${wasConfirmed ? '（loser 曾 confirmed，同笔降 superseded）' : ''}（actor=agent）`,
        { cwd: read.authority.file_path },
      ),
    )
    return { outcome: 'merged', winnerId: q.winnerId, loserId: q.loserId, demotedFromConfirmed: wasConfirmed }
  }

  async function revertMerge(q: KnowledgeRevertQuery): Promise<KnowledgeRevertOutcome> {
    const rejected = (reason: 'not-merged' | 'ledger-missing', detail: string): KnowledgeRevertOutcome => {
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_MERGE_EVENT, `驳回逆向拒：${detail}`, { cwd: q.loserId }))
      return { outcome: 'rejected', loserId: q.loserId, reason, detail }
    }
    const loser = selectEntry.get(q.loserId)
    if (loser === undefined || loser.merged_into === null || loser.merged_into === '') {
      return rejected('not-merged', `条目未处归并态（merged_into 空/未命中）：${q.loserId}`)
    }
    if (q.winnerId !== undefined && loser.merged_into !== q.winnerId) {
      return rejected('not-merged', `归并指向不符：当前 ${loser.merged_into} ≠ ${q.winnerId}`)
    }
    // 台账行在场校验（CT-DI-06 O2：逆向不可凭空回滚——由行重建全程）
    const ledgerRow = selectLatestAgentLedger.get(q.loserId)
    if (ledgerRow === undefined || ledgerRow.winner_id !== loser.merged_into) {
      return rejected('ledger-missing', `无对应 actor=agent 台账行——拒绝逆向：${q.loserId} → ${loser.merged_into}`)
    }
    const read = readAuthority(q.loserId, loser.confirmed_version_id)
    if (read === undefined) return rejected('not-merged', `loser 权威文件不可读/无版本行：${q.loserId}`)
    if (!hashMatches(read.raw, q.expectedLoserHash)) {
      const detail = `content_hash 失配——中止逆向（文件已被外部改动）：${q.loserId}`
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_MERGE_EVENT, `逆向中止：${detail}`, { cwd: read.authority.file_path }))
      return { outcome: 'rejected', loserId: q.loserId, reason: 'not-merged', detail }
    }
    // ③ 驳回逆向：loser 解除 redirect 恢复检索地位；winner 融合正文不回退（零触碰）
    const parsed = matter(read.raw)
    const data = { ...parsed.data } as Record<string, unknown>
    delete data.merged_into
    let restoredStatus: EntryStatus = 'unconfirmed'
    if (data.status === 'superseded' && typeof data.confirmed_at === 'string') {
      data.status = 'confirmed' // 曾审标记在场 → 恢复 confirmed 档（rank 1.0）
      restoredStatus = 'confirmed'
    } else if (data.status === 'confirmed' || data.status === 'unconfirmed' || data.status === 'superseded') {
      restoredStatus = data.status
    }
    writeFileSync(read.authority.file_path, matter.stringify(parsed.content, data), 'utf8')
    const revertedAt = new Date().toISOString()
    withImmediateTransaction(db, () => {
      db.prepare(
        `UPDATE knowledge_entries SET status = ?, effective_rank = ?, merged_into = NULL, updated_at = ? WHERE id = ?`,
      ).run(restoredStatus, deriveEffectiveRank(restoredStatus, undefined, false), revertedAt, q.loserId)
      insertLedger.run(loser.merged_into, q.loserId, q.reason ?? null, 'human', revertedAt)
    })
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_MERGE_EVENT, `驳回逆向：${q.loserId} 解除 redirect（rank 回 ${restoredStatus} 档）→ ${loser.merged_into} 正文保留（actor=human）`, { cwd: read.authority.file_path }),
    )
    return { outcome: 'reverted', loserId: q.loserId, winnerId: loser.merged_into, restoredStatus }
  }

  return { merge, revertMerge }
}
