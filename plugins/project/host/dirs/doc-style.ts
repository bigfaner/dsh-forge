// host/dirs · forge:doc-style 系统提示段——薄 re-export 兼容面（plugin-spec 1.18）：
// 渲染本体单源下沉 @dsh-forge/lib-api/tools/doc-style（与 format/args/forge-paths 同族），
// 本包消费 lib/api 单源并保持 host/dirs 出口形状不变（消费面零改动）。
export {
  DOC_STYLE_XML_TAG,
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  renderDocStyleSection,
} from '@dsh-forge/lib-api/tools/doc-style'
