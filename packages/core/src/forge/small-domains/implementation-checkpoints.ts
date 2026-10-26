// 机械①（forge-verification-hardening 提案 M5「标记体系/实体设计」节为契约）：forge 实现
// 检查点域服务（第六小域）——implementation_checkpoints 实现检查点流水三法：
// - appendCheckpoint：里程碑/关系标记追加（append-only 流水唯一写径）。五类里程碑标记
//   （first-pass-complete / retro-done / review-wave-N / stabilized / merged）受唯一约束
//   (proposal_id, mark, wave_seq)（DDL partial unique index——关系标记豁免）；review-wave-N
//   缺 wave_seq 自动递增（max+1，首波 = 1）——多波标记不要求调用方记序数。
// - ensureCheckpoint：lazy 补标记（merged/stabilized 漏打兜底——下个循环启动校验补标记；
//   与 stabilized lazy 判定同构）：标记已在场幂等 no-op（appended=false），缺席才落行。
// - listCheckpoints：按 proposal_id 时序查询（created_at 升序，同刻 id 稳定）+ 标记过滤。
// 计数快照（tasks_total / commits_total / fixes_total / evidence_debts_total）由调用方在
// 标记时刻传入——统计口径归任务域，本域只落快照（纯净表零业务引用字段）。写动词闭包尾部
// emitTasksChanged(projectId)（五域 emit 模式同构）。一切 SQL prepared statements。
import { withTransaction } from '../../db/transaction.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'

/** 五类里程碑标记（唯一约束作用域——关系标记 derived-to-child 豁免） */
const MILESTONE_MARKS = new Set([
  'first-pass-complete',
  'retro-done',
  'review-wave-N',
  'stabilized',
  'merged',
])

/** mark 词汇全量（里程碑五类 + 关系标记——DDL CHECK 同源） */
const MARKS = new Set([...MILESTONE_MARKS, 'derived-to-child'])

/** 计数快照（标记时刻累计值——四列独立落库，相邻标记差值 = 阶段增量） */
export interface CheckpointSnapshots {
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

export type CheckpointMark =
  | 'first-pass-complete'
  | 'retro-done'
  | 'review-wave-N'
  | 'stabilized'
  | 'merged'
  | 'derived-to-child'

/** 检查点行 DTO（lossless JSON——wave_seq NULL 条件展开为键缺席） */
export interface CheckpointRow {
  readonly id: number
  readonly proposalId: string
  readonly mark: CheckpointMark
  readonly waveSeq?: number
  readonly createdAt: string
  readonly baseCommitHash: string
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/** appendCheckpoint 入参 */
export interface AppendCheckpointInput {
  readonly projectId: string
  readonly proposalId: string
  readonly mark: CheckpointMark
  /** review-wave-N 专用波序数（缺省自动递增 max+1）；其余标记不得携带 */
  readonly waveSeq?: number
  /** 标记时容器分支 HEAD（commit hash 全局唯一——分支无关） */
  readonly baseCommitHash: string
  readonly snapshots: CheckpointSnapshots
}

/** ensureCheckpoint 返回（appended=false = 幂等跳过，checkpoint 键缺席） */
export interface EnsureCheckpointResult {
  readonly appended: boolean
  readonly checkpoint?: CheckpointRow
}

export interface ListCheckpointsQuery {
  readonly projectId: string
  readonly proposalId: string
  /** 标记过滤（缺省 = 全量） */
  readonly marks?: readonly CheckpointMark[]
}

// ── typed errors（本域就近落位——bugs 域先例同构） ──


/** 唯一约束命中（里程碑标记重复落行——拒写零副作用） */
export class CheckpointAlreadyExistsError extends Error {
  readonly code = 'ERR_CHECKPOINT_ALREADY_EXISTS' as const

