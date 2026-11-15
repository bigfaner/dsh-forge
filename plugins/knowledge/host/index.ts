// @dsh-forge/knowledge 插件定义（定位：装配——3.4；1.7 A2 服务切换：自有服务面）。
// 形态：Cordis Plugin.Function（loader 取 default 导出）：
//   inject = ['tools', 'systemPrompt', 'connection', 'workspaceRegistry'] —— 零 core 依赖（SC-2）：五通道供数 = 自有
//   'knowledge' 服务（reflect.provide；core 八法随迁 service/，自持库 storage/ 供数），
//   tools / systemPrompt 为 dsh 官方面；connection = fix-9 /api 共享通道 interceptor 注册边
//   （knowledge.*/projects.* 端点——UI 数据层官方宿主正缝，host/connection-rpc.ts）；
//   workspaceRegistry = fix-9 projects 端点官方宿主数据源边（具名服务消费以 inject 声明
//   承担——project host 同款先例；运行期存在性检查仍承担 fail-soft）。
// 装配：自持存储自启（失败/锚缺席 fail-soft 降级零注册）→ 'knowledge' 服务 provide →
// 六 tool 注册（tools/register——search/readAbstract/write/read/supersede/reinstate，
// 裁决 #1 修订 2026-11-05：supersede/reinstate 开为 agent tool）+ 提示词两段装配：
// 静态段 forge:knowledge(910) 全局注册（fix-11 裁决 B 侧 Interface 3 静态注册——
// plugin load 时点先于一切会话装配，首轮请求即在场；bug be4bac44 判例）+ 动态段
// forge:knowledge-domains(911) scoped 接线（stage③ C2：agent/created 时刻在该会话
// scope 注册——service/session-prompt.ts）+
// knowledge.root 目录键声明（根 scope provide('dirKeys.knowledge', entries)
// 约定名——跨 scope 反向拉取终态缝，bug 04d445f4）；交出合并 disposer。
// projectId 解析缝（用户裁决 Q19）：纯 config 静态注入——config.projects 绑定表为唯一
// 数据源（bindingsFile 文件与刷新缝退役）；服务面两级解析 projectId→wsPath→注册行。
import { createKnowledgeTools, createProjectResolver, createWsPathResolver } from './tools/index.js'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeStaticSection } from './prompt/index.js'
import type { ProjectIdResolver, WsPathResolver } from './tools/index.js'
import { domainTreeIndexOf } from './service/internal.js'
import { registerKnowledgeScopedPrompt } from './service/session-prompt.js'
import { createKnowledgeService } from './service/index.js'
import {
  startSelfHostedStorage,
  resolveKnowledgeDbFile,
  globalKnowledgeDir,
} from './storage/index.js'
import { dirname } from 'node:path'
import { DIAG_EVENT, type DiagEventPayload } from '@dsh-forge/contracts'
import { joinDirSegment } from '@dsh-forge/path-key'
import { defaultKnowledgeDirOf, resolveKnowledgeDir, type KnowledgeDirSetting } from './knowledge-dir.js'
import {
  isForgeProjectsSource,
  isWorkspaceRegistryFace,
  registryProjectsSource,
  registerKnowledgeConnectionRpc,
  type ForgeProjectsSource,
  type HostConnectionFace,
} from './connection-rpc.js'
import type { BackflowConfig } from './service/types.js'
import type { KnowledgeContextFace } from './tools/index.js'

