// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { ProjectTreeBrowser } from '../src/client/components/project-tree/ProjectTreeBrowser.tsx'
import { ProjectSidebarSeat } from '../src/client/nav/project-seat.tsx'
import {
  ArchiveBanner, ArchiveBannerDock, ARCHIVE_BANNER_DOCK_ID, installArchiveBanner,
} from '../src/client/components/archive-banner/ArchiveBanner.tsx'
import type { Project, WorkbenchState } from '../src/client/ipc-types.ts'
import type { WorkbenchIpcBridge } from '../src/client/ipc/workbench.ts'
import { createActiveProjectStore } from '../src/client/store/active-project.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'

// M4 task 3.5 — C8 归宿②③: the left-rail lifecycle menu (重命名行内编辑 /
// 归档·删除确认 Dialog / 恢复) and the C2 archive banner read-only state.
// AC map:
//   AC2 menu 四动作 — 重命名(行内编辑)/ 归档(确认 Dialog「workspace 保留,
//      会话仍按项目分组」)/ 恢复 / 删除(确认 Dialog「投影移除,会话退未分组
//      (历史不删除)」; 删除当前项目 → 工作台落其余项目或空态)
//   AC3 生命周期×投影联动 — rename rides the verb (local commit, projection
//      async); failures degrade without blocking the local effect
//   AC4 归档横幅只读态 — 「项目已归档(只读)」+ [恢复]/[删除] ghost ONLY
// Hard Rule — 确认 Dialog 文案 = PRD 必答⑤ 语义 (BIZ-006)

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
  IconFolderClose16: () => null,
  IconFolderOpen16: () => null,
  IconTriangleRightFill14: () => null,
  IconSearchOutline16: () => null,
  IconPersonalizationOutline16: () => null,
  IconPlusOutline16: () => null,
  IconNewChatOutline16: () => null,
  IconSettingsOutline16: () => null,
  IconChevronLeftOutline14: () => null,
}))

const t = (key: WorkbenchKey): string => zh[key]

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    displayName: id,
    codeRoot: `Z:/work/${id}`,
    docLocationType: 'in_repo',
    docLocationPath: null,
    createdAt: '2026-09-20T08:00:00.000Z',
    lastActivatedAt: null,
    archived: false,
    sortOrder: 0,
    projectionState: 'pending',
    docsPlacement: 'repo-existing',
    ...overrides,
  }
}

const ALPHA = makeProject('alpha', { sortOrder: 0 })
const BETA = makeProject('beta', { sortOrder: 1 })

/** A lifecycle-aware fake bridge: the four verbs mutate the state the reads answer. */
function makeLifecycleBridge(initial: { projects: Project[]; activeProjectId: string | null }) {
  const state = { ...initial }
  const calls = {
    rename: [] as Array<{ projectId: string; displayName: string }>,
    archive: [] as string[],
    restore: [] as string[],
    remove: [] as string[],
    activate: [] as string[],
    getState: 0,
  }
  let push: ((events: ReadonlyArray<{ type: string }>) => void) | undefined
  const bridge = {
    getState: async (): Promise<WorkbenchState> => {
      calls.getState += 1
      return { projects: state.projects, activeProjectId: state.activeProjectId, plugins: [] }
    },
    activateProject: async (id: string): Promise<void> => {
      calls.activate.push(id)
      state.activeProjectId = id
    },
    renameProject: async (input: { projectId: string; displayName: string }): Promise<Project> => {
      calls.rename.push(input)
      state.projects = state.projects.map(p => (p.id === input.projectId ? { ...p, displayName: input.displayName } : p))
      return state.projects.find(p => p.id === input.projectId) as Project
    },
    archiveProject: async (input: { projectId: string }): Promise<Project> => {
      calls.archive.push(input.projectId)
      state.projects = state.projects.map(p => (p.id === input.projectId ? { ...p, archived: true } : p))
      return state.projects.find(p => p.id === input.projectId) as Project
    },
    restoreProject: async (input: { projectId: string }): Promise<Project> => {
      calls.restore.push(input.projectId)
      state.projects = state.projects.map(p => (p.id === input.projectId ? { ...p, archived: false } : p))
      return state.projects.find(p => p.id === input.projectId) as Project
    },
    removeProject: async (id: string): Promise<void> => {
      calls.remove.push(id)
      state.projects = state.projects.filter(p => p.id !== id)
      // The kernel clears the pointer when the ACTIVE project is removed.
      if (state.activeProjectId === id) state.activeProjectId = null
    },
    onEvents: (dispatch: (events: ReadonlyArray<{ type: string }>) => void): (() => void) => {
      push = dispatch
      return () => { push = undefined }
    },
  }
  return {
    bridge: bridge as unknown as WorkbenchIpcBridge,
    state,
    calls,
    emit: (events: ReadonlyArray<{ type: string }>): void => { push?.(events) },
  }
}

