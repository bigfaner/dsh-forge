// 任务域服务装配壳（core forge/tasks/service.ts 直迁——plugin-task-loop 1.7 内联）。
// 职责 = 装配面稳定：动词与读面实现落位同域独立文件，方法面完整。deps = 共享单库连接 +
// 事件发射器 + 工作区根解析（详情 git 查找）。
import {
  addTask,
  batchAddTasks,
  validateBatchAddTasks,
  type AddTaskInput,
  type AddTaskResult,
  type BatchAddTasksInput,
  type BatchAddTasksResult,
  type BatchItemError,
} from "./add.js";
import type {
  BugRecurrenceCandidate,
  DiagEventPayload,
  ExpertPersonaProfile,
  SessionTaskLinkCard,
  TaskCard,
  TaskSnapshot,
  TasksVerbDeps,
} from "./types.js";
import { claimTask, type ClaimTaskInput, type ClaimTaskResult } from "./claim.js";
import { taskDetail, type TaskDetail, type TaskDetailQuery, type TasksDetailDeps } from "./detail.js";
import type { GitExecFile } from "./git-lookup.js";
import {
  listTasks,
  taskGraph,
  taskSettlements,
  taskStats,
  type ListTasksQuery,
  type TaskGraph,
  type TaskGraphQuery,
  type TaskSettlementRow,
  type TaskSettlementsQuery,
  type TaskStats,
  type TaskStatsQuery,
} from "./list.js";
import { markE2eAttribution, type MarkE2eAttributionInput } from "./mark-e2e-attribution.js";
import { queryTask } from "./query.js";
import { readUnsettledChain, type ReadUnsettledChainInput, type ReadUnsettledChainResult } from "./read-unsettled-chain.js";
import { reconcileInterrupted, type ReconcileInterruptedInput, type ReconcileInterruptedResult } from "./reconcile.js";
import { sessionLinks, type SessionLinksQuery, type SessionLinksDeps } from "./session-links.js";
import { recordSpawn, type RecordSpawnInput } from "./spawn.js";
import { submitTask, type SubmitTaskInput, type SubmitTaskResult } from "./submit.js";
import { transitionTask, type TransitionTaskInput } from "./transition.js";
import { unblockTask, type UnblockTaskInput, type UnblockTaskResult } from "./unblock.js";
import { updateTask, type UpdateTaskInput } from "./update.js";
import { validateFeatureTasks, type ValidateContainerTasksInput, type ValidateReport } from "./validate.js";

export interface TasksServiceDeps {
  /** task-loop.db 连接（openDomainDb().db——共享单库，project_key 归属谓词内建） */
  readonly db: TasksVerbDeps["db"];
  /** 写后事件发射器（装配单例——写动词闭包尾部 emitTasksChanged） */
  readonly events: TasksVerbDeps["events"];
  /** projectKey → 项目检出根（taskDetail actualFiles git 只读查找 cwd） */
  readonly resolveWsPath: (projectKey: string) => string;
  /** git 只读执行注入（缺席 = 生产 execFile） */
  readonly gitExec?: GitExecFile;
  /** 续跑指针探测 + 效度比对（缺席 = 简报零 `<resume>` 段） */
  readonly resolveEvidencePointer?: TasksVerbDeps["resolveEvidencePointer"];
  /** worker 任务目录锚点节渲染（缺席/空串 = persona 零追加） */
  readonly resolveWorkerContext?: TasksVerbDeps["resolveWorkerContext"];
  /** 专家档案取用面（缺席 = persona 仅程序段） */
  readonly resolveExpertProfile?: (taskType: string, expertKey?: string) => Promise<ExpertPersonaProfile | undefined>;
  /** bug 台账 recurrence 候选只读检索（缺席 = 交叉校验降级跳过不阻载） */
  readonly findRecurrenceCandidates?: (
    projectKey: string,
    scope: { readonly slug: string; readonly localId: string; readonly files: readonly string[] },
  ) => Promise<readonly BugRecurrenceCandidate[]> | readonly BugRecurrenceCandidate[];
  /** 诊断发射缝（降级径留痕透传动词面；缺席 = 装配方按级兜底） */
  readonly onDiag?: (payload: Omit<DiagEventPayload, "process">) => void;
}