/** 插件配置（profile cordis.patch.yml 行 config；应用装配期路径经 boot overlay 注入） */
export interface KnowledgePluginConfig {
  /**
   * 会话 cwd → projectId 绑定表（纯 config 静态注入——Q19 裁决；wsPath 与自持注册表
   * ws_path 同口径 canonical path）。服务面两级解析第一级（反向：projectId → wsPath）。
   */
  projects?: readonly import('./tools/index.js').ProjectBinding[]
  /**
   * 自持库文件路径（config 可配——裁决① 2026-11-19）；缺席按宿主数据域子目录缺省解析
   * （dsh-forge → 数据域根/knowledge/，dsh desktop → DSH_HOME/knowledge/）。
   * 自启缺席（裸环境）/开库失败 = fail-soft 零注册零供数（不向 ~/.dsh 静默落盘）。
   */
  dbFile?: string
  /**
   * 旧 core state.db 路径（种子迁移源——host 装配注入；缺席 = 常规路径零迁移）。
   * 轻量种子迁移（裁决 2026-11-19）：注册行唯一种子 / entries 零迁 / recall_logs best-effort。
   */
  legacyStateDb?: string
  /**
   * 回流配置面（stage② §2.4：阈值归插件 config，非代码常量——0.4/0.2 两档轻量索引
   * 回流的检索分阈 + 滞回（每对限次 + 冷却窗））。
   */
  backflow?: BackflowConfig
  /**
   * 项目知识目录覆盖面（1.5 提案项 4）：字面量（全项目单目录）或 per-project map
   * （键 = 项目工作区目录 projectDir/wsPath）。缺席 = 缺省 {projectDir}/.knowledge；
   * 非法值 = 消费点 fail-soft 回退缺省 + warn 埋点（不静默）。物化在消费点（读时
   * mkdir recursive——不在 apply 期预建，WYSIWYG + ACL 时序；解析纯函数见
   * host/knowledge-dir.ts）。
   */
  knowledgeDir?: KnowledgeDirSetting
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface KnowledgePlugin {
  (ctx: KnowledgeContextFace, config?: KnowledgePluginConfig): () => void
  /** 依赖声明：dsh 官方面齐备才加载（零 core 面） */
  readonly inject: readonly string[]
}

// ─────────────────── knowledge.root 目录键声明（forgeDirs declare merge 首个第三方声明者） ───────────────────

/** forgeDir 锚 → 工作区根（剥末段 .forge——forgeDirOfWorkspace 的逆向派生，纯字符串） */
export function workspaceRootOfForgeDir(forgeDir: string): string {
  const dir = forgeDir.replace(/[\\/]+$/, '')
  const root = dir.replace(/[\\/]\.forge$/, '')
  if (root === dir) {
    throw new Error(`knowledge: forgeDir anchor '${forgeDir}' missing trailing .forge segment`)
  }
  return root
}

/**
 * knowledge.root 声明项（工作区知识库根 .knowledge/——learn 技能三类沉淀所在；
 * dirKey 词汇进 forgeDirs 全量查询，description 与工具输出同源）。
 * resolve 纯函数零 IO：forgeDir 锚剥 .forge 段得工作区根，再连 .knowledge。
 */
export const KNOWLEDGE_ROOT_DIR_KEY = {
  dirKey: 'knowledge.root',
  description: '工作区知识库根（.knowledge/——conventions/lessons/examples 三类沉淀所在）',
  resolve: (ctx: { readonly forgeDir?: string }): string => {
    if (typeof ctx.forgeDir !== 'string' || ctx.forgeDir.trim() === '') {
      throw new Error('knowledge: knowledge.root resolve requires the forgeDir anchor (absent from resolve context)')
    }
    return joinDirSegment(workspaceRootOfForgeDir(ctx.forgeDir), '.knowledge')
  },
  declaredBy: 'knowledge',
} as const

/**
 * 装配期声明（bug 04d445f4 裁定：反向拉取缝——跨 scope 装配形态下推式注册不可达）：
 * knowledge 为全局 overlay 行（根 scope），plugin-forge 按会话隔离实例化——跨 scope 的
 * reflect.get / internal/service 事件均被隔离过滤。改为 knowledge 在根 scope
 * `reflect.provide('dirKeys.knowledge', entries)` 提供声明数组，plugin-forge 每次
 * forgeDirs/forgeResolvePath 查询时枚举 `dirKeys.*` 约定名现取（消费点现查，AGENTS 1.6）。
 * reflect/provide 缺席或抛 = 声明零生效零抛（fail-soft，不阻载本插件）。
 *
 * @returns provide 注销器（已当场 provide 时返回其注销器；缺席环境 no-op）——并入插件 disposers。
 */
const DIR_KEYS_SERVICE_NAME = 'dirKeys.knowledge'

/** knowledge 服务 provide 名（A2 服务切换：去 forge 前缀——host 在场判定/通道句柄同键） */
export const KNOWLEDGE_SERVICE_NAME = 'knowledge'

function declareKnowledgeRootDirKey(ctx: KnowledgeContextFace): () => void {
  const reflect = ctx.reflect
  const provide = reflect?.provide
  if (typeof provide !== 'function') return () => {}
  try {
    const dispose = provide.call(reflect, DIR_KEYS_SERVICE_NAME, [KNOWLEDGE_ROOT_DIR_KEY])
    return typeof dispose === 'function' ? () => dispose() : () => {}
  } catch {
    return () => {} // provide 抛（同名已注册等）= 零生效零抛
  }
}

const knowledgePlugin: KnowledgePlugin = Object.assign(
  (ctx: KnowledgeContextFace, config: KnowledgePluginConfig = {}): (() => void) => {
    // 诊断发射面（埋点经装配期注入——DIAG_EVENT 类型化 emit，host main 进程位）
    const diagEmit =
      typeof ctx.emit === 'function'
        ? (payload: DiagEventPayload) => ctx.emit!(DIAG_EVENT, { ...payload, process: 'main' })
        : undefined
    // 自持存储自启 + 首启轻量种子迁移（开库失败 fail-soft 降级零注册——锚缺席（裸环境）
    // 不自启，不向 ~/.dsh 静默落盘）
    const storage = startSelfHostedStorage(
      { dbFile: config.dbFile, legacyStateDb: config.legacyStateDb, emit: diagEmit },
    )
    if (storage === undefined) return () => {}

    // SC-1 全局库装配期自启注册（幂等——boot 时序先于服务消费：判例 5e5592dc 注册行
    // 缺 boot 回填致存量项目报不存在，全局行必须在本工厂同步段内落行）。全局目录 =
    // 库文件数据域根/knowledge-global/（与库文件同数据域派生——config.dbFile 显式时
    // 测试/替代宿主不写宿主缺省数据域）。失败 fail-soft + error 埋点，不阻载插件。
    try {
      const dbFilePath = resolveKnowledgeDbFile({ dbFile: config.dbFile })
      storage.registry.registerGlobalIfAbsent(
        globalKnowledgeDir(dirname(dirname(dbFilePath))),
        diagEmit,
      )
    } catch (cause) {
      diagEmit?.({
        event: 'knowledge-register',
        level: 'error',
        message: `全局库自启注册意外异常（fail-soft 不阻载）：${String(cause)}`,
        process: 'main',
        stack: cause instanceof Error ? cause.stack : undefined,
      })
    }

    // 两级解析器（config 静态绑定表 + 注册表行回退径——服务面第一级 + scoped 提示词接线共用）。
    // 回退径（bug：Q19 退役 host config.projects 注入后静态表恒空，工具面 cwd→projectId
    // 永远 miss → not bound）：注册表行（ws_path realpath canonical 键 → project_id）为
    // 动态事实源——host 注册链/boot 回填径（5e5592dc）落行后即解析可用。静态表优先（显式
    // config 注入仍是第一正径），miss 时回查注册表。
    const staticResolveProjectId = createProjectResolver(config.projects ?? [])
    const staticResolveWsPath = createWsPathResolver(config.projects ?? [])
    const resolveProjectId: ProjectIdResolver = (cwd) =>
      staticResolveProjectId(cwd) ?? storage.registry.findByWsPath(cwd)?.projectId ?? undefined
    const resolveWsPath: WsPathResolver = (projectId) =>
      staticResolveWsPath(projectId) ?? storage.registry.findByProjectId(projectId)?.wsPath ?? undefined
    // workspace 域 id 归一步（fix-10——bug bb11c53e）：官方宿主 projects 行 id = workspaceId
    // （workspaceRegistry 投影），不在绑定表/注册行 project_id 域——经 ctx.workspaceRegistry
    // 逐调用现查回查 workspace 行 path（AGENTS 1.6 检测永不缓存）；行缺席/面缺席/抛 = undefined
    // （服务面注册行缺席统一 fail-loud）。dsh-forge 集成宿主 forge projectId 先命中前两级，
    // 本步零参与零变化。
    const workspacePathOf = async (workspaceId: string): Promise<string | undefined> => {
      try {
        const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
        if (!isWorkspaceRegistryFace(registry)) return undefined
        return (await registry.get(workspaceId))?.path
      } catch {
        return undefined
      }
    }
    // 项目知识目录解析缝（1.5 提案项 4）：注册/收编消费点的缺省派生改经 config 纯解析
    // （host/knowledge-dir.ts resolveKnowledgeDir）；非法回退缺省 + warn 埋点（不静默）。
    // 目录物化仍在消费点（读时 mkdir recursive——apply 期零预建）。
    const resolveDefaultKnowledgeDir = (projectDir: string): string => {
      const dir = resolveKnowledgeDir(config, projectDir)
      if (dir !== undefined) return dir
      diagEmit?.({
        event: 'knowledge-dir',
        level: 'warn',
        message: `config.knowledgeDir 非法（回退缺省 {projectDir}/.knowledge）：projectDir=${projectDir}`,
        process: 'main',
      })
      return defaultKnowledgeDirOf(projectDir)
    }

    // A2 服务切换：八法服务面 + stage② 写门三法（自持库供数 + 两级解析第一级 config 静态绑定表）
    const service = createKnowledgeService({
      db: storage.db,
      resolveWsPath,
      resolveWorkspacePath: workspacePathOf,
      emit: diagEmit,
      resolveDefaultKnowledgeDir,
      ...(config.backflow !== undefined ? { backflow: config.backflow } : {}),
    })
    /** 注册库在场判定 + 顶域实时聚合（动态段 turn 期门控 + 供数面——静态段无条件注入） */
    const promptBindDeps = {
      isRegistered: (wsPath: string) => storage.registry.findByWsPath(wsPath) !== undefined,
      topDomains: (wsPath: string) => domainTreeIndexOf(storage.db, wsPath),
    }
    // fix-9 连接 RPC 数据源现查（逐调用现查不缓存——AGENTS 1.6）：① core forgeProjects
    // 具名服务（dsh-forge 集成态——core 行 provide，运营真源单源，与 preload 面同源）；
    // ② 官方 workspaceRegistry 投影（官方宿主——添加项目向导注册行；archived 概念缺席
    // 恒 false）。双缺 = undefined（projects 端点 typed 拒绝，knowledge 端点不受阻）。
    const projectsSourceOf = (): ForgeProjectsSource | undefined => {
      try {
        const raw: unknown = ctx.reflect?.get?.('forgeProjects')
        if (isForgeProjectsSource(raw)) return raw
      } catch {
        // 服务未 provide（官方宿主 core 行缺席）——回落 registry 投影
      }
      try {
        const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
        if (isWorkspaceRegistryFace(registry)) return registryProjectsSource(registry)
      } catch {
        // 服务缺席/劣形（inject 未声明宿主）——projects 端点 typed 拒绝
      }
      return undefined
    }
    // fix-9 连接 RPC 注册（官方 exact Fetch-route 缝——/api/knowledge.*|/api/projects.*
    // 逐 endpoint 一条 POST 精确路由，落座 = connection 服务内建表 + 既有 /api 共享路由
    // 分发，零 webServer 依赖；session-log-export 先例）。注册失败/连接面缺席 = 零注册
    // 零抛 fail-soft 不阻载，diag 留痕不静默——AGENTS §7。
    const connectionFace = (ctx as unknown as { connection?: HostConnectionFace }).connection
    const connectionDisposers: (() => void)[] = []
    if (connectionFace !== undefined && typeof connectionFace.fetch?.register === 'function') {
      try {
        const d = registerKnowledgeConnectionRpc(connectionFace, { service, projects: projectsSourceOf })
        connectionDisposers.push(d)
        diagEmit?.({
          event: 'knowledge-connection-rpc',
          level: 'info',
          message: '/api knowledge fetch routes registered（9 端点——connection.fetch.register 官方缝）',
          process: 'main',
        })
      } catch (cause) {
        diagEmit?.({
          event: 'knowledge-connection-rpc',
          level: 'warn',
          message: `/api 知识端点注册失败（fail-soft 零注册不阻载）：${String(cause)}`,
          process: 'main',
        })
      }
    } else {
      diagEmit?.({
        event: 'knowledge-connection-rpc',
        level: 'warn',
        message: 'ctx.connection.fetch.register 缺席——/api 知识端点零注册（UI 数据层回落宿主既有运输面）',
        process: 'main',
      })
    }
    const tools = createKnowledgeTools({
      knowledge: service,
      resolveProjectId,
      emit: diagEmit,
    })

    /** 'knowledge' 服务 provide（host servicesFace.get 消费；缺席 reflect 面 = 零供数不阻载） */
    function provideKnowledgeService(): () => void {
      const reflect = ctx.reflect
      const provide = reflect?.provide
      if (typeof provide !== 'function') return () => {}
      try {
        const dispose = provide.call(reflect, KNOWLEDGE_SERVICE_NAME, service)
        return typeof dispose === 'function' ? () => dispose() : () => {}
      } catch {
        return () => {} // provide 抛（同名已注册等）= 零生效零抛（fail-soft）
      }
    }

    const disposers = [
      () => storage.close(),
      provideKnowledgeService(),
      declareKnowledgeRootDirKey(ctx),
      // 静态段全局注册（fix-11 裁决 B 侧 Interface 3 静态注册——能力性指引固定文本零会话
      // 信息，plugin load 时点注册先于一切会话装配，首轮请求即在场；scoped 注册晚于会话
      // 首轮装配的判例 bug be4bac44——首个请求提示词不含后注册段）。动态域段走 scoped
      // 缝（session-prompt 接线），两段不双注入。
      ctx.systemPrompt.section({
        name: KNOWLEDGE_SECTION_NAME,
        order: KNOWLEDGE_SECTION_ORDER,
        text: renderKnowledgeStaticSection(),
      }),
      ctx.tools.register(tools.search),
      ctx.tools.register(tools.browse),
      ctx.tools.register(tools.readAbstract),
      ctx.tools.register(tools.write),
      ctx.tools.register(tools.read),
      ctx.tools.register(tools.supersede),
      ctx.tools.register(tools.reinstate),
      // stage③ C2 scoped 注册接线：session-bind 时刻在该会话 scope 注册
      // forge:knowledge(910)/forge:knowledge-domains(911) 两段（闭包捕获 ws_path、
      // 未绑定不注册、重绑随 scope 移除）；on 缺席（旧宿主/桩）= 零 scoped 接线 fail-soft
      ...(typeof ctx.on === 'function'
        ? [registerKnowledgeScopedPrompt({ on: ctx.on, resolveProjectId, resolveWsPath, ...promptBindDeps })]
        : []),
    ]
    return () => {
      for (const dispose of [...disposers, ...connectionDisposers]) dispose()
    }
  },
  { inject: ['tools', 'systemPrompt', 'connection', 'workspaceRegistry'] as const },
)

export default knowledgePlugin
export {
  KNOWLEDGE_DOMAINS_MAX_ROWS,
  KNOWLEDGE_DOMAINS_ROWS_PER_TOP,
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
  renderKnowledgeStaticSection,
} from './prompt/index.js'
export {
  bindKnowledgePromptSections,
  registerKnowledgeScopedPrompt,
} from './service/session-prompt.js'
export type { KnowledgePromptBindDeps, ScopedPromptWiringInput } from './service/session-prompt.js'
export { createKnowledgeTools, createProjectResolver, createWsPathResolver } from './tools/index.js'
export type {
  KnowledgeTools,
  KnowledgeToolDeps,
  ProjectBinding,
  ProjectIdResolver,
  WsPathResolver,
} from './tools/index.js'
export type { KnowledgeDirKeyDeclaration } from './tools/faces.js'
export {
  defaultKnowledgeDirOf,
  KNOWLEDGE_DIR_DEFAULT_SEGMENT,
  resolveKnowledgeDir,
} from './knowledge-dir.js'
export type { KnowledgeDirSetting } from './knowledge-dir.js'
export {
  createKnowledgeService,
  EntryNotFoundError,
  IndexStaleError,
  InvalidKnowledgeDirError,
} from './service/index.js'
export type {
  BackflowConfig,
  BrowseKnowledgeService,
  EntryAbstract,
  IndexReport,
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeRegistryWriter,
  KnowledgeService,
  KnowledgeServiceDeps,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  MergeSuggestion,
  NecessityAnswers,
  ReadAbstractQuery,
  RegisterProjectWrite,
  SearchHit,
  SearchQuery,
} from './service/index.js'