  constructor(data: { readonly proposalId: string; readonly mark: CheckpointMark; readonly waveSeq?: number }) {
    super(
      `检查点已存在：${data.mark}${data.waveSeq !== undefined ? `#${String(data.waveSeq)}` : ''}` +
        `（proposal ${data.proposalId}）——里程碑标记唯一约束命中`,
    )
    this.name = 'CheckpointAlreadyExistsError'
  }
}

/** wave_seq 词汇越界（仅 review-wave-N 使用，且须 ≥1 整数） */
export class CheckpointWaveSeqInvalidError extends Error {
  readonly code = 'ERR_CHECKPOINT_WAVE_SEQ_INVALID' as const

  constructor(mark: CheckpointMark) {
    super(`wave_seq 仅 review-wave-N 使用：${mark} 不得携带波序数（关系/里程碑标记 wave_seq 恒 NULL）`)
    this.name = 'CheckpointWaveSeqInvalidError'
  }
}

/** 未知 mark 拒写（词汇面防脏——DDL CHECK 兜底前的服务端预检，普通 Error fail-loud） */

export interface CheckpointsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——六域共享） */
  readonly events: ForgeTaskEvents
}

/** implementation_checkpoints 行存储形状（snake_case → DTO 映射唯一落点） */
interface CheckpointStorageRow {
  id: number
  proposal_id: string
  mark: CheckpointMark
  wave_seq: number | null
  created_at: string
  base_commit_hash: string
  tasks_total: number
  commits_total: number
  fixes_total: number
  evidence_debts_total: number
}

const SELECT_CHECKPOINT = `SELECT id, proposal_id, mark, wave_seq, created_at, base_commit_hash,
       tasks_total, commits_total, fixes_total, evidence_debts_total
FROM implementation_checkpoints`

/** 存储行 → DTO（wave_seq NULL = 键缺席——lossless JSON 合规） */
function toCheckpointRow(row: CheckpointStorageRow): CheckpointRow {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    mark: row.mark,
    ...(row.wave_seq !== null ? { waveSeq: row.wave_seq } : {}),
    createdAt: row.created_at,
    baseCommitHash: row.base_commit_hash,
    tasksTotal: row.tasks_total,
    commitsTotal: row.commits_total,
    fixesTotal: row.fixes_total,
    evidenceDebtsTotal: row.evidence_debts_total,
  }
}

/** mark 词汇校验（DDL CHECK 兜底前的服务端预检——fail-loud 带可读因） */
function assertKnownMark(mark: CheckpointMark): void {
  if (!MARKS.has(mark)) {
    throw new Error(`未知检查点标记：${mark}（五类里程碑 + derived-to-child 词汇外拒写）`)
  }
}

/** wave_seq 校验：仅 review-wave-N 使用；携带时须 ≥1 整数 */
function assertWaveSeq(mark: CheckpointMark, waveSeq: number | undefined): void {
  if (mark !== 'review-wave-N') {
    if (waveSeq !== undefined) throw new CheckpointWaveSeqInvalidError(mark)
    return
  }
  if (waveSeq !== undefined && (!Number.isInteger(waveSeq) || waveSeq < 1)) {
    throw new Error(`review-wave-N 波序数须 ≥1 整数，实际 ${String(waveSeq)}`)
  }
}

/** 唯一约束预检（里程碑标记：同 (proposal_id, mark, wave_seq) 在场即拒——DDL partial unique
 *  index 行为面同源；关系标记豁免不预检）。事务外预检 + 事务内 insert，单写者无 TOCTOU 窗口。 */
function assertUnique(
  db: ReturnType<ForgeWorkspaceStore['ensureOpen']>,
  input: AppendCheckpointInput,
  waveSeq: number | undefined,
): void {
  if (!MILESTONE_MARKS.has(input.mark)) return
  const existing = db
    .prepare<unknown[], { id: number }>(
      `SELECT id FROM implementation_checkpoints WHERE proposal_id = ? AND mark = ? AND wave_seq IS ?`,
    )
    .get(input.proposalId, input.mark, waveSeq ?? null)
  if (existing !== undefined) {
    throw new CheckpointAlreadyExistsError({ proposalId: input.proposalId, mark: input.mark, waveSeq })
  }
}

