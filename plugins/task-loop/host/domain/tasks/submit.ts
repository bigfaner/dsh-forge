// submitTask——任务域结算动词（core forge/tasks/submit.ts 直迁——plugin-task-loop 1.7 内联 +
// v1 列面适配）。actor 由通道推断：submitTask = tool 专属动词，submit 记录 actor 恒 'plugin-tool'。
//
// 模块②终态（1.8——entities.md §3.2）：结算写点 = 单事务两写——task_tasks 终态迁移 +
// task_settlements append 同一 db.transaction（拆条即 RED）；records 行 = 纯轨迹
// （verb/from_status/to_status——note 对 submit 载荷封闭），submit 全语义载荷归
// settlements.evidence_json 两形（success = {summary, gates, files, fields}；
// blocked = {reason 必填, gates?, files?, fields?}）；ac_results_json 单列同位快照
// （[{criterion, met, evidence?}] 逐字判据）；fix 链结算行 fix_root_id 事务内
// resolveFixRoot 解析（isFixTask 单源谓词 settle 消费点）。
// 派生失败拒写（projectKey 空）→ 隔离区暂存（deps.stagePendingSettlement 在场时），
// 不丢结算证据。
//
// 单事务全成全败（Hard Rule）：行解析 → 输入面校验（blocked reason 必带 / success summary
// 必带 / T2 归类必带）→ 双门（gate 摘要门 → AC 证据门——均仅挂 success 结算）→ agent 面
// 矩阵先验（in_progress→completed|blocked + blocked→completed 直达）→ 转移 UPDATE →
// settlement append（同事务）→ submit 轨迹行 → 恢复钩子（completed 挂）；闭包尾部
// （提交后）T2 应答增补 + emitTasksChanged。
import { taskFilesUnion } from "./files.js";
import { FACETS_HINT_CONTEXT_KEY, FACETS_KEY } from "../../../shared/contract-constants.js";
import { withTransaction } from "@dsh-forge/lib-db";
import { ProjectKeyDerivationError } from "../../db/repositories/project-key.js";
import {
  createSettlementRepo,
  FixRootResolutionError,
  type PendingSettlementPayload,
  type SettlementEvidence,
  type SettlementEvidenceBlocked,
  type SettlementEvidenceSuccess,
  type SettlementFields,
  type SettlementGates,
  type SettlementRepo,
} from "../../db/repositories/settlement-repo.js";
import {
  AcNotMetError,
  BlockClassificationRequiredError,
  FilesUnionMismatchError,
  FixTaskAcRequiredError,
  GateSummaryRequiredError,
  ReasonRequiredError,
  RuntimeEvidenceConflictError,
  RuntimeEvidenceRequiredError,
  SummaryRequiredError,
  TestEvidenceRequiredError,
  emitDiagOrFallback,
} from "./errors.js";
import { resolveTaskRef, isFixTask, type TaskStorageRow } from "./query.js";
import { SATISFYING_TASK_STATUSES, assertTransitionAllowed } from "./state-machine.js";
import { runRestoreHook } from "./transition.js";
import type {
  BugRecurrenceCandidate,
  TaskAcResult,
  TaskGateReport,
  TaskRecurrenceAdvisory,
  TaskRef,
  TasksVerbDeps,
} from "./types.js";

/** 归类 kind 合法集（T2 presence 校验——kind 非法同形拒绝；程序零语义判断） */
const BLOCK_CLASSIFICATION_KINDS = new Set(["new-problem", "same-family-recurrence"]);

/** 任务定义 facets 提示解析（context_json 的提示键逗号分隔形——提示缺席/畸形 = undefined 零对照）。 */
function facetsHintOf(row: { readonly context_json: string | null }): readonly string[] | undefined {
  if (row.context_json === null) return undefined;
  try {
    const ctx = JSON.parse(row.context_json) as unknown;
    if (typeof ctx === "object" && ctx !== null && !Array.isArray(ctx)) {
      const raw = (ctx as Record<string, unknown>)[FACETS_HINT_CONTEXT_KEY];
      if (typeof raw === "string" && raw.trim() !== "") {
        const parts = raw.split(",").map((f) => f.trim()).filter((f) => f !== "");
        if (parts.length > 0) return parts;
      }
    }
  } catch {
    // 畸形 context_json 跳过对照（不炸结算面）
  }
  return undefined;
}

