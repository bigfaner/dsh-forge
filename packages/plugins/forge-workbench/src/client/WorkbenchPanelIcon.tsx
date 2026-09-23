/**
 * The sidebar's workbench entry icon; the sidebar owns the button, label, and
 * selected state around it (same ownership split as ui-plugin-manager's
 * PluginsPanelIcon — the verbatim precedent).
 */
import type { ReactNode } from 'react'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchPanelIconProps } from './contract'

/**
 * Render the workbench glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function WorkbenchPanelIcon({ size }: WorkbenchPanelIconProps): ReactNode {
  return <IconBranchOutline16 size={size} />
}
