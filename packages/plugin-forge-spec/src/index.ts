// @dsh-forge/plugin-forge-spec 插件定义（定位：装配；plugin-forge / knowledge index.ts
// 同型——3.7 物理挂载[仅远征组合：expedition.patch.yml 行 + customSkillDirs spec 目录]）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeFeatures', 'forgeTasks', 'tools', 'systemPrompt'] —— 对 core 的
//   依赖 = 两域服务（Interface 1 类型，contracts 单一来源；运行期 inject 解析，
//   零实现级 import，Hard Rule）。forgeTasks 面 = validateFeatureTasks 只读校验
//   （Interface 1「签名不变」钉在任务域服务——Layer Placement inject 简写的勘正）；
//   tools / systemPrompt 为 dsh 官方面（非 core）。
// 装配：三 tool 注册（tools.register——名 = 动词透传）+ forge:spec 段注册
// （systemPrompt.section，order 520）；交出合并 disposer（fiber 卸载即全注销）。
// projectId 解析缝 = bindingsFile 机制（cwd 数据缝——host 维护 {wsPath,projectId}
// JSON 经插件 config 进入，与 plugin-forge 行同源；生产端 3.7）。
import { SPEC_SECTION_NAME, SPEC_SECTION_ORDER, renderForgeSpecSection } from './prompt/index.js'
import { createForgeSpecTools, createProjectResolver } from './tools/index.js'
import type { ForgeSpecContextFace } from './tools/index.js'
import type { ProjectBinding } from './tools/index.js'

/** 插件配置（profile expedition.patch.yml 行 config；cwd 绑定数据经 boot overlay 注入） */
export interface ForgeSpecPluginConfig {
  /** 会话 cwd → projectId 绑定表（wsPath 与 projects.ws_path 同口径 canonical path） */
  projects?: readonly ProjectBinding[]
  /** 绑定表文件路径（host 装配方维护——tool 执行点惰性读取，条目优先于静态表） */
  bindingsFile?: string
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface ForgeSpecPlugin {
  (ctx: ForgeSpecContextFace, config?: ForgeSpecPluginConfig): () => void
  /** 依赖声明：声明服务齐备才加载（core 面 = forgeFeatures + forgeTasks 双服务） */
  readonly inject: readonly string[]
}

const forgeSpecPlugin: ForgeSpecPlugin = Object.assign(
  (ctx: ForgeSpecContextFace, config: ForgeSpecPluginConfig = {}): (() => void) => {
    const tools = createForgeSpecTools({
      features: ctx.forgeFeatures,
      tasks: ctx.forgeTasks,
      resolveProjectId: createProjectResolver(config.projects ?? [], config.bindingsFile),
    })
    const disposers = [
      ctx.tools.register(tools.registerFeature),
      ctx.tools.register(tools.upsertFeatureDoc),
      ctx.tools.register(tools.validateFeatureTasks),
      // 段文本 = 规格产出经 tool 读写状态层一段式（文档/任务/诊断三径）；不含 tool
      // 参数说明——dsh tool 注册面自带（防双源漂移，plugin-forge 段同纪律）
      ctx.systemPrompt.section({
        name: SPEC_SECTION_NAME,
        order: SPEC_SECTION_ORDER,
        text: renderForgeSpecSection(),
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  },
  { inject: ['forgeFeatures', 'forgeTasks', 'tools', 'systemPrompt'] as const },
)

export default forgeSpecPlugin
export { SPEC_SECTION_NAME, SPEC_SECTION_ORDER, renderForgeSpecSection } from './prompt/index.js'
export { createForgeSpecTools, createProjectResolver, FORGE_SPEC_TOOL_NAMES } from './tools/index.js'
export type {
  ForgeSpecTools,
  ForgeSpecToolDeps,
  ForgeSpecToolName,
  ProjectBinding,
  ProjectIdResolver,
  ToolSessionContext,
  WorkspaceNotRegisteredData,
} from './tools/index.js'
export { WorkspaceNotRegisteredError, isWorkspaceNotRegisteredError } from './tools/index.js'
export type { ForgeSpecContextFace as PluginContextFace, ForgeToolDefinition } from './tools/index.js'
