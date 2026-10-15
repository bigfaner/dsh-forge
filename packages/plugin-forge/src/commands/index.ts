// commands barrel（S2——run-tasks-host-command 指令两枚单一出口：定义工厂 + handler + 名集
// 常量）。消费面 = 插件装配方（ctx.reflect.get('commands') 防御读取后 register——服务缺席 =
// 指令不注册 fail-soft，R3）与 handler 单测。依赖方向：commands → loop / contracts / faces /
// tools(session 解析器类型) 单向；零上游 import。
import type { ForgeTasksService } from '@dsh-forge/contracts'
import type { EscalationAskFace, LoopDriver } from '../loop/index.js'
import type { ForgeCommandDefinition } from '../faces.js'
import type { ProjectIdResolver } from '../tools/index.js'
import { createRunDagTasksHandler, RUN_DAG_TASKS_NAME } from './run-dag-tasks.js'
import { createStopDagTasksHandler, STOP_DAG_TASKS_NAME } from './stop-dag-tasks.js'

export { RUN_DAG_TASKS_NAME, nonTerminalSourcesOf } from './run-dag-tasks.js'
export type { RunDagTasksDeps, SourceCandidate } from './run-dag-tasks.js'
export { createStopDagTasksHandler, NO_ACTIVE_LOOP_TEXT, STOP_DAG_TASKS_NAME } from './stop-dag-tasks.js'
export type { StopDagTasksDeps } from './stop-dag-tasks.js'

/** 注册名集（序 = 注册序——plugin.test pin 锚；S5 GUI DISPATCH_COMMAND_PREFIX 同名锚） */
export const FORGE_COMMAND_NAMES = [RUN_DAG_TASKS_NAME, STOP_DAG_TASKS_NAME] as const

/** 指令定义工厂依赖（driver 单例 + core 读面 + 工作区解析 + 问询面可缺席 + 活根解析可缺席） */
export interface ForgeCommandsDeps {
  readonly driver: LoopDriver
  readonly tasks: ForgeTasksService
  readonly resolveProjectId: ProjectIdResolver
  readonly ask?: EscalationAskFace
  /** agentsRegistry 活根解析（1.18——指令单行 followup 目标；缺席 = ctx.parent fallback） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown
  /** 未进入会话激活面（1.19——host sessionController.resolveAgent 进入；缺席 = 1.18 回执指引语义） */
  readonly enterAgent?: (ownerSessionId: string) => Promise<unknown>
}

/** 指令定义组（S2 两枚——描述 = 发现 UI 用户可读文案） */
export interface ForgeCommands {
  readonly runDagTasks: ForgeCommandDefinition
  readonly stopDagTasks: ForgeCommandDefinition
}

export function createForgeCommands(deps: ForgeCommandsDeps): ForgeCommands {
  return {
    runDagTasks: {
      name: RUN_DAG_TASKS_NAME,
      description: '派发任务——自动逐个执行一个任务源里的任务直到全部完成',
      input: { hint: '[<slug>]' },
      handler: createRunDagTasksHandler(deps),
    },
    stopDagTasks: {
      name: STOP_DAG_TASKS_NAME,
      description: '停止本会话启动的派发循环',
      handler: createStopDagTasksHandler({ driver: deps.driver }),
    },
  }
}
