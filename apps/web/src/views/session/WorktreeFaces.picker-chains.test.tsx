// picker 四链组件测试（plugin-project 1.4——WorktreeFaces 拆迁前的 UI 回归锚）：
// 四链各至少一测，mock RPC 通道驱动 + openWorkspace face / 选中锚 window 替身
// （create-bind 同构）：
//   ① 点选切换：菜单点选行 → 选中态落定（window 锚回填 + chip 回填）+ openWorkspace
//     以行 workspaceId 显式调用；
//   ② 切换闸：openWorkspace 未敛棋窗口内 isWorktreeSwitchPending 置位（composer 禁输
//     窗口——conversation.blocks 缝消费此态），敛棋后归零；
//   ③ 懒物化：行 workspaceId 缺席 → 点选时点 ensureWorkspace find-or-create 拿 id
//     再 openWorkspace；
//   ④ 陈旧自愈：选中行 present=false → 选中态清回主行（openWorkspace 主行 + select
//     推送主行）+ StaleSelectionNotice 一次性呈现。
// 测试落在 apps/web 现位（WorktreeFaces 拆迁前）；断言组件行为（face 调用/锚态/notice
// 语义锚），不锁 DOM 层级细节。行分支与主行同支（branch=main）——零风险确认直通，
// 跨分支确认闩锁链归 risk-dismiss-remount/create-bind 既有单测。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { isWorktreeSwitchPending } from '../../state/worktree-switch-gate.js'
import type { ForgeRpcClient } from '../../rpc/client.js'
import { ForgeHeroWorktreeMount } from './WorktreeFaces.js'

const OPEN_KEY = '__dshForgeOpenWorkspace'
const ANCHOR_KEY = '__dshForgeSelectedTree'

const ROOT = 'C:/repo'
const MAIN = 'C:/repo'
const WT = 'C:/repo/.forge/worktrees/wt-same'

interface ListEntry {
  readonly path: string
  readonly branch: string | null
  readonly worktreeName: string
  readonly workspaceId?: string
  readonly isMain: boolean
  readonly present: boolean
}

/** 行集工厂（同支行——零风险确认直通） */
function rowsOf(opts: { readonly wtPresent?: boolean; readonly wtWorkspaceId?: string }): ListEntry[] {
  const wt: ListEntry = {
    path: WT,
    branch: 'main',
    worktreeName: 'wt-same',
    isMain: false,
    present: opts.wtPresent ?? true,
    ...(opts.wtWorkspaceId !== undefined ? { workspaceId: opts.wtWorkspaceId } : {}),
  }
  return [
    { path: MAIN, branch: 'main', worktreeName: 'repo', workspaceId: 'ws-main', isMain: true, present: true },
    wt,
  ]
}

interface SelectCall {
  readonly projectRoot: string
  readonly path?: string
}

interface Probe {
  readonly selectCalls: SelectCall[]
}

/** rpc 替身：list 行集由 listEntriesRef 现值给（重拉读最新），openWorkspace face 由外部注入 */
function makeRpcFactory(
  listEntriesRef: { current: ListEntry[] },
  opts: { readonly ensureId?: string; readonly probe?: Probe } = {},
): () => ForgeRpcClient {
  return () =>
    ({
      projects: { list: async () => [] },
      settings: { get: async () => ({}), set: async () => undefined },
      worktree: {
        list: async () => ({ isGit: true, worktreeDir: 'C:/repo/.forge/worktrees', entries: listEntriesRef.current }),
        selected: async () => ({}),
        select: async (payload: SelectCall) => {
          opts.probe?.selectCalls.push(payload)
          return {}
        },
        branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
        ensureWorkspace: async (payload: { projectRoot: string; path: string }) => {
          void payload
          return { workspaceId: opts.ensureId ?? '' }
        },
        aheadBehind: async () => ({}),
      },
    }) as unknown as ForgeRpcClient
}

function openFaceOf(): string[] {
  const opened: string[] = []
  ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
    opened.push(workspaceId)
  }
  return opened
}

async function settleEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

interface Mount {
  readonly host: HTMLElement
  readonly root: Root
  /** 以新 factory 身份重挂（refresh dep 变更触发清单重拉） */
  rerender(factory: () => ForgeRpcClient): Promise<void>
}

async function mount(factory: () => ForgeRpcClient): Promise<Mount> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<ForgeHeroWorktreeMount projectRoot={ROOT} makeRpc={factory} />)
  })
  await settleEffects()
  return {
    host,
    root,
    rerender: async (next: () => ForgeRpcClient): Promise<void> => {
      await act(async () => {
        root.render(<ForgeHeroWorktreeMount projectRoot={ROOT} makeRpc={next} />)
      })
      await settleEffects()
    },
  }
}

