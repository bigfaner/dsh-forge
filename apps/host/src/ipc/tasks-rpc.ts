// forge:tasks/* 八通道注册（3.1 注册行；定位：基础——通道面装配，域语义归 core 任务域）。
// 通道名仅出自 @dsh-forge/contracts TASKS_CHANNELS（三处一体：contracts → web/rpc →
// core 任务域；Interface 1 服务面 ↔ Interface 7 通道族一一对应）；服务经参数注入
//（结构类型——host 禁 import core 源码，tests/structure/host-main pin）。
// 面分治（SC7 Hard Rule）：写动词 addTask/claimTask/submitTask = agent tool 专属，
// 不入 RPC 面——注入类型收窄为八法 Pick（类型级禁令，knowledge-rpc.ts 同形制）。
import {
  TASKS_CHANNELS,
  type ForgeTasksService,
  type ListTasksQuery,
  type QueryTaskInput,
  type SessionLinksQuery,
  type TaskDetailQuery,
  type TaskGraphQuery,
  type TaskStatsQuery,
  type TransitionTaskInput,
  type ValidateFeatureTasksInput,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = RPC 八法（transition/query/validateFeatureTasks/list/stats/graph/detail/
 * sessionLinks）。addTask/claimTask/submitTask 不入面——经 web RPC 不可达（agent 面
 * 唯一门 = plugin-forge tool，双门分工 + SC7 断言面）。
 */
export type TasksChannelService = Pick<
  ForgeTasksService,
  | 'transitionTask'
  | 'queryTask'
  | 'validateFeatureTasks'
  | 'listTasks'
  | 'taskStats'
  | 'taskGraph'
  | 'taskDetail'
  | 'sessionLinks'
>

/** 八通道全集注册（负载映射 = contracts TasksChannelRequests/Responses，键键对应） */
export function registerTasksChannels(ipc: ForgeIpc, service: TasksChannelService): void {
  ipc.register(
    TASKS_CHANNELS.transition,
    rpcEnvelope((input: TransitionTaskInput) => service.transitionTask(input)),
  )
  ipc.register(TASKS_CHANNELS.query, rpcEnvelope((input: QueryTaskInput) => service.queryTask(input)))
  ipc.register(
    TASKS_CHANNELS.validateFeatureTasks,
    rpcEnvelope((input: ValidateFeatureTasksInput) => service.validateFeatureTasks(input)),
  )
  ipc.register(TASKS_CHANNELS.list, rpcEnvelope((q: ListTasksQuery) => service.listTasks(q)))
  ipc.register(TASKS_CHANNELS.stats, rpcEnvelope((q: TaskStatsQuery) => service.taskStats(q)))
  ipc.register(TASKS_CHANNELS.graph, rpcEnvelope((q: TaskGraphQuery) => service.taskGraph(q)))
  ipc.register(TASKS_CHANNELS.detail, rpcEnvelope((q: TaskDetailQuery) => service.taskDetail(q)))
  ipc.register(TASKS_CHANNELS.sessionLinks, rpcEnvelope((q: SessionLinksQuery) => service.sessionLinks(q)))
}
