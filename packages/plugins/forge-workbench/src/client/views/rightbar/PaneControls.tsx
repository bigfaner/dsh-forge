/**
 * The C9 pane 头 (M4 task 4.4, ui-design §Component C9): the h32 bar every
 * FORGE-hosted split pane renders at the top of its body — 区名 + the
 * [拆出为窗口] 动作位 + [关闭]. Mounted by the board pane body
 * (RightbarTabs.tsx) while the split is ACTIVE (≥ 2 C9 panes, the 单 pane
 * default carries no pane 头); the chrome wraps AROUND the view, never into
 * it — the board body keeps feeding the SAME TasksView instance (AC5,
 * 功能面不缩水).
 *
 * The 动作位 is a RESERVED slot: [拆出为窗口] renders disabled with its
 * M4-4.3 tooltip until task 4.3 wires `onDetach` (多窗口 = the shell window
 * registry's verb; a reserved, visible, inert seat is the honest form — the
 * pane 头's shape ships complete, the action lands with its owner task).
 *
 * Upstream-hosted panes (the 会话旁置 `subagentchat` aside body is upstream
 * ui-subagent's — not a forge seat) carry no forge pane 头: their close rides
 * the native chip ×, and their detach joins the same 4.3 wiring through the
 * native tab-menu seat. 全部 pane 关闭 lands natively — the last non-guide
 * close collapses the column and the 活跃区 conversation is the single view
 * again (the model observes it; see tabs-model.ts).
 */
import type { ReactNode } from 'react'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { ghostButtonStyle } from '../tasks/launch/LaunchStates'
import type { SplitPaneView } from './tabs-model'
import type { WorkbenchKey } from '../../locale/en'

/** The translate seat the pane 头 reads (the plugin's own `t`). */
export type PaneControlsTranslate = (key: WorkbenchKey) => string

/** The pane 头's chrome geometry (h32, the C9 spec; hairline bottom edge). */
const PANE_HEADER_STYLE = {
  alignItems: 'center',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.35))',
  display: 'flex',
  gap: '8px',
  height: '32px',
  minHeight: '32px',
  padding: '0 4px 0 12px',
} as const

/** The 区名 (the pane's view name, 12/18 secondary — a region label, not a title). */
const REGION_NAME_STYLE = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '1 1 auto',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The pane 头's sm ghost button (h28 r14 — the ui-design ghost sm form). */
const paneButtonStyle = {
  ...ghostButtonStyle,
  height: '24px',
  padding: '0 8px',
  fontSize: '12px',
  lineHeight: '18px',
  flex: '0 0 auto',
} as const

/** The pane controls' props. */
export interface PaneHeaderProps {
  /** The plugin locale seat. */
  t: PaneControlsTranslate
  /** The pane's view (drives the 区名). */
  view: SplitPaneView
  /**
   * The [拆出为窗口] action — ABSENT = the reserved 动作位 (disabled + the
   * 4.3 tooltip); task 4.3's wiring supplies it.
   */
  onDetach?: (() => void) | undefined
  /** The [关闭] commit (closes the pane's tab; the native settle rules follow). */
  onClose: () => void
  /** Reserved-slot override for tests / the 4.3 wiring verification. */
  detachAvailable?: boolean | undefined
}

/**
 * The pane 头: 区名 + [拆出为窗口] 动作位 + [关闭] (h32). The [关闭] is a
 * native button — click / Enter / Space activation for free (ChromeButton).
 * @returns the bar.
 */
export function PaneHeader({ t, view, onDetach, onClose, detachAvailable }: PaneHeaderProps): ReactNode {
  const regionName = view === 'board' ? t('rightbar.split.pane.board') : t('rightbar.split.pane.sessionAside')
  const detachWired = detachAvailable === true || onDetach !== undefined
  return (
    <div data-dsh-forge-pane-header={view} style={PANE_HEADER_STYLE} role="group" aria-label={regionName}>
      <span data-dsh-forge-pane-region="" style={REGION_NAME_STYLE} title={regionName}>{regionName}</span>
      <ChromeButton
        type="button"
        data-dsh-forge-pane-detach=""
        disabled={!detachWired}
        aria-disabled={!detachWired}
        title={detachWired ? t('rightbar.split.pane.detach') : t('rightbar.split.pane.detachReserved')}
        aria-label={t('rightbar.split.pane.detach')}
        style={{ ...paneButtonStyle, ...(!detachWired ? { cursor: 'default', opacity: 0.5 } : {}) }}
        {...(onDetach === undefined ? {} : { onClick: onDetach })}
      >
        {t('rightbar.split.pane.detach')}
      </ChromeButton>
      <ChromeButton
        type="button"
        data-dsh-forge-pane-close=""
        aria-label={t('rightbar.split.pane.close')}
        title={t('rightbar.split.pane.close')}
        style={paneButtonStyle}
        onClick={onClose}
      >
        {t('rightbar.split.pane.close')}
      </ChromeButton>
    </div>
  )
}
