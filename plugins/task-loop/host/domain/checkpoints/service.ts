// checkpoints 域服务——task_checkpoints 三法（plugin-task-loop 1.9，模块③直迁改锚）：
// core forge/small-domains/implementation-checkpoints.ts 三法直迁，容器锚 proposal_id FK
// 退役 → slug 弱引用（entities.md §3.3：零 FK、悬空降级不拒写——悬空预检删除）。
// - appendCheckpoint：里程碑/关系标记追加（append-only 流水唯一写径）。五类里程碑标记
//   （first-pass-complete / retro-done / review-wave-N / stabilized / merged）受唯一约束
//   (project_key, slug, mark, wave_seq)（DDL partial unique index——关系标记 derived-to-child
//   豁免）；review-wave-N 缺 wave_seq 自动递增（max+1，首波 = 1，按 (project_key, slug, mark)
//   圈定）——多波标记不要求调用方记序数。
// - ensureCheckpoint：lazy 补标记（merged/stabilized 漏打兜底）：标记已在场幂等 no-op
//   （appended=false），缺席才落行。唯一预检按 (project_key, slug, mark) 圈定。
// - listCheckpoints：按容器时序查询（created_at 升序，同刻 id 稳定）+ 标记过滤。
// 计数快照（tasks_total / commits_total / fixes_total / evidence_debts_total）由调用方在
// 标记时刻传入——统计口径归任务域，本域只落快照（零业务引用字段，四指标现算归 metrics.ts）。
// 写动词闭包尾部 emitTasksChanged(projectKey)（tasks 域 emit 模式同构）。id 纯 UUID 写入点
// 生成；一切 SQL prepared statements；typed 判据（处方②禁 message 字符串判据）。
import { randomUUID } from "node:crypto";
import type Database from "@dsh-forge/lib-db";
import type { TaskEvents } from "../tasks/types.js";

/** 五类里程碑标记（唯一约束作用域——关系标记 derived-to-child 豁免） */
const MILESTONE_MARKS = new Set([
  "first-pass-complete",
  "retro-done",
  "review-wave-N",
  "stabilized",
  "merged",
]);

/** mark 词汇全量（里程碑五类 + 关系标记——DDL CHECK 同源） */
const MARKS = new Set([...MILESTONE_MARKS, "derived-to-child"]);

/** 计数快照（标记时刻累计值——四列独立落库，相邻标记差值 = 阶段增量） */
export interface CheckpointSnapshots {
  readonly tasksTotal: number;
  readonly commitsTotal: number;
  readonly fixesTotal: number;
  readonly evidenceDebtsTotal: number;
}

export type CheckpointMark =
  | "first-pass-complete"
  | "retro-done"
  | "review-wave-N"
  | "stabilized"
  | "merged"
  | "derived-to-child";

/** 检查点行 DTO（lossless JSON——wave_seq NULL 条件展开为键缺席） */
export interface CheckpointRow {
  readonly id: string;
  readonly projectKey: string;
  readonly slug: string;
  readonly mark: CheckpointMark;
  readonly waveSeq?: number;
  readonly createdAt: string;
  readonly baseCommitHash: string;
  readonly tasksTotal: number;
  readonly commitsTotal: number;
  readonly fixesTotal: number;
  readonly evidenceDebtsTotal: number;
}

/** appendCheckpoint 入参（proposalId → containerSlug 改锚终态） */
export interface AppendCheckpointInput {
  readonly projectKey: string;
  /** 容器 slug 弱引用锚（零 FK——悬空降级不拒写，entities.md §3.3） */
  readonly containerSlug: string;
  readonly mark: CheckpointMark;
  /** review-wave-N 专用波序数（缺省自动递增 max+1）；其余标记不得携带 */
  readonly waveSeq?: number;
  /** 标记时容器分支 HEAD（commit hash 全局唯一——分支无关） */
  readonly baseCommitHash: string;
  readonly snapshots: CheckpointSnapshots;
}

/** ensureCheckpoint 返回（appended=false = 幂等跳过，checkpoint 键缺席） */
export interface EnsureCheckpointResult {
  readonly appended: boolean;
  readonly checkpoint?: CheckpointRow;
}

export interface ListCheckpointsQuery {
  readonly projectKey: string;
  readonly slug: string;
  /** 标记过滤（缺省 = 全量） */
  readonly marks?: readonly CheckpointMark[];
}

