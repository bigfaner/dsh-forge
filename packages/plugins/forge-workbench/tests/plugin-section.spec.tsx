// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginSection } from '../src/client/views/overview/PluginSection.tsx'
import { OverviewPage } from '../src/client/views/overview/OverviewPage.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import { MOCK_PLUGIN_ROWS, createMockPluginFace } from '../src/client/mocks/workbench.ts'
import type { PluginFace } from '../src/client/contract.ts'
import type { PluginRow } from '../src/client/ipc-types.ts'

// Task 5.12 — the UF6 plugin section BUILD units (mocked face; 5.13/5.14 wire
// the IPC verbs). AC map:
//   AC1 two-tier render matrix — mandatory rows (badge + status, ZERO
//      writable controls, SC6-1 DOM discipline) vs third-party rows (action)
//   AC2 the 启停 flow — disable via the double-confirm dialog, enable direct,
//      the verb's resolved rows drive the status migration, transitioning
//      spinner while in flight
//   AC3 空态 (mandatory-only) + loading + load-error states
//   AC4 guard-error readable mapping — ERR_PLUGIN_MANDATORY explains
//      不可禁用, ERR_PLUGIN_RUNTIME_STATE explains 已自动重建, generic falls back
//   AC5 dual theme (alias vars, no stylesheet) + keyboard reachability
//      (native buttons; dialog focus trap defaults to the safe cancel)
//   AC6 this suite itself + the face call shapes (5.7's 1:1 verb discipline)

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

/** The third-party fixture row (the togglable one). */
const HELLO = MOCK_PLUGIN_ROWS.find(row => row.name === '@dsh-forge/plugin-hello-world') as PluginRow
/** The mandatory fixture rows (the product manifest's set — no write control ever). */
const MANDATORY_ROWS = MOCK_PLUGIN_ROWS.filter(row => row.mandatory)

/** Deferred promise helper for driving in-flight verbs deterministically. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/**
 * A spied face over the real mock twin: every verb is asserted AND keeps the
 * Interface 1 semantics (the mandatory guard rejects ERR_PLUGIN_MANDATORY for
 * real). `.base` exposes the twin's mock-only failure pokes.
 */
function makeFace(initial: readonly PluginRow[] = MOCK_PLUGIN_ROWS) {
  const base = createMockPluginFace(initial)
  const face = {
    listPlugins: vi.fn(base.listPlugins),
    setPluginEnabled: vi.fn(base.setPluginEnabled),
  }
  return Object.assign(face, { base })
}

type SectionFace = ReturnType<typeof makeFace>

/** Render the section and settle the initial load. */
async function renderSection(face: SectionFace = makeFace(), tSeat = t.en) {
  render(<PluginSection t={tSeat} face={face} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-plugin-row]')).not.toBeNull()
  })
  return { face }
}

const rowOf = (name: string): HTMLElement =>
  document.querySelector(`[data-dsh-forge-plugin-row="${name}"]`) as HTMLElement

// The upstream StateDot resolves through the module table at runtime; the npm
// node entry carries undeclared transitive deps that only the upstream
// monorepo supplies, so the jsdom unit render stubs it (the overview.spec
// precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// AC1: the two-tier render matrix (SC6-1 DOM discipline)
// ---------------------------------------------------------------------------

