// host/dirs · forge:doc-style 系统提示段渲染（dual-mode-overhaul 模板化终版；
// plugin-project 1.12 目录事实面归拢 host/dirs——提案 §一裁决 3 + §「ADR 不在本包」：
// ADR 降为纯文件约定，目录 + 命名/结构约定入本提示段，agent 直接写文件、零服务零 tool
// 零插件面；自 plugin-forge prompt/index.ts git mv 迁入——标签包裹与文本零语义改动）。
import { XML_TAGS } from '@dsh-forge/contracts'

/** doc-style 独立段名（dual-mode-overhaul——文档风格公约拆段） */
export const FORGE_DOC_STYLE_SECTION_NAME = 'forge:doc-style'

/** doc-style 段序（510 之后相邻——双段同属 forge 系统提示面） */
export const FORGE_DOC_STYLE_SECTION_ORDER = 511

/**
 * doc-style 独立段全文（dual-mode-overhaul：文档风格公约从 forge-pipeline 段拆出——
 * XML_TAGS.docStyle 封闭集扩集；双模式共用注入，零入参，单模板字符串）。
 */
export function renderDocStyleSection(): string {
  // 标签行独立成 HTML 块（同 forge:pipeline——开标签后/闭标签前各留空行）。
  return `<${XML_TAGS.docStyle}>

## 文档风格公约

约束本工作区全部产出文档（含 PRD/走查记录/台账/README）：

- 图示优先用 mermaid（\`\`\`mermaid 代码块）；能用一张图说清的不用大段文字。
- 分点阐述：注意换行、逐点分行，不挤成一个大段落。
- 文字精简：只写结论与必要上下文，不复述代码与流程细节。
- 用词规范：不用怪词与生造词，用通用准确的技术表述。
- 不留调整修复叙事：不记录「改了哪里、为什么改、排查过程」等过程性内容，文档只呈现当前事实。

### ADR 文件约定（架构决策记录）

- ADR 为纯文件约定：落 \`{projectRoot}/.forge/adr/YYYY-MM-DD-{slug}.md\`（进 git），agent 直接写文件——零服务、零 tool、零插件面（文件即真源）。
- 文件名 = 日期 + slug（YYYY-MM-DD-{slug}.md）；正文轻量四段：背景 / 决策 / 理由 / 影响。

</${XML_TAGS.docStyle}>`
}
