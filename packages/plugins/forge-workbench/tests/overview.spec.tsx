// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewPage, verbErrorCode } from '../src/client/views/overview/OverviewPage.tsx'
import type { OverviewPageProps } from '../src/client/views/overview/OverviewPage.tsx'
import { formatTimestamp, middleEllipsis } from '../src/client/views/overview/format.ts'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  MOCK_EMPTY_WORKBENCH_STATE, MOCK_NOW, MOCK_WORKBENCH_STATE, createMockOverviewFace,
} from '../src/client/mocks/workbench.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { Project, WorkbenchState } from '../src/client/ipc-types.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'

// Task 5.3 — the UF1 overview page BUILD units (mocked face; 5.14 wires the
// IPC verbs). AC map:
//   AC1 card field matrix · AC2 activation + active visual · AC3 rename
//   inline + remove double-confirm (promise copy, Hard Rules) · AC4
//   empty/loading/error states + 失联 surfaces · AC5 themes/keyboard/grid ·
//   AC6 the render + interaction suite itself, plus the 5.4/5.12/5.14 seams.

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const ACTIVE_ID = '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10'
const OTHER_ID = 'b2c93f57-1e6a-4d88-8f0c-2a9d4e7b1c53'
const ACTIVE_PROJECT = MOCK_WORKBENCH_STATE.projects[0] as Project
const OTHER_PROJECT = MOCK_WORKBENCH_STATE.projects[1] as Project

/** Deferred promise helper for driving the loading phase deterministically. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/**
 * A spied face over the real mock twin: every verb is asserted AND keeps the
 * Interface 1 transaction semantics (auto-activation etc.) for the page to
 * observe. `.base` exposes the underlying twin for bespoke orchestration.
 */
function makeFace(initial: WorkbenchState = MOCK_WORKBENCH_STATE) {
  const base = createMockOverviewFace(initial)
  const face = {
    loadState: vi.fn(base.loadState),
    activateProject: vi.fn(base.activateProject),
    updateProject: vi.fn(base.updateProject),
    removeProject: vi.fn(base.removeProject),
  }
  return Object.assign(face, { base })
}

/** Render the page and settle the initial load. */
async function renderOverview(props: Partial<OverviewPageProps> = {}, face?: ReturnType<typeof makeFace>) {
  const f = face ?? makeFace()
  render(<OverviewPage t={t.en} face={f} {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-overview]')?.getAttribute('aria-busy')).toBe('false')
  })
  return { face: f }
}

// The upstream StateDot (consumed by the tasks-seat board since task 5.5,
// via the WorkbenchShell mount chain) resolves through the module table at
// runtime; the npm node entry carries undeclared transitive deps
// (clsx/shiki/...) that only the upstream monorepo supplies, so the jsdom
// unit render stubs it (the shell.spec precedent).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// View-state machine: loading / populated / empty / load-error (AC4 + tech plan)
// ---------------------------------------------------------------------------

