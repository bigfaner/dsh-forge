// forge:knowledge 系统提示词两段（定位：业务——stage③ C2 / 提案 §2.2 + §7 审核稿；
// 域细分改造 2026-11-05：静态段中文归档规则 + 动态段目录树渲染）。
// 两段函数化、独立注册、同生同退（无注册库整体不注入——text 空返 ''，空段在官方
// 装配渲染期自然消失）：
//   · 静态段 forge:knowledge（order 910）：XML 标签制固定文本，零工具说明
//     （工具加载由 dsh 机械承载——renderToolUsage 退役）+ 归档规则块（rubric——
//     固定规则零 turn 态，放静态段零注入成本；动态段只做一行指认）；
//   · 动态域索引段 forge:knowledge-domains（order 911）：text 函数每 turn 实时
//     聚合域树（DomainIndexRow[]——目录树渲染：顶域主行 + 子域缩进行；简介有则
//     展示无则省略；双限截断）。
// 两段经 scoped 注册缝随会话绑定注入（service/session-prompt.ts——AssembleContext
// 无会话信息，绑定经 session-bind 时刻 scoped 注册闭包承载）。
// 契约单一来源：域层级上限取 @dsh-forge/contracts 常量插值；本模块零工具定义引用。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——两段文本禁用裸 {{。
import { FRONTMATTER_DOMAIN_MAX_DEPTH } from '@dsh-forge/contracts'
import type { DomainIndexRow } from '../service/internal.js'

/** 静态段名（提案 §7 审核稿定死） */
export const KNOWLEDGE_SECTION_NAME = 'forge:knowledge'

/** 静态段序（§2.2：910——原 500 与官方 FILE_REFERENCE 900 撞位已上移队尾区） */
export const KNOWLEDGE_SECTION_ORDER = 910

/** 动态域索引段名（提案 §7 审核稿定死） */
export const KNOWLEDGE_DOMAINS_SECTION_NAME = 'forge:knowledge-domains'

/** 动态段序（静态段紧后） */
export const KNOWLEDGE_DOMAINS_SECTION_ORDER = 911

/** 动态段内容行总量上限（含顶域主行与子域行，不含首尾标签与指认行；超限附计数行） */
export const KNOWLEDGE_DOMAINS_MAX_ROWS = 28

/** 单顶域行配额（主行 1 + 子域行至多 5；超配子域按计数降序截并附计数行） */
export const KNOWLEDGE_DOMAINS_ROWS_PER_TOP = 6

/**
 * 静态段全文（固定文本，零工具说明）。归档规则块 = 沉淀归档 rubric（圆桌裁决
 * 2026-11-05：机制不强制归档、agent 自判按本规则执行——判据缺口靠打磨判据，
 * 不靠加深层级）。与动态段的协调：`<knowledge-domains>` 互指（同名标签互相
 * 指认）、domain_prefix 指引与动态段指认行同词、zero hits 诚实口径不承担兜底。
 */
export function renderKnowledgeStaticSection(): string {
  const depth = String(FRONTMATTER_DOMAIN_MAX_DEPTH)
  return [
    '<knowledge-base>',
    '本项目已注册知识库，收录项目的约定、决策、常见错误、事实与示例：先检索知识库，',
    '再退回原始文件查找。',
    '',
    '检索方法（每次检索遵循，按优先序）：',
    '- knowledge_search 摘要优先命中：keywords 为精确 AND 标签，只传一两个高置信词；',
    '  text 用单个高信号词或短语，不用整句查询。',
    '- 已注册域及其简介列于下文 <knowledge-domains> 块，域名作为 domain_prefix 传入',
    '  以收窄范围；域目录全量查询用 knowledge_browse 工具（depth 封顶层级 / keyword',
    '  过滤域路径与简介）。',
    '- 命中后先读摘要，必要时才读正文；零命中即零命中——自行改写查询词或换检索手段，',
    '  连续改写仍零命中才可断言「知识库无此内容」。',
    '',
    '子域最多 ' + depth + ' 级，写入即存在。',
    '',
    '归档规则（每次写入均须遵循）：',
    '- 归入与主题匹配的最深既有子域；仅当无父域容纳时才新建子域。',
    '- 子域名须自释义（如 lessons/windows）：无简介时选域只凭域名。',
    '- 子域超过约 30 篇且出现明显子簇才分裂；禁止预建空架子；层级上限 ' + depth + ' 级。',
    '- 两个候选域间犹豫时归父域，靠关键词区分——缺口靠打磨判据，不靠加深层级。',
    '- 新建子域后立即用域描述工具补写简介。',
    '</knowledge-base>',
  ].join('\n')
}