/** Mount the browser directly (build stage; no seat faces). */
function mountTree(over: Record<string, unknown> = {}) {
  const onRename = vi.fn()
  const onProjectCommand = vi.fn()
  const view = render(
    <ProjectTreeBrowser
      t={t}
      projects={[ALPHA, makeProject('gone', { archived: true, sortOrder: 5 })]}
      workspaces={[]}
      sessions={[]}
      activeProjectId="alpha"
      onProjectCommand={onProjectCommand}
      onRename={onRename}
      {...over}
    />,
  )
  return { view, onRename, onProjectCommand }
}

const openProjectMenu = (id: string, selector = 'data-dsh-forge-tree-project'): HTMLElement => {
  const row = document.querySelector(`[${selector}="${id}"]`) as HTMLElement
  fireEvent.mouseEnter(row)
  fireEvent.click(row.querySelector('[data-dsh-forge-tree-project-more]') as HTMLElement)
  return document.querySelector(`[data-dsh-forge-tree-project-menu="${id}"]`) as HTMLElement
}

// ---------------------------------------------------------------------------
// AC2 — the ⋯ menu vocabulary + the inline rename
// ---------------------------------------------------------------------------

describe('ProjectRow lifecycle menu: 重命名 / 归档 / 恢复 / 删除 (AC2)', () => {
  it('the ACTIVE row menu carries the three lifecycle commands (rename/archive/remove)', () => {
    mountTree()
    const menu = openProjectMenu('alpha')
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent)
    expect(items).toEqual(['✎ 重命名', '🗄 归档项目', '🗑 删除项目'])
  })

  it('重命名 = 行内编辑: the name slot swaps for an input; Enter commits onRename, Esc cancels', () => {
    const { view, onRename } = mountTree()
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    const input = view.container.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect((input as HTMLInputElement).value).toBe('alpha')
    // Esc cancels — no verb, the row restores.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(view.container.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]')).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
    // Again: type a new name, Enter commits.
    const menu2 = openProjectMenu('alpha')
    fireEvent.click(menu2.querySelectorAll('[role="menuitem"]')[0]!)
    const input2 = view.container.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]') as HTMLInputElement
    fireEvent.change(input2, { target: { value: 'dsh-forge-2' } })
    fireEvent.keyDown(input2, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('alpha', 'dsh-forge-2')
  })

  it('an empty/whitespace rename commit cancels instead of firing the verb; archived rows keep 恢复/删除', () => {
    const { view, onRename } = mountTree()
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    const input = view.container.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
    // Archived vocabulary unchanged (1.4): restore/remove only.
    const archivedMenu = openProjectMenu('gone', 'data-dsh-forge-tree-archived-row')
    const items = Array.from(archivedMenu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent)
    expect(items).toEqual(['⤺ 恢复项目', '🗑 删除项目'])
    void view
  })

  it('归档/删除 bubble through onProjectCommand (the dialog confirm lives at the seat)', () => {
    const { onProjectCommand } = mountTree()
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[1]!)
    expect(onProjectCommand).toHaveBeenCalledWith('alpha', 'archive')
    const menu2 = openProjectMenu('alpha')
    fireEvent.click(menu2.querySelectorAll('[role="menuitem"]')[2]!)
    expect(onProjectCommand).toHaveBeenCalledWith('alpha', 'remove')
  })
})

// ---------------------------------------------------------------------------
// AC2/AC3 — the seat wiring: dialogs + verbs + the removal landing
// ---------------------------------------------------------------------------

