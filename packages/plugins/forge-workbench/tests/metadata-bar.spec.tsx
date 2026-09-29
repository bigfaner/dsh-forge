// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import {
  deriveMetadataBinding, installMetadataBar, METADATA_BAR_DOCK_ID,
  MetadataBar, MetadataBarDock,
} from '../src/client/components/task-metadata/MetadataBar.tsx'
import type { MetadataTaskSource } from '../src/client/components/task-metadata/MetadataBar.tsx'
import { CONVERSATION_DOCK_SLOT } from '../src/client/contract.ts'
import type { LineageSessionRow, LineageSessionsSnapshot, LineageSessionsSource } from '../src/client/lineage'
import type { SessionLink, TaskStatus } from '../src/client/ipc-types.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'

// M4 task 2.7 — Component C6, the subagent 会话·任务元数据条 (ui-design
// §Component C6 / UF6; tech-design §Integration #3 — the RESOLVED fallback
// seat: the upstream conversation.input.dock list slot above the composer,
// NOT conversation.session (single-slot shadowing would replace the native
// panel — the forbidden zero-invasion form)). AC map:
//   AC2 三态渲染 — bound (the full bar: ⟂ task key — title / status Pill +
//      「查看任务」 ghost) / ambiguous (「该会话执行中」 次文字, no task number,
//      no jump) / unbound (renders NOTHING — 非 subagent 实例, no covering
//      task, degraded snapshot, or failed reads all degrade silently).
//   AC3 双向跳转 — the bar body, the cluster, and 「查看任务」 all fire the
//      ONE open-task seam with the LINEAGE-derived taskKey.
//   AC4 血缘为准 — deriveMetadataBinding's covered-task matrix: badges hit
//      the ancestor chain (active AND ended links), the self-hit rides the
//      executing tree, multi-task 共会话 → ambiguous, top sessions never bind.
//   零侵入 — the installer adds ONE list entry under the dock slot over the
//      real SlotCore; no native occupant touched.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

// ---------------------------------------------------------------------------
// Fixtures — the upstream snapshot (a top + two subagent depths) + sources
// ---------------------------------------------------------------------------

const row = (id: string, extra: Partial<LineageSessionRow> = {}): LineageSessionRow => ({ id, ...extra })

const SNAPSHOT: LineageSessionsSnapshot = Object.freeze({
  byId: Object.freeze({
    'top-a': Object.freeze(row('top-a', { title: 'the dispatch top' })),
    'sub-1': Object.freeze(row('sub-1', { title: 'renamed by hand (命名辅助)', origin: 'subagent', parentId: 'top-a', running: true })),
    'sub-2': Object.freeze(row('sub-2', { title: 'a plain subagent', origin: 'subagent', parentId: 'top-a' })),
    'sub-1-1': Object.freeze(row('sub-1-1', { title: 'grandchild leg', origin: 'subagent', parentId: 'sub-1' })),
    'top-b': Object.freeze(row('top-b', { title: 'another top' })),
    'top-c': Object.freeze(row('top-c', { title: 'an unlinked top' })),
    'sub-b': Object.freeze(row('sub-b', { title: 'unlinked subagent', origin: 'subagent', parentId: 'top-c' })),
  }),
})

const link = (sessionId: string, taskKey: string, status: 'active' | 'ended'): SessionLink => ({
  id: `link-${taskKey}-${sessionId}`, projectId: 'p-1', taskKey,
  sessionId, status, startedAt: '2026-09-28T08:00:00.000Z',
  endedAt: status === 'ended' ? '2026-09-28T10:00:00.000Z' : null,
})

const taskOf = (key: string, status: TaskStatus = 'in_progress') => ({ key, title: `title of ${key}`, status })

const source = (key: string, status: TaskStatus, links: readonly SessionLink[]): MetadataTaskSource => ({
  task: taskOf(key, status),
  links,
})

const SOURCES: readonly MetadataTaskSource[] = Object.freeze([
  source('feat/2.1', 'in_progress', [link('top-a', 'feat/2.1', 'active')]),
  source('feat/3.1', 'completed', [link('top-b', 'feat/3.1', 'ended')]),
])