/** 单条索引行渲染（顶域主行 `路径(N 篇) — 简介`；简介缺席降级 `<无简介>`） */
function topLineOf(row: DomainIndexRow): string {
  const n = `${row.entryCount} 篇`
  return row.description !== null ? `${row.domainPath}(${n}) — ${row.description}` : `${row.domainPath}(${n}) — <无简介>`
}

/** 子域行渲染（叶名 + 树形连接符，两空格/层缩进；简介有则附、无则省） */
function childLineOf(row: DomainIndexRow, isLast: boolean): string {
  const indent = '  '.repeat(row.depth - 1)
  const connector = isLast ? '└─ ' : '├─ '
  const n = `${row.entryCount} 篇`
  const leaf = row.domainPath.split('/').pop() ?? row.domainPath
  const desc = row.description !== null ? ` — ${row.description}` : ''
  return `${indent}${connector}${leaf}(${n})${desc}`
}

/** 单顶域块行集（主行 + 子域行；子域超配额按计数降序截并附 `… 还有 N 个子域` 行） */
function topBlockOf(top: DomainIndexRow, descendants: readonly DomainIndexRow[]): string[] {
  const quota = KNOWLEDGE_DOMAINS_ROWS_PER_TOP - 1 // 主行占 1
  const kept = [...descendants]
    .sort((a, b) => b.entryCount - a.entryCount || (a.domainPath < b.domainPath ? -1 : 1))
    .slice(0, quota)
  const hidden = descendants.length - kept.length
  const lines = [topLineOf(top)]
  kept.forEach((row, i) => {
    lines.push(childLineOf(row, i === kept.length - 1 && hidden === 0))
  })
  if (hidden > 0) {
    const indent = '  '.repeat(descendants[0]!.depth - 1)
    lines.push(`${indent}└─ … 还有 ${hidden} 个子域`)
  }
  return lines
}

/**
 * 动态域索引段全文（纯函数——行集由实时聚合的 DomainIndexRow[] 供数，目录树形态）。
 * 顶域行顶格、子域两空格/层缩进（├─/└─ 按兄弟位置）；子域简介有则展示、无则省略；
 * 双限截断：单顶域配额 KNOWLEDGE_DOMAINS_ROWS_PER_TOP、总量 KNOWLEDGE_DOMAINS_MAX_ROWS
 * （超总量顶域整块截并附 `… 还有 N 个域` 计数行）；段尾固定指认行（归档规则在静态段 +
 * 子域 prefix 构成规则）。count ≤ 0 域隐去；空行集 → 空串（段整体退场）。
 */
export function renderKnowledgeDomainsSection(rows: readonly DomainIndexRow[]): string {
  const active = rows.filter((r) => r.entryCount > 0)
  if (active.length === 0) return ''
  const tops = active.filter((r) => r.depth === 1)
  const lines: string[] = []
  let skippedTops = 0
  for (const top of tops) {
    const descendants = active.filter((r) => r.depth > 1 && r.domainPath.startsWith(`${top.domainPath}/`))
    const block = topBlockOf(top, descendants)
    if (lines.length > 0 && lines.length + block.length > KNOWLEDGE_DOMAINS_MAX_ROWS) {
      skippedTops += 1
      continue
    }
    lines.push(...block)
  }
  if (skippedTops > 0) lines.push(`… 还有 ${skippedTops} 个域（用 domain_prefix 检索）`)
  lines.push('归档规则：见上文 knowledge-base 块。子域 domain_prefix = 父路径/名称。')
  // 树体包 fenced code block：轨迹面板系统提示词 tab 走 MarkdownText 渲染（markdown 折叠
  // 段内单换行），fence 保树形换行双面可见（模型侧块结构 + 人侧目录树形态）。
  return ['<knowledge-domains>', '```text', ...lines, '```', '</knowledge-domains>'].join('\n')
}