describe('OverviewPage: the four-state machine', () => {
  it('loading: skeleton gray blocks + status label while the first load is in flight, no cards', async () => {
    const gate = deferred<WorkbenchState>()
    const face = makeFace()
    face.loadState.mockImplementationOnce(() => gate.promise)
    render(<OverviewPage t={t.en} face={face} />)
    const skeleton = document.querySelector('[data-dsh-forge-overview-skeleton]') as HTMLElement
    expect(skeleton).not.toBeNull()
    expect(skeleton.getAttribute('role')).toBe('status')
    expect(skeleton.getAttribute('aria-label')).toBe(en['overview.loading'])
    expect(document.querySelector('[data-dsh-forge-project-grid]')).toBeNull()
    act(() => { gate.resolve(MOCK_WORKBENCH_STATE) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-project-grid]')).not.toBeNull()
    })
  })

  it('populated: every ui-design card field renders for every project (AC1)', async () => {
    await renderOverview()
    const cards = document.querySelectorAll('[data-dsh-forge-project-card]')
    expect(cards).toHaveLength(2)

    const activeCard = document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`) as HTMLElement
    expect(activeCard.textContent).toContain('dsh-forge')
    expect(activeCard.textContent).toContain(ACTIVE_PROJECT.codeRoot)
    expect(activeCard.querySelector('[data-dsh-forge-card-doc="in_repo"]')?.textContent).toBe(en['overview.doc.inRepo'])
    // Deterministic timestamp rendering (fixed UTC shape — no host clock/zone).
    expect(activeCard.querySelector('[data-dsh-forge-card-last-activated]')?.textContent)
      .toBe('2026-09-22 06:40')

    const otherCard = document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`) as HTMLElement
    expect(otherCard.querySelector('[data-dsh-forge-card-doc="external"]')?.textContent).toBe(en['overview.doc.external'])
    expect(otherCard.textContent).toContain(OTHER_PROJECT.docLocationPath as string)
    // lastActivatedAt null → the never-activated label, never a raw null.
    expect(otherCard.querySelector('[data-dsh-forge-card-last-activated]')?.textContent)
      .toBe(en['overview.card.neverActivated'])
    // The meta row carries the ACTIVE project's identity + paths.
    const meta = document.querySelector('[data-dsh-forge-overview-meta]') as HTMLElement
    expect(meta.textContent).toContain('dsh-forge')
    expect(meta.textContent).toContain(en['overview.doc.inRepo'])
  })

  it('empty: the 注册引导卡 with the register CTA firing the 5.4 seam', async () => {
    const onRegister = vi.fn()
    await renderOverview({ onRegister }, makeFace(MOCK_EMPTY_WORKBENCH_STATE))
    const empty = document.querySelector('[data-dsh-forge-overview-empty]') as HTMLElement
    expect(empty.textContent).toContain(en['overview.empty.title'])
    expect(empty.textContent).toContain(en['overview.empty.body'])
    // No error surface — a guidance card (the state-gate discipline).
    expect(empty.getAttribute('role')).not.toBe('alert')
    fireEvent.click(document.querySelector('[data-dsh-forge-overview-register]') as HTMLButtonElement)
    expect(onRegister).toHaveBeenCalledTimes(1)
  })

  it('load-error: the retry card, then a retry that recovers into populated', async () => {
    const face = makeFace()
    let failNext = true
    face.loadState.mockImplementation(async () => {
      if (failNext) {
        failNext = false
        throw new Error('db probe failed')
      }
      return face.base.loadState()
    })
    render(<OverviewPage t={t.en} face={face} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-load-error]')).not.toBeNull()
    })
    const errorCard = document.querySelector('[data-dsh-forge-overview-load-error]') as HTMLElement
    expect(errorCard.getAttribute('role')).toBe('alert')
    expect(errorCard.textContent).toContain(en['overview.loadError.title'])
    expect(document.querySelector('[data-dsh-forge-project-grid]')).toBeNull()
    fireEvent.click(document.querySelector('[data-dsh-forge-overview-retry]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-project-grid]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Activation: the single-activation switch + the active visual (AC2)
// ---------------------------------------------------------------------------

describe('OverviewPage: activation (AC2)', () => {
  it('clicking a non-active card 切换 activates it and the visual marker migrates', async () => {
    const { face } = await renderOverview()
    const trigger = document.querySelector(
      `[data-dsh-forge-project-card="${OTHER_ID}"] [data-dsh-forge-card-action="activate"]`,
    ) as HTMLButtonElement
    fireEvent.click(trigger)
    await waitFor(() => { expect(face.activateProject).toHaveBeenCalledWith(OTHER_ID) })
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`)?.getAttribute('data-active'))
        .toBe('true')
    })
    expect(document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"] [data-dsh-forge-card-active-badge]`)
      ?.textContent).toBe(en['overview.card.activeBadge'])
    // The previous holder released the marker (single activation).
    expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`)?.getAttribute('data-active'))
      .toBe('false')
    // The meta row follows the new active project.
    expect(document.querySelector('[data-dsh-forge-overview-meta]')?.textContent).toContain('electron-course')
  })

  it('the active card carries the explicit visual state and its own 切换 is disabled', async () => {
    await renderOverview()
    const activeCard = document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`) as HTMLElement
    expect(activeCard.getAttribute('data-active')).toBe('true')
    // The brand border (1.5px link-colored) is the ui-design active marker.
    expect(activeCard.style.border).toContain('var(--dsw-alias-link')
    expect(activeCard.querySelector('[data-dsh-forge-card-active-badge]')).not.toBeNull()
    expect((activeCard.querySelector('[data-dsh-forge-card-action="activate"]') as HTMLButtonElement).disabled)
      .toBe(true)
    const otherCard = document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`) as HTMLElement
    expect((otherCard.querySelector('[data-dsh-forge-card-action="activate"]') as HTMLButtonElement).disabled)
      .toBe(false)
  })

  it('ERR_PROJECT_NOT_FOUND maps to refresh + toast, never an error wall (tech-design)', async () => {
    const { face } = await renderOverview()
    face.activateProject.mockRejectedValueOnce({ code: 'ERR_PROJECT_NOT_FOUND', message: 'stale id' })
    fireEvent.click(document.querySelector(
      `[data-dsh-forge-project-card="${OTHER_ID}"] [data-dsh-forge-card-action="activate"]`,
    ) as HTMLButtonElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-toast]')?.textContent)
        .toContain(en['overview.toast.refreshed'])
    })
    // The refresh leg: loadState ran again beyond the initial load.
    expect(face.loadState.mock.calls.length).toBeGreaterThanOrEqual(2)
    // The registry is still presented — no error card replaced the page.
    expect(document.querySelector('[data-dsh-forge-overview-load-error]')).toBeNull()
    expect(document.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Rename: inline editor semantics (AC3)
// ---------------------------------------------------------------------------

describe('OverviewPage: inline rename (AC3)', () => {
  const openEditor = (): HTMLInputElement => {
    fireEvent.click(document.querySelector(
      `[data-dsh-forge-project-card="${ACTIVE_ID}"] [data-dsh-forge-card-action="rename"]`,
    ) as HTMLButtonElement)
    return document.querySelector('[data-dsh-forge-card-rename-input]') as HTMLInputElement
  }

  it('Enter saves through updateProject(displayName) and the card reflects the rename', async () => {
    const { face } = await renderOverview()
    const input = openEditor()
    expect(input.value).toBe('dsh-forge')
    expect(input.getAttribute('aria-label')).toBe(en['overview.rename.label'])
    fireEvent.change(input, { target: { value: 'dsh-forge-dev' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(face.updateProject).toHaveBeenCalledWith(ACTIVE_ID, { displayName: 'dsh-forge-dev' })
    })
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`)?.textContent)
        .toContain('dsh-forge-dev')
    })
    // The editor closed on success.
    expect(document.querySelector('[data-dsh-forge-card-rename-input]')).toBeNull()
  })

  it('Esc cancels without firing the verb', async () => {
    const { face } = await renderOverview()
    const input = openEditor()
    fireEvent.change(input, { target: { value: 'discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-card-rename-input]')).toBeNull()
    })
    expect(face.updateProject).not.toHaveBeenCalled()
    expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`)?.textContent)
      .toContain('dsh-forge')
  })

  it('an empty submit reverts to the original name — no verb, editor closes (ui-design)', async () => {
    const { face } = await renderOverview()
    const input = openEditor()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-card-rename-input]')).toBeNull()
    })
    expect(face.updateProject).not.toHaveBeenCalled()
    expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`)?.textContent)
      .toContain('dsh-forge')
  })
})