describe('ProjectSidebarSeat lifecycle wiring (AC2/AC3)', () => {
  it('归档: the confirm Dialog carries the 必答⑤ copy; confirm fires archiveProject + toast; the row moves to the archived partition', async () => {
    const world = makeLifecycleBridge({ projects: [ALPHA, BETA], activeProjectId: 'alpha' })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[1]!)
    // The dialog: title + the 必答⑤ archive copy (workspace 保留,会话仍按项目分组).
    const dialog = document.querySelector('[data-dsh-forge-dialog="project-archive-confirm"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('workspace 保留,会话仍按项目分组')
    expect(dialog.textContent).toContain('alpha')
    // Cancel first: nothing fires.
    fireEvent.click(dialog.querySelector('[data-dsh-forge-project-archive-cancel]') as HTMLElement)
    expect(world.calls.archive).toHaveLength(0)
    // Confirm: the verb + the toast + the tree moves the row (refresh after verb).
    const menu2 = openProjectMenu('alpha')
    fireEvent.click(menu2.querySelectorAll('[role="menuitem"]')[1]!)
    const dialog2 = document.querySelector('[data-dsh-forge-dialog="project-archive-confirm"]') as HTMLElement
    fireEvent.click(dialog2.querySelector('[data-dsh-forge-project-archive-confirm]') as HTMLElement)
    await waitFor(() => { expect(world.calls.archive).toEqual(['alpha']) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-tree-archived-row="alpha"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('已归档 alpha')
    // The pointer stays (归档 ≠ 删除; the workbench enters the read-only state).
    expect(world.calls.activate).toHaveLength(0)
  })

  it('删除 the ACTIVE project: confirm fires removeProject and the workbench falls to the remaining project', async () => {
    const world = makeLifecycleBridge({ projects: [ALPHA, BETA], activeProjectId: 'alpha' })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[2]!)
    const dialog = document.querySelector('[data-dsh-forge-dialog="project-remove-confirm"]') as HTMLElement
    expect(dialog).not.toBeNull()
    // The 必答⑤ delete copy verbatim.
    expect(dialog.textContent).toContain('投影移除,会话退未分组(历史不删除)')
    fireEvent.click(dialog.querySelector('[data-dsh-forge-project-remove-confirm]') as HTMLElement)
    await waitFor(() => { expect(world.calls.remove).toEqual(['alpha']) })
    // 落其余项目: the pointer falls to the first remaining project (beta).
    await waitFor(() => { expect(world.calls.activate).toEqual(['beta']) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-tree-project="beta"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-tree-project="alpha"]')).toBeNull()
  })

  it('删除 the LAST project: the workbench lands on the empty-state guide', async () => {
    const world = makeLifecycleBridge({ projects: [ALPHA], activeProjectId: 'alpha' })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[2]!)
    const dialog = document.querySelector('[data-dsh-forge-dialog="project-remove-confirm"]') as HTMLElement
    fireEvent.click(dialog.querySelector('[data-dsh-forge-project-remove-confirm]') as HTMLElement)
    await waitFor(() => { expect(world.calls.remove).toEqual(['alpha']) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-project-empty]')).not.toBeNull() })
    expect(world.calls.activate).toHaveLength(0)
  })

  it('重命名 rides the verb and lands 原位 (toast + tree text); a rejection degrades with the failure toast', async () => {
    const world = makeLifecycleBridge({ projects: [ALPHA, BETA], activeProjectId: 'alpha' })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    const input = document.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'renamed-alpha' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(world.calls.rename).toEqual([{ projectId: 'alpha', displayName: 'renamed-alpha' }]) })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-tree-project="alpha"]')?.textContent).toContain('renamed-alpha')
    })
    expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('已重命名为 renamed-alpha')
  })

  it('恢复 (archived row) rides the verb directly — no dialog — and lands the row back among the active projects', async () => {
    const world = makeLifecycleBridge({
      projects: [ALPHA, makeProject('gone', { archived: true, sortOrder: 5 })],
      activeProjectId: 'alpha',
    })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('gone', 'data-dsh-forge-tree-archived-row')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    await waitFor(() => { expect(world.calls.restore).toEqual(['gone']) })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-tree-project="gone"]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-tree-archived-row="gone"]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('已恢复 gone')
  })
})

// ---------------------------------------------------------------------------
// AC4 — the C2 archive banner read-only state
// ---------------------------------------------------------------------------

