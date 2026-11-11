// official-seams 单测（fix-13——官方缝注册面迁移收编）：五面注册行 pin（chip 行 /
// overlay 双行 / Bug 台账 tab 两段 / @ Bug source）+ 接线面 pin（bugs.list RPC 递达 ·
// 状态面包屑 drill 切口径 · bug 图标件 · openReference 路由）+ 页内全局缝发布/摘除。
// 组件本体形状 pin（BugPreview/chip/seal overlay）归各自组件测试树；此树承担注册面。
// @vitest-environment happy-dom（页内全局缝 window 锚——publishBugChipRestorer 消费 window）
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUG_CHIP_RESTORE_ENTRY_ID,
  BUG_TAB_KIND,
  CONVERSATION_INPUT_OVERLAY_SLOT,
  SEAL_NOTICE_ENTRY_ID,
  SESSION_HEADER_ACTIONS_SLOT,
  SIDEBAR_RIGHT_PANE_TAB_SLOT,
  WORKTREE_CHIP_ENTRY_ID,
  WORKTREE_CHIP_ORDER,
  bugAddressOf,
  bugIdOfAddress,
  bugSourceCacheOf,
  buildBugReferenceSource,
  bugProjectsFromRows,
  bugProjectIdOf,
  registerOfficialSeamFaces,
  revokeOfficialSeamGlobals,
  FORGE_BUG_SOURCE_NAME,
  FORGE_BUG_SOURCE_ORDER,
  type OfficialSeamCtx,
} from './official-seams.js'
import { ForgeBugPreview, DSWF_BUG_ADDRESS_PREFIX, DSWF_BUG_TAB_KIND } from './bug-refs/BugPreview.js'
import { ForgeBugGlyph } from './bug-refs/BugGlyph.js'
import { ForgeSessionWorktreeChip } from './session-badge/chip.js'
import { ForgeWorktreeSealOverlay } from './session-badge/seal-notice.js'
import { ForgeBugChipRestoreOverlay } from './bug-refs/ChipRestoreOverlay.js'

// ── fake 官方面 ──

interface RegisterRow {
  key: string
  options: Record<string, unknown>
  component: unknown
}

function fakeSlots() {
  const injected: string[] = []
  const rows: RegisterRow[] = []
  const slots = {
    inject: (key: string, cb: () => (() => void) | undefined) => {
      injected.push(key)
      const dispose = cb()
      return () => dispose?.()
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      rows.push({ key: options['name'] as string, options, component })
      return () => {}
    },
  }
  return { injected, rows, slots }
}

interface TabsState {
  calls: Array<Record<string, unknown>>
  disposed: string[]
}

function fakeCtx(options?: { tabs?: TabsState; inputTriggers?: unknown; projects?: unknown; bugs?: unknown }) {
  const tabs: TabsState = options?.tabs ?? { calls: [], disposed: [] }
  const registered: unknown[] = []
  const svc = {
    registerSource: (src: unknown) => {
      registered.push(src)
      return () => {
        tabs.disposed.push('input-triggers')
      }
    },
  }
  const ctx: OfficialSeamCtx & { registered: unknown[]; tabs: TabsState } = {
    get(name: string): unknown {
      if (name === 'sidebarRightTabs') {
        return { register: (def: Record<string, unknown>) => { tabs.calls.push(def); return () => { tabs.disposed.push(def['id'] as string) } } }
      }
      if (name === 'sidebarRight') return { openResource: vi.fn() }
      if (name === 'workspaces') return { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }) } }
      if (name === 'sessions') return { binding: () => undefined }
      return undefined
    },
    effect: (factory: () => (() => void) | undefined) => {
      factory()
      return undefined
    },
    reflect: { get: (name: string) => (name === 'inputTriggers' ? (options?.inputTriggers === undefined ? svc : options.inputTriggers) : undefined) },
    registered,
    tabs,
  }
  return ctx
}

