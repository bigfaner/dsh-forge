// tasks 域 typed error 池（core forge/tasks/errors.ts 直迁——plugin-task-loop 1.7 内联）。
// 容器语义 slug 化退役面：TasksFeatureNotFoundError / TasksProposalNotFoundError 随
// source_kind 对应表在场校验一并退役（slug = 通用执行容器弱引用，无容器主表可命中校验）；
// TaskNotFoundData 作用域字段 featureSlug → containerSlug。code 字面量沿用 contracts
// ERROR_CODES 词汇（跨 IPC 以 code 判别；类名/name 手写字面量）。
import type {
  AcNotMetData,
  TaskRef,
  TaskStatus,
  TestEvidenceRequiredData,
} from "@dsh-forge/contracts";
import type { DiagEventPayload } from "./types.js";

/** 校验面（Interface 10）：human = 八态 − 当前态；agent = claim/submit 转移矩阵 */
export type TransitionFace = "human" | "agent";

/** ERR_INVALID_TRANSITION 附载 */
export interface InvalidTransitionData {
  readonly current: TaskStatus;
  readonly to: TaskStatus;
  readonly face: TransitionFace;
  readonly allowed: readonly TaskStatus[];
}

export class InvalidTransitionError extends Error {
  readonly code = "ERR_INVALID_TRANSITION" as const;
  readonly data: InvalidTransitionData;

  constructor(data: InvalidTransitionData) {
    super(
      `非法任务转移：${data.current} → ${data.to}（${data.face} 面）——合法目标 [${data.allowed.join(", ")}]`,
    );
    this.name = "InvalidTransitionError";
    this.data = data;
  }
}

export function isInvalidTransitionError(e: unknown): e is InvalidTransitionError {
  return e instanceof InvalidTransitionError;
}

/** ERR_TASK_NOT_FOUND 附载（uq_task_tasks_project_slug_local 查捞未命中） */
export interface TaskNotFoundData {
  readonly projectKey: string;
  readonly taskRef?: TaskRef;
  readonly taskId?: string;
  /** 同容器前置/谱系解析的作用域（命中他容器同键任务亦按未命中拒——同容器边服务不变量） */
  readonly containerSlug?: string;
}

export class TaskNotFoundError extends Error {
  readonly code = "ERR_TASK_NOT_FOUND" as const;
  readonly data: TaskNotFoundData;

  constructor(data: TaskNotFoundData) {
    const where =
      data.taskRef !== undefined ? `${data.taskRef.slug}/${data.taskRef.localId}` : `id ${data.taskId ?? "?"}`;
    super(
      `任务未命中：${where}（project ${data.projectKey}` +
        `${data.containerSlug === undefined ? "" : `，容器 ${data.containerSlug} 作用域`}）`,
    );
    this.name = "TaskNotFoundError";
    this.data = data;
  }
}

export function isTaskNotFoundError(e: unknown): e is TaskNotFoundError {
  return e instanceof TaskNotFoundError;
}

/** ERR_TASK_EXISTS 附载（定位键随冲突面：任务自然键 / manual 边复合键） */
export interface TaskExistsData {
  readonly projectKey: string;
  readonly slug?: string;
  readonly localId?: string;
  readonly edge?: { readonly taskId: string; readonly prerequisiteId: string };
}

export class TaskExistsError extends Error {
  readonly code = "ERR_TASK_EXISTS" as const;
  readonly data: TaskExistsData;

  constructor(data: TaskExistsData) {
    const where =
      data.edge !== undefined
        ? `边重复（${data.edge.taskId} ← ${data.edge.prerequisiteId}）`
        : `任务已存在：${data.slug ?? "?"}/${data.localId ?? "?"}`;
    super(`${where}——UNIQUE 冲突（project ${data.projectKey}）`);
    this.name = "TaskExistsError";
    this.data = data;
  }
}

/** ERR_CYCLE_DETECTED 附载（完整环路径——'slug/localId' 复合自然键，首尾相接） */
export interface CycleDetectedPayload {
  readonly cycle: readonly string[];
}