/** 唯一约束命中（里程碑标记重复落行——拒写零副作用） */
export interface CheckpointExistsData {
  readonly projectKey: string;
  readonly slug: string;
  readonly mark: CheckpointMark;
  readonly waveSeq?: number;
}

export class CheckpointAlreadyExistsError extends Error {
  readonly code = "ERR_CHECKPOINT_ALREADY_EXISTS" as const;
  readonly data: CheckpointExistsData;

  constructor(data: CheckpointExistsData) {
    super(
      `检查点已存在：${data.mark}${data.waveSeq !== undefined ? `#${String(data.waveSeq)}` : ""}` +
        `（project ${data.projectKey}，slug ${data.slug}）——里程碑标记唯一约束命中`,
    );
    this.name = "CheckpointAlreadyExistsError";
    this.data = data;
  }
}

/** wave_seq 词汇越界（仅 review-wave-N 使用，且须 ≥1 整数） */
export class CheckpointWaveSeqInvalidError extends Error {
  readonly code = "ERR_CHECKPOINT_WAVE_SEQ_INVALID" as const;
  readonly data: { readonly mark: CheckpointMark };

  constructor(mark: CheckpointMark) {
    super(`wave_seq 仅 review-wave-N 使用：${mark} 不得携带波序数（关系/里程碑标记 wave_seq 恒 NULL）`);
    this.name = "CheckpointWaveSeqInvalidError";
    this.data = { mark };
  }
}

/** checkpoints 域装配依赖（tasks 域 TasksVerbDeps 同构最小集——单库共享连接 + 事件发射器）。 */
export interface CheckpointsServiceDeps {
  /** task-loop.db 连接（openDomainDb().db——WAL/FK 三参数由连接工厂保证） */
  readonly db: Database.Database;
  /** 写后事件发射器（装配单例——写动词闭包尾部 emitTasksChanged） */
  readonly events: TaskEvents;
}

/** task_checkpoints 行存储形状（snake_case → DTO 映射唯一落点） */
interface CheckpointStorageRow {
  id: string;
  project_key: string;
  slug: string;
  mark: CheckpointMark;
  wave_seq: number | null;
  created_at: string;
  base_commit_hash: string;
  tasks_total: number;
  commits_total: number;
  fixes_total: number;
  evidence_debts_total: number;
}

const CHECKPOINT_COLUMNS =
  "id, project_key, slug, mark, wave_seq, created_at, base_commit_hash, tasks_total, commits_total, fixes_total, evidence_debts_total";

/** 存储行 → DTO（wave_seq NULL = 键缺席——lossless JSON 合规） */
function toCheckpointRow(row: CheckpointStorageRow): CheckpointRow {
  return {
    id: row.id,
    projectKey: row.project_key,
    slug: row.slug,
    mark: row.mark,
    ...(row.wave_seq !== null ? { waveSeq: row.wave_seq } : {}),
    createdAt: row.created_at,
    baseCommitHash: row.base_commit_hash,
    tasksTotal: row.tasks_total,
    commitsTotal: row.commits_total,
    fixesTotal: row.fixes_total,
    evidenceDebtsTotal: row.evidence_debts_total,
  };
}

/** mark 词汇校验（DDL CHECK 兜底前的服务端预检——fail-loud 带可读因） */
function assertKnownMark(mark: CheckpointMark): void {
  if (!MARKS.has(mark)) {
    throw new Error(`未知检查点标记：${mark}（五类里程碑 + derived-to-child 词汇外拒写）`);
  }
}

/** wave_seq 校验：仅 review-wave-N 使用；携带时须 ≥1 整数 */
function assertWaveSeq(mark: CheckpointMark, waveSeq: number | undefined): void {
  if (mark !== "review-wave-N") {
    if (waveSeq !== undefined) throw new CheckpointWaveSeqInvalidError(mark);
    return;
  }
  if (waveSeq !== undefined && (!Number.isInteger(waveSeq) || waveSeq < 1)) {
    throw new Error(`review-wave-N 波序数须 ≥1 整数，实际 ${String(waveSeq)}`);
  }
}

/** wave_seq 自动递增解析（append/ensure 共用）：max+1 按 (project_key, slug, mark) 圈定。 */
function resolveWaveSeq(db: Database.Database, input: AppendCheckpointInput): number | undefined {
  assertKnownMark(input.mark);
  assertWaveSeq(input.mark, input.waveSeq);
  if (input.mark !== "review-wave-N") return undefined;
  if (input.waveSeq !== undefined) return input.waveSeq;
  const current = db
    .prepare<unknown[], { max_seq: number | null }>(
      `SELECT MAX(wave_seq) AS max_seq FROM task_checkpoints
       WHERE project_key = ? AND slug = ? AND mark = 'review-wave-N'`,
    )
    .get(input.projectKey, input.containerSlug);
  return (current?.max_seq ?? 0) + 1;
}