/** 开菜单并点选 wt-same 行（回走 promise 微观敛棋） */
async function clickRow(): Promise<void> {
  const trigger = document.querySelector('[data-dswt-hero-trigger]')
  expect(trigger, '触发 chip 应呈现').not.toBeNull()
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
  const row = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].find(
    (el) => el.textContent?.includes('wt-same'),
  )
  expect(row, 'wt-same 行应呈现').not.toBeNull()
  await act(async () => {
    row!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

function anchorOf(): unknown {
  return (globalThis as unknown as Record<string, unknown>)[ANCHOR_KEY]
}

// ───────────────── ① 点选切换（选中态 + openWorkspace 调用）─────────────────

describe('链① 点选切换', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
  })

  it('点选同支行 → 选中态落定（锚回填 + chip 回填）且 openWorkspace 以行 workspaceId 调用', async () => {
    const ref = { current: rowsOf({ wtWorkspaceId: 'ws-wt' }) }
    const opened = openFaceOf()
    const ui = await mount(makeRpcFactory(ref))
    expect(anchorOf(), '挂载回填：无选中记忆时按锚定链落主行').toBe(MAIN)
    await clickRow()
    expect(opened, '主视图切到所选行 workspace（显示 = 实际生效状态）').toEqual(['ws-wt'])
    expect(anchorOf(), '选中态锚回填所选行路径').toBe(WT)
    const triggerText = ui.host.querySelector('[data-dswt-hero-trigger]')?.textContent ?? ''
    expect(triggerText, 'chip 回填所选行名').toContain('wt-same')
  })
})

// ───────────────── ② 切换闸（composer 禁输窗口）─────────────────

describe('链② 切换闸（bug 267dcac1 composer 禁输窗口）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
  })

  it('点选 → openWorkspace 未敛棋期间闸 pending；敛棋后闸归零', async () => {
    const ref = { current: rowsOf({ wtWorkspaceId: 'ws-wt' }) }
    const opened: string[] = []
    let release: (() => void) | undefined
    ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): Promise<void> => {
      opened.push(workspaceId)
      return new Promise<void>((resolve) => {
        release = resolve
      })
    }
    expect(isWorktreeSwitchPending(), '空闲态闸不置位').toBe(false)
    await mount(makeRpcFactory(ref))
    await clickRow()
    expect(opened, 'openWorkspace 已发起（闸窗口内）').toEqual(['ws-wt'])
    expect(isWorktreeSwitchPending(), 'openWorkspace 未敛棋 → 闸 pending（composer 禁输窗口）').toBe(true)
    await act(async () => {
      release?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(isWorktreeSwitchPending(), '敛棋后闸解除（composer 恢复可输）').toBe(false)
  })
})

// ───────────────── ③ 懒物化（ensureWorkspace find-or-create 后再开）─────────────────

describe('链③ 懒物化（bug 9d2b7e6a——行 workspaceId 缺席）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
  })

  it('点选无 workspaceId 的行 → ensureWorkspace({projectRoot,path}) find-or-create 后以 ensured id 开', async () => {
    const ref = { current: rowsOf({}) }
    const opened = openFaceOf()
    await mount(makeRpcFactory(ref, { ensureId: 'ws-ensured' }))
    await clickRow()
    expect(opened, 'openWorkspace 收到物化后的 workspaceId（非显示态捷径）').toEqual(['ws-ensured'])
    expect(anchorOf(), '选中态落定所选行').toBe(WT)
  })
})

// ───────────────── ④ 陈旧自愈（present=false 清选中 + StaleSelectionNotice）─────────────────

describe('链④ 陈旧自愈（bug 4a30b193 UI 面）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
  })

  it('选中行盘上消失（present=false）→ 选中清回主行（openWorkspace 主行 + select 推送）+ notice 呈现', async () => {
    const ref = { current: rowsOf({ wtWorkspaceId: 'ws-wt' }) }
    const opened = openFaceOf()
    const probe: Probe = { selectCalls: [] }
    const ui = await mount(makeRpcFactory(ref, { probe }))
    await clickRow()
    expect(opened, '前置：点选已开所选行 workspace').toEqual(['ws-wt'])
    expect(anchorOf()).toBe(WT)
    // 外部删除：wt-same 盘上缺席 → 以新 factory 身份重挂触发清单重拉（refresh dep 变更）
    ref.current = rowsOf({ wtPresent: false, wtWorkspaceId: 'ws-wt' })
    await ui.rerender(makeRpcFactory(ref, { probe }))
    expect(document.querySelector('[data-dswt-stale-selection-notice]'), '陈旧失效 notice 一次性呈现').not.toBeNull()
    expect(opened, '选中跳回主行（openWorkspace 主行 workspace）').toEqual(['ws-wt', 'ws-main'])
    expect(anchorOf(), '选中态锚清回主行路径').toBe(MAIN)
    expect(
      probe.selectCalls.some((call) => call.projectRoot === ROOT && call.path === MAIN),
      'host 选中记忆推送主行',
    ).toBe(true)
  })
})