/** The guarded sessions source over the frozen snapshot. */
const sessionsSource: LineageSessionsSource = { list: { getSnapshot: () => SNAPSHOT } }

// ---------------------------------------------------------------------------
// AC4 — the derivation matrix (血缘为准)
// ---------------------------------------------------------------------------

describe('deriveMetadataBinding: the covered-task matrix', () => {
  it('bound: a direct subagent of the linked top (badge hits the chain)', () => {
    expect(deriveMetadataBinding('sub-1', SNAPSHOT, SOURCES)).toEqual({
      kind: 'bound', taskKey: 'feat/2.1', title: 'title of feat/2.1', status: 'in_progress',
    })
  })

  it('bound: a GRANDCHILD rides the executing tree (the self-hit)', () => {
    expect(deriveMetadataBinding('sub-1-1', SNAPSHOT, SOURCES)).toEqual({
      kind: 'bound', taskKey: 'feat/2.1', title: 'title of feat/2.1', status: 'in_progress',
    })
  })

  it('bound: an ENDED link still covers (badges span active AND ended links)', () => {
    const endedOnly: readonly MetadataTaskSource[] = [source('feat/9.9', 'completed', [link('top-a', 'feat/9.9', 'ended')])]
    expect(deriveMetadataBinding('sub-2', SNAPSHOT, endedOnly)).toEqual({
      kind: 'bound', taskKey: 'feat/9.9', title: 'title of feat/9.9', status: 'completed',
    })
  })

  it('ambiguous: 多任务共会话 (two tasks covering one session tree)', () => {
    const multi: readonly MetadataTaskSource[] = [
      source('feat/2.1', 'in_progress', [link('top-a', 'feat/2.1', 'active')]),
      source('feat/2.2', 'completed', [link('top-a', 'feat/2.2', 'ended')]),
    ]
    expect(deriveMetadataBinding('sub-1', SNAPSHOT, multi)).toEqual({ kind: 'ambiguous' })
  })

  it('unbound: a subagent whose tree has NO covering task', () => {
    expect(deriveMetadataBinding('sub-b', SNAPSHOT, SOURCES)).toBeUndefined()
  })

  it('unbound: a TOP session never binds (仅 subagent 实例)', () => {
    expect(deriveMetadataBinding('top-a', SNAPSHOT, SOURCES)).toBeUndefined()
  })

  it('unbound: an absent byId row, a degraded snapshot, or no sources', () => {
    expect(deriveMetadataBinding('unknown', SNAPSHOT, SOURCES)).toBeUndefined()
    expect(deriveMetadataBinding('sub-1', undefined, SOURCES)).toBeUndefined()
    expect(deriveMetadataBinding('sub-1', SNAPSHOT, undefined)).toBeUndefined()
    expect(deriveMetadataBinding('sub-1', SNAPSHOT, [])).toBeUndefined()
  })

  it('血缘为准 (Story 7-3): the binding carries the TASK facts, never the session title', () => {
    const binding = deriveMetadataBinding('sub-1', SNAPSHOT, SOURCES)
    // sub-1's own title is 「renamed by hand」 — the bar shows the lineage's task.
    expect(binding).toMatchObject({ kind: 'bound', taskKey: 'feat/2.1' })
    expect(JSON.stringify(binding)).not.toContain('renamed by hand')
  })
})

// ---------------------------------------------------------------------------
// AC2 — the three render states
// ---------------------------------------------------------------------------

afterEach(cleanup)

const $ = (selector: string): HTMLElement | null => document.querySelector(selector)