/** 页内 dshForge 传输替身 */
function stubTransport(routes: Record<string, (payload?: unknown) => unknown>): { calls: Array<{ channel: string; payload?: unknown }>; unstub: () => void } {
  const calls: Array<{ channel: string; payload?: unknown }> = []
  ;(globalThis as { dshForge?: unknown }).dshForge = {
    invoke: (channel: string, payload?: unknown) => {
      calls.push({ channel, payload })
      const route = routes[channel]
      return Promise.resolve(route === undefined ? { ok: false, error: { code: 'NO_ROUTE', message: 'no route' } } : route(payload))
    },
  }
  return { calls, unstub: () => { delete (globalThis as { dshForge?: unknown }).dshForge } }
}

const FIXTURE_PROJECTS = [
  { id: 'p1', workspaceId: 'w1' },
  { id: 'p2', workspaceId: 'w2' },
]
const FIXTURE_NOW = '2026-10-14T00:00:00.000Z'
const FIXTURE_BUGS = [
  { bugId: 'b-2', summary: '已修一条', bugStatus: 'fixed', bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a', reporter: 'r', createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW },
  { bugId: 'b-1', summary: '在修一条', bugStatus: 'open', bugDesc: 'd', triggerDesc: 't', expected: 'e', actual: 'a', reporter: 'r', createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW },
]
const SIGNAL = new AbortController().signal

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  delete (globalThis as { dshForge?: unknown }).dshForge
  revokeOfficialSeamGlobals()
})

// ── 五面注册行 pin ──

