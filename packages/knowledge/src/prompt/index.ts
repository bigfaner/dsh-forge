// forge:knowledge 系统提示词段渲染（定位：业务——DF006）。
// 契约内容源渲染（AC5 / Hard Rule 2）：事实不自插件私藏——工具名/描述/参数说明
// 机械取自两 tool 定义对象（tools/ 单一来源），域层级上限等契约事实取自
// @dsh-forge/contracts 常量（frontmatter 契约单一来源）；本模块只提供连接性散文。
// 段文本三部分（任务 3.4）：知识库存在声明 + agentic search 流程指引 + 两 tool 用法。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——文本禁用裸 {{。
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import type { KnowledgeTools } from '../tools/index.js'

/** 段名（Interface 3 定死） */
export const KNOWLEDGE_SECTION_NAME = 'forge:knowledge'

/** 段序（Interface 3 定死：order 500，升序拼接） */
export const KNOWLEDGE_SECTION_ORDER = 500

/** 单 tool 参数行（参数说明机械取自定义——改定义即改提示词，无副本） */
function parameterLines(parameters: { properties: Readonly<Record<string, { type: string; description: string }>>; required?: readonly string[] }): string[] {
  const required = new Set(parameters.required ?? [])
  return Object.entries(parameters.properties).map(([key, prop]) => {
    const shape = prop.type === 'array' ? 'array of string' : prop.type
    const tag = required.has(key) ? 'required' : 'optional'
    return `  - ${key} (${shape}, ${tag}): ${prop.description}`
  })
}

/** 两 tool 用法说明（名称/描述/参数全部来自定义对象机械渲染） */
function renderToolUsage(tools: KnowledgeTools): string {
  return [tools.search, tools.readAbstract]
    .map((t) => `${t.name}: ${t.description}\n${parameterLines(t.parameters).join('\n')}`)
    .join('\n\n')
}

/**
 * 知识段全文（纯函数）。流程指引锚 PRD 流程三 / 召回飞轮流：
 * 先 search 相应域（域前缀可选、自主选域、省略 = 全域）→ 摘要先行 →
 * 按需 read-abstract → 与 grep/glob 同位自主编排；零命中回落常规检索原语。
 */
export function renderKnowledgeSection(tools: KnowledgeTools): string {
  const depth = String(FRONTMATTER_DOMAIN_MAX_DEPTH)
  return [
    '## Project knowledge base',
    '',
    'A project knowledge base may be registered for this workspace: curated project documents with summary-first abstracts, keyword tags, and domain classification (domains are directory paths of at most '
      + depth
      + ' levels). Prefer it as the first source for project conventions, decisions, and domain knowledge.',
    '',
    'Retrieval flow (agentic search):',
    '1. Call knowledge.search first when a question touches project knowledge. Pick the domain_prefix yourself from the question, or omit it to search all domains.',
    '2. Keep queries short and iterative: keyword tags narrow by exact match (all tags must hit) and text matches by substring — start with one high-signal term, then refine; a full question sentence rarely matches.',
    '3. Hits are summary-first: evaluate titles and summaries before reading further.',
    '4. Call knowledge.read-abstract with a hit\'s entry_id only when its summary is not enough; it never returns the full body.',
    '5. These knowledge tools sit alongside grep/glob as retrieval primitives — compose them freely, and fall back to regular file retrieval when the knowledge base has no relevant hits.',
    '',
    'Tools:',
    renderToolUsage(tools),
  ].join('\n')
}
