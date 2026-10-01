// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'
import { WorkbenchShell, VIEW_MOUNT_TABLE, resolveViewMount } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'

// M4 task 1.7 (旧视图退役, tech-design §Integration #6): the `workbench`
// main panel is the OVERVIEW ESCAPE DOOR single page — the VIEW_MOUNT_TABLE
// carries no dead keys, the M2/M3 chrome (top bar / tab strip / project
// switcher / state gate) renders nowhere, the UF1 overview assembly mounts
// in the reserved container (SC5 过渡载体), and the panel-lifecycle
// notifications still fire on mount/unmount.

// The upstream icons/dots resolve through the module table at runtime
// (browser bundle); the npm node entry carries undeclared transitive deps
// (clsx/shiki/katex/...) that only the upstream monorepo supplies, so the
// jsdom unit render stubs them. The real paths ride the e2e boot.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

type Dict = Record<WorkbenchKey, string>

/** Translate bound like the locale face does (t(key, params)). */
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]

const t = { en: bind(en), zh: bind(zh) }

afterEach(() => cleanup())

describe('WorkbenchShell: the M4 1.7 escape door — mount table 无死键', () => {
  it('reserves exactly the surviving view keys in the mapping table (孤儿视图清零 unit 口径)', () => {
    // The retired keys (workbench/tasks|features|proposals[:slug]) are gone:
    // the table is the escape door's single interior page + the dialog
    // family — the assertion basis the 1.8 e2e migration consumes.
    expect(Object.keys(VIEW_MOUNT_TABLE)).toEqual([
      'workbench/overview',
      'workbench/dialog/*',
    ])
    expect(resolveViewMount('workbench/overview')).toBe('dsh-forge-view-overview')
  })

  it('renders the overview page in its reserved container over the shared mock registry (build form)', async () => {
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} />)
    expect(document.querySelector('[data-dsh-forge-plugin="forge-workbench"]')).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-shell]')).not.toBeNull()
    const seat = document.querySelector('[data-dsh-forge-view="dsh-forge-view-overview"]') as HTMLElement
    expect(seat).not.toBeNull()
    await waitFor(() => {
      expect(seat.querySelector('[data-dsh-forge-overview]')).not.toBeNull()
    })
    // The page runs its own mock twin: the populated fixture's cards appear.
    expect(seat.querySelectorAll('[data-dsh-forge-project-card]')).toHaveLength(2)
  })

  it('renders NO retired chrome: no tab strip, no top bar, no switcher, no gate (一次性替换, 不留双轨)', () => {
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} />)
    expect(document.querySelector('[data-dsh-forge-tabs]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-tab]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-topbar]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-add-project]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-switcher]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-gate]')).toBeNull()
    // The retired view keys address nothing: no board containers exist.
    for (const retired of ['dsh-forge-view-tasks', 'dsh-forge-view-features', 'dsh-forge-view-proposals']) {
      expect(document.querySelector(`[data-dsh-forge-view="${retired}"]`)).toBeNull()
    }
  })

  it('reads the locale seat — the same component renders zh copy', async () => {
    render(<WorkbenchShell t={t.zh as WorkbenchShellProps['t']} />)
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-overview]')).not.toBeNull()
    })
  })
})

describe('WorkbenchShell: panel lifecycle (AC6, external-selection sync)', () => {
  it('fires notifyPresented on mount and notifyDismissed on unmount', () => {
    const notifyPresented = vi.fn()
    const notifyDismissed = vi.fn()
    const view = render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']}
        notifyPresented={notifyPresented} notifyDismissed={notifyDismissed}
      />,
    )
    expect(notifyPresented).toHaveBeenCalledTimes(1)
    expect(notifyDismissed).not.toHaveBeenCalled()
    view.unmount()
    expect(notifyDismissed).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchPanelIcon: the sidebar glyph (3.2)', () => {
  it('renders without error at the size the sidebar requests (glyph stubbed, see mock note)', () => {
    const view = render(<WorkbenchPanelIcon size={16} />)
    expect(view.container).toBeDefined()
  })
})