// ---------------------------------------------------------------------------
// Remove: the double-step confirm + the promise copy (AC3 + Hard Rules)
// ---------------------------------------------------------------------------

describe('OverviewPage: remove double-confirm (AC3, Hard Rules)', () => {
  const openConfirm = (id: string): HTMLElement => {
    fireEvent.click(document.querySelector(
      `[data-dsh-forge-project-card="${id}"] [data-dsh-forge-card-action="remove"]`,
    ) as HTMLButtonElement)
    const dialog = document.querySelector('[data-dsh-forge-dialog="overview-remove-confirm"]') as HTMLElement
    expect(dialog).not.toBeNull()
    return dialog
  }

  it('the card 移除 only OPENS the dialog — nothing is removed yet', async () => {
    const { face } = await renderOverview()
    const dialog = openConfirm(ACTIVE_ID)
    expect(face.removeProject).not.toHaveBeenCalled()
    // The dialog identifies the project verbatim.
    expect(dialog.textContent).toContain('dsh-forge')
    expect(dialog.textContent).toContain(ACTIVE_PROJECT.codeRoot)
    // The Hard-Rule copy: the promise that repo files are never deleted.
    expect(dialog.querySelector('[data-dsh-forge-remove-promise]')?.textContent)
      .toBe(en['overview.remove.promise'])
    expect(en['overview.remove.promise']).toMatch(/no files inside the repository are deleted/i)
  })

  it('zh dictionary carries the same 不删除文件 promise semantics (bilingual balance)', async () => {
    // Hard Rule: the copy promises non-deletion — affirming 不删除…文件, and
    // framing removal as registration-only (仅移除…注册信息).
    expect(zh['overview.remove.promise']).toContain('不删除')
    expect(zh['overview.remove.promise']).toContain('文件')
    expect(zh['overview.remove.promise']).toContain('注册信息')
    // And renders through the same component face.
    await renderOverview({ t: t.zh })
    openConfirm(ACTIVE_ID)
    expect(document.querySelector('[data-dsh-forge-remove-promise]')?.textContent)
      .toBe(zh['overview.remove.promise'])
  })

  it('destructive-safe default focus: the dialog opens on CANCEL, not the confirm', async () => {
    await renderOverview()
    openConfirm(ACTIVE_ID)
    expect(document.activeElement).toBe(document.querySelector('[data-dsh-forge-remove-cancel]'))
  })

  it('cancel (button, Esc, mask) closes without firing the verb; focus returns to the card trigger', async () => {
    const { face } = await renderOverview()
    openConfirm(ACTIVE_ID)
    fireEvent.click(document.querySelector('[data-dsh-forge-remove-cancel]') as HTMLButtonElement)
    expect(document.querySelector('[data-dsh-forge-dialog="overview-remove-confirm"]')).toBeNull()
    expect(face.removeProject).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.querySelector(
      `[data-dsh-forge-project-card="${ACTIVE_ID}"] [data-dsh-forge-card-action="remove"]`,
    ))

    // Esc dismissal, same contract.
    openConfirm(ACTIVE_ID)
    fireEvent.keyDown(document.querySelector('[data-dsh-forge-dialog="overview-remove-confirm"]') as HTMLElement, { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="overview-remove-confirm"]')).toBeNull()
    expect(face.removeProject).not.toHaveBeenCalled()
  })

  it('confirm removes the card; removing the ACTIVE project surfaces the auto-activation toast', async () => {
    const { face } = await renderOverview()
    openConfirm(ACTIVE_ID)
    fireEvent.click(document.querySelector('[data-dsh-forge-remove-confirm]') as HTMLButtonElement)
    await waitFor(() => { expect(face.removeProject).toHaveBeenCalledWith(ACTIVE_ID) })
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`)).toBeNull()
    })
    // The transaction auto-activated the first remaining project (mock twin
    // semantics) — the page observes and toasts it (ui-design).
    await waitFor(() => {
      expect(document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`)?.getAttribute('data-active'))
        .toBe('true')
    })
    expect(document.querySelector('[data-dsh-forge-overview-toast]')?.textContent)
      .toContain('Activated electron-course')
  })

  it('removing the last project returns the page to the empty 空态', async () => {
    const single: WorkbenchState = {
      projects: [ACTIVE_PROJECT],
      activeProjectId: ACTIVE_ID,
      plugins: [],
    }
    const { face } = await renderOverview({}, makeFace(single))
    openConfirm(ACTIVE_ID)
    fireEvent.click(document.querySelector('[data-dsh-forge-remove-confirm]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-empty]')).not.toBeNull()
    })
    expect(face.removeProject).toHaveBeenCalledWith(ACTIVE_ID)
  })
})

