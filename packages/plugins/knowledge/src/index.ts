// @dsh-forge/knowledge 插件定义（定位：装配——3.4；1.7 A2 服务切换：自有服务面）。
// 形态：Cordis Plugin.Function（loader 取 default 导出）：
//   inject = ['tools', 'systemPrompt'] —— 零 core 依赖（SC-2）：五通道供数 = 自有
//   'knowledge' 服务（reflect.provide；core 八法随迁 service/，自持库 storage/ 供数），
//   tools / systemPrompt 为 dsh 官方面。
// 装配：自持存储自启（失败/锚缺席 fail-soft 降级零注册）→ 'knowledge' 服务 provide →
// 六 tool 注册（tools/register——search/readAbstract/write/read/merge/revert，
// 裁决 #1 修订 2026-11-05：merge/revert 开为 agent tool）+ forge:knowledge 段注册（systemPrompt.section，
// order 500）+ knowledge.root 目录键声明（根 scope provide('dirKeys.knowledge', entries)
// 约定名——跨 scope 反向拉取终态缝，bug 04d445f4）；交出合并 disposer。
// projectId 解析缝（用户裁决 Q19）：纯 config 静态注入——config.projects 绑定表为唯一
// 数据源（bindingsFile 文件与刷新缝退役）；服务面两级解析 projectId→wsPath→注册行。
import { createKnowledgeTools, createProjectResolver, createWsPathResolver } from './tools/index.js'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './prompt/index.js'
import { createKnowledgeService } from './service/index.js'
import { startSelfHostedStorage } from './storage/index.js'
import { DIAG_EVENT, type DiagEventPayload } from '@dsh-forge/contracts'
import { joinDirSegment } from '@dsh-forge/path-key'
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

    // A2 服务切换：八法服务面 + stage② 写门三法（自持库供数 + 两级解析第一级 config 静态绑定表）
    const service = createKnowledgeService({
      db: storage.db,
      resolveWsPath: createWsPathResolver(config.projects ?? []),
      emit: diagEmit,
      ...(config.backflow !== undefined ? { backflow: config.backflow } : {}),
    })
    const tools = createKnowledgeTools({
      knowledge: service,
      resolveProjectId: createProjectResolver(config.projects ?? []),
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
      ctx.tools.register(tools.search),
      ctx.tools.register(tools.readAbstract),
      ctx.tools.register(tools.write),
      ctx.tools.register(tools.read),
      ctx.tools.register(tools.supersede),
      ctx.tools.register(tools.reinstate),
      // 段文本 = 契约内容源渲染（工具定义 + contracts 常量），不在此复述
      ctx.systemPrompt.section({
        name: KNOWLEDGE_SECTION_NAME,
        order: KNOWLEDGE_SECTION_ORDER,
        text: renderKnowledgeSection(tools),
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  },
  { inject: ['tools', 'systemPrompt'] as const },
)

export default knowledgePlugin
export { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './prompt/index.js'
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
