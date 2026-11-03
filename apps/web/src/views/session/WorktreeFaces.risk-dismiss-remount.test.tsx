// bug e2a10cd4「不再提示」闩锁重挂击穿面（happy-dom 真实挂载——create-bind/drift-portal 同构）：
// riskDismissed 挂组件 useState（范本反例）——确认「不再提示」后 openWorkspace 切主视图
// 触发 ForgeHeroWorktreeMount 重挂，组件态清零且 settings 写透未及回读（fire-and-forget
// 竞态窗）→ 换一行跨分支目标重弹确认框（fail 向 = 用户级一票失守）。
// 断言面 = 重挂后点选另一跨分支行零弹框（模块级跨重挂记忆，a944424f 同族形态）。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { ForgeRpcClient } from '../../rpc/client.js'
import { ForgeHeroWorktreeMount } from './WorktreeFaces.js'
import { riskDismissedMemoryOf, riskDismissedMemorySync } from './hero-picker-model.js'

const OPEN_KEY = '__dshForgeOpenWorkspace'
const MAIN = 'C:/repo'
const WT_A = 'C:/repo/.forge/worktrees/wt-a'
const WT_B = 'C:/repo/.forge/worktrees/wt-b'

const ROWS = [
  { path: MAIN, branch: 'main', worktreeName: 'repo', workspaceId: 'ws-main', isMain: true, present: true },
  { path: WT_A, branch: 'feat/a', worktreeName: 'wt-a', workspaceId: 'ws-a', isMain: false, present: true },
  { path: WT_B, branch: 'feat/b', worktreeName: 'wt-b', workspaceId: 'ws-b', isMain: false, present: true },
]

/** rpc 替身：settings.get 恒缺席（模拟 set 写透未及回读的竞态窗——重挂读不到 true） */
function dismissRpc(settingsSetCalls: unknown[]): () => ForgeRpcClient {
  return () =>
    ({
      projects: { list: async () => [] },
      settings: {
        get: async () => ({}),
        set: async (payload: unknown) => {
          settingsSetCalls.push(payload)
        },
      },
      worktree: {
        list: async () => ({ isGit: true, worktreeDir: 'C:/repo/.forge/worktrees', entries: ROWS }),
        selected: async () => ({}),
        select: async () => ({}),
        branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
        ensureWorkspace: async () => ({ workspaceId: 'ws-x' }),
        aheadBehind: async () => ({}),
      },
    }) as unknown as ForgeRpcClient
}

async function mountHero(rpc: () => ForgeRpcClient, opened: string[]): Promise<{ host: HTMLElement; root: ReturnType<typeof createRoot> }> {
  ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
    opened.push(workspaceId)
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<ForgeHeroWorktreeMount projectRoot={MAIN} makeRpc={rpc} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  return { host, root }
}

/** 开 hero 菜单并点选指定树名行（点选 → 跨分支确认框或直通 applySelection） */
async function clickRow(host: HTMLElement, name: string): Promise<void> {
  const trigger = host.querySelector('[data-dswt-hero-trigger]')
  expect(trigger, '触发 chip 应呈现').not.toBeNull()
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
  const row = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].find(
    (el) => el.textContent?.includes(name),
  )
  expect(row, `${name} 行应呈现`).not.toBeNull()
  await act(async () => {
    row!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

function riskDialog(): Element | null {
  return [...document.querySelectorAll('[role="dialog"]')].find((el) => el.textContent?.includes('跨分支风险确认')) ?? null
}

async function checkDismissAndConfirm(): Promise<void> {
  const dialog = riskDialog()
  expect(dialog, '跨分支确认框应呈现').not.toBeNull()
  const boxes = dialog!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  expect(boxes.length, '知悉勾选 + 不再提示勾选应齐备').toBe(2)
  await act(async () => {
    boxes[0]!.click()
    boxes[1]!.click()
    await Promise.resolve()
  })
  const confirm = [...dialog!.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.includes('确认继续'))
  expect(confirm, '确认钮应呈现').not.toBeNull()
  await act(async () => {
    confirm!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
}

describe('bug e2a10cd4：「不再提示」跨重挂保持（重挂后换跨分支目标零重弹）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
    riskDismissedMemorySync(false) // 用例隔离：模块级记忆回基线
  })

  it('确认「不再提示」后重挂（settings 写透竞态窗）→ 点选另一跨分支行零弹框、直通选中', async () => {
    const setCalls: unknown[] = []
    const openedFirst: string[] = []
    const first = await mountHero(dismissRpc(setCalls), openedFirst)
    // ① 点选 wt-a（feat/a ≠ main）→ 确认框；勾「不再提示」确认 → 闩锁 + openWorkspace
    await clickRow(first.host, 'wt-a')
    await checkDismissAndConfirm()
    expect(openedFirst, '确认后应直通 openWorkspace').toEqual(['ws-a'])
    expect(setCalls, '「不再提示」应写透 settings').toEqual([{ worktree: { crossBranchRiskDismissed: true } }])
    // ② 重挂（openWorkspace 切主视图同构）：settings.get 仍缺席——组件态应自模块级记忆水合
    first.root.unmount()
    const openedSecond: string[] = []
    const second = await mountHero(dismissRpc(setCalls), openedSecond)
    await clickRow(second.host, 'wt-b') // 换一行跨分支目标——riskDismissed 失守即重弹
    expect(riskDialog(), '用户级「不再提示」跨重挂保持——零重弹').toBeNull()
    expect(openedSecond, '直通选中（零确认框阻断）').toEqual(['ws-b'])
    second.root.unmount()
  })

  it('记忆面水合：置位后 riskDismissedMemoryOf 读回 true（重挂初始化惰性读消费）', () => {
    riskDismissedMemorySync(true)
    expect(riskDismissedMemoryOf()).toBe(true)
  })
})
