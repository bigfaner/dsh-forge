// PROVENANCE: 复制自官方 dsh 源码 ui-conversation/src/client/input/editor/reference-activation.ts @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）；升级需人工 re-copy，漂移自担。
/** Route composer clicks through the live reference owner without editing the draft. */
import {
  $getNearestNodeFromDOMNode, $getSelection, $isRangeSelection,
  CLICK_COMMAND, COMMAND_PRIORITY_LOW,
} from 'lexical'
import type { LexicalEditor } from 'lexical'
import type { ReferenceInsert } from '../../contract/draft-editor.js'
import { $isReferenceChipNode } from './chip-node.js'
import { TextRefNode } from './text-ref.js'

/**
 * Install preview activation for atomic chips and editable reference tokens.
 * @param editor - composer editor.
 * @param open - live source routing; false preserves ordinary editor handling.
 * @returns command disposer.
 */
export function registerReferenceActivation(
  editor: LexicalEditor,
  open: (source: string | undefined, reference: Pick<ReferenceInsert, 'ref' | 'appearance'>) => boolean,
): () => void {
  return editor.registerCommand(CLICK_COMMAND, (event) => {
    if (event.target === null || event.button !== 0 || event.detail > 1) return false
    const selection = $getSelection()
    if ($isRangeSelection(selection) && !selection.isCollapsed()) return false
    const node = $getNearestNodeFromDOMNode(event.target as Node)
    if ($isReferenceChipNode(node)) {
      if (node.isInvalid()) return false
      const appearance = node.getAppearance()
      return open(node.getSource(), { ref: node.getReference(), ...appearance === undefined ? {} : { appearance } })
    }
    return node instanceof TextRefNode && open(undefined, { ref: node.getTextContent() })
  }, COMMAND_PRIORITY_LOW)
}
