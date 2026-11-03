// @dsh-forge/knowledge 插件定义（定位：装配——3.4）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeKnowledge', 'tools', 'systemPrompt'] —— 对 core 的唯一依赖 =
//   forgeKnowledge 服务（Interface 2 类型，contracts 单一来源；运行期 inject 解析，
//   零实现级 import，AC3）；tools / systemPrompt 为 dsh 官方面（非 core）。
// 装配：两 tool 注册（tools/register）+ forge:knowledge 段注册
// （systemPrompt.section，order 500）+ knowledge.root 目录键声明（forgeDirs 服务键
// declare merge——forge-dirs-query-tool 1.2 首个第三方声明者）；交出合并 disposer
// （fiber 卸载即全注销）。
// projectId 解析缝：Interface 2 无路径反查、Hard Rule 禁第二 core 服务——绑定表经
// 插件 config 进入（会话 cwd → projectId；DF003 调用缝设计期定缝项）。
import type { KnowledgeContextFace } from './tools/index.js'
import { createKnowledgeTools, createProjectResolver } from './tools/index.js'
import type { ProjectBinding } from './tools/index.js'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './prompt/index.js'
import { joinDirSegment } from '@dsh-forge/path-key'

/** 插件配置（profile cordis.patch.yml 行 config；应用装配期路径经 boot overlay 注入） */
export interface KnowledgePluginConfig {
  /** 会话 cwd → projectId 绑定表（wsPath 与 projects.ws_path 同口径 canonical path） */
  projects?: readonly ProjectBinding[]
  /** 绑定表文件路径（host 装配方维护——tool 执行点惰性读取，条目优先于静态表；4.2） */
  bindingsFile?: string
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface KnowledgePlugin {
  (ctx: KnowledgeContextFace, config?: KnowledgePluginConfig): () => void
  /** 依赖声明：三服务齐备才加载（core 面 = forgeKnowledge 唯一） */
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
    const tools = createKnowledgeTools({
      knowledge: ctx.forgeKnowledge,
      resolveProjectId: createProjectResolver(config.projects ?? [], config.bindingsFile),
    })
    const disposers = [
      declareKnowledgeRootDirKey(ctx),
      ctx.tools.register(tools.search),
      ctx.tools.register(tools.readAbstract),
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
  { inject: ['forgeKnowledge', 'tools', 'systemPrompt'] as const },
)

export default knowledgePlugin
export { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './prompt/index.js'
export { createKnowledgeTools, createProjectResolver } from './tools/index.js'
export type { KnowledgeTools, KnowledgeToolDeps, ProjectBinding, ProjectIdResolver } from './tools/index.js'
export type { KnowledgeDirKeyDeclaration } from './tools/faces.js'
