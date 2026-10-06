// @dsh-forge/core 插件定义（定位：装配；入口文件 index.ts——fix-35 与 knowledge=index.ts
// 对称化，contracts/path-key 同惯例）——注册 ctx.forgeProjects（2.2：registerProject
// 四步补偿链）与 ctx.forgeKnowledge（3.3 收口：Interface 2 全七法——rebuildIndex/search/
// readAbstract/listEntries/getEntryDetail/heatByEntry/sessionRecall）。无逻辑：开句柄 →
// 注册双服务 → 交出 disposer。
// 形态：Cordis Plugin.Function——loader 取 default 导出（exports.default ?? exports，上游核实）；
// inject 依赖声明（仅 workspaceRegistry 可用时加载）；返回句柄 disposer（fiber 卸载时关库，
// 单句柄生命周期）。core 不依赖 cordis 编译期包：ctx 以结构化最小面（CoreContextFace）消费，
// 运行期由 profile 装配注入；reflect.provide 即服务注册官方面（dsh Service 基类同径）。
import { openDatabase } from './db/index.js'
import { createProjectService } from './forge/project-service.js'
import type { WorkspaceRegistryPort, WorkspaceRenamePort } from './forge/registry.js'
import { createKnowledgeService } from './knowledge/knowledge-service.js'

/** 插件配置（profile cordis.patch.yml 行 config；dbFile = state.db 绝对路径，{app-data}/dsh-forge/state.db） */
export interface CorePluginConfig {
  dbFile: string
  /**
   * M2 派生根 {dsh-forge-home}（1.4 缝——3.4 注入：env DSH_FORGE_TASKS_HOME > {userData}/
   * forge-workspaces；每工作区任务库 {tasksHome}/{flatten}@{hash8}/forge.db 的根）。
   * 缺席 = M2 面（注册碰撞复检 + deriveTaskStoreDir 动词）降级缺席，P1 行为零变化。
   */
  tasksHome?: string
}

/** Cordis Context 的结构化装配消费面（真 Context 结构兼容，经 profile 装配注入） */
export interface CoreContextFace {
  workspaceRegistry: WorkspaceRegistryPort
  /** dsh workspaceController 窄面（官方 workspace/rename——fix-24 ② 注册时标题对齐项目名） */
  workspaceController: WorkspaceRenamePort
  /** 服务注册官方面：provide(name, value) 返回注销器（Service 基类构造同径） */
  reflect: { provide(name: string, value?: unknown): unknown }
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface CorePlugin {
  (ctx: CoreContextFace, config: CorePluginConfig): () => void
  /** 依赖声明：dsh workspaceRegistry + workspaceController 双服务可用时本插件加载 */
  readonly inject: readonly string[]
}

const corePlugin: CorePlugin = Object.assign(
  (ctx: CoreContextFace, config: CorePluginConfig): () => void => {
    const db = openDatabase(config.dbFile) // 单 SQLite 句柄唯一创建口（db/ 前向门 + 迁移）
    ctx.reflect.provide(
      'forgeProjects',
      createProjectService({
        db,
        registry: ctx.workspaceRegistry,
        rename: ctx.workspaceController,
        tasksHome: config.tasksHome, // 1.4 缝（可选）——3.4 装配 onRegistered 建库+扫描闭包
      }),
    )
    ctx.reflect.provide('forgeKnowledge', createKnowledgeService({ db })) // Interface 2 全七法（3.3 收口）
    return () => db.close() // fiber disposer：卸载即关库
  },
  { inject: ['workspaceRegistry', 'workspaceController'] as const },
)

export default corePlugin