describe('MetadataBar: the three states', () => {
  it('unbound renders NOTHING (the seat stays empty)', () => {
    const view = render(<MetadataBar t={t.en} binding={undefined} />)
    expect(view.container.innerHTML).toBe('')
  })

  it('bound renders the full bar: ⟂ task key — title / status Pill + 「查看任务」', () => {
    render(
      <MetadataBar
        t={t.en}
        binding={{ kind: 'bound', taskKey: 'feat/2.1', title: '实现会话列表增强', status: 'in_progress' }}
        onOpenTask={() => {}}
      />,
    )
    const bar = $('[data-dsh-forge-metadata-bar]')
    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('data-dsh-forge-metadata-state')).toBe('bound')
    expect(bar?.getAttribute('data-dsh-forge-metadata-task')).toBe('feat/2.1')
    expect(bar?.textContent).toContain('⟂')
    expect(bar?.textContent).toContain('task')
    expect(bar?.textContent).toContain('feat/2.1')
    expect(bar?.textContent).toContain('实现会话列表增强')
    expect($('[data-dsh-forge-metadata-status="in_progress"]')).not.toBeNull()
    expect($('[data-dsh-forge-metadata-status="in_progress"] [data-mock-state-dot]')?.getAttribute('data-mock-state-dot')).toBe('ongoing')
    expect($('[data-dsh-forge-metadata-open]')?.textContent).toBe('View task')
    // 双语: the zh face renders 查看任务 + the status short label.
    cleanup()
    render(
      <MetadataBar
        t={t.zh}
        binding={{ kind: 'bound', taskKey: 'feat/2.1', title: '实现会话列表增强', status: 'in_progress' }}
        onOpenTask={() => {}}
      />,
    )
    expect($('[data-dsh-forge-metadata-open]')?.textContent).toBe('查看任务')
  })

  it('ambiguous renders 「该会话执行中」 — no task number, no jump affordance', () => {
    render(<MetadataBar t={t.zh} binding={{ kind: 'ambiguous' }} onOpenTask={() => {}} />)
    const bar = $('[data-dsh-forge-metadata-bar]')
    expect(bar?.getAttribute('data-dsh-forge-metadata-state')).toBe('ambiguous')
    expect(bar?.textContent).toContain('该会话执行中')
    expect(bar?.textContent).not.toContain('feat/')
    expect($('[data-dsh-forge-metadata-open]')).toBeNull()
  })

  it('bound WITHOUT the seam stays informational (no button, no cursor)', () => {
    render(<MetadataBar t={t.en} binding={{ kind: 'bound', taskKey: 'feat/2.1', title: 't', status: 'pending' }} />)
    expect($('[data-dsh-forge-metadata-open]')).toBeNull()
    expect($('[data-dsh-forge-metadata-bar]')?.getAttribute('style')).not.toContain('pointer')
  })
})

// ---------------------------------------------------------------------------
// AC3 — 双向跳转 (click → open task detail)
// ---------------------------------------------------------------------------

