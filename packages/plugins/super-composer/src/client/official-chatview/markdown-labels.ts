/**
 * 官方复制件（PROVENANCE 逐文件锚）：源位 ui-chat/src/client/markdown-labels.ts
 * @ deepseek-harness 0.2.0-rc.2（repo f059f01ce367748392d8f665c0705fb4302a626b，复制日期
 * 2026-10-22）；适配：ChatViewSlotProps['t'] 改走本地镜像面（chat/contract/slots.js），
 * 体逐字未改。
 */

/** Localized copy adapters for Cordis-free Markdown primitives. */

import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatTranslate } from './contract/slots.js'

/**
 * Build the complete Markdown chrome copy for one locale revision.
 * @param t - Chat locale seat.
 * @returns Labels for code fences and footnotes.
 */
export function markdownLabels(t: ChatTranslate): MarkdownLabels {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
    footnotes: t('markdown.footnotes'),
  }
}