describe('ArchiveBanner: the C2 archived read-only state (AC4)', () => {
  it('renders ONLY when the active project is archived; the actions are 恢复/删除 ghost ONLY', async () => {
    const world = makeLifecycleBridge({
      projects: [makeProject('arch', { archived: true, sortOrder: 0 }), BETA],
      activeProjectId: 'arch',
    })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    const view = render(<ArchiveBannerDock t={t} store={store} session={{ sessionId: 's1', subagent: null }} input={undefined} />)
    const banner = view.container.querySelector('[data-dsh-forge-archive-banner]') as HTMLElement
    expect(banner).not.toBeNull()
    expect(banner.textContent).toContain('项目已归档(只读)')
    // 可用动作仅 恢复/删除 — exactly two affordances, no others.
    const buttons = Array.from(banner.querySelectorAll('button')) as HTMLButtonElement[]
    expect(buttons.map(el => el.textContent)).toEqual(['恢复', '删除'])
    // A non-archived active project renders nothing (the banner IS the archived state).
    world.state.projects = world.state.projects.map(p => ({ ...p, archived: false }))
    await act(async () => { await store.refresh() })
    await waitFor(() => { expect(view.container.querySelector('[data-dsh-forge-archive-banner]')).toBeNull() })
  })

  it('[恢复] rides restoreProject directly; [删除] opens the 必答⑤ confirm then removeProject', async () => {
    const world = makeLifecycleBridge({
      projects: [makeProject('arch', { archived: true, sortOrder: 0 })],
      activeProjectId: 'arch',
    })
    const store = createActiveProjectStore(world.bridge)
    await act(async () => { await store.refresh() })
    const view = render(<ArchiveBannerDock t={t} store={store} session={{ sessionId: 's1', subagent: null }} input={undefined} />)
    fireEvent.click(view.container.querySelector('[data-dsh-forge-archive-banner-restore]') as HTMLElement)
    await waitFor(() => { expect(world.calls.restore).toEqual(['arch']) })
    // The banner leaves with the archived flag (store re-pull after the verb).
    await waitFor(() => { expect(view.container.querySelector('[data-dsh-forge-archive-banner]')).toBeNull() })

    // Delete leg: re-archive, then banner → 删除 → dialog → confirm.
    world.state.projects = world.state.projects.map(p => ({ ...p, archived: true }))
    await act(async () => { await store.refresh() })
    await waitFor(() => { expect(view.container.querySelector('[data-dsh-forge-archive-banner]')).not.toBeNull() })
    fireEvent.click(view.container.querySelector('[data-dsh-forge-archive-banner-remove]') as HTMLElement)
    const dialog = document.querySelector('[data-dsh-forge-dialog="project-remove-confirm"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('投影移除,会话退未分组(历史不删除)')
    fireEvent.click(dialog.querySelector('[data-dsh-forge-project-remove-confirm]') as HTMLElement)
    await waitFor(() => { expect(world.calls.remove).toEqual(['arch']) })
  })

  it('the pure banner takes callbacks (presentation seam): full-width warn band copy', () => {
    const onRestore = vi.fn()
    const onRemove = vi.fn()
    const view = render(<ArchiveBanner t={t} projectName="arch" onRestore={onRestore} onRemove={onRemove} />)
    const banner = view.container.querySelector('[data-dsh-forge-archive-banner]') as HTMLElement
    expect(banner.textContent).toContain('项目已归档(只读)')
    fireEvent.click(view.container.querySelector('[data-dsh-forge-archive-banner-restore]') as HTMLElement)
    expect(onRestore).toHaveBeenCalledTimes(1)
    fireEvent.click(view.container.querySelector('[data-dsh-forge-archive-banner-remove]') as HTMLElement)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('installArchiveBanner: ONE dock entry under conversation.input.dock, disposed cleanly', () => {
    const core = new SlotCore()
    core.register(
      { name: 'root', children: { 'conversation.input.dock': { kind: 'list', scope: 'session' } } },
      () => null,
    )
    const ctx = {
      effect(fn: () => (() => void) | undefined): () => void {
        const dispose = fn()
        return () => dispose?.()
      },
      slots: {
        register: (options: object, component: unknown) =>
          core.register(options as Parameters<SlotCore['register']>[0], component as never),
        inject(key: string, callback: () => (() => void) | undefined): () => void {
          let disposeActive: (() => void) | undefined
          const reconcile = (): void => {
            if (core.specDynamic(key) === undefined) return
            disposeActive?.()
            const dispose = callback()
            disposeActive = () => dispose?.()
          }
          const unsubscribe = core.subscribeDeclaration(key, reconcile)
          reconcile()
          return () => {
            unsubscribe()
            disposeActive?.()
          }
        },
        spec: (key: string) => core.specDynamic(key),
      },
    } as unknown as Context
    const dispose = installArchiveBanner(ctx, { t })
    const ids = core.entriesOfSlot('conversation.input.dock').map(({ options }) => options.id)
    expect(ids).toEqual([ARCHIVE_BANNER_DOCK_ID])
    dispose()
    expect(core.entriesOfSlot('conversation.input.dock')).toHaveLength(0)
  })

  it('a lifecycle verb rejection degrades to the failure toast (Propagation: never a throw)', async () => {
    const world = makeLifecycleBridge({ projects: [ALPHA, BETA], activeProjectId: 'alpha' })
    const failing = { ...world.bridge, renameProject: vi.fn(async () => { throw new Error('boom') }) } as unknown as WorkbenchIpcBridge
    const store = createActiveProjectStore(failing)
    await act(async () => { await store.refresh() })
    render(<ProjectSidebarSeat t={t} wide store={store} />)
    const menu = openProjectMenu('alpha')
    fireEvent.click(menu.querySelectorAll('[role="menuitem"]')[0]!)
    const input = document.querySelector('[data-dsh-forge-tree-project-rename-input="alpha"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'renamed-alpha' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-project-toast]')?.textContent).toContain('操作失败')
    })
  })
})