describe('registerOfficialSeamFaces（fix-13 迁移面——五面注册行）', () => {
  it('①-③ 声明缝 + 行形状 pin：chip id ' + WORKTREE_CHIP_ENTRY_ID + ' / overlay 双行 seal + chip-restore（list 槽必带 id）', () => {
    const slots = fakeSlots()
    const seams = registerOfficialSeamFaces(fakeCtx(), slots.slots)
    expect(seams.registered).toEqual(expect.arrayContaining([WORKTREE_CHIP_ENTRY_ID, SEAL_NOTICE_ENTRY_ID, BUG_CHIP_RESTORE_ENTRY_ID, BUG_TAB_KIND, FORGE_BUG_SOURCE_NAME]))
    const chip = slots.rows.find((r) => r.key === SESSION_HEADER_ACTIONS_SLOT)
    expect(chip).toBeDefined()
    expect(chip!.options.id).toBe(WORKTREE_CHIP_ENTRY_ID)
    expect(chip!.options.order).toBe(WORKTREE_CHIP_ORDER)
    expect(chip!.component).toBe(ForgeSessionWorktreeChip)
    const overlayRows = slots.rows.filter((r) => r.key === CONVERSATION_INPUT_OVERLAY_SLOT)
    expect(overlayRows).toHaveLength(2)
    expect(overlayRows[0]!.options.id).toBe(SEAL_NOTICE_ENTRY_ID)
    expect(overlayRows[0]!.component).toBe(ForgeWorktreeSealOverlay)
    expect(overlayRows[1]!.options.id).toBe(BUG_CHIP_RESTORE_ENTRY_ID)
    expect(overlayRows[1]!.component).toBe(ForgeBugChipRestoreOverlay)
  })

  it('④ Bug 台账 tab 两段：类型定义（multiple + patterns + canOpen + 标题）+ keyed body（组件 = ForgeBugPreview）；字面量同源 pin ↔ BugPreview 镜像', () => {
    const slots = fakeSlots()
    const ctx = fakeCtx()
    registerOfficialSeamFaces(ctx, slots.slots)
    expect(ctx.tabs.calls).toHaveLength(1)
    const bugType = ctx.tabs.calls[0]!
    expect(bugType['id']).toBe(BUG_TAB_KIND)
    expect(bugType['kind']).toBe(BUG_TAB_KIND)
    expect(bugType['multiple']).toBe(true)
    expect(bugType['patterns']).toEqual([`dsh-resource://dswf-bug/**`])
    const canOpen = bugType['canOpen'] as (address: string) => boolean
    expect(canOpen(bugAddressOf('p1', 'b-42'))).toBe(true)
    expect(canOpen('dsh-resource://dswf-doc/p1/a.md')).toBe(false)
    const title = bugType['title'] as (address: string) => string
    expect(title(bugAddressOf('p1', 'b-42'))).toBe('Bug b-42')
    expect(title('dsh-resource://dswf-bug/')).toBe('Bug 台账')
    // 字面量同源 pin（注册面常量 ↔ BugPreview.tsx 正本——bundle 自含不经 import）
    expect(BUG_TAB_KIND).toBe(DSWF_BUG_TAB_KIND)
    expect(bugAddressOf('p1', 'b-42')).toBe(`dsh-resource://${DSWF_BUG_TAB_KIND}/p1/b-42`)
    expect(DSWF_BUG_ADDRESS_PREFIX).toBe('dsh-resource://dswf-bug/')
    expect(bugIdOfAddress('dsh-resource://dswf-bug/p1/')).toBeUndefined()
    // keyed body
    const body = slots.rows.find((r) => r.key === SIDEBAR_RIGHT_PANE_TAB_SLOT)
    expect(body).toBeDefined()
    expect(body!.options.key).toBe(BUG_TAB_KIND)
    expect(body!.component).toBe(ForgeBugPreview)
  })

  it('⑤ @ Bug source：reflect.get(inputTriggers) 恰挂一 source——trigger @ / name dswf-bug / order 30 / 方法面在位 / lexicon 缺席；页内全局缝双发布（chip 重建 + source 缓存）', () => {
    const slots = fakeSlots()
    const ctx = fakeCtx()
    const transport = stubTransport({
      'forge:projects/list': () => ({ ok: true, data: FIXTURE_PROJECTS }),
      'forge:bugs/list': () => ({ ok: true, data: FIXTURE_BUGS }),
    })
    registerOfficialSeamFaces(ctx, slots.slots)
    expect(ctx.registered).toHaveLength(1)
    const source = ctx.registered[0] as Record<string, unknown>
    expect(source['trigger']).toBe('@')
    expect(source['name']).toBe(FORGE_BUG_SOURCE_NAME)
    expect(source['order']).toBe(FORGE_BUG_SOURCE_ORDER)
    expect(source['order']).toBe(30)
    expect(typeof source['candidates']).toBe('function')
    expect(typeof source['header']).toBe('function')
    expect(typeof source['onPick']).toBe('function')
    expect(typeof source['openReference']).toBe('function')
    expect(source['lexicon']).toBeUndefined()
    expect(source['subscribeLexicon']).toBeUndefined()
    // 页内全局缝：chip 重建闭包 + source 快照缓存（壳侧 1.4 快速路径跨 bundle 消费）
    expect(typeof (globalThis as { __DSH_FORGE_BUG_CHIP_RESTORE__?: unknown }).__DSH_FORGE_BUG_CHIP_RESTORE__).toBe('function')
    expect(bugSourceCacheOf()?.cacheBugSnapshot).toBeTypeOf('function')
    void transport
  })

  it('fail-soft：inputTriggers 缺席 / registerSource throw / 官方服务缺席——不炸不注册其余面不受累', () => {
    const a = fakeSlots()
    const ctxA = fakeCtx({ inputTriggers: undefined })
    expect(() => registerOfficialSeamFaces(ctxA, a.slots)).not.toThrow()
    expect(a.rows.find((r) => r.key === SESSION_HEADER_ACTIONS_SLOT)).toBeDefined() // 其余面不受累
    const b = fakeSlots()
    const ctxB = fakeCtx({ inputTriggers: { registerSource: () => { throw new Error('duplicate trigger/name') } } })
    expect(() => registerOfficialSeamFaces(ctxB, b.slots)).not.toThrow()
    const missing = fakeSlots()
    const ctxMissing = fakeCtx()
    ;(ctxMissing as { get: (n: string) => unknown }).get = () => undefined
    const seams = registerOfficialSeamFaces(ctxMissing, missing.slots)
    expect(seams.registered).not.toContain(FORGE_BUG_SOURCE_NAME)
    expect(seams.registered).not.toContain(BUG_TAB_KIND)
  })

  it('revokeOfficialSeamGlobals：页内全局摘除（死闭包不残留）', () => {
    const slots = fakeSlots()
    stubTransport({})
    registerOfficialSeamFaces(fakeCtx(), slots.slots)
    expect(bugSourceCacheOf()).toBeDefined()
    revokeOfficialSeamGlobals()
    expect(bugSourceCacheOf()).toBeUndefined()
    expect((globalThis as { __DSH_FORGE_BUG_CHIP_RESTORE__?: unknown }).__DSH_FORGE_BUG_CHIP_RESTORE__).toBeUndefined()
  })
})

