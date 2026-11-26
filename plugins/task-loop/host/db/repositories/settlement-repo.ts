// settlement-repo——task_settlements DAO 单源（plugin-task-loop 1.8，模块②）。
// 职责（code-design §2）：appendSettlement 唯一写径（seq 同 task_id 链内 max+1、id 纯 UUID
// 写入点生成——排序单调性由 (created_at, seq) 承担，id 降尾位 tiebreaker）+ 读面排序钉死
// `ORDER BY created_at, seq, id`（禁 ORDER BY id——entities.md §3.2 机检 grep 门）。
// （forge-dirs-unification §2.9：结算隔离区（pending/ 暂存 + 重放）已删——暂存从未被注入、
// 重放无调用方，触发分支在产品路径上不可达；迁移脚本自身的隔离区表是另一回事，不在此列。）
import { randomUUID } from "node:crypto";
import type Database from "@dsh-forge/lib-db";
import type { TaskAcResult } from "../../domain/tasks/types.js";

/** 结算 evidence 载荷键面（submit gates/证据 debt 聚合位——entities.md §3.2 evidence_json）。 */
export interface SettlementGates {
  readonly compile?: boolean;
  readonly fmt?: boolean;
  readonly lint?: boolean;
  readonly test?: boolean;
  readonly coverage?: number;
  readonly evidenceDebt?: { readonly suite: string; readonly specs: readonly string[]; readonly note?: string };
}

/** 类型化卡片扩展键面（fields 键——键开放、值 JSON 可序列化）。 */
export type SettlementFields = Record<string, unknown>;

/** evidence_json 两形（同构证据容载）：success 四键 / blocked reason 必填 + 可选键。 */
export interface SettlementEvidenceSuccess {
  readonly summary: string;
  readonly gates?: SettlementGates;
  readonly files?: readonly string[];
  readonly fields?: SettlementFields;
}

export interface SettlementEvidenceBlocked {
  readonly reason: string;
  readonly gates?: SettlementGates;
  readonly files?: readonly string[];
  readonly fields?: SettlementFields;
}

export type SettlementEvidence = SettlementEvidenceSuccess | SettlementEvidenceBlocked;

/** appendSettlement 唯一写径入参（id 恒写入点生成、seq 缺省链内 max+1）。 */
export interface SettlementInsert {
  readonly taskId: string;
  readonly result: "success" | "blocked";
  readonly acResults?: readonly TaskAcResult[];
  readonly commitHash?: string;
  readonly evidence: SettlementEvidence;
  readonly fixRootId?: string | null;
  /** 原结算时戳回写（缺省 = 当前时刻）。 */
  readonly createdAt?: string;
}

/** task_settlements 行水化形状（v1 9 列 snake_case）。 */
export interface SettlementRow {
  readonly id: string;
  readonly task_id: string;
  readonly seq: number;
  readonly fix_root_id: string | null;
  readonly result: "success" | "blocked";
  readonly ac_results_json: string;
  readonly commit_hash: string | null;
  readonly evidence_json: string | null;
  readonly created_at: string;
}

/** evidence 两形校验（typed 判据——处方②禁 message 字符串判据，抛码制错误）。 */
export class SettlementEvidenceInvalidError extends Error {
  readonly code = "ERR_SETTLEMENT_EVIDENCE_INVALID" as const;
  constructor(readonly detail: string) {
    super(`结算 evidence_json 两形违例：${detail}`);
    this.name = "SettlementEvidenceInvalidError";
  }
}

/** fix 链 root 解析失败（域不变量违例 fail-loud 拒写——entities.md §3.2② 规则 4）。 */
export class FixRootResolutionError extends Error {
  readonly code = "ERR_FIX_ROOT_UNRESOLVED" as const;
  constructor(readonly data: { readonly taskId: string; readonly reason: string }) {
    super(`fix 链 root 解析失败（${data.reason}）：task ${data.taskId}`);
    this.name = "FixRootResolutionError";
  }
}

function assertEvidenceShape(result: "success" | "blocked", evidence: SettlementEvidence): void {
  if (result === "blocked") {
    if (!("reason" in evidence) || (evidence as SettlementEvidenceBlocked).reason.trim() === "") {
      throw new SettlementEvidenceInvalidError("blocked 行 reason 必填非空");
    }
    return;
  }
  if (!("summary" in evidence) || (evidence as SettlementEvidenceSuccess).summary.trim() === "") {
    throw new SettlementEvidenceInvalidError("success 行 summary 必填非空");
  }
}

const SETTLEMENT_COLUMNS = `id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at`;

/** ac_results_json 解码（畸形负载 → 空数组降级不炸读面——read 面单点）。 */
export function parseAcResults(raw: string): TaskAcResult[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TaskAcResult[]) : [];
  } catch {
    return [];
  }
}

/** 批量最新结算行投影（服务面透传形——taskId 键 + AC 判据解码载荷；typert DTO 聚合消费）。 */
export interface LatestSettlementRow {
  readonly taskId: string;
  readonly result: "success" | "blocked";
  readonly acResults: readonly TaskAcResult[];
  readonly commitHash: string | null;
}