/** facets 集合等值（trim+小写归一化后无序集相等）。 */
function facetsSetEqual(a: readonly string[], b: readonly string[]): boolean {
  const norm = (xs: readonly string[]): Set<string> =>
    new Set(xs.map((x) => x.trim().toLowerCase()).filter((x) => x !== ""));
  const sa = norm(a);
  const sb = norm(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/** T2 advisory 候选列表限幅（渐进式披露：候选 >5 条时 top-5 + 计数） */
const ADVISORY_LIST_LIMIT = 5;

function candidateLineOf(c: BugRecurrenceCandidate): string {
  return (
    `- ${c.bugId} [${c.status ?? "unknown"}] ${c.summary}` +
    ` | errorType=${c.errorType ?? "未归类"}` +
    ` | container=${c.containerSlug ?? "—"}` +
    ` | suspected=${c.suspectedLocation ?? "—"}` +
    ` | lastSeen=${c.lastSeenAt ?? "—"}` +
    ` | recurrenceOf=${c.recurrenceOf ?? "链根"}`
  );
}

function suspectedFamilyMessageOf(candidates: readonly BugRecurrenceCandidate[]): string {
  const ordered = [...candidates].sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
  const top = ordered.slice(0, ADVISORY_LIST_LIMIT);
  const rest = ordered.slice(ADVISORY_LIST_LIMIT);
  const counts = new Map<string, number>();
  for (const c of rest) {
    const key = c.errorType ?? "未归类";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const overflow =
    rest.length > 0
      ? `\n（其余 ${rest.length} 条按 errorType 计数：${[...counts.entries()].map(([type, n]) => `${type}×${n}`).join("、")}——经 getBug 深挖）`
      : "";
  return (
    `疑似同族：台账按本缝归属命中 ${candidates.length} 条 recurrence 候选（全史含 fixed；` +
    `甄别判据 = suspected 位置，自行甄别后经 getBug 深挖）：\n` +
    top.map(candidateLineOf).join("\n") +
    overflow +
    `——归类自报「新问题」，请主会话复核家族归属`
  );
}

/** T2 归类闸门应答增补推导（事务提交后——只读 face 消费点，fail-soft 降级不阻载） */
async function deriveRecurrenceAdvisories(deps: TasksVerbDeps, input: SubmitTaskInput): Promise<TaskRecurrenceAdvisory[]> {
  const classification = input.blockClassification;
  if (input.result !== "blocked" || classification === undefined) return [];
  const advisories: TaskRecurrenceAdvisory[] = [];
  if (classification.kind === "same-family-recurrence") {
    advisories.push({
      kind: "upgrade-hint",
      message:
        `归类=同族复发${classification.recurrenceOf !== undefined ? `（前驱 ${classification.recurrenceOf}）` : ""}` +
        `——不建议盲试 fix：建议先升级排查（家族共因判据实验清单）再开修；同缝 ≥2 时派发守卫将软拒绝`,
    });
  }
  const findCandidates = deps.findRecurrenceCandidates;
  if (classification.kind === "new-problem") {
    if (findCandidates === undefined) {
      emitDiagOrFallback(deps.onDiag, {
        level: "info",
        event: "recurrence-face-absent",
        message:
          `submitTask 归类交叉校验降级：findRecurrenceCandidates face 缺席` +
          `（${input.taskRef.slug}/${input.taskRef.localId}）——疑似同族警示机制惰性关停（核销装配面接线）`,
      });
    } else {
      try {
        const candidates = await findCandidates(input.projectKey, {
          slug: input.taskRef.slug,
          localId: input.taskRef.localId,
          files: input.files ?? [],
        });
        if (candidates.length > 0) {
          advisories.push({
            kind: "suspected-family",
            message: suspectedFamilyMessageOf(candidates),
            candidates,
          });
        }
      } catch (cause) {
        emitDiagOrFallback(deps.onDiag, {
          level: "warn",
          event: "recurrence-face-error",
          message:
            `submitTask 归类交叉校验降级：台账候选检索故障（${input.taskRef.slug}/` +
            `${input.taskRef.localId}）——${cause instanceof Error ? cause.message : String(cause)}`,
        });
      }
    }
  }
  return advisories;
}

export type { TasksVerbDeps };

/** 机械⑤强制域判定：判据 = 交付物含运行期装配面；豁免面 = SDK/库边界与纯逻辑/纯文档。 */
const RUNTIME_EXEMPT_FACES = new Set(["library", "sdk", "pure-logic", "docs"]);

export function requiresRuntimeAssemblyEvidence(faces: readonly string[]): boolean {
  return faces.some((face) => !RUNTIME_EXEMPT_FACES.has(face.trim().toLowerCase()));
}

/**
 * evidence_json 两形聚合（entities.md §3.2 evidence_json 终态）：
 * success = {summary, gates?, files?, fields?}；blocked = {reason 必填, gates?, files?, fields?}。
 * 改接注口径：actualFiles 级联 → files 键 / gates ∪ evidenceDebt → gates 键 /
 * 类型化卡片扩展（分组 files/扩展字段/取证声明/T2 归类）→ fields 键。
 */
function buildEvidence(input: SubmitTaskInput): SettlementEvidence {
  const gates: SettlementGates | undefined =
    input.gate === undefined && input.evidenceDebt === undefined
      ? undefined
      : {
          ...input.gate,
          ...(input.evidenceDebt !== undefined ? { evidenceDebt: input.evidenceDebt } : {}),
        };
  const files: readonly string[] | undefined =
    input.files ??
    (input.filesCreated !== undefined || input.filesModified !== undefined
      ? taskFilesUnion({ created: input.filesCreated ?? [], modified: input.filesModified ?? [] })
      : undefined);
  const fields: SettlementFields = {
    ...(input.filesCreated !== undefined ? { filesCreated: input.filesCreated } : {}),
    ...(input.filesModified !== undefined ? { filesModified: input.filesModified } : {}),
    ...(input.keyDecisions !== undefined ? { keyDecisions: input.keyDecisions } : {}),
    ...(input.testsPassed !== undefined ? { testsPassed: input.testsPassed } : {}),
    ...(input.testsFailed !== undefined ? { testsFailed: input.testsFailed } : {}),
    ...(input.coverage !== undefined ? { coverage: input.coverage } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.facets !== undefined ? { [FACETS_KEY]: input.facets } : {}),
    ...(input.runtimeEvidence !== undefined ? { runtimeEvidence: input.runtimeEvidence } : {}),
    ...(input.blockClassification !== undefined ? { blockClassification: input.blockClassification } : {}),
  };
  const hasFields = Object.keys(fields).length > 0;
  if (input.result === "blocked") {
    const evidence: SettlementEvidenceBlocked = {
      reason: input.reason as string,
      ...(gates !== undefined ? { gates } : {}),
      ...(files !== undefined ? { files } : {}),
      ...(hasFields ? { fields } : {}),
    };
    return evidence;
  }
  const evidence: SettlementEvidenceSuccess = {
    summary: input.summary as string,
    ...(gates !== undefined ? { gates } : {}),
    ...(files !== undefined ? { files } : {}),
    ...(hasFields ? { fields } : {}),
  };
  return evidence;
}

/**
 * resolveFixRoot——fix 链身份解析（appendSettlement 同事务内单次解析，entities.md §3.2②）：
 * 非 fix 任务 → NULL；fix 任务沿 fix_of_task_id 逐跳上溯至根任务，取触发派生的
 * 最新 blocked 结算行 id（ORDER BY created_at DESC, seq DESC）；根任务无 blocked 结算行
 * = 域不变量违例 fail-loud 拒写（环由 addTask 写点预检保证，防御性检测兜底）。
 */
export function resolveFixRoot(
  db: import("@dsh-forge/lib-db").Database,
  repo: SettlementRepo,
  task: Pick<TaskStorageRow, "id" | "fix_of_task_id">,
): string | null {
  if (!isFixTask(task)) return null;
  const byId = db.prepare<unknown[], Pick<TaskStorageRow, "id" | "fix_of_task_id">>(
    `SELECT id, fix_of_task_id FROM task_tasks WHERE id = ?`,
  );
  let cur = task;
  const visited = new Set<string>([task.id]);
  while (cur.fix_of_task_id !== null) {
    const nextId = cur.fix_of_task_id;
    if (visited.has(nextId)) {
      throw new FixRootResolutionError({ taskId: task.id, reason: "fix_of 链成环（数据漂移）" });
    }
    visited.add(nextId);
    const next = byId.get(nextId);
    if (next === undefined) {
      throw new FixRootResolutionError({ taskId: task.id, reason: `前驱行缺席（${nextId}）` });
    }
    cur = next;
  }
  const head = repo.latestBlockedByTask(cur.id);
  if (head === undefined) {
    throw new FixRootResolutionError({ taskId: task.id, reason: "根任务无 blocked 结算行" });
  }
  return head.id;
}

export interface SubmitTaskInput {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly result: "success" | "blocked";
  /** blocked 阻塞理由（必带——fix 链承接） */
  readonly reason?: string;
  /** success 执行摘要（必带） */
  readonly summary?: string;
  /** T2 根因归类（blocked 必带） */
  readonly blockClassification?: {
    readonly kind: "new-problem" | "same-family-recurrence";
    readonly recurrenceOf?: string;
  };
  /** AC 核销快照（success；criterion 与定义侧逐字镜像 + met 全 true） */
  readonly acceptanceCriteria?: readonly TaskAcResult[];
  /** 数字摘要门（gate 类型任务 success 必带） */
  readonly gate?: TaskGateReport;
  readonly files?: readonly string[];
  readonly filesCreated?: readonly string[];
  readonly filesModified?: readonly string[];
  readonly commitHash?: string;
  readonly keyDecisions?: readonly string[];
  readonly testsPassed?: number;
  readonly testsFailed?: number;
  readonly coverage?: number;
  readonly notes?: string;
  readonly evidenceDebt?: { readonly suite: string; readonly specs: readonly string[]; readonly note?: string };
  /** 运行期装配面声明（工具入参 facets——两跳更名终态 runtime_surface→runtime_face→facets） */
  readonly facets?: readonly string[];
  readonly runtimeEvidence?: {
    readonly face: string;
    readonly artifacts: readonly string[];
    readonly note?: string;
  };
  /** 发起会话（审计归因——可缺省落 NULL） */
  readonly sessionId?: string;
}

export interface SubmitTaskResult {
  readonly taskId: string;
  readonly status: "completed" | "blocked";
  readonly restored: readonly TaskRef[];
  readonly recurrenceAdvisories?: readonly TaskRecurrenceAdvisory[];
}

/**
 * Interface 1 submitTask：executor 结算（转移 + submit 记录轨迹行 + 恢复钩子）。
 * result=success → in_progress→completed | blocked→completed（verdict restore 直达）；
 * result=blocked → in_progress→blocked（reason 必带——fix 链承接）。
 */
export async function submitTask(deps: TasksVerbDeps, input: SubmitTaskInput): Promise<SubmitTaskResult> {
  const db = deps.db;
  const now = new Date().toISOString();

  // ⓪ 归属键派生失败拒写（cwd 推导不出 project_key）——结算载荷降级隔离区暂存
  //   （stagePendingSettlement face 在场时；缺席 = 纯拒写 fail-loud），不丢结算证据。
  if (input.projectKey.trim() === "") {
    const payload: PendingSettlementPayload = {
      ...(input.taskRef.slug !== undefined ? { taskRef: input.taskRef } : {}),
      result: input.result,
      acResults: input.acceptanceCriteria ?? [],
      ...(input.commitHash !== undefined ? { commitHash: input.commitHash } : {}),
      evidence: buildEvidence(input),
      createdAt: now,
    };
    if (deps.stagePendingSettlement !== undefined) {
      deps.stagePendingSettlement(payload);
      emitDiagOrFallback(deps.onDiag, {
        level: "warn",
        event: "settlement-quarantined",
        message: `submitTask 归属键派生失败——结算载荷隔离区暂存待重放（${input.taskRef.slug}/${input.taskRef.localId}）`,
      });
    }
    throw new ProjectKeyDerivationError();
  }

  const repo = createSettlementRepo(db);
  const result = withTransaction(db, (): SubmitTaskResult => {
    // ① 行解析（agent 面 TaskRef 三键查捞）
    const row = resolveTaskRef(db, input.projectKey, input.taskRef);

    // ② 输入面校验（先于转移校验）
    if (input.result === "blocked" && (input.reason ?? "").trim() === "") {
      throw new ReasonRequiredError({ verb: "submitTask" });
    }
    if (input.result === "blocked") {
      const kind = input.blockClassification?.kind;
      if (kind === undefined || !BLOCK_CLASSIFICATION_KINDS.has(kind)) {
        throw new BlockClassificationRequiredError({ verb: "submitTask" });
      }
    }
    if (input.result === "success" && (input.summary ?? "").trim() === "") {
      throw new SummaryRequiredError({ verb: "submitTask" });
    }

    // ②b gate 摘要门（仅挂 success 结算）：type='gate' ∧ gate 载荷缺席 → 拒
    if (input.result === "success" && row.task_type === "gate" && input.gate === undefined) {
      throw new GateSummaryRequiredError({ verb: "submitTask" });
    }

    // ②c AC 证据门（仅挂 success 结算——blocked submit 不经）
    if (input.result === "success") {
      const acceptanceCriteria = row.ac_json !== null ? (JSON.parse(row.ac_json) as string[]) : [];

      // ②c' rescue fix 核销门（bug faf0ca57②——结算证据真实性门）：fix 任务 success 零核销
      //   （ac_results 缺席/空数组）= 未核销拒写——rescue 轮必须逐条核验（或 blocked 收口）。
      if (isFixTask(row) && (input.acceptanceCriteria?.length ?? 0) === 0) {
        throw new FixTaskAcRequiredError({ verb: "submitTask" });
      }

      // ②d AC 交叉 warn 门（双 warn 机械门①——结算判据 ≠ 任务定义判据仅 warn 不拒写：
      //   投影层按归一化匹配显形漂移，机械门降为诊断留痕；fix 任务跳过同前）。
      if (input.acceptanceCriteria !== undefined && row.ac_json !== null && !isFixTask(row)) {
        const actual = input.acceptanceCriteria.map((ac) => ac.criterion);
        const mismatched =
          actual.length !== acceptanceCriteria.length ||
          actual.some((criterion, i) => criterion !== acceptanceCriteria[i]);
        if (mismatched) {
          emitDiagOrFallback(deps.onDiag, {
            level: "warn",
            event: "ac-criteria-drift",
            message:
              `submitTask 结算判据 ≠ 任务定义判据（逐字交叉失配——投影按归一化匹配显形漂移）：` +
              `${input.taskRef.slug}/${input.taskRef.localId} ` +
              `expected=${JSON.stringify(acceptanceCriteria)} actual=${JSON.stringify(actual)}`,
          });
        }
      }

      // ②e AC 逐项闭环门：success ∧ 任一 met=false → 拒
      if (input.acceptanceCriteria !== undefined) {
        const unmet = input.acceptanceCriteria
          .filter((ac) => ac.met !== true)
          .map((ac) => (ac.evidence !== undefined ? { criterion: ac.criterion, evidence: ac.evidence } : { criterion: ac.criterion }));
        if (unmet.length > 0) {
          throw new AcNotMetError({ unmet });
        }
      }

      // AC 证据门：ac_json 非空 ∧ gate.test !== true → 拒；空清单 = 无 AC 任务直通
      if (acceptanceCriteria.length > 0 && input.gate?.test !== true) {
        throw new TestEvidenceRequiredError({ acceptanceCriteria });
      }

      // ②g 强制域取证声明门：声明命中运行期装配面 ∧ 取证/债务均缺席 → 拒
      if (input.runtimeEvidence !== undefined && input.evidenceDebt !== undefined) {
        throw new RuntimeEvidenceConflictError({ verb: "submitTask" });
      }
      if (
        input.facets !== undefined &&
        input.facets.length > 0 &&
        requiresRuntimeAssemblyEvidence(input.facets) &&
        input.runtimeEvidence === undefined &&
        input.evidenceDebt === undefined
      ) {
        throw new RuntimeEvidenceRequiredError({ faces: input.facets });
      }

      // ②h facets 提示对照 warn 门（双 warn 机械门②——结算 facets ≠ 任务定义 facets
      //   提示仅 warn 不拒写；提示缺席/结算未声明 = 零对照跳过，纯提示不设硬门）。
      if (input.facets !== undefined) {
        const hint = facetsHintOf(row);
        if (hint !== undefined && !facetsSetEqual(input.facets, hint)) {
          emitDiagOrFallback(deps.onDiag, {
            level: "warn",
            event: "facets-hint-drift",
            message:
              `submitTask 结算 facets ≠ 任务定义 facets 提示（对照仅提示）：` +
              `${input.taskRef.slug}/${input.taskRef.localId} ` +
              `expected=${JSON.stringify(hint)} actual=${JSON.stringify(input.facets)}`,
          });
        }
      }
    }

    // ②f files 一致性校验：顶层 files 与分组并存时 files 必须等于并集（有序集相等）
    if (input.filesCreated !== undefined || input.filesModified !== undefined) {
      const created = input.filesCreated ?? [];
      const modified = input.filesModified ?? [];
      if (input.files !== undefined) {
        const union = taskFilesUnion({ created, modified });
        const same = union.length === input.files.length && union.every((f, i) => f === input.files?.[i]);
        if (!same) {
          throw new FilesUnionMismatchError({ files: input.files, created, modified });
        }
      }
    }

    // ③ agent 面矩阵先验（in_progress → completed|blocked；blocked→completed 直达）
    const toStatus = input.result === "success" ? "completed" : "blocked";
    assertTransitionAllowed(row.task_status, toStatus, "agent");

    // ⑤ 单事务两写：任务终态迁移 + settlement append（同 db.transaction——拆条即 RED）；
    //    fix 链身份事务内 resolveFixRoot 解析；records 行 = 纯轨迹（submit 载荷列封闭，
    //    全语义载荷归 evidence_json 两形）。
    const fixRootId = resolveFixRoot(db, repo, row);
    db.prepare(`UPDATE task_tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(toStatus, now, row.id);
    repo.appendSettlement({
      taskId: row.id,
      result: input.result,
      acResults: input.acceptanceCriteria ?? [],
      ...(input.commitHash !== undefined ? { commitHash: input.commitHash } : {}),
      evidence: buildEvidence(input),
      fixRootId,
      createdAt: now,
    });
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, actor, session_id, created_at, updated_at)
       VALUES (?, 'submit', ?, ?, NULL, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, row.task_status, toStatus, input.sessionId ?? null, now, now);

    // ⑥ 恢复钩子（completed 挂——反查后继 blocked 且前置全满足 → auto-restore，边不删；
    //    blocked submit 不挂）
    const restored =
      (SATISFYING_TASK_STATUSES as readonly string[]).includes(toStatus)
        ? runRestoreHook(db, { satisfiedTaskId: row.id, now })
        : [];

    return { taskId: row.id, status: toStatus, restored };
  });

  // 事务提交后：T2 归类闸门应答增补（fail-soft 不阻载）+ emitTasksChanged
  const advisories = await deriveRecurrenceAdvisories(deps, input);
  deps.events.emitTasksChanged(input.projectKey);
  return advisories.length > 0 ? { ...result, recurrenceAdvisories: advisories } : result;
}
