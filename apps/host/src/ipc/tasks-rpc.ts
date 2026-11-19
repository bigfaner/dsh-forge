// forge:tasks/* 八通道注册（3.1 注册行；定位：基础——通道面装配，域语义归 task-loop 任务域）。
// 通道名仅出自 @dsh-forge/contracts TASKS_CHANNELS（键名沿用 C1 裁决）；服务类型锚 =
// @dsh-forge/task-loop 包出口 TasksService（1.14 host 改指——contracts 旧 ForgeTasksService
// face 退役面禁再引用），经参数注入（结构类型——host 禁 import 插件域源码内联）。
// 面分治（SC7 Hard Rule）：写动词 addTask/claimTask/submitTask = agent tool 专属，
// 不入 RPC 面——注入类型收窄为八法 Pick（类型级禁令，knowledge-rpc.ts 同形制）。
import { TASKS_CHANNELS } from '@dsh-forge/contracts'
import type { TasksService } from '@dsh-forge/task-loop'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = RPC 八法（transition/query/validateFeatureTasks/list/stats/graph/detail/
 * sessionLinks）。addTask/claimTask/submitTask 不入面——经 web RPC 不可达（agent 面
 * 唯一门 = task-loop tool，双门分工 + SC7 断言面）。
 */
export type TasksChannelService = Pick<
  TasksService,
  | 'transitionTask'
  | 'queryTask'
  | 'validateFeatureTasks'
  | 'listTasks'
  | 'taskStats'
  | 'taskGraph'
  | 'taskDetail'
  | 'sessionLinks'
>

/** 通道入参类型（服务面方法首参单源——零手写 DTO 复制，服务面漂移编译期显形） */
type ChannelInput<M extends keyof TasksChannelService> = Parameters<TasksChannelService[M]>[0]

/** 八通道全集注册（负载映射随 task-loop 服务面 slug 键——键键对应，信封机制留宿主） */
export function registerTasksChannels(ipc: ForgeIpc, service: TasksChannelService): void {
  ipc.register(
    TASKS_CHANNELS.transition,
    rpcEnvelope((input: ChannelInput<'transitionTask'>) => service.transitionTask(input)),
  )
  ipc.register(TASKS_CHANNELS.query, rpcEnvelope((input: ChannelInput<'queryTask'>) => service.queryTask(input)))
  ipc.register(
    TASKS_CHANNELS.validateFeatureTasks,
    rpcEnvelope((input: ChannelInput<'validateFeatureTasks'>) => service.validateFeatureTasks(input)),
  )
  ipc.register(TASKS_CHANNELS.list, rpcEnvelope((q: ChannelInput<'listTasks'>) => service.listTasks(q)))
  ipc.register(TASKS_CHANNELS.stats, rpcEnvelope((q: ChannelInput<'taskStats'>) => service.taskStats(q)))
  ipc.register(TASKS_CHANNELS.graph, rpcEnvelope((q: ChannelInput<'taskGraph'>) => service.taskGraph(q)))
  ipc.register(TASKS_CHANNELS.detail, rpcEnvelope((q: ChannelInput<'taskDetail'>) => service.taskDetail(q)))
  ipc.register(TASKS_CHANNELS.sessionLinks, rpcEnvelope((q: ChannelInput<'sessionLinks'>) => service.sessionLinks(q)))
}
