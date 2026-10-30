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
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openDatabase } from './db/index.js'
import { createProjectService } from './forge/project-service.js'
import type { WorkspaceRegistryPort, WorkspaceRenamePort } from './forge/registry.js'
import { createSettingsService } from './forge/settings/service.js'
import { createDocsService } from './forge/small-domains/docs.js'
import { createBugsService } from './forge/small-domains/bugs.js'
import { createCheckpointsService } from './forge/small-domains/implementation-checkpoints.js'
import { createFeaturesService, registerFeatureInTx } from './forge/small-domains/features.js'
import { createProposalsService } from './forge/small-domains/proposals.js'
import {
  readEvidencePointerState,
  writeEvidenceValidityStamp,
  type EvidencePointerIo,
  type EvidenceValidityStamp,
} from './forge/tasks/evidence-pointer.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './forge/tasks/phase-deriver.js'
import { createTasksService } from './forge/tasks/service.js'
import { validateFeatureTasks } from './forge/tasks/validate.js'
import { recordWorkspaceKeyLog } from './forge/workspace/app-key-logs.js'
import { createDiscoveryFirstCreateHook } from './forge/workspace/discovery.js'
import { createForgeTaskEvents } from './forge/workspace/events.js'
import { deriveTaskStoreDir } from './forge/workspace/derive-dir.js'
import { createProjectRouting } from './forge/workspace/routing.js'
import { renderWorkerContext } from './forge/workspace/worker-context.js'
import { createWorkspaceStore, type ForgeWorkspaceStore } from './forge/workspace/store.js'
import { createKnowledgeService } from './knowledge/knowledge-service.js'

// worker agent 级提示词（persona 组成矩阵——worker-lean-execution S2a）：
// plugin-forge spawn 链的唯一 persona 源（dispatch-core 消费；此前为死代码双源，接线收口）
export {
  composePersona,
  PERSONA_CORE_SECTION,
  ANTI_CHURN_ANCHORS,
  PERSONA_VARIANTS,
  CODING_STRATEGY_TYPES,
} from './forge/tasks/prompt/persona.js'

// git 身份探针默认实现（1.6——host bindings 刷新面 worktree→projectId 行的
// `git worktree list` 现算派生数据源；git 缺席/非 git 目录全 null fail-soft）。
export { createGitIdentityPort } from './forge/workspace/identity-anchor.js'

// —— 证据效度域生产取数（装配面 IO 收口——R1-major① f913fc49：同步 git/fs 出 core/
// evidence-pointer.ts，落本装配闭包；core 侧只剩比对纯函数 + io 注入编排）——

/**
 * 当前效度域取数（机械读侧——生产实现，装配面单源）：checkoutRoot 检出的 HEAD commit
 * （`git rev-parse HEAD`）+ pnpm-lock.yaml 基线签名（sha-256 前 16 hex）。任何一步故障
 * （非 git 检出/lock 缺席/exec 失败）= undefined——机制惰性（不判，形态兼容）。claim
 * 领取热路径经 resolveEvidencePointer 注入闭包间接消费，core 内零同步子进程直调。
 */
export function currentValidityDomain(checkoutRoot: string | undefined): EvidenceValidityStamp | undefined {
  if (checkoutRoot === undefined || checkoutRoot === '') return undefined
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: checkoutRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const baseline = createHash('sha256')
      .update(readFileSync(join(checkoutRoot, 'pnpm-lock.yaml')))
      .digest('hex')
      .slice(0, 16)
    if (head === '') return undefined
    return { head, baseline }
  } catch {
    return undefined
  }
}

