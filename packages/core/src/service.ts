// @dsh-forge/core 插件定义（定位：装配）——注册 ctx.forgeProjects（2.2：registerProject
// 四步补偿链；ctx.forgeKnowledge 服务 3.x 知识域任务装配）。无逻辑：开句柄 → 注册服务 → 交出 disposer。
// 形态：Cordis Plugin.Function——loader 取 default 导出（exports.default ?? exports，上游核实）；
// inject 依赖声明（仅 workspaceRegistry 可用时加载）；返回句柄 disposer（fiber 卸载时关库，
// 单句柄生命周期）。core 不依赖 cordis 编译期包：ctx 以结构化最小面（CoreContextFace）消费，
// 运行期由 profile 装配注入；reflect.provide 即服务注册官方面（dsh Service 基类同径）。
import { openDatabase } from './db/index.js'
import { createProjectService } from './forge/project-service.js'
import type { WorkspaceRegistryPort } from './forge/registry.js'

/** 插件配置（profile cordis.patch.yml 行 config；dbFile = state.db 绝对路径，{app-data}/dsh-forge/state.db） */
export interface CorePluginConfig {
  dbFile: string
}

/** Cordis Context 的结构化装配消费面（真 Context 结构兼容，经 profile 装配注入） */
export interface CoreContextFace {
  workspaceRegistry: WorkspaceRegistryPort
  /** 服务注册官方面：provide(name, value) 返回注销器（Service 基类构造同径） */
  reflect: { provide(name: string, value?: unknown): unknown }
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface CorePlugin {
  (ctx: CoreContextFace, config: CorePluginConfig): () => void
  /** 依赖声明：仅 dsh workspaceRegistry 可用时本插件加载 */
  readonly inject: readonly string[]
}

const corePlugin: CorePlugin = Object.assign(
  (ctx: CoreContextFace, config: CorePluginConfig): () => void => {
    const db = openDatabase(config.dbFile) // 单 SQLite 句柄唯一创建口（db/ 前向门 + 迁移）
    ctx.reflect.provide('forgeProjects', createProjectService({ db, registry: ctx.workspaceRegistry }))
    return () => db.close() // fiber disposer：卸载即关库
  },
  { inject: ['workspaceRegistry'] as const },
)

export default corePlugin
