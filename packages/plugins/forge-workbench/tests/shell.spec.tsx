// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import { WorkbenchPanelIcon } from '../src/client/WorkbenchPanelIcon.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'

// The upstream icon resolves through the module table at runtime (browser
// bundle); the npm node entry carries undeclared transitive deps
// (clsx/shiki/katex/...) that only the upstream monorepo supplies, so the
// jsdom unit render stubs the glyph. The real icon path rides the e2e boot.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ IconBranchOutline16: () => null }))

// Task 3.2 AC2: the slot shell renders. The placeholder container mounts with
// the ReactFlowProvider already around the board area (@xyflow/react's
// context creation runs in jsdom — the render-path proof that the bundled
// engine loads), and the `t` seat drives the bilingual copy.

type Dict = Record<WorkbenchKey, string>

/** Translate bound like the locale face does (t(key, params)). */
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]

const t = { en: bind(en), zh: bind(zh) }

afterEach(() => cleanup())

describe('WorkbenchShell: placeholder container (AC2)', () => {
  it('renders the shell title and the 5.x placeholder inside the flow provider', () => {
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} />)
    expect(screen.getByText(en['shell.title'])).toBeDefined()
    expect(screen.getByText(en['shell.placeholder'])).toBeDefined()
    const root = document.querySelector('[data-dsh-forge-plugin="forge-workbench"]')
    expect(root).not.toBeNull()
    expect(document.querySelector('[data-dsh-forge-board]')).not.toBeNull()
  })

  it('reads the locale seat — the same component renders zh copy', () => {
    render(<WorkbenchShell t={t.zh as WorkbenchShellProps['t']} />)
    expect(screen.getByText(zh['shell.title'])).toBeDefined()
    expect(screen.getByText(zh['shell.placeholder'])).toBeDefined()
  })
})

describe('WorkbenchPanelIcon: the sidebar glyph (AC2)', () => {
  it('renders without error at the size the sidebar requests (glyph stubbed, see mock note)', () => {
    const view = render(<WorkbenchPanelIcon size={16} />)
    expect(view.container).toBeDefined()
  })
})