export class CycleDetectedError extends Error {
  readonly code = "ERR_CYCLE_DETECTED" as const;
  readonly data: CycleDetectedPayload;

  constructor(data: CycleDetectedPayload) {
    super(`检测到依赖环：${data.cycle.join(" → ")}`);
    this.name = "CycleDetectedError";
    this.data = data;
  }
}

/** ERR_CHAIN_DEPTH_EXCEEDED 附载（fix 链深 = fix_of_task_id 边数；新任务 = 源链长 + 1） */
export interface ChainDepthExceededData {
  readonly projectKey: string;
  readonly containerSlug: string;
  readonly chain: readonly string[];
  readonly depth: number;
  readonly limit: number;
}

export class ChainDepthExceededError extends Error {
  readonly code = "ERR_CHAIN_DEPTH_EXCEEDED" as const;
  readonly data: ChainDepthExceededData;

  constructor(data: ChainDepthExceededData) {
    super(
      `fix 链深超限：新任务将处第 ${data.depth} 级（上限 ${data.limit}）——` +
        `链 ${data.chain.join(" → ")}，请人工介入（project ${data.projectKey}，容器 ${data.containerSlug}）`,
    );
    this.name = "ChainDepthExceededError";
    this.data = data;
  }
}

/** ERR_REASON_REQUIRED 附载（transitionTask/submitTask/unblockTask 空因同码跨动词） */
export interface TasksReasonRequiredData {
  readonly verb: "transitionTask" | "submitTask" | "unblockTask";
}

export class ReasonRequiredError extends Error {
  readonly code = "ERR_REASON_REQUIRED" as const;
  readonly data: TasksReasonRequiredData;

  constructor(data: TasksReasonRequiredData) {
    super(`${data.verb} 需要 reason（转移缘由必带——空因拒绝）`);
    this.name = "ReasonRequiredError";
    this.data = data;
  }
}

/** ERR_DEPENDENCIES_UNMET 附载（claim 守卫前置未终态——data 带未满足清单） */
export interface DependenciesUnmetData {
  readonly unmet: readonly { slug: string; localId: string; taskStatus: TaskStatus }[];
}

export class DependenciesUnmetError extends Error {
  readonly code = "ERR_DEPENDENCIES_UNMET" as const;
  readonly data: DependenciesUnmetData;

  constructor(data: DependenciesUnmetData) {
    super(
      `前置依赖未满足：${data.unmet.map((u) => `${u.slug}/${u.localId} ${u.taskStatus}`).join("; ")}` +
        `——满足集 {completed, skipped}`,
    );
    this.name = "DependenciesUnmetError";
    this.data = data;
  }
}

export function isDependenciesUnmetError(e: unknown): e is DependenciesUnmetError {
  return e instanceof DependenciesUnmetError;
}

/** ERR_SUMMARY_REQUIRED 附载（success submit 空摘要） */
export interface TasksSummaryRequiredData {
  readonly verb: "submitTask";
}

export class SummaryRequiredError extends Error {
  readonly code = "ERR_SUMMARY_REQUIRED" as const;
  readonly data: TasksSummaryRequiredData;

  constructor(data: TasksSummaryRequiredData) {
    super(`${data.verb} result=success 需要 summary（执行摘要必带——空摘要拒绝）`);
    this.name = "SummaryRequiredError";
    this.data = data;
  }
}

/** ERR_TEST_EVIDENCE_REQUIRED（AC 任务 success 结算缺测试证据·data 带清单原样带回） */
export class TestEvidenceRequiredError extends Error {
  readonly code = "ERR_TEST_EVIDENCE_REQUIRED" as const;
  readonly data: TestEvidenceRequiredData;

  constructor(data: TestEvidenceRequiredData) {
    super(
      `submitTask 缺测试证据：带验收清单的任务 success 结算须 gate.test === true——` +
        `验收清单（逐条补证据后重新提交）：\n${data.acceptanceCriteria.map((ac) => `- ${ac}`).join("\n")}`,
    );
    this.name = "TestEvidenceRequiredError";
    this.data = data;
  }
}

