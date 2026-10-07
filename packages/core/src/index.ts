// @dsh-forge/core 插件定义（定位：装配；入口文件 index.ts——fix-35 与 knowledge=index.ts
// 对称化，contracts/path-key 同惯例）——注册 ctx.forgeProjects（2.2：registerProject
// 四步补偿链）与 ctx.forgeKnowledge（3.3 收口：Interface 2 全七法——rebuildIndex/search/
// readAbstract/listEntries/getEntryDetail/heatByEntry/sessionRecall）。M2（2.7）：tasksHome
// 注入时增注册四域服务 ctx.forgeTasks/forgeFeatures/forgeProposals/forgeDocs（装配壳 +
// 三小域实现；tasks 动词面 2.2–2.6 接线）——共享 ForgeWorkspaceStore 惰性多句柄 +
// 事件发射器装配单例；首建挂点 = 发现面只读扫描（交互二/三）。M3（2.7）：settingsFile
// 注入时增注册第七服务 ctx.forgeSettings（get/set 单门——UI 与 dispatchTask 同门消费，
// host 接线 = 3.8）。无逻辑：开句柄 → 注册服务 →
// 交出 disposer。
// 形态：Cordis Plugin.Function——loader 取 default 导出（exports.default ?? exports，上游核实）；
// inject 依赖声明（仅 workspaceRegistry 可用时加载）；返回句柄 disposer（fiber 卸载时关库，
// 单句柄生命周期）。core 不依赖 cordis 编译期包：ctx 以结构化最小面（CoreContextFace）消费，
// 运行期由 profile 装配注入；reflect.provide 即服务注册官方面（dsh Service 基类同径）。
import { dirname } from 'node:path'
import { openDatabase } from './db/index.js'
import { createProjectService } from './forge/project-service.js'
import type { WorkspaceRegistryPort, WorkspaceRenamePort } from './forge/registry.js'
import { createSettingsService } from './forge/settings/service.js'
import { createDocsService } from './forge/small-domains/docs.js'
import { createFeaturesService } from './forge/small-domains/features.js'
import { createProposalsService } from './forge/small-domains/proposals.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './forge/tasks/phase-deriver.js'
import { createTasksService } from './forge/tasks/service.js'
import { validateFeatureTasks } from './forge/tasks/validate.js'
import { recordWorkspaceKeyLog } from './forge/workspace/app-key-logs.js'
import { createDiscoveryFirstCreateHook } from './forge/workspace/discovery.js'
import { createForgeTaskEvents } from './forge/workspace/events.js'
import { deriveTaskStoreDir } from './forge/workspace/derive-dir.js'
import { createProjectRouting } from './forge/workspace/routing.js'
import { createWorkspaceStore, type ForgeWorkspaceStore } from './forge/workspace/store.js'
import { createKnowledgeService } from './knowledge/knowledge-service.js'

