// doc-style 系统提示段渲染单源（plugin-spec 1.18 自 plugins/project/host/dirs/doc-style.ts
// 下沉——与 format/args/forge-paths 同族 tool 面共享原语：跨插件共享契约落 lib/api 单源，
// 禁插件间 import 域实现；project/spec 双侧改消费本单源，插件侧留 re-export 兼容面）。
// dual-mode-overhaul 模板化终版：ADR 降为纯文件约定，目录 + 命名/结构约定入本提示段，
// agent 直接写文件、零服务零 tool 零插件面；标签包裹与文本零语义改动。
// XML 标签本地图常量（lib/api 依赖铁律：运行期零包依赖——contracts 侧 xml-tags.test
// 以对检锚 pin DOC_STYLE_XML_TAG === XML_TAGS.docStyle，漂移即红）。

/** doc-style 裸标签名（与 @dsh-forge/contracts XML_TAGS.docStyle 对检 pin 同源） */
export const DOC_STYLE_XML_TAG = 'doc-style'

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
  return `<${DOC_STYLE_XML_TAG}>

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

</${DOC_STYLE_XML_TAG}>`
}
