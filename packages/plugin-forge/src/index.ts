// @dsh-forge/plugin-forge 插件定义（定位：装配；knowledge index.ts 同型——3.4 物理挂载）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeTasks', 'forgeProposals', 'tools', 'systemPrompt'] —— 对 core 的
//   依赖 = 两域服务（Interface 1/3 类型，contracts 单一来源；运行期 inject 解析，
//   零实现级 import，Hard Rule）；tools / systemPrompt 为 dsh 官方面（非 core）。
// 装配：六 tool 注册（tools.register——名 = 动词透传）+ forge:pipeline 段注册
// （systemPrompt.section，order 510）；交出合并 disposer（fiber 卸载即全注销）。
// projectId 解析缝 = bindingsFile 机制（Interface 8 cwd 数据缝——host 维护
// {wsPath,projectId} JSON 经插件 config 进入，生产端 3.4）。
import { FORGE_SECTION_NAME, FORGE_SECTION_ORDER, renderForgePipelineSection } from './prompt/index.js'
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
  /** 依赖声明：声明服务齐备才加载（core 面 = forgeTasks + forgeProposals 双服务） */
  readonly inject: readonly string[]
}

const forgePlugin: ForgePlugin = Object.assign(
  (ctx: ForgeContextFace, config: ForgePluginConfig = {}): (() => void) => {
    const tools = createForgeTools({
      tasks: ctx.forgeTasks,
      proposals: ctx.forgeProposals,
      resolveProjectId: createProjectResolver(config.projects ?? [], config.bindingsFile),
    })
    const disposers = [
      ctx.tools.register(tools.addTask),
      ctx.tools.register(tools.claimTask),
      ctx.tools.register(tools.submitTask),
      ctx.tools.register(tools.queryTask),
      ctx.tools.register(tools.createProposal),
      ctx.tools.register(tools.transitionProposal),
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
  { inject: ['forgeTasks', 'forgeProposals', 'tools', 'systemPrompt'] as const },
)

export default forgePlugin
export { FORGE_SECTION_NAME, FORGE_SECTION_ORDER, renderForgePipelineSection } from './prompt/index.js'
// M3 3.3：产品自建事件总线 + 日志监听器（logs/{slug}.jsonl 唯一写者）——挂接缝；
// emit 点随 3.4/3.5 工具路径接入（工具执行零日志代码）。
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
export { createForgeTools, createProjectResolver, FORGE_TOOL_NAMES } from './tools/index.js'
export type {
  ForgeTools,
  ForgeToolDeps,
  ForgeToolName,
  ProjectBinding,
  ProjectIdResolver,
  ToolSessionContext,
  WorkspaceNotRegisteredData,
} from './tools/index.js'
export { WorkspaceNotRegisteredError, isWorkspaceNotRegisteredError } from './tools/index.js'
export type { ForgeContextFace as PluginContextFace, ForgeToolDefinition } from './tools/index.js'
