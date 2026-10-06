// forge 任务域服务装配壳（任务 2.7 provide ×4 装配点——Interface 1 十一法签名面先行，
// 动词实现逐任务接线：add/query（2.3）/transition·validateFeatureTasks（2.5 已接线）/
// claim/submit（2.4）/list·stats·graph·detail·sessionLinks（2.6））。壳的职责 = 装配面稳定：
// 桥六服务白名单与 ready 位（3.1）以本面为锚——服务名恒在场、方法面完整；接线前每法
// fail-loud 抛占位错误（不静默假成功）。deps = store + events（装配单例句柄/事件共享），
// 动词实现落位同域独立文件（add.ts/query.ts/transition.ts/validate.ts——2.4/2.6 继续扩池）。
// validateFeatureTasks 以 async 包装同步核心（Interface 1 契约面；发现面挂点直调同步核心
// ——防逃逸 Promise 拒绝绕过 fail-soft 记账，见 validate.ts 头注）。
import type {
  AddTaskInput,
  AddTaskResult,
  ForgeTasksService,
  QueryTaskInput,
  QueryTaskResult,
  TaskSnapshot,
  TransitionTaskInput,
  ValidateFeatureTasksInput,
  ValidateReport,
} from '@dsh-forge/contracts'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { addTask } from './add.js'
import { queryTask } from './query.js'
import { transitionTask } from './transition.js'
import { validateFeatureTasks } from './validate.js'

export interface TasksServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen——动词/读面共用） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享；写动词闭包尾部 emitTasksChanged） */
  readonly events: ForgeTaskEvents
}

/** 接线期占位错误（fail-loud——动词落地前不静默假成功） */
function notWired(method: string, landingTask: string): never {
  throw new Error(`forgeTasks.${method} 尚未接线（${landingTask} 落地——装配壳仅保服务面完整）`)
}

/** Interface 1：core · forge 任务域服务面（ctx.forgeTasks——add/query/transition/validate 已接线） */
export function createTasksService(deps: TasksServiceDeps): ForgeTasksService {
  return {
    async addTask(input: AddTaskInput): Promise<AddTaskResult> {
      return addTask(deps, input)
    },
    async claimTask() {
      notWired('claimTask', '2.4')
    },
    async submitTask() {
      notWired('submitTask', '2.4')
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
    async listTasks() {
      notWired('listTasks', '2.6')
    },
    async taskStats() {
      notWired('taskStats', '2.6')
    },
    async taskGraph() {
      notWired('taskGraph', '2.6')
    },
    async taskDetail() {
      notWired('taskDetail', '2.6')
    },
    async sessionLinks() {
      notWired('sessionLinks', '2.6')
    },
  }
}