/** 任务域服务面（动词/读面全接线——域内装配壳，宿主工具面经此消费） */
export function createTasksService(deps: TasksServiceDeps) {
  const verbDeps: TasksVerbDeps = {
    db: deps.db,
    events: deps.events,
    ...(deps.resolveEvidencePointer !== undefined ? { resolveEvidencePointer: deps.resolveEvidencePointer } : {}),
    ...(deps.resolveWorkerContext !== undefined ? { resolveWorkerContext: deps.resolveWorkerContext } : {}),
    ...(deps.resolveExpertProfile !== undefined ? { resolveExpertProfile: deps.resolveExpertProfile } : {}),
    ...(deps.findRecurrenceCandidates !== undefined ? { findRecurrenceCandidates: deps.findRecurrenceCandidates } : {}),
    ...(deps.onDiag !== undefined ? { onDiag: deps.onDiag } : {}),
  };
  const detailDeps: TasksDetailDeps = {
    db: deps.db,
    resolveWsPath: deps.resolveWsPath,
    ...(deps.gitExec !== undefined ? { git: { execFile: deps.gitExec } } : {}),
  };
  const linksDeps: SessionLinksDeps = { db: deps.db };
  return {
    async addTask(input: AddTaskInput): Promise<AddTaskResult> {
      return addTask(verbDeps, input);
    },
    async batchAddTasks(input: BatchAddTasksInput): Promise<BatchAddTasksResult> {
      return batchAddTasks(verbDeps, input);
    },
    async validateBatchAddTasks(input: Pick<BatchAddTasksInput, "projectKey" | "slug" | "tasks">): Promise<BatchItemError[]> {
      return validateBatchAddTasks(verbDeps, input);
    },
    async claimTask(input: ClaimTaskInput): Promise<ClaimTaskResult> {
      return claimTask(verbDeps, input);
    },
    async submitTask(input: SubmitTaskInput): Promise<SubmitTaskResult> {
      return submitTask(verbDeps, input);
    },
    async unblockTask(input: UnblockTaskInput): Promise<UnblockTaskResult> {
      return unblockTask(verbDeps, input);
    },
    async recordSpawn(input: RecordSpawnInput): Promise<void> {
      return recordSpawn(verbDeps, input);
    },
    async markE2eAttribution(input: MarkE2eAttributionInput): Promise<void> {
      return markE2eAttribution(verbDeps, input);
    },
    async readUnsettledChain(input: ReadUnsettledChainInput): Promise<ReadUnsettledChainResult> {
      return readUnsettledChain(verbDeps, input);
    },
    async reconcileInterrupted(input: ReconcileInterruptedInput): Promise<ReconcileInterruptedResult> {
      return reconcileInterrupted(verbDeps, input);
    },
    async transitionTask(input: TransitionTaskInput): Promise<TaskSnapshot> {
      return transitionTask(verbDeps, input);
    },
    async updateTask(input: UpdateTaskInput): Promise<TaskSnapshot> {
      return updateTask(verbDeps, input);
    },
    async queryTask(input: {
      projectKey: string;
      taskRef: { slug: string; localId: string };
      include?: { prerequisites?: boolean; waitingOnMe?: boolean; records?: boolean; sessions?: boolean };
    }) {
      return queryTask(verbDeps, input);
    },
    async validateFeatureTasks(input: ValidateContainerTasksInput): Promise<ValidateReport> {
      return validateFeatureTasks({ db: deps.db }, input);
    },
    async listTasks(q: ListTasksQuery): Promise<TaskCard[]> {
      return listTasks(verbDeps, q);
    },
    async taskStats(q: TaskStatsQuery): Promise<TaskStats> {
      return taskStats(verbDeps, q);
    },
    async taskSettlements(q: TaskSettlementsQuery): Promise<TaskSettlementRow[]> {
      return taskSettlements(verbDeps, q);
    },
    async taskGraph(q: TaskGraphQuery): Promise<TaskGraph> {
      return taskGraph(verbDeps, q);
    },
    async taskDetail(q: TaskDetailQuery): Promise<TaskDetail> {
      return taskDetail(detailDeps, q);
    },
    async sessionLinks(q: SessionLinksQuery): Promise<SessionTaskLinkCard[]> {
      return sessionLinks(linksDeps, q);
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
