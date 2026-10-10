// @dsh-forge/plugin-forge 插件定义（定位：装配；knowledge index.ts 同型——3.4 物理挂载）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeTasks', 'forgeProposals', 'forgeProjects', 'tools', 'systemPrompt']
//   —— 对 core 的依赖 = 任务/提案/项目三域服务（Interface 1/3 类型 +
//   ProjectServiceM2.deriveTaskStoreDir——事件日志落位目录单源派生，插件不复制）；
//   forgeSettings = 可选服务（经官方 reflect.get 防御读取——cordis 4.0.4 无 '?'
//   可选 inject 后缀；缺席 = dispatchTask 不携带 agentOptions 回退父会话继承）；
//   tools / systemPrompt 为 dsh 官方面（非 core）。
// 装配（3.4 终态）：事件总线（产品自建）+ 事件 sink（emit 面 + 会话目录记忆）+
// 日志监听器挂接（logs/{slug}.jsonl 唯一写者——事件→工作区映射 = 装配方闭包：
// sink.prepare 在 tool 执行点经 core deriveTaskStoreDir 解析并记忆，监听器
// resolveContainerDir 消费同一记忆）+ tool 注册（六员——名 = 动词透传；dispatchTask
// spawn 面 = spawn/in-process-driver.ts 真绑定）+ forge:pipeline 段注册（order 510）；
// 交出合并 disposer（fiber 卸载即全注销）。
// projectId 解析缝 = bindingsFile 机制（Interface 8 cwd 数据缝——host 维护
// {wsPath,projectId} JSON 经插件 config 进入，生产端 3.4）。
import type { ForgeSettingsService } from '@dsh-forge/contracts'
import { attachForgeLogListener } from './events/log-listener.js'
import { createForgeEventBus } from './events/bus.js'
import { createForgeEventSink } from './events/sink.js'
import { FORGE_SECTION_NAME, FORGE_SECTION_ORDER, renderForgePipelineSection } from './prompt/index.js'
import { createInProcessDriverSpawn } from './spawn/in-process-driver.js'
import { createForgeTools, createProjectResolver } from './tools/index.js'
import type { ForgeContextFace } from './tools/index.js'
import type { ProjectBinding } from './tools/index.js'