describe('PluginSection: two-tier row matrix (AC1)', () => {
  it('mandatory rows: name + 「必备」badge + 已启用 status, and ZERO writable controls of any kind', async () => {
    await renderSection()
    expect(MANDATORY_ROWS.length).toBeGreaterThanOrEqual(3)
    for (const row of MANDATORY_ROWS) {
      const cell = rowOf(row.name)
      expect(cell.getAttribute('data-tier')).toBe('mandatory')
      // The tier badge — 「必备」中性填充 Pill.
      expect(cell.querySelector('[data-dsh-forge-plugin-mandatory-badge]')?.textContent)
        .toBe(en['overview.plugins.mandatoryBadge'])
      // The status cell carries the full label (StateDot's text redundancy).
      expect(cell.querySelector('[data-dsh-forge-plugin-status]')?.textContent)
        .toContain(en['overview.plugins.status.enabled'])
      // SC6-1 DOM discipline: no button, no input, no switch/checkbox — not
      // rendered-disabled, simply absent (Hard Rule: 零写控件入口).
      const writable = cell.querySelectorAll(
        'button, input, select, textarea, [role="switch"], [role="checkbox"], [href]',
      )
      expect(writable.length).toBe(0)
      expect(cell.querySelector('[data-dsh-forge-plugin-action]')).toBeNull()
    }
  })

  it('third-party rows: no tier badge, status + the 「禁用」action, and the injected-content hint line', async () => {
    await renderSection()
    const cell = rowOf(HELLO.name)
    expect(cell.getAttribute('data-tier')).toBe('third-party')
    expect(cell.getAttribute('data-enabled')).toBe('true')
    expect(cell.querySelector('[data-dsh-forge-plugin-mandatory-badge]')).toBeNull()
    expect(cell.querySelector('[data-dsh-forge-plugin-status]')?.textContent)
      .toContain(en['overview.plugins.status.enabled'])
    const action = cell.querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLButtonElement
    expect(action.tagName).toBe('BUTTON')
    expect(action.textContent).toBe(en['overview.plugins.action.disable'])
    // The sketch's second line: 第三方插件 · 禁用仅退出其注入内容.
    expect(cell.textContent).toContain(en['overview.plugins.thirdPartyHint'])
  })

  it('a disabled third-party row renders the 「启用」action and the secondary status text', async () => {
    const disabledRows = MOCK_PLUGIN_ROWS.map(row =>
      row.name === HELLO.name ? { ...row, enabled: false } : row,
    )
    await renderSection(makeFace(disabledRows))
    const cell = rowOf(HELLO.name)
    expect(cell.getAttribute('data-enabled')).toBe('false')
    expect(cell.querySelector('[data-dsh-forge-plugin-action="disable"]')).toBeNull()
    const action = cell.querySelector('[data-dsh-forge-plugin-action="enable"]') as HTMLButtonElement
    expect(action.textContent).toBe(en['overview.plugins.action.enable'])
    expect(cell.querySelector('[data-dsh-forge-plugin-status]')?.textContent)
      .toContain(en['overview.plugins.status.disabled'])
  })
})

// ---------------------------------------------------------------------------
// AC2: the 启停 flow (disable = double-confirm; enable = direct) + transitioning
// ---------------------------------------------------------------------------