// ── 接线面 pin（buildBugReferenceSource——自壳侧 plugin.ts 逐字迁移） ──

describe('buildBugReferenceSource 接线面（composer-bug-reference 1.2/1.3）', () => {
  function wiringSource(routes: Record<string, (payload?: unknown) => unknown>, overrides?: { bugIcon?: unknown }) {
    const transport = stubTransport(routes)
    const source = buildBugReferenceSource({
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }) } },
      sidebarRight: { openResource: vi.fn() },
      ...overrides,
    })
    source.warm({ sessionId: '' }) // 登记期预热等价（projects 缓存就绪——锚定解析前提）
    return { source, transport }
  }

  it('candidates 递达 bugs.list：projectId 沿会话↔workspace 绑定锚解析，query 透传 search，open 优先排序', async () => {
    const { source, transport } = wiringSource({
      'forge:projects/list': () => ({ ok: true, data: FIXTURE_PROJECTS }),
      'forge:bugs/list': (payload) => ({
        ok: true,
        data: FIXTURE_BUGS.filter((b) => b.summary.includes((payload as { search?: string }).search ?? '')),
      }),
    })
    await flush()
    const rows = await source.candidates({ sessionId: 's1' }, { query: '在修', position: 'inline', drilled: false, signal: SIGNAL })
    expect(rows.map((r) => r.name)).toEqual(['b-1'])
    expect(transport.calls.some((c) => c.channel === 'forge:bugs/list' && JSON.stringify(c.payload) === JSON.stringify({ projectId: 'p1', search: '在修' }))).toBe(true)
    transport.unstub()
  })

  it('状态面包屑：header 四 crumb；drill 切口径后 candidates 以 status 入参重拉', async () => {
    const { source, transport } = wiringSource({
      'forge:projects/list': () => ({ ok: true, data: FIXTURE_PROJECTS }),
      'forge:bugs/list': (payload) => {
        const status = (payload as { status?: string[] }).status
        return { ok: true, data: status === undefined ? FIXTURE_BUGS : FIXTURE_BUGS.filter((b) => status.includes(b.bugStatus)) }
      },
    })
    await flush()
    const crumbs = source.header!({ sessionId: 's1' }, { query: '', drilled: false })
    expect(crumbs.map((c) => c.label)).toEqual(['全部', 'open', 'fixed', 'unresolved'])
    expect(source.bugStatusScope()).toBe('all')
    const outcome = source.onPick({
      candidate: { name: 'scope:fixed', value: crumbs.find((c) => c.label === 'fixed')!.value },
      session: { sessionId: 's1' },
      position: 'inline',
      via: 'menu',
      action: 'drill',
    })
    expect(outcome).toBe('handled')
    expect(source.bugStatusScope()).toBe('fixed')
    const rows = await source.candidates({ sessionId: 's1' }, { query: '', position: 'leading', drilled: true, signal: SIGNAL })
    expect(rows.map((r) => r.name)).toEqual(['b-2'])
    transport.unstub()
  })

  it('fail-soft：quoted=true 空候选；无 dshForge 传输 → 零候选不抛', async () => {
    const withRoutes = wiringSource({
      'forge:projects/list': () => ({ ok: true, data: FIXTURE_PROJECTS }),
      'forge:bugs/list': () => ({ ok: true, data: FIXTURE_BUGS }),
    })
    await flush()
    const quoted = await withRoutes.source.candidates({ sessionId: 's1' }, { query: '任意', quoted: true, position: 'inline', drilled: false, signal: SIGNAL })
    expect(quoted).toEqual([])
    withRoutes.transport.unstub()
    const noTransport = buildBugReferenceSource({
      workspaces: { list: { getSnapshot: () => ({ items: [] }) } },
      sidebarRight: { openResource: vi.fn() },
      invoke: undefined,
    })
    const rows = await noTransport.candidates({ sessionId: 's1' }, { query: '', position: 'inline', drilled: false, signal: SIGNAL })
    expect(rows).toEqual([])
  })

  it('bug 图标件：deps.bugIcon 递达 → 候选行 icon；缺席 → 行零 icon 键', async () => {
    const withGlyph = wiringSource({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p1', workspaceId: 'w1' }] }),
      'forge:bugs/list': () => ({ ok: true, data: FIXTURE_BUGS }),
    }, { bugIcon: ForgeBugGlyph })
    await flush()
    const rows = await withGlyph.source.candidates({ sessionId: 's1' }, { query: '', position: 'inline', drilled: false, signal: SIGNAL })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => (r as { icon?: unknown }).icon === ForgeBugGlyph)).toBe(true)
    withGlyph.transport.unstub()
    const noGlyph = buildBugReferenceSource({
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }) } },
      sidebarRight: { openResource: vi.fn() },
    })
    await flush()
    const bare = await noGlyph.candidates({ sessionId: 's1' }, { query: '', position: 'inline', drilled: false, signal: SIGNAL })
    expect(bare.every((r) => !('icon' in r))).toBe(true)
  })

  it('warm：scope 出生预热——projects.list 先落缓存随后 bugs.list 预取（锚定项目口径）', async () => {
    const { source, transport } = wiringSource({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p9', workspaceId: 'w9' }] }),
      'forge:bugs/list': () => ({ ok: true, data: [] }),
    })
    source.warm({ sessionId: 's9' })
    await flush()
    expect(transport.calls.some((c) => c.channel === 'forge:bugs/list' && JSON.stringify(c.payload) === JSON.stringify({ projectId: 'p9' }))).toBe(true)
    transport.unstub()
  })

  it('openReference（1.3）：bug ref → sidebarRight.openResource 开台账 pane → true；非 bug 引用 → false；官方面抛错 → false', async () => {
    const openResource = vi.fn()
    const transport = stubTransport({
      'forge:projects/list': () => ({ ok: true, data: [{ id: 'p1', workspaceId: 'w1' }] }),
      'forge:bugs/list': () => ({ ok: true, data: FIXTURE_BUGS }),
    })
    const source = buildBugReferenceSource({
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }) } },
      sidebarRight: { openResource },
    })
    source.warm({ sessionId: '' }) // 登记期预热（openReference 会话锚解析前提）
    await flush()
    expect(source.openReference({ sessionId: 's1' }, { ref: 'bug:b-42' })).toBe(true)
    expect(openResource).toHaveBeenCalledWith('dsh-resource://dswf-bug/p1/b-42', { kind: BUG_TAB_KIND })
    expect(source.openReference({ sessionId: 's1' }, { ref: 'file:src/a.ts' })).toBe(false)
    expect(source.openReference({ sessionId: 's1' }, { ref: '' })).toBe(false)
    expect(openResource).toHaveBeenCalledTimes(1)
    openResource.mockImplementationOnce(() => { throw new Error('no active pane') })
    expect(source.openReference({ sessionId: 's1' }, { ref: 'bug:b-42' })).toBe(false)
    transport.unstub()
  })

  it('纯函数 pin：bugProjectsFromRows 行集正规化 + bugProjectIdOf 锚定/唯一兜底', () => {
    expect(bugProjectsFromRows([{ id: 'p1', workspaceId: 'w1' }, { id: 'x' }, null, 'junk'])).toEqual([{ id: 'p1', workspaceId: 'w1' }])
    expect(bugProjectsFromRows('junk')).toEqual([])
    const projects = [{ id: 'p1', workspaceId: 'w1' }, { id: 'p2', workspaceId: 'w2' }]
    expect(bugProjectIdOf('s1', { items: [{ workspaceId: 'w2', sessionIds: ['s1'] }] }, projects)).toBe('p2')
    expect(bugProjectIdOf('s-none', { items: [] }, [{ id: 'p1', workspaceId: 'w1' }])).toBe('p1')
    expect(bugProjectIdOf('s-none', undefined, projects)).toBeUndefined()
  })
})
