// forge:knowledge 系统提示词两段（定位：业务——stage③ C2 / 提案 §2.2 + §7 审核稿）。
// 两段函数化、独立注册、同生同退（无注册库整体不注入——text 空返 ''，空段在官方
// 装配渲染期自然消失）：
//   · 静态瘦身段 forge:knowledge（order 910）：XML 标签制固定文本，零工具说明
//     （工具加载由 dsh 机械承载——renderToolUsage 退役）；
//   · 动态域索引段 forge:knowledge-domains（order 911）：text 函数每 turn 实时
//     聚合顶域清单 `域名(N entries) — 简介`（降级 <无简介>；>10 截断 + 计数枚举行）。
// 两段经 scoped 注册缝随会话绑定注入（service/session-prompt.ts——AssembleContext
// 无会话信息，绑定经 session-bind 时刻 scoped 注册闭包承载）。
// 契约单一来源：域层级上限取 @dsh-forge/contracts 常量插值；本模块零工具定义引用。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——两段文本禁用裸 {{。
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import type { TopDomainStat } from '../service/internal.js'

/** 静态段名（提案 §7 审核稿定死） */
export const KNOWLEDGE_SECTION_NAME = 'forge:knowledge'

/** 静态段序（§2.2：910——原 500 与官方 FILE_REFERENCE 900 撞位已上移队尾区） */
export const KNOWLEDGE_SECTION_ORDER = 910

/** 动态域索引段名（提案 §7 审核稿定死） */
export const KNOWLEDGE_DOMAINS_SECTION_NAME = 'forge:knowledge-domains'

/** 动态段序（静态段紧后） */
export const KNOWLEDGE_DOMAINS_SECTION_ORDER = 911

/** 顶域清单行数上限（>10 截断并附被截域名计数枚举行——消盲区） */
export const KNOWLEDGE_DOMAINS_MAX_ROWS = 10

/**
 * 静态段全文（提案 §7 审核稿逐字——固定文本，零工具说明）。
 * 与动态段的协调：`<knowledge-domains>` 互指（同名标签互相指认）、
 * domain_prefix 指引与截断计数行同词、zero hits 诚实口径不承担兜底。
 */
export function renderKnowledgeStaticSection(): string {
  const depth = String(FRONTMATTER_DOMAIN_MAX_DEPTH)
  return [
    '<knowledge-base>',
    'A curated project knowledge base is registered for this workspace. It is the',
    'preferred source for project conventions, decisions, pitfalls, and domain',
    'knowledge — search it on demand before falling back to raw file retrieval.',
    'Hits are summary-first: judge from titles and summaries first, read deeper',
    'only when needed. Zero hits means zero hits — rephrase the query or switch',
    'retrieval primitives yourself.',
    '',
    'The registered top-level domains and their descriptions are listed in the',
    '<knowledge-domains> block below. Pass one as domain_prefix to narrow a search;',
    `sub-domains (up to ${depth} levels) are explorable the same way — a domain exists`,
    'when an entry is written into it.',
    '</knowledge-base>',
  ].join('\n')
}

/**
 * 动态域索引段全文（纯函数——行集由实时聚合的 TopDomainStat[] 供数）。
 * 行格式 `域名(N entries) — 简介`；简介缺席降级 `域名(N entries) — <无简介>`；
 * 单数 entry；count ≤ 0 域隐去（空域行保留于表、段内自然隐去）；
 * >10 顶域截断并附 `… and N more domains (search with domain_prefix)` 行。
 * 空行集 → 空串（段整体退场）。
 */
export function renderKnowledgeDomainsSection(stats: readonly TopDomainStat[]): string {
  const rows = stats.filter((s) => s.entryCount > 0)
  if (rows.length === 0) return ''
  const lines = rows.slice(0, KNOWLEDGE_DOMAINS_MAX_ROWS).map(
    (s) => `- ${s.domain}(${s.entryCount} ${s.entryCount === 1 ? 'entry' : 'entries'}) — ${s.description ?? '<无简介>'}`,
  )
  if (rows.length > KNOWLEDGE_DOMAINS_MAX_ROWS) {
    lines.push(`… and ${rows.length - KNOWLEDGE_DOMAINS_MAX_ROWS} more domains (search with domain_prefix)`)
  }
  return ['<knowledge-domains>', ...lines, '</knowledge-domains>'].join('\n')
}
