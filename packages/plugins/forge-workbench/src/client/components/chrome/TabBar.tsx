/**
 * The workbench tab strip (task 5.1, ui-design 工作台内部结构; M3 revision
 * task 5.5): 概览 / 提案 / Feature / 任务 — the four page-map view keys
 * `workbench/overview|proposals|features|tasks` in the PRD's M3 order (提案
 * second, Feature third, tasks last; the「Feature」label normalized). This is
 * the presentation twin of the 3.3 view-key machine's tab dimension: every
 * activation routes through the machine's `selectWorkbenchTab` action
 * (persisted last tab; re-selecting a tab from its own `:slug` subview clears
 * the slug — the subview return stack), so the strip never keeps a second
 * tab state (task Hard Rule via the 3.3 contract).
 *
 * Keyboard (ui-design 全局规则, WAI-ARIA tabs pattern): Tab reaches the strip's
 * active tab only (roving tabindex); ArrowLeft/ArrowRight/Home/End move focus
 * and select — automatic activation, the same transitions a click performs.
 *
 * Task 5.5 also mounts the 工作台级审批指示 on the 任务 tab label: the 3.7
 * ApprovalCountBadge (warn capsule, top-right of the label's relative box,
 * N = 0 NOT rendered) so the pending signal stays visible from every tab —
 * the count itself is a CONTROLLED prop the shell feeds (task 3.7's contract).
 */
import { useRef, type KeyboardEvent } from 'react'
import { WORKBENCH_TABS, type WorkbenchTabKey } from '../../store/view-key'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from './ChromeButton'
import { ApprovalCountBadge } from '../../views/tasks/dispatch/ApprovalCountBadge'

/** The tab-strip rows: locale key + view key, in WORKBENCH_TABS order. */
export const TAB_LOCALE_KEYS: Record<WorkbenchTabKey, WorkbenchKey> = {
  'workbench/overview': 'tab.overview',
  'workbench/proposals': 'tab.proposals',
  'workbench/features': 'tab.features',
  'workbench/tasks': 'tab.tasks',
}

/** Inputs of {@link TabBar}. */
export interface TabBarProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The active workbench tab (the machine snapshot's `workbenchTab`). */
  activeTab: WorkbenchTabKey
  /** The machine's tab action — every activation (click or arrow) goes through here. */
  onSelect: (tab: WorkbenchTabKey) => void
  /**
   * The pending-approval count for the 任务 tab's warn badge (task 5.5 wiring
   * of the 3.7 component; the shell feeds the live workbench-level count).
   * Absent/0 → the badge renders nothing.
   */
  approvalCount?: number | undefined
}

const tabsStyle = {
  borderBottom: '1px solid var(--dsh-border-color, transparent)',
  display: 'flex',
  gap: '4px',
  padding: '6px 16px 0',
} as const

/** ui-design tab 条: text tab pad 8 14, r14; unselected = label-secondary. */
const tabStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  padding: '8px 14px',
  position: 'relative',
} as const

/** Selected tab: interactive-bg-hover fill + label-primary. */
const activeTabStyle = {
  ...tabStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontWeight: 500,
} as const

/**
 * The four-tab strip. `data-dsh-forge-tabs` / `data-dsh-forge-tab` are the
 * 3.3 test/e2e observation hooks — the attributes are contract, not deco.
 */
export function TabBar(props: TabBarProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = WORKBENCH_TABS.indexOf(props.activeTab)
    let next: number | undefined
    if (event.key === 'ArrowRight') next = (current + 1) % WORKBENCH_TABS.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + WORKBENCH_TABS.length) % WORKBENCH_TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = WORKBENCH_TABS.length - 1
    if (next === undefined) return
    event.preventDefault()
    // Automatic activation: the arrow performs the same machine transition a
    // click does, then parks focus on the newly selected tab.
    props.onSelect(WORKBENCH_TABS[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={props.t('tabs.label')}
      data-dsh-forge-tabs=""
      style={tabsStyle}
      onKeyDown={onKeyDown}
    >
      {WORKBENCH_TABS.map((tab, index) => (
        <ChromeButton
          key={tab}
          ref={(element) => { tabRefs.current[index] = element }}
          type="button"
          role="tab"
          aria-selected={props.activeTab === tab ? 'true' : 'false'}
          tabIndex={props.activeTab === tab ? 0 : -1}
          data-dsh-forge-tab={tab}
          style={props.activeTab === tab ? activeTabStyle : tabStyle}
          onClick={() => { props.onSelect(tab) }}
        >
          {props.t(TAB_LOCALE_KEYS[tab])}
          {tab === 'workbench/tasks' && (
            <ApprovalCountBadge t={props.t} count={props.approvalCount ?? 0} />
          )}
        </ChromeButton>
      ))}
    </div>
  )
}