/** 排序锚钉死（entities.md §3.2 pin）：created_at, seq, id——禁 ORDER BY id（UUID 无序）。 */
const ORDER_ANCHOR = ` ORDER BY created_at, seq, id`;

export interface SettlementRepo {
  /** 唯一写径（调用方事务内调用——与任务终态迁移同 db.transaction）。 */
  appendSettlement(input: SettlementInsert): SettlementRow;
  /** task_id 等值读（uq_task_settle_seq 前缀——排序锚 created_at, seq, id）。 */
  listByTask(taskId: string): SettlementRow[];
  /** 容器聚合读（JOIN tasks 取 project_key+slug 任务集——归属经 FK 传导）。 */
  listByContainer(projectKey: string, slug: string): SettlementRow[];
  /** 根任务触发派生的链首结算（result='blocked' 最新一行——fix_root_id 解析取径）。 */
  latestBlockedByTask(taskId: string): SettlementRow | undefined;
  /** (task_id, seq) 定位。 */
  findByTaskAndSeq(taskId: string, seq: number): SettlementRow | undefined;
  /**
   * 批量最新结算行读（typert forgeTasks DTO 聚合 AC 进度的数据源）：project_key + slug IN
   * 任务集每 task 取最新一行（关联子查询按排序锚逆序 LIMIT 1）——一条 SQL 零 N+1。
   */
  latestSettlementsByTask(projectKey: string, slugs: readonly string[]): SettlementRow[];
}

export function createSettlementRepo(db: Database.Database): SettlementRepo {
  const nextSeq = (taskId: string): number => {
    const row = db
      .prepare<unknown[], { n: number }>(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM task_settlements WHERE task_id = ?`)
      .get(taskId);
    return row?.n ?? 1;
  };

  return {
    appendSettlement(input) {
      assertEvidenceShape(input.result, input.evidence);
      const seq = nextSeq(input.taskId);
      const createdAt = input.createdAt ?? new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO task_settlements (id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.taskId,
        seq,
        input.fixRootId ?? null,
        input.result,
        JSON.stringify(input.acResults ?? []),
        input.commitHash ?? null,
        JSON.stringify(input.evidence),
        createdAt,
      );
      const row = db
        .prepare<unknown[], SettlementRow>(`SELECT ${SETTLEMENT_COLUMNS} FROM task_settlements WHERE id = ?`)
        .get(id);
      if (row === undefined) throw new Error(`appendSettlement 回读缺席（不可达）：${id}`);
      return row;
    },

    listByTask(taskId) {
      return db
        .prepare<unknown[], SettlementRow>(
          `SELECT ${SETTLEMENT_COLUMNS} FROM task_settlements WHERE task_id = ?${ORDER_ANCHOR}`,
        )
        .all(taskId);
    },

    listByContainer(projectKey, slug) {
      return db
        .prepare<unknown[], SettlementRow>(
          `SELECT s.id, s.task_id, s.seq, s.fix_root_id, s.result, s.ac_results_json, s.commit_hash, s.evidence_json, s.created_at
           FROM task_settlements s
           JOIN task_tasks t ON t.id = s.task_id
           WHERE t.project_key = ? AND t.slug = ?
           ORDER BY s.created_at, s.seq, s.id`,
        )
        .all(projectKey, slug);
    },

    latestBlockedByTask(taskId) {
      return db
        .prepare<unknown[], SettlementRow>(
          `SELECT ${SETTLEMENT_COLUMNS} FROM task_settlements
           WHERE task_id = ? AND result = 'blocked' ORDER BY created_at DESC, seq DESC LIMIT 1`,
        )
        .get(taskId);
    },

    findByTaskAndSeq(taskId, seq) {
      return db
        .prepare<unknown[], SettlementRow>(
          `SELECT ${SETTLEMENT_COLUMNS} FROM task_settlements WHERE task_id = ? AND seq = ?`,
        )
        .get(taskId, seq);
    },

    latestSettlementsByTask(projectKey, slugs) {
      if (slugs.length === 0) return [];
      const placeholders = slugs.map(() => "?").join(", ");
      // 每 task 最新一行 = 关联子查询按排序锚逆序取首（created_at DESC, seq DESC, id DESC
      // ——ORDER_ANCHOR 逆序同语义；禁 ORDER BY id 单锚，entities.md §3.2 pin）。
      return db
        .prepare<unknown[], SettlementRow>(
          `SELECT s.id, s.task_id, s.seq, s.fix_root_id, s.result, s.ac_results_json, s.commit_hash, s.evidence_json, s.created_at
           FROM task_settlements s
           JOIN task_tasks t ON t.id = s.task_id
           WHERE t.project_key = ? AND t.slug IN (${placeholders})
             AND s.id = (
               SELECT s2.id FROM task_settlements s2 WHERE s2.task_id = s.task_id
               ORDER BY s2.created_at DESC, s2.seq DESC, s2.id DESC LIMIT 1
             )`,
        )
        .all(projectKey, ...slugs);
    },
  };
}