export function isTestEvidenceRequiredError(e: unknown): e is TestEvidenceRequiredError {
  return e instanceof TestEvidenceRequiredError;
}

/** ERR_GATE_SUMMARY_REQUIRED（type='gate' 任务 success 结算缺数字摘要） */
export interface TasksGateSummaryRequiredData {
  readonly verb: "submitTask";
}

export class GateSummaryRequiredError extends Error {
  readonly code = "ERR_GATE_SUMMARY_REQUIRED" as const;
  readonly data: TasksGateSummaryRequiredData;

  constructor(data: TasksGateSummaryRequiredData) {
    super(
      `${data.verb} 需要 gate 数字摘要：type='gate' 任务结算必带 gate 载荷 ` +
        `（{compile, fmt, lint, test[, coverage]}——gate 载荷承载）`,
    );
    this.name = "GateSummaryRequiredError";
    this.data = data;
  }
}

export function isGateSummaryRequiredError(e: unknown): e is GateSummaryRequiredError {
  return e instanceof GateSummaryRequiredError;
}

/** ERR_AC_NOT_MET（success ∧ acceptanceCriteria 任一 met=false） */
export class AcNotMetError extends Error {
  readonly code = "ERR_AC_NOT_MET" as const;
  readonly data: AcNotMetData;

  constructor(data: AcNotMetData) {
    super(
      `submitTask AC 逐项核验未通过：${data.unmet.length} 项 met=false——逐项补齐证据后重新提交：\n` +
        data.unmet.map((u) => `- ${u.criterion}${u.evidence !== undefined ? `（证据：${u.evidence}）` : ""}`).join("\n"),
    );
    this.name = "AcNotMetError";
    this.data = data;
  }
}

/** ERR_AC_CRITERIA_MISMATCH（提交面 criterion 与定义侧镜像失配） */
export interface AcCriteriaMismatchData {
  readonly expected: readonly string[];
  readonly actual: readonly string[];
}

export class AcCriteriaMismatchError extends Error {
  readonly code = "ERR_AC_CRITERIA_MISMATCH" as const;
  readonly data: AcCriteriaMismatchData;

  constructor(data: AcCriteriaMismatchData) {
    super(
      `submitTask AC 交叉校验失败：acceptanceCriteria[].criterion 须与任务定义侧逐项对应（条数与顺序一致、判据原文相同）——\n` +
        `定义侧：\n${data.expected.map((c) => `- ${c}`).join("\n")}\n` +
        `提交侧：\n${data.actual.map((c) => `- ${c}`).join("\n")}`,
    );
    this.name = "AcCriteriaMismatchError";
    this.data = data;
  }
}

/** ERR_FIX_TASK_AC_REQUIRED（rescue fix 任务 success 零核销——bug faf0ca57②真实性门） */
export class FixTaskAcRequiredError extends Error {
  readonly code = "ERR_FIX_TASK_AC_REQUIRED" as const;

  constructor(data: { readonly verb: "submitTask" }) {
    super(
      `${data.verb} rescue fix 任务零核销拒写：fix 任务 result=success 必带非空 ac_results ` +
        `（[{criterion, met, evidence?}] 自报核销快照——零判据 = 未核销，拒绝结算；` +
        `无法逐条核验时以 result=blocked 收口走 fix 链承接）`,
    );
    this.name = "FixTaskAcRequiredError";
  }
}

/** ERR_FILES_UNION_MISMATCH（files 与 {created, modified} 并存且 files ≠ 并集） */
export interface FilesUnionMismatchData {
  readonly files: readonly string[];
  readonly created: readonly string[];
  readonly modified: readonly string[];
}

export class FilesUnionMismatchError extends Error {
  readonly code = "ERR_FILES_UNION_MISMATCH" as const;
  readonly data: FilesUnionMismatchData;

