// bug 97d3cd9e 建树自动选中绑定面（happy-dom 真实挂载——drift-portal 同构）：
// 新建 worktree 成功 → chip 自动选中新树 → 主视图必须随之切到新树（openWorkspace face
// 以新树 workspaceId 调用）——否则 composer 仍系旧树 blank，直接发送消息会话绑到上一个
// worktree（WYSIWYG 违例）。断言面 = openWorkspace face 收到新树 workspaceId。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import type { WorktreeFacesRpc } from '../rpc.js'
import { ForgeHeroWorktreeMount } from './picker.js'

const OPEN_KEY = '__dshForgeOpenWorkspace'

const MAIN = 'C:/repo'
const NEW_PATH = 'C:/repo/.forge/worktrees/wt-new'

interface ListEntry {
  readonly path: string
  readonly branch: string | null
  readonly worktreeName: string
  readonly workspaceId?: string
  readonly isMain: boolean
  readonly present: boolean
}

function entriesWith(withNew: boolean): ListEntry[] {
  const base: ListEntry[] = [
    { path: MAIN, branch: 'main', worktreeName: 'repo', isMain: true, present: true },
    { path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a', worktreeName: 'wt-a', isMain: false, present: true },
  ]
  return withNew
    ? [...base, { path: NEW_PATH, branch: 'feat/new', worktreeName: 'wt-new', isMain: false, present: true }]
    : base
}

function mountRpc(): () => WorktreeFacesRpc {
  return (() =>
    ({
      projects: {
        list: async () => [],
      },
      settings: {
        get: async () => ({}),
        set: async () => undefined,
      },
      worktree: {
        list: async () => ({ isGit: true, worktreeDir: 'C:/repo/.forge/worktrees', entries: entriesWith(created) }),
        selected: async () => ({}),
        select: async () => ({}),
        branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
        create: async () => {
          created = true
          return { entry: { path: NEW_PATH, branch: 'feat/new', worktreeName: 'wt-new', isMain: false, present: true } }
        },
        ensureWorkspace: async () => ({ workspaceId: 'ws-new' }),
        aheadBehind: async () => ({}),
      },
    }) as unknown as WorktreeFacesRpc)
}

let created = false

async function mountAndCreateNewWorktree(): Promise<string[]> {
  const opened: string[] = []
  ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
    opened.push(workspaceId)
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<ForgeHeroWorktreeMount projectRoot={MAIN} makeRpc={mountRpc()} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
  // ① 点触发 chip 开菜单
  const trigger = host.querySelector('[data-dswt-hero-trigger]')
  expect(trigger, '触发 chip 应呈现').not.toBeNull()
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
  // ② 点 footer「新建 worktree…」开弹窗
  const footerItem = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].find(
    (el) => el.textContent?.includes('新建 worktree'),
  )
  expect(footerItem, 'footer 新建入口应呈现').not.toBeNull()
  await act(async () => {
    footerItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
  // ③ 弹窗填分支名（受控 input——原生 setter + input 事件）
  const branchInput = document.querySelector<HTMLInputElement>('[data-dswt-branch-input]')
  expect(branchInput, '分支输入应呈现').not.toBeNull()
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(branchInput!, 'feat/new')
    branchInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
  // ④ 提交创建
  const submit = document.querySelector<HTMLButtonElement>('[data-dswt-create-submit]')
  expect(submit, '创建提交钮应呈现').not.toBeNull()
  expect(submit!.disabled, '表单就绪后提交钮应可用').toBe(false)
  await act(async () => {
    submit!.click()
    await Promise.resolve()
  })
  // 创建 RPC → refresh → 选中落定 → ensure-workspace → openWorkspace 全链敛棋
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
  return opened
}

describe('建树自动选中 = 完整选中（bug 97d3cd9e——主视图随创建切到新树）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
    created = false
  })

  it('创建成功后 openWorkspace face 以新树 workspaceId 调用（composer 随之系新树）', async () => {
    const opened = await mountAndCreateNewWorktree()
    expect(opened, '主视图应切到新树 workspace').toEqual(['ws-new'])
  })
})

// ───────────── bug 70188b91：localSelectedPath 跨 projectRoot 残留 ─────────────
// hero 弹层切项目（不经 applySelection）→ 残留路径在新项目行集被判「陈旧失效」：
// 伪失效 notice + 强切主行（绕过分支锚定链，openWorkspace 被强制调用）+ window 锚停留
// 旧项目树路径（startSession 无参径跨项目错绑的触发源）。修复 = projectRoot 变更即清
// 本地投影，回填效应按新项目锚定链重新落定（零编排）。

const ANCHOR_KEY = '__dshForgeSelectedTree'