describe('PluginSection: third-party toggle flow (AC2)', () => {
  it('disabling: the confirm dialog (r24 family) opens, cancel fires no verb and returns focus; confirm calls the verb with (name, false) and adopts the resolved rows', async () => {
    const { face } = await renderSection()
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)

    // The double-confirm: title + impact copy, safe-cancel default focus.
    const dialog = document.querySelector('[data-dsh-forge-dialog="plugins-disable-confirm"]') as HTMLElement
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(dialog.textContent).toContain(en['overview.plugins.confirm.title'])
    expect(dialog.textContent).toContain(en['overview.plugins.confirm.impact'])
    expect(document.activeElement?.getAttribute('data-dsh-forge-plugin-cancel')).toBe('')

    // Cancel: no verb, focus returns to the row's 禁用 trigger.
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-cancel]') as HTMLElement)
    expect(face.setPluginEnabled).not.toHaveBeenCalled()
    expect(dialog.isConnected).toBe(false)
    const back = rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement
    expect(document.activeElement).toBe(back)

    // Confirm: the verb fires with the exact Interface 1 shape, and the
    // RESOLVED rows drive the status migration (pending-then-refresh).
    fireEvent.click(back)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
    await waitFor(() => { expect(face.setPluginEnabled).toHaveBeenCalledWith(HELLO.name, false) })
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('false')
    })
    expect(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-status]')?.textContent)
      .toContain(en['overview.plugins.status.disabled'])
    expect(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="enable"]')?.textContent)
      .toBe(en['overview.plugins.action.enable'])
  })

  it('enabling: direct verb (no dialog), rows adopt the resolved state', async () => {
    const disabledRows = MOCK_PLUGIN_ROWS.map(row =>
      row.name === HELLO.name ? { ...row, enabled: false } : row,
    )
    const { face } = await renderSection(makeFace(disabledRows))
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="enable"]') as HTMLElement)
    expect(document.querySelector('[data-dsh-forge-dialog="plugins-disable-confirm"]')).toBeNull()
    await waitFor(() => { expect(face.setPluginEnabled).toHaveBeenCalledWith(HELLO.name, true) })
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('true')
    })
  })

  it('transitioning: the action button carries the spinner + aria-busy while the verb is in flight, and re-clicks are absorbed', async () => {
    const { face } = await renderSection()
    const gate = deferred<PluginRow[]>()
    face.setPluginEnabled.mockImplementationOnce(() => gate.promise)
    const trigger = rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement
    fireEvent.click(trigger)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)

    const busy = rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action]') as HTMLElement
    await waitFor(() => {
      expect(busy.querySelector('[data-dsh-forge-launch-spinner]')).not.toBeNull()
    })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    // A second activation while in flight is absorbed (single write in flight).
    fireEvent.click(busy)
    act(() => { gate.resolve(MOCK_PLUGIN_ROWS.map(row =>
      row.name === HELLO.name ? { ...row, enabled: false } : row,
    )) })
    await waitFor(() => { expect(face.setPluginEnabled).toHaveBeenCalledTimes(1) })
    await waitFor(() => {
      expect(rowOf(HELLO.name).querySelector('[data-dsh-forge-launch-spinner]')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// AC3: 空态 (mandatory-only) + loading + load-error
// ---------------------------------------------------------------------------

describe('PluginSection: empty / loading / error states (AC3)', () => {
  it('mandatory-only 空态: rows render + the quiet no-third-party hint, no error surface', async () => {
    await renderSection(makeFace(MOCK_PLUGIN_ROWS.filter(row => row.mandatory)))
    expect(document.querySelectorAll('[data-dsh-forge-plugin-row]')).toHaveLength(3)
    const hint = document.querySelector('[data-dsh-forge-plugins-empty-third-party]')
    expect(hint?.textContent).toBe(en['overview.plugins.emptyThirdParty'])
    expect(document.querySelector('[data-dsh-forge-plugins-error]')).toBeNull()
  })

  it('loading: the skeleton status block renders while listPlugins is in flight', async () => {
    const face = makeFace()
    const gate = deferred<readonly PluginRow[]>()
    face.listPlugins.mockImplementationOnce(() => gate.promise)
    render(<PluginSection t={t.en} face={face} />)
    const skeleton = document.querySelector('[data-dsh-forge-plugins-skeleton]') as HTMLElement
    expect(skeleton.getAttribute('role')).toBe('status')
    expect(skeleton.getAttribute('aria-label')).toBe(en['overview.plugins.loading'])
    expect(document.querySelector('[data-dsh-forge-plugin-row]')).toBeNull()
    act(() => { gate.resolve(MOCK_PLUGIN_ROWS) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugin-row]')).not.toBeNull()
    })
  })

  it('load error: the error card with retry; a retry re-lists and recovers', async () => {
    const face = makeFace()
    face.base.failListWith({ code: 'ERR_WORKBENCH_DB', message: 'build-stage mock: list boom' })
    render(<PluginSection t={t.en} face={face} />)
    const errorCard = await waitFor(() => {
      const card = document.querySelector('[data-dsh-forge-plugins-error]') as HTMLElement
      expect(card).not.toBeNull()
      return card
    })
    expect(errorCard.getAttribute('role')).toBe('alert')
    expect(errorCard.textContent).toContain(en['overview.plugins.loadError.title'])

    face.listPlugins.mockClear()
    fireEvent.click(document.querySelector('[data-dsh-forge-plugins-retry]') as HTMLElement)
    await waitFor(() => { expect(face.listPlugins).toHaveBeenCalledTimes(1) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugin-row]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// AC4: guard-error readable mapping (defense-in-depth's visible layer)
// ---------------------------------------------------------------------------

describe('PluginSection: toggle failure mapping (AC4)', () => {
  it('ERR_PLUGIN_MANDATORY: readable 不可禁用 copy + rows refreshed from listPlugins (the rejection leaves the row untouched)', async () => {
    const { face } = await renderSection()
    face.base.failWith(HELLO.name, {
      code: 'ERR_PLUGIN_MANDATORY',
      message: 'build-stage mock: guard says mandatory',
    })
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-toast]')?.textContent)
        .toContain(en['overview.plugins.err.mandatory'])
    })
    // 返回当前 PluginRow[] semantics: the section re-lists the authoritative rows.
    await waitFor(() => { expect(face.listPlugins).toHaveBeenCalledTimes(2) })
    await waitFor(() => {
      expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('true')
    })
  })

  it('ERR_PLUGIN_RUNTIME_STATE: the 已自动重建 copy + refresh', async () => {
    const { face } = await renderSection()
    face.base.failWith(HELLO.name, {
      code: 'ERR_PLUGIN_RUNTIME_STATE',
      message: 'build-stage mock: runtime json rebuilt',
    })
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-toast]')?.textContent)
        .toContain(en['overview.plugins.err.runtimeState'])
    })
    await waitFor(() => { expect(face.listPlugins).toHaveBeenCalledTimes(2) })
  })

  it('a generic rejection: the {message} failure toast, rows stay at the last good state', async () => {
    const { face } = await renderSection()
    face.base.failWith(HELLO.name, {
      code: 'ERR_WORKBENCH_DB',
      message: 'boom-7781',
    })
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
    await waitFor(() => {
      const toast = document.querySelector('[data-dsh-forge-plugins-toast]')
      expect(toast?.textContent).toContain('boom-7781')
    })
    expect(rowOf(HELLO.name).getAttribute('data-enabled')).toBe('true')
  })

  it('the toast is explicit-dismiss only (role=status), and dismissing clears it', async () => {
    const { face } = await renderSection()
    face.base.failWith(HELLO.name, { code: 'ERR_WORKBENCH_DB', message: 'boom' })
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-dsh-forge-plugin-confirm]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-toast]')).not.toBeNull()
    })
    const toast = document.querySelector('[data-dsh-forge-plugins-toast]') as HTMLElement
    expect(toast.getAttribute('aria-live')).toBe('polite')
    fireEvent.click(toast.querySelector('[data-dsh-forge-plugins-toast-dismiss]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-toast]')).toBeNull()
    })
    expect(face.listPlugins).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC5: dual theme + keyboard reachability; the zh balance; face call shapes
