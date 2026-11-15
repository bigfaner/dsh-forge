// submitTask——任务域结算动词（core forge/tasks/submit.ts 直迁——plugin-task-loop 1.7 内联 +
// v1 列面适配）。actor 由通道推断：submitTask = tool 专属动词，submit 记录 actor 恒 'plugin-tool'。
//
// v1 列面适配（records 列面对 submit 载荷封闭——entities §3.4）：submit 动词行 = 轨迹
// （verb/from_status/to_status/actor/session_id），结构化结算证据（ac_results/gate/files/
// evidence）归 task_settlements.appendSettlement 单事务两写——该写点归模块②（1.8）落位，
// 本迁移批双门校验面保持、records 写点按 v1 封闭口径落轨迹行；reason/summary 载荷以
// note 列暂承（transition/pause/unblock 同列语义——模块②落位后随 evidence_json 收口）。
//
// 单事务全成全败（Hard Rule）：行解析 → 输入面校验（blocked reason 必带 / success summary
// 必带 / T2 归类必带）→ 双门（gate 摘要门 → AC 证据门——均仅挂 success 结算）→ agent 面
// 矩阵先验（in_progress→completed|blocked + blocked→completed 直达）→ 转移 UPDATE →
// submit 记录 → 恢复钩子（completed 挂）；闭包尾部（提交后）T2 应答增补 + emitTasksChanged。
import { taskFilesUnion } from "./files.js";
import { withTransaction } from "@dsh-forge/lib-db";
import {
  AcCriteriaMismatchError,
  AcNotMetError,
  BlockClassificationRequiredError,
  FilesUnionMismatchError,
  GateSummaryRequiredError,
  ReasonRequiredError,
  RuntimeEvidenceConflictError,
  RuntimeEvidenceRequiredError,
  SummaryRequiredError,
  TestEvidenceRequiredError,
  emitDiagOrFallback,
} from "./errors.js";
import { resolveTaskRef } from "./query.js";
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
  readonly runtimeSurface?: readonly string[];
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

      // ②d AC 交叉校验：提交面 criterion 与定义侧逐项对应（条数与顺序一致、判据原文相同）
      if (input.acceptanceCriteria !== undefined) {
        const actual = input.acceptanceCriteria.map((ac) => ac.criterion);
        const mismatched =
          actual.length !== acceptanceCriteria.length ||
          actual.some((criterion, i) => criterion !== acceptanceCriteria[i]);
        if (mismatched) {
          throw new AcCriteriaMismatchError({ expected: acceptanceCriteria, actual });
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
        input.runtimeSurface !== undefined &&
        input.runtimeSurface.length > 0 &&
        requiresRuntimeAssemblyEvidence(input.runtimeSurface) &&
        input.runtimeEvidence === undefined &&
        input.evidenceDebt === undefined
      ) {
        throw new RuntimeEvidenceRequiredError({ faces: input.runtimeSurface });
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

    // ⑤ 转移 + submit 记录轨迹行（v1 封闭口径——结构化证据落点归 task_settlements，模块②）；
    //    note 暂承 reason|summary（transition/pause/unblock 同列语义）
    db.prepare(`UPDATE task_tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(toStatus, now, row.id);
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, actor, session_id, created_at, updated_at)
       VALUES (?, 'submit', ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(
      row.id,
      row.task_status,
      toStatus,
      input.result === "blocked" ? (input.reason as string) : (input.summary as string),
      input.sessionId ?? null,
      now,
      now,
    );

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
