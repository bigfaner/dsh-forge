// forge 任务域服务装配壳（任务 2.7 provide ×4 装配点——Interface 1 十一法签名面；
// 动词/读面实现逐任务接线：add/query（2.3）/claim·submit（2.4）/transition·
// validateFeatureTasks（2.5）/list·stats·graph·detail·sessionLinks（2.6——全接线，占位
// fail-loud 面退役）。壳的职责 = 装配面稳定：桥六服务白名单与 ready 位（3.1）以本面为锚
// ——服务名恒在场、方法面完整。deps = store + events + resolveWsPath（装配单例句柄/事件
// 共享/详情 git 查找工作区根），动词与读面实现落位同域独立文件（add.ts/query.ts/claim.ts/
// submit.ts/transition.ts/validate.ts/list.ts/detail.ts/session-links.ts + git-lookup.ts——
// git 唯一调用点单文件审计面）。validateFeatureTasks 以 async 包装同步核心（Interface 1
// 契约面；发现面挂点直调同步核心——防逃逸 Promise 拒绝绕过 fail-soft 记账，见 validate.ts 头注）。
import type {
  AddTaskInput,
  AddTaskResult,
  ClaimTaskInput,
  ClaimTaskResult,
  ForgeTasksService,
  ListTasksQuery,
  QueryTaskInput,
  QueryTaskResult,
  SessionLinksQuery,
  SessionTaskLinkCard,
  SubmitTaskInput,
  SubmitTaskResult,
  TaskCard,
  TaskDetail,
  TaskDetailQuery,
  TaskGraph,
  TaskGraphQuery,
  TaskSnapshot,
  TaskStats,
  TaskStatsQuery,
  TransitionTaskInput,
  ValidateFeatureTasksInput,
  ValidateReport,
} from '@dsh-forge/contracts'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { addTask } from './add.js'
import { claimTask } from './claim.js'
import { taskDetail } from './detail.js'
import type { GitExecFile } from './git-lookup.js'
import { listTasks, taskGraph, taskStats } from './list.js'
import { queryTask } from './query.js'
import { sessionLinks } from './session-links.js'
import { submitTask } from './submit.js'
import { transitionTask } from './transition.js'
import { validateFeatureTasks } from './validate.js'

export interface TasksServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen——动词/读面共用） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享；写动词闭包尾部 emitTasksChanged） */
  readonly events: ForgeTaskEvents
  /** projectId → 工作区仓库根（2.6 taskDetail actualFiles git 只读查找 cwd——装配层 routing.wsPath 注入） */
  readonly resolveWsPath: (projectId: string) => string
  /** git 只读执行注入（缺席 = 生产 execFile——git-lookup.ts defaultExecFile；测试桩受控注入） */
  readonly gitExec?: GitExecFile
}

/** Interface 1：core · forge 任务域服务面（ctx.forgeTasks——十一法全接线） */
export function createTasksService(deps: TasksServiceDeps): ForgeTasksService {
  return {
    async addTask(input: AddTaskInput): Promise<AddTaskResult> {
      return addTask(deps, input)
    },
    async claimTask(input: ClaimTaskInput): Promise<ClaimTaskResult> {
      return claimTask(deps, input)
    },
    async submitTask(input: SubmitTaskInput): Promise<SubmitTaskResult> {
      return submitTask(deps, input)
    },
    async transitionTask(input: TransitionTaskInput): Promise<TaskSnapshot> {
      return transitionTask(deps, input)
    },
    async queryTask(input: QueryTaskInput): Promise<QueryTaskResult> {
      return queryTask(deps, input)
    },
    async validateFeatureTasks(input: ValidateFeatureTasksInput): Promise<ValidateReport> {
      return validateFeatureTasks(deps, input)
    },
    async listTasks(q: ListTasksQuery): Promise<TaskCard[]> {
      return listTasks(deps, q)
    },
    async taskStats(q: TaskStatsQuery): Promise<TaskStats> {
      return taskStats(deps, q)
    },
    async taskGraph(q: TaskGraphQuery): Promise<TaskGraph> {
      return taskGraph(deps, q)
    },
    async taskDetail(q: TaskDetailQuery): Promise<TaskDetail> {
      return taskDetail(
        { store: deps.store, resolveWsPath: deps.resolveWsPath, git: { execFile: deps.gitExec } },
        q,
      )
    },
    async sessionLinks(q: SessionLinksQuery): Promise<SessionTaskLinkCard[]> {
      return sessionLinks(deps, q)
    },
  }
}