// ---------------------------------------------------------------------------

describe('PluginSection: themes, keyboard, bilingual, face discipline (AC5/AC6)', () => {
  it('injects no stylesheet; the card and controls ride the dual-theme alias vars', async () => {
    await renderSection()
    expect(document.querySelectorAll('style')).toHaveLength(0)
    const section = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    expect(section.style.background).toContain('var(--dsw-alias-bg-layer-2')
    expect(section.style.borderRadius).toBe('14px')
    const action = rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action]') as HTMLElement
    expect(action.style.borderRadius).toBe('14px')
    expect(action.style.height).toBe('28px')
  })

  it('every row action is a native button (Enter/Space operable) and gains the brand focus ring on focus', async () => {
    await renderSection()
    const action = rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action]') as HTMLButtonElement
    expect(action.tagName).toBe('BUTTON')
    expect(action.style.outline).toBe('')
    act(() => { action.focus() })
    expect(action.style.outline).toContain('var(--dsw-alias-link')
  })

  it('the confirm dialog dismisses on Escape and traps nothing after close', async () => {
    await renderSection()
    fireEvent.click(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]') as HTMLElement)
    const dialog = document.querySelector('[data-dsh-forge-dialog="plugins-disable-confirm"]') as HTMLElement
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog.isConnected).toBe(false)
    expect(document.querySelector('[data-dsh-forge-plugin-row]')).not.toBeNull()
  })

  it('renders the zh dictionary through the same component (bilingual balance)', async () => {
    await renderSection(makeFace(), t.zh)
    expect(document.querySelector('[data-dsh-forge-plugin-mandatory-badge]')?.textContent)
      .toBe(zh['overview.plugins.mandatoryBadge'])
    expect(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-action="disable"]')?.textContent)
      .toBe(zh['overview.plugins.action.disable'])
    expect(rowOf(HELLO.name).querySelector('[data-dsh-forge-plugin-status]')?.textContent)
      .toContain(zh['overview.plugins.status.enabled'])
  })

  it('face discipline: one listPlugins on mount; setPluginEnabled only ever fires from a third-party action', async () => {
    const { face } = await renderSection()
    expect(face.listPlugins).toHaveBeenCalledTimes(1)
    // Clicking a mandatory row region fires nothing (no control exists — the
    // DOM assertion above is the primary; this re-states it at call level).
    fireEvent.click(rowOf(MANDATORY_ROWS[0]!.name))
    expect(face.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('OverviewPage build default: without a pluginFace prop the section runs on its own mock twin (the 5.14 seat injects later)', async () => {
    render(<OverviewPage t={t.en} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-plugins-section]')).not.toBeNull()
    })
    await waitFor(() => {
      expect(rowOf(HELLO.name)).not.toBeNull()
    })
  })
})
