// spec 插件装配面（plugin-spec 1.8——本批消费面 = 提示段注册）。
// A1 自含形态：提示段注册恒在（段注册无条件、text 运行期按装配求值——同构
// forge:doc-style 三先例）；presetBinding 注入判据由段 text 回调现求值承担
// （核销报告 research/official-verification.md §3）。包本体零预设知识——
// presetBinding 仅作不透明字符串透传。
import type { SpecContextFace } from './faces.js'
import {
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  FORGE_PIPELINE_SECTION_NAME,
  FORGE_PIPELINE_SECTION_ORDER,
  renderDocStyleSection,
  specPipelineSectionText,
} from './prompt/index.js'

// docs 读域（plugin-spec 1.10 收编——forgeDocs 双锚兼容读域出口；装配层 consume）
export { createDocsService, type DocsServiceDeps } from './docs/index.js'
export { DocPathInvalidError, type DocPathInvalidData } from './docs/errors.js'

/** spec 插件装配入参（spec 行 config；presetBinding 缺省 = 无条件注入） */
export interface SpecPluginConfig {
  /** forge 组合器（M5）经 config 约定缝下发的预设绑定值；缺省 = 无条件注入 */
  readonly presetBinding?: string
}

/**
 * 注册 spec 提示词面（forge:pipeline + forge:doc-style 两段；返回注销器——
 * 插件卸载级摘除）。
 */
export function registerSpecPromptSections(
  ctx: Pick<SpecContextFace, 'systemPrompt'>,
  config: SpecPluginConfig = {},
): () => void {
  const disposePipeline = ctx.systemPrompt.section({
    name: FORGE_PIPELINE_SECTION_NAME,
    order: FORGE_PIPELINE_SECTION_ORDER,
    text: (context) => specPipelineSectionText(context, { presetBinding: config.presetBinding }),
  })
  const disposeDocStyle = ctx.systemPrompt.section({
    name: FORGE_DOC_STYLE_SECTION_NAME,
    order: FORGE_DOC_STYLE_SECTION_ORDER,
    text: renderDocStyleSection(),
  })
  return () => {
    disposePipeline()
    disposeDocStyle()
  }
}