  constructor(data: FilesUnionMismatchData) {
    super(
      `submitTask files 不一致：顶层 files 必须等于 created ∪ modified（消解双存储歧义）——` +
        `files=${JSON.stringify(data.files)} created=${JSON.stringify(data.created)} modified=${JSON.stringify(data.modified)}`,
    );
    this.name = "FilesUnionMismatchError";
    this.data = data;
  }
}

/** ERR_BEFORE_SUCCESSOR_INVALID（addTask before 后继状态守卫） */
export interface BeforeSuccessorInvalidData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly taskStatus: TaskStatus;
  readonly action: "pauseTask" | "human" | "terminal";
}

export class BeforeSuccessorInvalidError extends Error {
  readonly code = "ERR_BEFORE_SUCCESSOR_INVALID" as const;
  readonly data: BeforeSuccessorInvalidData;

  constructor(data: BeforeSuccessorInvalidData) {
    const advice =
      data.action === "pauseTask"
        ? "先对该任务调用 pauseTask（落 suspended）后再重试 before 挂边"
        : data.action === "human"
          ? "interrupted 任务不在 before 工具面——请走 human 通道（transitionTask）处置"
          : "后继已终态，插入无意义——请改选未终态后继";
    super(
      `before 后继不可挂边：${data.taskRef.slug}/${data.taskRef.localId} 当前 ${data.taskStatus}——${advice}` +
        `（project ${data.projectKey}）`,
    );
    this.name = "BeforeSuccessorInvalidError";
    this.data = data;
  }
}

/** ERR_RUNTIME_EVIDENCE_REQUIRED（强制域取证声明兜底门） */
export interface RuntimeEvidenceRequiredData {
  readonly faces: readonly string[];
}

export class RuntimeEvidenceRequiredError extends Error {
  readonly code = "ERR_RUNTIME_EVIDENCE_REQUIRED" as const;
  readonly data: RuntimeEvidenceRequiredData;

  constructor(data: RuntimeEvidenceRequiredData) {
    super(
      `submitTask 强制域结算缺取证声明：交付物声明运行期装配面 [${data.faces.join(", ")}]——` +
        `真机取证证据（runtime_evidence）与取证债声明（evidence_debt）二选一必带（AGENTS 1.4：` +
        `fake 契约测试全绿不算交付；豁免域 = 纯逻辑/纯文档/纯库边界不受影响）`,
    );
    this.name = "RuntimeEvidenceRequiredError";
    this.data = data;
  }
}

/** ERR_RUNTIME_EVIDENCE_CONFLICT（取证声明二选一——并存即口径歧义） */
export interface RuntimeEvidenceConflictData {
  readonly verb: "submitTask";
}

export class RuntimeEvidenceConflictError extends Error {
  readonly code = "ERR_RUNTIME_EVIDENCE_CONFLICT" as const;
  readonly data: RuntimeEvidenceConflictData;

  constructor(data: RuntimeEvidenceConflictData) {
    super(
      `${data.verb} 取证声明二选一：runtime_evidence（真机取证已做）与 evidence_debt（欠账声明）` +
        `不可并存——证据在手走证据路径，取证未做走债务路径`,
    );
    this.name = "RuntimeEvidenceConflictError";
    this.data = data;
  }
}

/** ERR_TASK_LOCKED（updateTask 状态门） */
export interface TaskLockedData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly taskStatus: TaskStatus;
}

export class TaskLockedError extends Error {
  readonly code = "ERR_TASK_LOCKED" as const;
  readonly data: TaskLockedData;

  constructor(data: TaskLockedData) {
    super(
      `任务处锁定态 ${data.taskStatus}，不可改写（仅 pending/blocked/suspended 可改）——` +
        `${data.taskRef.slug}/${data.taskRef.localId}（project ${data.projectKey}）`,
    );
    this.name = "TaskLockedError";
    this.data = data;
  }
}

/** ERR_TASK_EDGE_ORIGIN_LOCKED（updateTask dependsOn 改写护栏） */
export interface EdgeOriginLockedData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly origins: readonly ("fix-chain" | "autoconfig")[];
}