/** 插件配置（profile cordis.patch.yml 行 config；cwd 绑定数据经 boot overlay 注入） */
export interface ForgePluginConfig {
  /** 会话 cwd → projectId 绑定表（wsPath 与 projects.ws_path 同口径 canonical path） */
  projects?: readonly ProjectBinding[]
  /** 绑定表文件路径（host 装配方维护——tool 执行点惰性读取，条目优先于静态表） */
  bindingsFile?: string
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface ForgePlugin {
  (ctx: ForgeContextFace, config?: ForgePluginConfig): () => void
  /** 依赖声明：声明服务齐备才加载（core 面 = forgeTasks + forgeProposals + forgeProjects
   *  三服务；forgeSettings 可选消费不走 inject 声明——缺席不阻载） */
  readonly inject: readonly string[]
}

const forgePlugin: ForgePlugin = Object.assign(
  (ctx: ForgeContextFace, config: ForgePluginConfig = {}): (() => void) => {
    // 事件链装配（3.3/3.4）：总线 → sink（emit + 会话目录记忆——core deriveTaskStoreDir
    // 单源）→ 监听器（唯一写者——容器维度 logs/{slug}.jsonl；dirOf 未命中 = fail-soft 丢行·绝不落相对路径）
    const bus = createForgeEventBus()
    const sink = createForgeEventSink({
      bus,
      resolveDir: (workspaceDir) =>
        ctx.forgeProjects.deriveTaskStoreDir({ workspaceDir }).then((r) => r.dir).catch(() => undefined),
    })
    // forgeSettings 可选消费（cordis 4.0.4 无 '?' 可选 inject 后缀——settingsFile 缺席 =
    // core 不注册该服务，注入声明会阻载整个插件；经官方 reflect.get 防御读取：
    // 缺席/异常 = undefined → dispatchTask 不携带 agentOptions 回退父会话继承）
    let settingsService: Pick<ForgeSettingsService, 'get'> | undefined
    try {
      const viaReflect = ctx.reflect?.get('forgeSettings') as Pick<ForgeSettingsService, 'get'> | undefined
      if (viaReflect !== undefined && typeof viaReflect.get === 'function') settingsService = viaReflect
    } catch {
      settingsService = undefined
    }
    // llm 服务可选消费（同 reflect.get 懒读配方）：resolveModelInfo → 模型推理档位支持集。
    // dispatchTask 组装面消费——配置档位不被模型支持时剥离 effort（无法兼容就不设置，
    // 杜绝 UNSUPPORTED_REASONING_EFFORT 级 worker 启动即崩）；服务缺席/异常 = 不判。
    let resolveModelReasoning:
      | ((provider: string, model: string) => Promise<readonly string[] | undefined>)
      | undefined
    try {
      const llm = ctx.reflect?.get('llm') as
        | {
            resolveModelInfo?: (
              provider: string,
              model: string,
            ) => Promise<{ reasoning?: { efforts?: readonly { id?: unknown }[] } } | undefined>
          }
        | undefined
      const resolveModelInfo = llm?.resolveModelInfo
      if (typeof resolveModelInfo === 'function') {
        resolveModelReasoning = async (provider, model) => {
          try {
            const info = await resolveModelInfo.call(llm, provider, model)
            const efforts = info?.reasoning?.efforts
            if (!Array.isArray(efforts)) return undefined // 非推理模型/无能力面 = 目录不可知（不判）
            return efforts.flatMap((effort) => (typeof effort?.id === 'string' ? [effort.id] : []))
          } catch {
            return undefined // 不可解析（未知 provider/model 等）= 不判
          }
        }
      }
    } catch {
      resolveModelReasoning = undefined
    }
    const tools = createForgeTools({
      tasks: ctx.forgeTasks,
      proposals: ctx.forgeProposals,
      resolveProjectId: createProjectResolver(config.projects ?? [], config.bindingsFile),
      events: sink,
      ...(settingsService !== undefined ? { settings: settingsService } : {}),
      ...(resolveModelReasoning !== undefined ? { resolveModelReasoning } : {}),
      spawn: createInProcessDriverSpawn(),
    })
    const disposers = [
      ctx.tools.register(tools.addTask),
      ctx.tools.register(tools.submitTask),
      ctx.tools.register(tools.queryTask),
      ctx.tools.register(tools.createProposal),
      ctx.tools.register(tools.transitionProposal),
      ctx.tools.register(tools.dispatchTask),
      attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) }),
      // 段文本 = 老 forge hook 注入文本平移（状态层说明/执行协议/受限面声明），
      // 不含 tool 说明——dsh tool 注册面自带（Interface 9 标签表行 1）
      ctx.systemPrompt.section({
        name: FORGE_SECTION_NAME,
        order: FORGE_SECTION_ORDER,
        text: renderForgePipelineSection(),
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  },
  {
    inject: ['forgeTasks', 'forgeProposals', 'forgeProjects', 'tools', 'systemPrompt'] as const,
  },
)

export default forgePlugin
export { FORGE_SECTION_NAME, FORGE_SECTION_ORDER, renderForgePipelineSection } from './prompt/index.js'
// M3 3.3/3.4：产品自建事件总线 + 日志监听器 + 事件 sink（logs/{slug}.jsonl 唯一写者）——
// tool 面 emit 点已接线（dispatchTask 五事件 + submitTask task-submitted + 全 tool-error）。
export { assertForgeEventEnvelope, createForgeEventBus } from './events/bus.js'
export type { ForgeEventBus, ForgeEventHandler } from './events/bus.js'
export {
  attachForgeLogListener,
  createForgeLogListener,
  forgeLogFileOf,
  FORGE_LOG_POOL_SLUG,
  FORGE_LOGS_DIR,
  readForgeEventLog,
  resolveLogSlug,
  standardizeEvent,
} from './events/log-listener.js'
export type { ForgeLogListener, ForgeLogListenerOptions } from './events/log-listener.js'
export { createForgeEventSink, emitToolError, slugOfToolArgs } from './events/sink.js'
export type { ForgeEventSink, ForgeEventSinkDeps } from './events/sink.js'
export { createForgeTools, createProjectResolver, FORGE_TOOL_NAMES } from './tools/index.js'
export type {
  ForgeTools,
  ForgeToolDeps,
  DispatchForgeToolDeps,
  ForgeToolName,
  ProjectBinding,
  ProjectIdResolver,
  ToolSessionContext,
  WorkspaceNotRegisteredData,
} from './tools/index.js'
export { WorkspaceNotRegisteredError, isWorkspaceNotRegisteredError } from './tools/index.js'
export type { ForgeContextFace as PluginContextFace, ForgeToolDefinition } from './tools/index.js'
export { classifyPool, deriveWorkerToolFilter, poolOf, reconcileWorkerReasoning, workerAgentOptionsOf } from './tools/index.js'
export type { DispatchTaskResult, PoolSnapshot, PoolVerdict, SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from './tools/index.js'
export { createInProcessDriverSpawn } from './spawn/in-process-driver.js'