describe('MetadataBar: the open-task seam', () => {
  const bound = { kind: 'bound' as const, taskKey: 'feat/2.1', title: 't', status: 'in_progress' }

  it('「查看任务」 fires the seam with the lineage taskKey', () => {
    const onOpenTask = vi.fn()
    render(<MetadataBar t={t.en} binding={bound} onOpenTask={onOpenTask} />)
    fireEvent.click($('[data-dsh-forge-metadata-open]') as HTMLElement)
    expect(onOpenTask).toHaveBeenCalledWith('feat/2.1')
  })

  it('the cluster button and the bar body fire the SAME seam (one open, not double)', () => {
    const onOpenTask = vi.fn()
    render(<MetadataBar t={t.en} binding={bound} onOpenTask={onOpenTask} />)
    fireEvent.click($('[data-dsh-forge-metadata-cluster]') as HTMLElement)
    expect(onOpenTask).toHaveBeenCalledTimes(1)
    fireEvent.click($('[data-dsh-forge-metadata-bar]') as HTMLElement)
    expect(onOpenTask).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// The dock host (the seat's runtime form)
// ---------------------------------------------------------------------------

/** The owner zone twin as the runtime InputZone flows it. */
const zone = (sessionId: string, subagent: boolean) => ({
  session: {
    sessionId,
    subagent: subagent
      ? { address: { parentSessionId: 'top-a', childSessionId: sessionId, mode: 'one-shot' as const } }
      : null,
  },
  input: {},
})

describe('MetadataBarDock: the seat host', () => {
  it('a non-subagent session renders nothing and never reads sources', async () => {
    const readSources = vi.fn(async () => SOURCES)
    const view = render(
      <MetadataBarDock t={t.en} {...zone('top-a', false)} readSources={readSources} onOpenTask={() => {}} />,
    )
    expect(view.container.innerHTML).toBe('')
    await waitFor(() => expect(readSources).not.toHaveBeenCalled())
  })

  it('a subagent session derives over the read sources and fires the seam on click', async () => {
    const onOpenTask = vi.fn()
    render(
      <MetadataBarDock
        t={t.en} {...zone('sub-1', true)} sessions={sessionsSource}
        readSources={async () => SOURCES} onOpenTask={onOpenTask}
      />,
    )
    await waitFor(() => {
      expect($('[data-dsh-forge-metadata-state="bound"]')).not.toBeNull()
    })
    fireEvent.click($('[data-dsh-forge-metadata-open]') as HTMLElement)
    expect(onOpenTask).toHaveBeenCalledWith('feat/2.1')
  })

  it('a rejecting or absent read degrades to unbound (silent, no bar)', async () => {
    const view = render(
      <MetadataBarDock t={t.en} {...zone('sub-1', true)} sessions={sessionsSource}
        readSources={async () => { throw new Error('bridge gone') }} />,
    )
    await waitFor(() => { expect(view.container.innerHTML).toBe('') })
    cleanup()
    const view2 = render(<MetadataBarDock t={t.en} {...zone('sub-1', true)} sessions={sessionsSource} />)
    await waitFor(() => { expect(view2.container.innerHTML).toBe('') })
  })

  it('an absent sessions source (degraded snapshot) renders nothing', async () => {
    const view = render(
      <MetadataBarDock t={t.en} {...zone('sub-1', true)} readSources={async () => SOURCES} />,
    )
    await waitFor(() => { expect(view.container.innerHTML).toBe('') })
  })
})

// ---------------------------------------------------------------------------
// 零侵入 — the installer (one list entry, declaration-merge only)
// ---------------------------------------------------------------------------

/** Fake client ctx over the real SlotCore (the rightbar-container.spec pattern). */
function makeFakeCtx(core: SlotCore): Context {
  const ctx = {
    effect(fn: () => (() => void) | undefined | void): () => void {
      const dispose = fn()
      return () => dispose?.()
    },
    slots: {
      register: (options: object, component: unknown) =>
        core.register(options as Parameters<SlotCore['register']>[0], component as never),
      inject(key: string, callback: () => (() => void) | undefined | void): () => void {
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
    },
  }
  return ctx as unknown as Context
}

/** Declare the dock slot the way ui-conversation's factory does (a list child under a session-scoped parent). */
function declareDockSlot(core: SlotCore): void {
  core.register(
    { name: 'root', children: { 'conversation.stub': { kind: 'single', scope: 'root' } } },
    () => null,
  )
  core.register(
    { name: 'conversation.stub', children: { [CONVERSATION_DOCK_SLOT]: { kind: 'list', scope: 'session' } } },
    () => null,
  )
}

describe('installMetadataBar: the declaration-merge seat', () => {
  it('registers ONE list entry under the dock slot; dispose removes it', () => {
    const core = new SlotCore()
    declareDockSlot(core)
    const dispose = installMetadataBar(makeFakeCtx(core), { t: t.en })
    const entries = core.entriesOfSlot(CONVERSATION_DOCK_SLOT)
    expect(entries.map(entry => entry.options.id)).toEqual([METADATA_BAR_DOCK_ID])
    expect(entries[0]?.options.order).toBe(20)
    dispose()
    expect(core.entriesOfSlot(CONVERSATION_DOCK_SLOT)).toEqual([])
  })

  it('waits for the upstream declaration (arrival-order; nothing registered before)', () => {
    const core = new SlotCore()
    const dispose = installMetadataBar(makeFakeCtx(core), { t: t.en })
    expect(core.entriesOfSlot(CONVERSATION_DOCK_SLOT)).toEqual([])
    declareDockSlot(core)
    expect(core.entriesOfSlot(CONVERSATION_DOCK_SLOT).map(entry => entry.options.id)).toEqual([METADATA_BAR_DOCK_ID])
    dispose()
  })
})
