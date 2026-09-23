// @vitest-environment jsdom
import { act } from '@testing-library/react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersistedViewKey, WorkbenchKey } from '../src/client/index.ts'
import {
  ViewSwitchController, createViewKeyStore, en, installRailNav,
} from '../src/client/index.ts'

// Task 3.3 AC2 (降级 rail) + AC6 (aria/键盘) + Hard Rule (两形态行为契约逐项
// 一致): the rail's switching behavior is verified item by item against the
// SAME machine the slot path drives — same transitions, same persistence
// shape, same activation surface (native buttons: click/Enter/Space), same
// WorkbenchShell content. The live slot-path leg of the contract rides the
// e2e (forge-workbench-nav); a live rail boot cannot be forced without
// removing the upstream bundles (which kills the SPA the rail switches back
// into), so the rail's automated leg is this real-DOM jsdom mount.

// The upstream icons resolve through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps only the
// upstream monorepo supplies — the jsdom mount stubs the glyphs.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  IconNewChatOutline16: () => null,
  // Consumed by the tasks-seat board since task 5.5 (shell mount chain).
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// Since 5.6 the tasks tab's DEFAULT view is the DAG — the real ReactFlow
// needs d3-zoom + ResizeObserver (absent in jsdom), so the overlay's shell
// renders that mount through the lib-boundary standin (e2e rides real).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** Bind the en dictionary as the rail's translate. */
const t: TranslateNS<'workbench'> = ((key: WorkbenchKey) => en[key]) as TranslateNS<'workbench'>

/** A rail installation under test with its own machine + persistence record (act-flushed so the React 18 root has committed). */
async function mountRail(content: 'overlay' | 'chrome' = 'overlay', initial?: PersistedViewKey) {
  const writes: PersistedViewKey[] = []
  const store = createViewKeyStore({
    read: () => initial,
    write: (value) => { writes.push(value); initial = value },
  })
  const controller = new ViewSwitchController(store)
  const dispose = installRailNav({ controller, store, t, content })
  await act(async () => {})
  return { dispose, controller, store, writes }
}

const railRoot = (): HTMLElement | null => document.querySelector('[data-dsh-forge-rail-root]')
const rail = (): HTMLElement | null => document.querySelector('[data-dsh-forge-rail]')
const overlay = (): HTMLElement | null => document.querySelector('[data-dsh-forge-rail-overlay]')
const button = (target: 'session' | 'workbench'): HTMLButtonElement =>
  document.querySelector(`[data-dsh-forge-rail-button="${target}"]`) as HTMLButtonElement

afterEach(() => { document.body.innerHTML = '' })

describe('rail: mount and scoped chrome (AC2/AC6)', () => {
  it('renders the 48px left rail: tablist + two native buttons, DOM order 会话 → 工作台 (Tab 序)', async () => {
    await mountRail()
    expect(railRoot()).not.toBeNull()
    const column = rail() as HTMLElement
    expect(column.getAttribute('role')).toBe('tablist')
    expect(column.getAttribute('aria-label')).toBe(en['rail.label'])
    expect(column.style.width).toBe('48px')
    expect(column.style.position).toBe('fixed')
    expect(column.style.left).toBe('0px')
    const buttons = column.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect((buttons[0] as HTMLButtonElement).dataset.dshForgeRailButton).toBe('session')
    expect((buttons[1] as HTMLButtonElement).dataset.dshForgeRailButton).toBe('workbench')
    for (const node of buttons) {
      const el = node as HTMLButtonElement
      expect(el.tagName).toBe('BUTTON') // native activation: click / Enter / Space
      expect(el.getAttribute('role')).toBe('tab')
      expect(el.getAttribute('aria-label')).toBeDefined()
      expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'))
    }
  })

  it('injects NO stylesheet — every style is inline on plugin-owned elements (Hard Rule: 防污染上游界面)', async () => {
    await mountRail()
    expect(document.querySelectorAll('style')).toHaveLength(0)
    for (const element of (railRoot() as HTMLElement).querySelectorAll('*')) {
      expect((element as HTMLElement).getAttribute('class')).toBeNull()
    }
    expect((railRoot() as HTMLElement).style.display).toBe('contents')
  })
})

describe('rail: switching behavior — item-by-item identical to the slot path (AC2/AC4)', () => {
  it('click 工作台 → workbench view: persisted, overlay visible, shell mounted, aria-selected flipped', async () => {
    const { writes } = await mountRail()
    expect(button('workbench').getAttribute('aria-selected')).toBe('false')
    await act(async () => { button('workbench').click() })
    expect(button('workbench').getAttribute('aria-selected')).toBe('true')
    expect(button('session').getAttribute('aria-selected')).toBe('false')
    expect(writes.at(-1)).toEqual({ view: 'workbench', workbenchTab: 'workbench/overview' })
    const panel = overlay() as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.style.visibility).toBe('visible')
    expect(document.querySelector('[data-dsh-forge-shell]')).not.toBeNull()
  })

  it('click 会话 → session view: persisted, overlay faded, shell STAYS mounted (会话期内存保留)', async () => {
    const { writes } = await mountRail('overlay', { view: 'workbench', workbenchTab: 'workbench/tasks' })
    await act(async () => { button('session').click() })
    expect(writes.at(-1)).toEqual({ view: 'session', workbenchTab: 'workbench/tasks' })
    const panel = overlay() as HTMLElement
    expect(panel.style.visibility).toBe('hidden')
    expect(panel.style.opacity).toBe('0')
    expect(panel.style.transition).toContain('0.2s')
    // Retention: the shell is hidden, not unmounted — workbench state survives.
    expect(panel.querySelector('[data-dsh-forge-shell]')).not.toBeNull()
  })

  it('restores the persisted workbench view on mount — the same restart contract the slot carrier projects', async () => {
    await mountRail('overlay', { view: 'workbench', workbenchTab: 'workbench/features' })
    expect(button('workbench').getAttribute('aria-selected')).toBe('true')
    expect((overlay() as HTMLElement).style.visibility).toBe('visible')
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-features"]')).not.toBeNull()
  })

  it('the shell inside the overlay is the SAME component with the SAME face: tabs switch the mapped container', async () => {
    const { store } = await mountRail('overlay', { view: 'workbench', workbenchTab: 'workbench/overview' })
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]')).not.toBeNull()
    const tasksTab = document.querySelector('[data-dsh-forge-tab="workbench/tasks"]') as HTMLButtonElement
    expect(tasksTab.getAttribute('role')).toBe('tab')
    expect(tasksTab.getAttribute('aria-selected')).toBe('false')
    await act(async () => { tasksTab.click() })
    expect(tasksTab.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[data-dsh-forge-view="dsh-forge-view-tasks"]')).not.toBeNull()
    expect(store.getSnapshot().workbenchTab).toBe('workbench/tasks')
  })
})

describe('rail: modes and teardown', () => {
  it('chrome mode mounts no overlay (the keyed slot presents; the rail is only the visible toggle)', async () => {
    await mountRail('chrome')
    expect(rail()).not.toBeNull()
    expect(overlay()).toBeNull()
  })

  it('dispose unmounts the rail, removes the host, and detaches the carrier', async () => {
    const { dispose, controller } = await mountRail()
    expect(controller.form).toBe('rail')
    dispose()
    expect(controller.form).toBeUndefined()
    expect(railRoot()).toBeNull()
    expect(rail()).toBeNull()
  })
})