export class EdgeOriginLockedError extends Error {
  readonly code = "ERR_TASK_EDGE_ORIGIN_LOCKED" as const;
  readonly data: EdgeOriginLockedData;

  constructor(data: EdgeOriginLockedData) {
    super(
      `dependsOn 改写被拒：存在非 manual 边（${[...new Set(data.origins)].join(", ")}）——` +
        `fix-chain/autoconfig 派生边结构性不可改，仅 manual 边可改写（${data.taskRef.slug}/${data.taskRef.localId}）`,
    );
    this.name = "EdgeOriginLockedError";
    this.data = data;
  }
}

/** ERR_BLOCK_SOURCE_REQUIRED（blocked 源 + block_source 缺省） */
export interface BlockSourceRequiredData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly taskStatus: "blocked";
}

export class BlockSourceRequiredError extends Error {
  readonly code = "ERR_BLOCK_SOURCE_REQUIRED" as const;
  readonly data: BlockSourceRequiredData;

  constructor(data: BlockSourceRequiredData) {
    super(
      `源任务已 blocked：${data.taskRef.slug}/${data.taskRef.localId}——不带 block_source 的派生（disc 径）` +
        `不会建等待边，fix 完成无法恢复源。请补 block_source=true 建 fix 链（等待边 + auto-block；` +
        `fix 完成即恢复源）`,
    );
    this.name = "BlockSourceRequiredError";
    this.data = data;
  }
}

/** ERR_BLOCK_CLASSIFICATION_REQUIRED（blocked 结算根因归类闸门） */
export interface BlockClassificationRequiredData {
  readonly verb: "submitTask";
}

export class BlockClassificationRequiredError extends Error {
  readonly code = "ERR_BLOCK_CLASSIFICATION_REQUIRED" as const;
  readonly data: BlockClassificationRequiredData;

  constructor(data: BlockClassificationRequiredData) {
    super(
      `${data.verb} result=blocked 必带根因归类 blockClassification：` +
        `{ kind: 'new-problem' | 'same-family-recurrence'[, recurrenceOf: '<前驱 bug_id>'] }——` +
        `新问题/同族复发二选一；同族复发请携带台账 recurrence 链前驱 bug_id`,
    );
    this.name = "BlockClassificationRequiredError";
    this.data = data;
  }
}

/** ERR_PHASE_GATE_UNSETTLED（claim fresh 径容器实现链阶段门未收口） */
export interface PhaseGateUnsettledData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly containerSlug: string;
  readonly unsettled: readonly { slug: string; localId: string; taskStatus: TaskStatus }[];
}

export class PhaseGateUnsettledError extends Error {
  readonly code = "ERR_PHASE_GATE_UNSETTLED" as const;
  readonly data: PhaseGateUnsettledData;

  constructor(data: PhaseGateUnsettledData) {
    super(
      `容器实现链阶段门未收口：${data.taskRef.slug}/${data.taskRef.localId} 需待容器实现链全部终态 ` +
        `（completed/skipped）后方可领取——链上未终态：\n` +
        `${data.unsettled.map((u) => `- ${u.slug}/${u.localId} ${u.taskStatus}`).join("\n")}\n` +
        `等待容器实现链收口；链卡死时走处置阶梯（pauseTask/人工）` +
        `（project ${data.projectKey}，container ${data.containerSlug}）`,
    );
    this.name = "PhaseGateUnsettledError";
    this.data = data;
  }
}

export function isPhaseGateUnsettledError(e: unknown): e is PhaseGateUnsettledError {
  return e instanceof PhaseGateUnsettledError;
}

/** ERR_BLOCK_SOURCE_IN_PROGRESS（block_source 对在飞源） */
export interface BlockSourceInProgressData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly taskStatus: "in_progress";
}

export class BlockSourceInProgressError extends Error {
  readonly code = "ERR_BLOCK_SOURCE_IN_PROGRESS" as const;
  readonly data: BlockSourceInProgressData;