/** 证据位生产 io（node:fs 适配 EvidencePointerIo 注入缝——UTF-8 文本三法） */
const evidencePointerIo: EvidencePointerIo = {
  exists: (path) => existsSync(path),
  readTextFile: (path) => readFileSync(path, 'utf8'),
  writeTextFile: (path, data) => writeFileSync(path, data, 'utf8'),
}

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
  /**
   * 官方 cordis 事件混入原型方法（Context.emit 结构缝——(event, payload) 双参形态）。
   * 原型方法经 cordis Proxy 陷阱放行（Reflect.has 沿原型链命中）；自定义虚构属性
   * （如 diagEmit）会触发 inject 陷阱装载崩（bug 590b8eff）。缺席 = 诊断缝降级缺席
   * （onDiag 不桥出，排序写面零 emit 零行为差异）。
   */
  emit?: (event: string, payload: unknown) => void
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
    // bug 4e25858a / 590b8eff：project-sort 埋点生产接线——core 不 import host，桥出责任在
    // 装配层：经 ctx 官方事件混入原型方法 emit（真 Context 的合法结构缝——自定义属性会触发
    // cordis inject 陷阱，见 CoreContextFace.emit 注），child.ts relayDiagOverBridge 已订阅
    // 'diag/log' 直落 main appender；process 域 'child' 与 diag-events.ts 现行口径一致
    // （core 插件行仅装载于 child profile 进程）。Root cause: 上一修以虚构属性 diagEmit
    // 当缝——真 cordis Context Proxy 对未声明属性即抛，插件装载崩（590b8eff）。
    const diagEmit = ctx.emit
    ctx.reflect.provide(
      'forgeProjects',
      createProjectService({
        db,
        registry: ctx.workspaceRegistry,
        rename: ctx.workspaceController,
        tasksHome: config.tasksHome, // 1.4 缝（可选）——3.4 装配 onRegistered 建库+扫描闭包
        onDiag:
          diagEmit === undefined
            ? undefined
            : (payload) => diagEmit('diag/log', { ...payload, process: 'child' }),
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
        createTasksService({
          store,
          events,
          resolveWsPath: routing.wsPath, // 十一法全接线（2.6 读面收口）
          // worker-exec-evidence-replay 1.3 + disc 效度戳：续跑指针探测 + 效度机械比对（claim
          // 领取瞬间证据位读取——容器库目录经 tasksHome + routing.wsPath 单源派生；checkoutRoot
          // = claim 入参检出根（循环/派发会话 worktree），缺席回落注册根，再缺席 = 机制惰性
          // 不判；fail-soft = 首跑零 <resume> 段；漂移 = stale 规则段强制重跑）
          resolveEvidencePointer: (projectId, slug, localId, checkoutRoot) => {
            const containerDir = deriveTaskStoreDir(tasksHome, routing.wsPath(projectId))
            const state = readEvidencePointerState(
              evidencePointerIo,
              containerDir,
              slug,
              localId,
              currentValidityDomain(checkoutRoot ?? routing.wsPath(projectId)),
            )
            return state.pointer === undefined ? undefined : { pointer: state.pointer, stale: state.stale }
          },
          // disc 效度戳写侧（submit-task 结算面）：resume.md 在盘才写 sidecar（HEAD + 基线签名
          // 单源取数同上——checkoutRoot = 结算会话检出 = worker 工作区根；fail-soft）
          stampEvidenceValidity: (input) => {
            writeEvidenceValidityStamp(
              evidencePointerIo,
              deriveTaskStoreDir(tasksHome, routing.wsPath(input.projectId)),
              input.slug,
              input.localId,
              currentValidityDomain(input.checkoutRoot) ?? { head: 'unknown', baseline: 'unknown' },
            )
          },
          // worker-lean-execution 追加轮：任务目录锚点节（容器目录树/logs 双锚——检出根唯一
          // 权威 = worker 会话 cwd（真根因裁决：WORKSPACE 锚点行砍除，见 worker-context.ts 头注）；
          // persona 通道 worker 独享；logsRoot = <任务库>/logs 与续跑指针共享 deriveTaskStoreDir
          // 单源锚，任务日志目录由渲染器派生 logsRoot/<slug>/<localId>；fail-soft）
          resolveWorkerContext: (projectId, source, localId) =>
            renderWorkerContext({
              forgeDir: routing.forgeDir(projectId),
              logsRoot: join(deriveTaskStoreDir(tasksHome, routing.wsPath(projectId)), 'logs'),
              localId,
              source,
            }),
        }),
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
        createProposalsService({
          store,
          events,
          resolveForgeDir: routing.forgeDir, // 2.3 文档区扫描基准
          registerFeatureInTx, // 2.2 成链内聚同事务核心（装配注边——四域互禁 import 消解）
        }),
      )
      ctx.reflect.provide('forgeDocs', createDocsService({ store, resolveForgeDir: routing.forgeDir }))
      // fix-bug 第五小域（bug 台账两写径 + listBugs）：recordBug/resolveBug 工具面 + RPC list 消费
      ctx.reflect.provide(
        'forgeBugs',
        createBugsService({ store, events, resolveWsPath: routing.wsPath }),
      )
      // 机械① 第六小域（forge-verification-hardening）：implementation_checkpoints 实现检查点
      // 流水三法（appendCheckpoint/ensureCheckpoint/listCheckpoints）——M5 标记域装配
      ctx.reflect.provide('forgeCheckpoints', createCheckpointsService({ store, events }))
    }
    return () => {
      taskStore?.dispose() // 每工作区任务库句柄统一关闭（3.4 接插件 disposer 前的进程内收口）
      db.close() // fiber disposer：卸载即关中央库
    }
  },
  { inject: ['workspaceRegistry', 'workspaceController'] as const },
)

export default corePlugin