describe('bug 70188b91：projectRoot 变更清退本地选中投影', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
  })

  it('项目 B 选中 wt-b 后切到项目 A：零伪失效 notice、回填主行零 openWorkspace、锚不残留 B 树路径', async () => {
    const rootA = 'C:/proj-a'
    const rootB = 'C:/proj-b'
    const wtB = 'C:/proj-b/.forge/worktrees/wt-b'
    const mainA = 'C:/proj-a'
    const rowsOf = (root: string): ListEntry[] =>
      root === rootA
        ? [
            { path: mainA, branch: 'main', worktreeName: 'proj-a', workspaceId: 'ws-a-main', isMain: true, present: true },
            { path: 'C:/proj-a/.forge/worktrees/wt-a', branch: 'feat/a', worktreeName: 'wt-a', isMain: false, present: true },
          ]
        : [
            { path: rootB, branch: 'main', worktreeName: 'proj-b', workspaceId: 'ws-b-main', isMain: true, present: true },
            { path: wtB, branch: 'main', worktreeName: 'wt-b', workspaceId: 'ws-b-wt', isMain: false, present: true },
          ]
    const rpc = (() =>
      ({
        projects: { list: async () => [] },
        settings: { get: async () => ({}), set: async () => undefined },
        worktree: {
          list: async (q: { projectRoot: string }) => ({ isGit: true, worktreeDir: `${q.projectRoot}/.forge/worktrees`, entries: rowsOf(q.projectRoot) }),
          selected: async () => ({}),
          select: async () => ({}),
          branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
          aheadBehind: async () => ({}),
        },
      }) as unknown as WorktreeFacesRpc)
    const opened: string[] = []
    ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
      opened.push(workspaceId)
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<ForgeHeroWorktreeMount projectRoot={rootB} makeRpc={rpc} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    // 项目 B：开菜单点选 wt-b（branch=main 与主行同分支 → 零风险确认直通）
    const trigger = host.querySelector('[data-dswt-hero-trigger]')
    expect(trigger, '触发 chip 应呈现').not.toBeNull()
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const row = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].find(
      (el) => el.textContent?.includes('wt-b'),
    )
    expect(row, 'wt-b 行应呈现').not.toBeNull()
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(opened, '前置：点选 wt-b 应 openWorkspace 其 workspace').toEqual(['ws-b-wt'])
    // 切到项目 A（hero 弹层 onPick——不经 applySelection）
    await act(async () => {
      root.render(<ForgeHeroWorktreeMount projectRoot={rootA} makeRpc={rpc} />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(document.querySelector('[data-dswt-stale-selection-notice]'), '零伪失效 notice').toBeNull()
    // bug c6e124c2：回填落定 = 完整选中（显示 = 生效）——A 项目回填解析为主行，主行回填
    // 零编排（主视图缺省即主树）；非主树回填才 openWorkspace（见下方 c6e124c2 组）
    expect(opened, '回填主行零 openWorkspace（非主树回填才切主视图）').toEqual(['ws-b-wt'])
    const anchor = (globalThis as unknown as Record<string, unknown>)[ANCHOR_KEY]
    expect(anchor, 'window 锚不残留 B 树路径（按 A 锚定链重新落定）').toBe(mainA)
  })
})

describe('bug c6e124c2：默认回填显示树 = 主视图树（所见即所得）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete (globalThis as unknown as Record<string, unknown>)[OPEN_KEY]
    delete (globalThis as unknown as Record<string, unknown>)[ANCHOR_KEY]
  })

  it('host 选中记忆回填非主树 → chip 显示该树且 openWorkspace 切主视图到该树', async () => {
    const root = 'Z:/proj'
    const wt = 'Z:/proj/.forge/worktrees/plugins'
    const rpc = (() =>
      ({
        projects: { list: async () => [] },
        settings: { get: async () => ({}), set: async () => undefined },
        worktree: {
          list: async () => ({
            isGit: true,
            worktreeDir: 'Z:/proj/.forge/worktrees',
            entries: [
              { path: root, branch: 'main', worktreeName: 'proj', workspaceId: 'ws-main', isMain: true, present: true },
              { path: wt, branch: 'plugins', worktreeName: 'plugins', workspaceId: 'ws-plugins', isMain: false, present: true },
            ],
          }),
          selected: async () => ({ path: wt }),
          select: async () => ({}),
          branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
          aheadBehind: async () => ({}),
        },
      }) as unknown as WorktreeFacesRpc)
    const opened: string[] = []
    ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
      opened.push(workspaceId)
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const rootEl = createRoot(host)
    await act(async () => {
      rootEl.render(<ForgeHeroWorktreeMount projectRoot={root} makeRpc={rpc} />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect((globalThis as unknown as Record<string, unknown>)[ANCHOR_KEY], 'chip 显示记忆树').toBe(wt)
    expect(opened, '主视图随显示切到记忆树 workspace').toEqual(['ws-plugins'])
    expect(host.textContent, 'chip 文案显示记忆树').toContain('plugins')
  })

  it('记忆树 = 主树 → 回填落定不重开主视图（无冗余 openWorkspace）', async () => {
    const root = 'Z:/proj'
    const rpc = (() =>
      ({
        projects: { list: async () => [] },
        settings: { get: async () => ({}), set: async () => undefined },
        worktree: {
          list: async () => ({
            isGit: true,
            entries: [{ path: root, branch: 'main', worktreeName: 'proj', workspaceId: 'ws-main', isMain: true, present: true }],
          }),
          selected: async () => ({}),
          select: async () => ({}),
          branches: async () => ({ defaultBranch: 'main', branches: ['main'] }),
          aheadBehind: async () => ({}),
        },
      }) as unknown as WorktreeFacesRpc)
    const opened: string[] = []
    ;(globalThis as unknown as Record<string, unknown>)[OPEN_KEY] = (workspaceId: string): void => {
      opened.push(workspaceId)
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const rootEl = createRoot(host)
    await act(async () => {
      rootEl.render(<ForgeHeroWorktreeMount projectRoot={root} makeRpc={rpc} />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(opened, '主树回填零 openWorkspace').toEqual([])
  })
})
