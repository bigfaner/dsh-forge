// @dsh-forge/knowledge 插件定义（定位：装配——3.4）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeKnowledge', 'tools', 'systemPrompt'] —— 对 core 的唯一依赖 =
//   forgeKnowledge 服务（Interface 2 类型，contracts 单一来源；运行期 inject 解析，
//   零实现级 import，AC3）；tools / systemPrompt 为 dsh 官方面（非 core）。
// 装配：两 tool 注册（tools/register）+ forge:knowledge 段注册
// （systemPrompt.section，order 500）；交出合并 disposer（fiber 卸载即全注销）。
// projectId 解析缝：Interface 2 无路径反查、Hard Rule 禁第二 core 服务——绑定表经
// 插件 config 进入（会话 cwd → projectId；DF003 调用缝设计期定缝项）。
import type { KnowledgeContextFace } from './tools/index.js'
import { createKnowledgeTools, createProjectResolver } from './tools/index.js'
import type { ProjectBinding } from './tools/index.js'
import { KNOWLEDGE_SECTION_NAME, KNOWLEDGE_SECTION_ORDER, renderKnowledgeSection } from './prompt/index.js'

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

const knowledgePlugin: KnowledgePlugin = Object.assign(
  (ctx: KnowledgeContextFace, config: KnowledgePluginConfig = {}): (() => void) => {
    const tools = createKnowledgeTools({
      knowledge: ctx.forgeKnowledge,
      resolveProjectId: createProjectResolver(config.projects ?? [], config.bindingsFile),
    })
    const disposers = [
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
