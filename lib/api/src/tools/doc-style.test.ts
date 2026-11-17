// doc-style 系统提示段渲染单源单测（plugin-spec 1.18 自 plugins/project/host/dirs 下沉——
// 与 format/args/forge-paths 同族 tool 面共享原语）：段名/段序 pin + 渲染全文快照
// （迁移逐位等价锚——改文本即快照红，属契约面变更）。
import { describe, expect, it } from 'vitest'
import {
  DOC_STYLE_XML_TAG,
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  renderDocStyleSection,
} from './doc-style.js'

describe('renderDocStyleSection（doc-style 段单源）', () => {
  it('段名/段序/标签 pin（forge:doc-style / 511 / doc-style 裸标签）', () => {
    expect(FORGE_DOC_STYLE_SECTION_NAME).toBe('forge:doc-style')
    expect(FORGE_DOC_STYLE_SECTION_ORDER).toBe(511)
    expect(DOC_STYLE_XML_TAG).toBe('doc-style')
  })

  it('渲染全文快照（HTML 块形态：开标签后/闭标签前各留空行）', () => {
    expect(renderDocStyleSection()).toMatchInlineSnapshot(
      `
      "<doc-style>

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

      </doc-style>"
    `,
    )
  })
})