// ---------------------------------------------------------------------------
// Lost-project surfaces: per-card 失联徽标 + the active-project error card (AC4)
// ---------------------------------------------------------------------------

describe('OverviewPage: 失联 badge and the repoint seam (AC4)', () => {
  it('a lost ACTIVE project: badge + error card with 重新指向 (the 5.4 edit-mode seam) and 移除', async () => {
    const onRepoint = vi.fn()
    await renderOverview({ onRepoint, lostProjectIds: [ACTIVE_ID] })
    expect(document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"] [data-dsh-forge-card-lost-badge]`)
      ?.textContent).toBe(en['overview.card.lostBadge'])
    const lost = document.querySelector('[data-dsh-forge-overview-lost]') as HTMLElement
    expect(lost.getAttribute('role')).toBe('alert')
    expect(lost.textContent).toContain(en['overview.lost.title'])

    fireEvent.click(document.querySelector('[data-dsh-forge-overview-repoint]') as HTMLButtonElement)
    expect(onRepoint).toHaveBeenCalledTimes(1)
    expect(onRepoint).toHaveBeenCalledWith(expect.objectContaining({ id: ACTIVE_ID }))

    // The error card's 移除 routes into the SAME double-confirm.
    fireEvent.click(document.querySelector('[data-dsh-forge-overview-lost-remove]') as HTMLButtonElement)
    expect(document.querySelector('[data-dsh-forge-dialog="overview-remove-confirm"]')).not.toBeNull()
  })

  it('a lost NON-active project: the badge only — the error card belongs to the active project', async () => {
    await renderOverview({ lostProjectIds: [OTHER_ID] })
    expect(document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`)?.getAttribute('data-lost'))
      .toBe('true')
    expect(document.querySelector('[data-dsh-forge-overview-lost]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Theming / keyboard / responsive grid (AC5)
// ---------------------------------------------------------------------------

describe('OverviewPage: themes, keyboard reachability, responsive grid (AC5)', () => {
  it('injects no stylesheet; colors ride the dual-theme alias vars', async () => {
    await renderOverview()
    expect(document.querySelectorAll('style')).toHaveLength(0)
    const card = document.querySelector(`[data-dsh-forge-project-card="${ACTIVE_ID}"]`) as HTMLElement
    expect(card.style.background).toContain('var(--dsw-alias-bg-layer-2')
    const grid = document.querySelector('[data-dsh-forge-project-grid]') as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('auto-fill')
    expect(grid.style.gridTemplateColumns).toContain('minmax(280px, 1fr)')
    expect(grid.style.gap).toBe('12px')
  })

  it('every card action is a native button carrying the brand focus ring on focus', async () => {
    await renderOverview()
    const actions = document.querySelectorAll('[data-dsh-forge-card-action]')
    expect(actions.length).toBe(6)
    for (const action of Array.from(actions)) {
      expect(action.tagName).toBe('BUTTON')
    }
    const rename = document.querySelector(
      `[data-dsh-forge-project-card="${OTHER_ID}"] [data-dsh-forge-card-action="rename"]`,
    ) as HTMLButtonElement
    expect(rename.style.outline).toBe('')
    act(() => { rename.focus() })
    expect(rename.style.outline).toContain('var(--dsw-alias-link')
  })

  it('renders the zh dictionary through the same component (bilingual balance)', async () => {
    await renderOverview({ t: t.zh })
    expect(document.querySelector(`[data-dsh-forge-project-card="${OTHER_ID}"]`)?.textContent)
      .toContain(zh['overview.card.activate'])
    expect(document.querySelector('[data-dsh-forge-plugins-section]')?.textContent)
      .toContain(zh['overview.plugins.title'])
  })
})

// ---------------------------------------------------------------------------
// Reserved seats: UF6 (5.12) + the shell mount + the 5.14 assembly seat
// ---------------------------------------------------------------------------

describe('OverviewPage: reserved seats', () => {
  it('the UF6 plugin-section 区块卡 sits below the grid, reserved for 5.12', async () => {
    await renderOverview()
    const section = document.querySelector('[data-dsh-forge-plugins-section]') as HTMLElement
    expect(section.getAttribute('data-reserved')).toBe('5.12')
    expect(section.textContent).toContain(en['overview.plugins.title'])
    // Below the grid in page child order (the page-map section order).
    const page = document.querySelector('[data-dsh-forge-overview]') as HTMLElement
    const grid = document.querySelector('[data-dsh-forge-project-grid]') as HTMLElement
    const order = Array.from(page.children)
    expect(order.indexOf(grid)).toBeGreaterThanOrEqual(0)
    expect(order.indexOf(section)).toBeGreaterThan(order.indexOf(grid))
  })

  it('the empty state reserves no plugin seat (ui-design States: 空态卡 only)', async () => {
    await renderOverview({}, makeFace(MOCK_EMPTY_WORKBENCH_STATE))
    expect(document.querySelector('[data-dsh-forge-plugins-section]')).toBeNull()
  })
})

describe('WorkbenchShell: the overview mount + assembly seat (5.1 → 5.3)', () => {
  /** A controllable view face (the chrome.spec pattern). */
  function makeViewFace(initial: Partial<ViewKeySnapshot> = {}) {
    let snapshot: ViewKeySnapshot = {
      view: 'workbench',
      workbenchTab: 'workbench/overview',
      featureSlug: undefined,
      ...initial,
    }
    const selectWorkbenchTab = vi.fn((tab: WorkbenchTabKey) => {
      snapshot = { ...snapshot, workbenchTab: tab, featureSlug: undefined }
    })
    return {
      props: {
        useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
        selectWorkbenchTab,
        openFeatureDetail: (slug: string) => {
          snapshot = { ...snapshot, workbenchTab: 'workbench/features', featureSlug: slug }
        },
      } satisfies Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'>,
    }
  }

  it('mounts the page inside the reserved overview container (each tab owns its page since 5.9)', async () => {
    const face = makeViewFace()
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...face.props} />)
    const seat = document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]') as HTMLElement
    await waitFor(() => {
      expect(seat.querySelector('[data-dsh-forge-overview]')).not.toBeNull()
    })
    // The page runs its own mock twin: the populated fixture's cards appear.
    expect(seat.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
  })

  it('the page register CTA fires the shell addProject seam (the 5.4 wizard entry)', async () => {
    const addProject = vi.fn()
    const face = makeViewFace()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props} addProject={addProject}
        overview={{ face: { loadState: async () => MOCK_EMPTY_WORKBENCH_STATE } }}
      />,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-empty]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-dsh-forge-overview-register]') as HTMLButtonElement)
    expect(addProject).toHaveBeenCalledTimes(1)
  })

  it('the overview seat passes the 5.14 signals through (lostProjectIds → error card)', async () => {
    const face = makeViewFace()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']} {...face.props}
        overview={{ lostProjectIds: [ACTIVE_ID] }}
      />,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview-lost]')).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Pure helpers + the mock twin's transaction semantics
// ---------------------------------------------------------------------------

describe('format helpers: deterministic rendering', () => {
  it('formatTimestamp: fixed UTC shape, verbatim passthrough for unparseable input', () => {
    expect(formatTimestamp('2026-09-22T06:40:00.000Z')).toBe('2026-09-22 06:40')
    expect(formatTimestamp('2026-01-05T23:59:12.345Z')).toBe('2026-01-05 23:59')
    expect(formatTimestamp('not-a-timestamp')).toBe('not-a-timestamp')
  })

  it('middleEllipsis: passthrough when it fits; head…tail keeping the tail segment', () => {
    expect(middleEllipsis('Z:\\short', 48)).toBe('Z:\\short')
    const long = 'Z:\\project\\dsh\\some\\very\\deeply\\nested\\directory\\tree\\electron-course'
    const clipped = middleEllipsis(long, 48)
    expect(clipped.length).toBeLessThanOrEqual(48)
    expect(clipped).toContain('…')
    expect(clipped.endsWith('electron-course'.slice(-8))).toBe(true)
    expect(clipped.startsWith('Z:\\project')).toBe(true)
  })
})

describe('createMockOverviewFace: the Interface 1 transaction twin', () => {
  it('activation stamps lastActivatedAt with the frozen MOCK_NOW', async () => {
    const face = createMockOverviewFace()
    await face.activateProject(OTHER_ID)
    const state = await face.loadState()
    expect(state.activeProjectId).toBe(OTHER_ID)
    expect((state.projects.find(project => project.id === OTHER_ID) as Project).lastActivatedAt).toBe(MOCK_NOW)
  })

  it('remove auto-activates the first remaining row; the last removal clears the pointer', async () => {
    const face = createMockOverviewFace()
    await face.removeProject(ACTIVE_ID)
    let state = await face.loadState()
    expect(state.activeProjectId).toBe(OTHER_ID)
    await face.removeProject(OTHER_ID)
    state = await face.loadState()
    expect(state.projects).toHaveLength(0)
    expect(state.activeProjectId).toBeNull()
  })

  it('unknown ids reject the serialized ERR_PROJECT_NOT_FOUND shape', async () => {
    const face = createMockOverviewFace()
    await expect(face.activateProject('missing')).rejects.toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
    await expect(face.updateProject('missing', { displayName: 'x' })).rejects.toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
    await expect(face.removeProject('missing')).rejects.toMatchObject({ code: 'ERR_PROJECT_NOT_FOUND' })
  })
})

describe('verbErrorCode: the serialized rejection guard', () => {
  it('narrows the Interface 1 code and rejects everything else', () => {
    expect(verbErrorCode({ code: 'ERR_PROJECT_NOT_FOUND', message: 'x' })).toBe('ERR_PROJECT_NOT_FOUND')
    expect(verbErrorCode(new Error('plain'))).toBeUndefined()
    expect(verbErrorCode('string')).toBeUndefined()
    expect(verbErrorCode(null)).toBeUndefined()
    expect(verbErrorCode({ code: 42 })).toBeUndefined()
  })
})