/** 插件配置（profile cordis.patch.yml 行 config；dbFile = state.db 绝对路径，{app-data}/dsh-forge/state.db） */
export interface CorePluginConfig {
  dbFile: string
  /**
   * M2 派生根 {dsh-forge-home}（1.4 缝——3.4 注入：env DSH_FORGE_TASKS_HOME > {userData}/
   * forge-workspaces；每工作区任务库 {tasksHome}/{flatten}@{hash8}/forge.db 的根）。
   * 缺席 = M2 面降级缺席（注册碰撞复检 + deriveTaskStoreDir 动词 + 四域服务
   * forgeTasks/forgeFeatures/forgeProposals/forgeDocs 均不装配），P1 行为零变化。
   */
  tasksHome?: string
  /**
   * M3 设置存储 {userData}/forge-settings.json（2.7——路径经 boot overlay 注 core 行 config，
   * bindingsFile 同型先例；host 注入面 = 3.8）。缺席 = forgeSettings 服务降级缺席
   * （六服务形制不动——与 tasksHome 两缝各自独立降级）；在场时路径守卫基准 =
   * dirname(dbFile)（state.db 与设置文件同居 userData——双注入缝交叉校验）。
   */
  settingsFile?: string
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
    // M3 第七服务（2.7 provide ×1）：构造先于开库——路径守卫坏装配即拒（fail-loud），
    // 不留中央库句柄。settingsFile 缺席 = forgeSettings 降级缺席（六服务形制不动）。
    const settings =
      config.settingsFile !== undefined
        ? createSettingsService({ settingsFile: config.settingsFile, userDataDir: dirname(config.dbFile) })
        : undefined
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
    if (settings !== undefined) {
      ctx.reflect.provide('forgeSettings', settings) // Interface 1（M3）设置域两法——单门读写（3.8 host 接线）
    }
    // M2 四域装配（2.7 provide ×4）：tasksHome 缺席 = 四域整体降级缺席（P1 行为零变化）。
    // 共享单例：中央行路由 + ForgeWorkspaceStore（惰性多句柄；首建挂点 = 发现面只读扫描——
    // 交互二「库文件缺席 → 新建 v1 + 发现面扫描」，P1 存量工作区升级 M2 首次触达补建；
    // 2.5 送校接线：post-ingestion 挂点 → 对新入库 feature 逐个送校 validateFeatureTasks
    // ——单 feature 子图（动词面恒单 feature），「增量集/批量」语义归本流程层闭包；发现违规
    // warn 记账工作区 app_key_logs（scope=tasks）。挂点为同步回调（discovery fail-soft
    // try/catch 包装），故直调 validate 同步核心而非 async 服务面——防逃逸 Promise 拒绝
    // 绕过记账；taskStore 闭包迟绑定（首建只可能发生于装配完成后的首次触达））+
    // 事件发射器（四域写动词 emitTasksChanged 同通道）。相位推导机经注入进入 features 域
    // （2.1 单源纯函数——四域互禁 import 彼此，装配层注入消 import 边）。
    const tasksHome = config.tasksHome
    let taskStore: ForgeWorkspaceStore | undefined
    if (tasksHome !== undefined) {
      const routing = createProjectRouting(db)
      const events = createForgeTaskEvents()
      const store = createWorkspaceStore({
        resolveDir: (projectId: string) => deriveTaskStoreDir(tasksHome, routing.wsPath(projectId)),
        onFirstCreate: createDiscoveryFirstCreateHook({
          resolveForgeDir: routing.forgeDir,
          onFeatureIngested: ({ projectId, featureSlug }) => {
            const wsDb = store.ensureOpen(projectId) // 首建挂点内重入——句柄已入表（store.ts 先 set 后跑协作者）
            const report = validateFeatureTasks({ store }, { projectId, featureSlug })
            if (report.violations.length > 0) {
              recordWorkspaceKeyLog(wsDb, {
                level: 'warn',
                scope: 'tasks',
                data: {
                  projectId,
                  featureSlug,
                  checked: report.checked,
                  violations: report.violations.map((v) => ({ kind: v.kind, message: v.message, taskRef: v.taskRef })),
                  disposition: '发现面送校发现违规——已记账（只读诊断，不阻断吸收）',
                },
              })
            }
          },
        }),
      })
      taskStore = store
      ctx.reflect.provide(
        'forgeTasks',
        createTasksService({ store, events, resolveWsPath: routing.wsPath }), // 十一法全接线（2.6 读面收口）
      )
      ctx.reflect.provide(
        'forgeFeatures',
        createFeaturesService({
          store,
          events,
          phase: { derivePhase: deriveFeaturePhase, assertPhaseInvariant },
        }),
      )
      ctx.reflect.provide(
        'forgeProposals',
        createProposalsService({ store, events, resolveForgeDir: routing.forgeDir }), // 2.3 文档区扫描基准
      )
      ctx.reflect.provide('forgeDocs', createDocsService({ store, resolveForgeDir: routing.forgeDir }))
    }
    return () => {
      taskStore?.dispose() // 每工作区任务库句柄统一关闭（3.4 接插件 disposer 前的进程内收口）
      db.close() // fiber disposer：卸载即关中央库
    }
  },
  { inject: ['workspaceRegistry', 'workspaceController'] as const },
)

export default corePlugin