/** Interface：core · forge 实现检查点域服务面（装配注入——机械①标记落点 + ⑥ agent 工具消费） */
export function createCheckpointsService(deps: CheckpointsServiceDeps) {
  const resolveWaveSeq = (
    db: ReturnType<ForgeWorkspaceStore['ensureOpen']>,
    input: AppendCheckpointInput,
  ): number | undefined => {
    assertKnownMark(input.mark)
    assertWaveSeq(input.mark, input.waveSeq)
    if (input.mark !== 'review-wave-N') return undefined
    if (input.waveSeq !== undefined) return input.waveSeq
    // 自动递增：max+1（首波 = 1）——多波标记调用方免记序数
    const current = db
      .prepare<unknown[], { max_seq: number | null }>(
        `SELECT MAX(wave_seq) AS max_seq FROM implementation_checkpoints WHERE proposal_id = ? AND mark = 'review-wave-N'`,
      )
      .get(input.proposalId)
    return (current?.max_seq ?? 0) + 1
  }

  return {
    /** 追加标记行（append-only 流水唯一写径；里程碑标记唯一约束拒重复） */
    async appendCheckpoint(input: AppendCheckpointInput): Promise<CheckpointRow> {
      const db = deps.store.ensureOpen(input.projectId)
      const waveSeq = resolveWaveSeq(db, input)
      // proposal_id FK 真值预检（proposals 无删除动词——事务外预检无 TOCTOU 窗口）
      const proposal = db.prepare<unknown[], { id: string }>('SELECT id FROM proposals WHERE id = ?').get(input.proposalId)
      if (proposal === undefined) {
        throw new Error(`proposal 悬空引用拒绝：${input.proposalId} 不存在（检查点零副作用）`)
      }
      assertUnique(db, input, waveSeq)
      const row = withTransaction(db, () => {
        db.prepare(
          `INSERT INTO implementation_checkpoints
             (proposal_id, mark, wave_seq, created_at, base_commit_hash,
              tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.proposalId,
          input.mark,
          waveSeq ?? null,
          new Date().toISOString(),
          input.baseCommitHash,
          input.snapshots.tasksTotal,
          input.snapshots.commitsTotal,
          input.snapshots.fixesTotal,
          input.snapshots.evidenceDebtsTotal,
        )
        return db
          .prepare<unknown[], CheckpointStorageRow>(`${SELECT_CHECKPOINT} WHERE id = last_insert_rowid()`)
          .get() as CheckpointStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toCheckpointRow(row)
    },

    /** lazy 补标记：标记已在场幂等 no-op（merged/stabilized 漏打兜底——趋势链不断点） */
    async ensureCheckpoint(input: AppendCheckpointInput): Promise<EnsureCheckpointResult> {
      const db = deps.store.ensureOpen(input.projectId)
      const waveSeq = resolveWaveSeq(db, input)
      if (MILESTONE_MARKS.has(input.mark)) {
        const existing = db
          .prepare<unknown[], { id: number }>(
            `SELECT id FROM implementation_checkpoints WHERE proposal_id = ? AND mark = ? AND wave_seq IS ?`,
          )
          .get(input.proposalId, input.mark, waveSeq ?? null)
        if (existing !== undefined) return { appended: false }
      }
      const checkpoint = await this.appendCheckpoint(input)
      return { appended: true, checkpoint }
    },

    /** 按 proposal_id 时序查询（created_at 升序，同刻 id 稳定）+ 标记过滤 */
    async listCheckpoints(q: ListCheckpointsQuery): Promise<CheckpointRow[]> {
      const db = deps.store.ensureOpen(q.projectId)
      const rows = db
        .prepare<unknown[], CheckpointStorageRow>(`${SELECT_CHECKPOINT} WHERE proposal_id = ? ORDER BY created_at, id`)
        .all(q.proposalId)
      return rows
        .map(toCheckpointRow)
        .filter((r) => q.marks === undefined || q.marks.length === 0 || q.marks.includes(r.mark))
    },
  }
}
