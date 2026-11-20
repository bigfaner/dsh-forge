// PROVENANCE: 复制自官方 dsh 源码 ui-conversation/src/client/input/editor/DecoratorPortals.tsx @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）；升级需人工 re-copy，漂移自担。
/**
 * Decorator render loop: portals every decorator node's React face into its
 * host element (what @lexical/react's composer does internally, scoped to
 * this composer's needs). Chip DOM identity rides the NodeKey — text edits
 * around a chip never remount its portal.
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import type { LexicalEditor, NodeKey } from 'lexical'

/** Portal-loop props. */
export interface DecoratorPortalsProps {
  /** The bound editor; null (no-session) renders nothing. */
  readonly editor: LexicalEditor | null
}

/**
 * Render every decorator's React face into its editor host element.
 * @param props - the editor to observe.
 * @returns the live portal set.
 */
export function DecoratorPortals({ editor }: DecoratorPortalsProps): ReactNode {
  const [decorators, setDecorators] = React.useState<Record<NodeKey, React.JSX.Element>>(
    () => editor === null ? {} : editor.getDecorators<React.JSX.Element>(),
  )
  React.useLayoutEffect(() => {
    if (editor === null) return
    setDecorators(editor.getDecorators<React.JSX.Element>())
    return editor.registerDecoratorListener<React.JSX.Element>((next) => { setDecorators(next) })
  }, [editor])
  if (editor === null) return null
  return (
    <>
      {Object.entries(decorators).map(([key, jsx]) => {
        const el = editor.getElementByKey(key)
        return el === null ? null : createPortal(jsx, el, key)
      })}
    </>
  )
}