/** 唯一约束预检（里程碑标记：同 (project_key, slug, mark, wave_seq) 在场即拒——DDL partial
 *  unique index 行为面同源；关系标记豁免不预检）。事务外预检 + 事务内 insert，单写者无
 *  TOCTOU 窗口。 */
function assertUnique(
  db: Database.Database,
  input: AppendCheckpointInput,
  waveSeq: number | undefined,
): void {
  if (!MILESTONE_MARKS.has(input.mark)) return;
  const existing = db
    .prepare<unknown[], { id: string }>(
      `SELECT id FROM task_checkpoints
       WHERE project_key = ? AND slug = ? AND mark = ? AND wave_seq IS ?`,
    )
    .get(input.projectKey, input.containerSlug, input.mark, waveSeq ?? null);
  if (existing !== undefined) {
    throw new CheckpointAlreadyExistsError({
      projectKey: input.projectKey,
      slug: input.containerSlug,
      mark: input.mark,
      ...(waveSeq !== undefined ? { waveSeq } : {}),
    });
  }
}

/** Interface：task-loop checkpoints 域服务面（机械①标记落点 + 四指标现算取数面） */
export function createCheckpointsService(deps: CheckpointsServiceDeps) {
  const { db } = deps;
  return {
    /** 追加标记行（append-only 流水唯一写径；里程碑标记唯一约束拒重复） */
    async appendCheckpoint(input: AppendCheckpointInput): Promise<CheckpointRow> {
      const waveSeq = resolveWaveSeq(db, input);
      assertUnique(db, input, waveSeq);
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO task_checkpoints
             (id, project_key, slug, mark, wave_seq, created_at, base_commit_hash,
              tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.projectKey,
          input.containerSlug,
          input.mark,
          waveSeq ?? null,
          createdAt,
          input.baseCommitHash,
          input.snapshots.tasksTotal,
          input.snapshots.commitsTotal,
          input.snapshots.fixesTotal,
          input.snapshots.evidenceDebtsTotal,
        );
      })();
      const row = db
        .prepare<unknown[], CheckpointStorageRow>(`SELECT ${CHECKPOINT_COLUMNS} FROM task_checkpoints WHERE id = ?`)
        .get(id);
      if (row === undefined) throw new Error(`appendCheckpoint 回读缺席（不可达）：${id}`);
      deps.events.emitTasksChanged(input.projectKey);
      return toCheckpointRow(row);
    },

    /** lazy 补标记：标记已在场幂等 no-op（merged/stabilized 漏打兜底——趋势链不断点）。
     *  唯一预检按 (project_key, slug, mark) 圈定。 */
    async ensureCheckpoint(input: AppendCheckpointInput): Promise<EnsureCheckpointResult> {
      const waveSeq = resolveWaveSeq(db, input);
      if (MILESTONE_MARKS.has(input.mark)) {
        const existing = db
          .prepare<unknown[], { id: string }>(
            `SELECT id FROM task_checkpoints
             WHERE project_key = ? AND slug = ? AND mark = ? AND wave_seq IS ?`,
          )
          .get(input.projectKey, input.containerSlug, input.mark, waveSeq ?? null);
        if (existing !== undefined) return { appended: false };
      }
      const checkpoint = await this.appendCheckpoint(input);
      return { appended: true, checkpoint };
    },

    /** 按容器 slug 时序查询（created_at 升序，同刻 id 稳定）+ 标记过滤 */
    async listCheckpoints(q: ListCheckpointsQuery): Promise<CheckpointRow[]> {
      const rows = db
        .prepare<unknown[], CheckpointStorageRow>(
          `SELECT ${CHECKPOINT_COLUMNS} FROM task_checkpoints
           WHERE project_key = ? AND slug = ? ORDER BY created_at, id`,
        )
        .all(q.projectKey, q.slug);
      return rows
        .map(toCheckpointRow)
        .filter((r) => q.marks === undefined || q.marks.length === 0 || q.marks.includes(r.mark));
    },
  };
}

export type CheckpointsService = ReturnType<typeof createCheckpointsService>;