  constructor(data: BlockSourceInProgressData) {
    super(
      `block_source 源任务在飞：${data.taskRef.slug}/${data.taskRef.localId} 当前 in_progress——` +
        `先 pauseTask 源任务 → addTask(blockSource=true) → resume（project ${data.projectKey}）`,
    );
    this.name = "BlockSourceInProgressError";
    this.data = data;
  }
}

/** ERR_BLOCK_SOURCE_TERMINAL（block_source 对终态源） */
export interface BlockSourceTerminalData {
  readonly projectKey: string;
  readonly taskRef: TaskRef;
  readonly taskStatus: "completed" | "skipped" | "rejected";
}

export class BlockSourceTerminalError extends Error {
  readonly code = "ERR_BLOCK_SOURCE_TERMINAL" as const;
  readonly data: BlockSourceTerminalData;

  constructor(data: BlockSourceTerminalData) {
    super(
      `block_source 源任务已终态：${data.taskRef.slug}/${data.taskRef.localId} 当前 ${data.taskStatus}——` +
        `源已终态，改用 disc 径（不携 blockSource）或改选未终态源（project ${data.projectKey}）`,
    );
    this.name = "BlockSourceTerminalError";
    this.data = data;
  }
}

// ───────── plugin-task-loop 1.7 新增：batchAddTasks 批量校验拒绝面 + ERR_CONTAINER_SLUG_INVALID ─────────

/** addTask/batchAddTasks 容器 slug 形制拒绝（409）：裸 `fix-%` 前缀 slug——fix 判别单源化
 *  （圆桌处方 5：fix 身份由 fix_of_task_id 列承载，slug 前缀冒用即身份歧义）。 */
export interface ContainerSlugInvalidData {
  readonly projectKey: string;
  readonly slug: string;
}

export class ContainerSlugInvalidError extends Error {
  readonly code = "ERR_CONTAINER_SLUG_INVALID" as const;
  readonly data: ContainerSlugInvalidData;

  constructor(data: ContainerSlugInvalidData) {
    super(
      `容器 slug 形制非法：'${data.slug}'——裸 fix-% 前缀 slug 拒收（fix 判别单源 = fix_of_task_id 列，` +
        `slug 前缀冒用即身份歧义；project ${data.projectKey}）`,
    );
    this.name = "ContainerSlugInvalidError";
    this.data = data;
  }
}

/** batchAddTasks dry-run 收集制校验单项错误（{index, field, code, message, fixHint}） */
export interface BatchItemError {
  readonly index: number;
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly fixHint: string;
}

/** ERR_BATCH_INVALID（400/409 聚合信封——收集制校验失败，零落库） */
export interface BatchInvalidData {
  readonly projectKey: string;
  readonly slug: string;
  readonly errors: readonly BatchItemError[];
}

export class BatchInvalidError extends Error {
  readonly code = "ERR_BATCH_INVALID" as const;
  readonly data: BatchInvalidData;

  constructor(data: BatchInvalidData) {
    super(
      `batchAddTasks 批量校验失败（${data.errors.length} 处——收集制全量回报，零落库）：\n` +
        data.errors
          .map((e) => `- [#${e.index}] ${e.field} ${e.code}: ${e.message}（${e.fixHint}）`)
          .join("\n"),
    );
    this.name = "BatchInvalidError";
    this.data = data;
  }
}

/** better-sqlite3 UNIQUE/PK 违例判据（code + 消息定位表——两级去重的存储级拒绝面） */
export function isUniqueViolation(cause: unknown, tableHint: string): boolean {
  if (!(cause instanceof Error)) return false;
  const code = (cause as { code?: unknown }).code;
  return (
    (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") &&
    cause.message.includes(tableHint)
  );
}

/** 诊断兜底发射（emitDiagOrFallback 平移——缝缺席时经 deps.onDiag 注入面留痕；无缝则静默降级
 *  ——宿主装配面兜底纪律：本域零直落 console）。 */
export function emitDiagOrFallback(
  onDiag: ((payload: DiagEventPayload) => void) | undefined,
  payload: DiagEventPayload,
): void {
  onDiag?.(payload);
}
