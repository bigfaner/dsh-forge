// detail-section worktree 管理面单测（1.32 复测·Typert 正典化——数据通路自 forge.worktrees
// host 缝迁 ui/rpc.ts Typert remote face，1.38 正典）：
// fake WorktreeFacesRpc 注入四链——列表渲染（分支/状态/ahead-behind/封存态）、创建调用
// （worktree.create 载荷 = joinWorktreePath 口径）、删除 fail-closed（checks 三清单，
// null = 拦）、劣形退无面板（projects.list 失败 / 项目锚歧义 / worktree.list 首调抛错）。
// projectRoot 来源 = Typert projects.list 行自带 wsPath（唯一非 archived 项目；0/多 = 无锚不猜）。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PROJECT_PKG,
  DETAIL_SECTION_SLOT,
} from '../settings-section/index.js'
import {
  WORKTREE_DETAIL_SECTION_ID,
  ProjectWorktreesSection,
  registerWorktreeDetailSection,
} from './index.js'
import type { ProjectSummary } from '@dsh-forge/contracts'
import type { WorktreeEntryDto } from '@dsh-forge/contracts'
import type { WorktreeFacesRpc } from '../rpc.js'

const ROOT = 'C:/repo'

// ── fakes ────────────────────────────────────────────────────────

function entriesFixture(): WorktreeEntryDto[] {
  return [
    { path: ROOT, branch: 'main', worktreeName: 'repo', isMain: true, present: true, detached: false, bare: false },
    { path: 'C:/repo/.forge/worktrees/wt-a', branch: 'feat/a', worktreeName: 'wt-a', isMain: false, present: true, detached: false, bare: false },
    { path: 'C:/repo/.forge/worktrees/wt-sealed', branch: 'feat/old', worktreeName: 'wt-sealed', isMain: false, present: false, detached: false, bare: false },
  ]
}

interface RpcCalls {
  create: { branch: string; base: string; path: string }[]
  delete: { path: string }[]
  list: unknown[]
}

function projectRows(count: number, archived = false): ProjectSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    workspaceId: `ws${i + 1}`,
    name: `proj-${i + 1}`,
    wsPath: i === 0 ? ROOT : `C:/other-${i + 1}`,
    archived,
  }))
}

interface RpcFakeOpts {
  projects?: ProjectSummary[]
  projectsError?: Error
  entries?: WorktreeEntryDto[]
  listError?: Error
  isGit?: boolean
  checks?: unknown
}

function rpcFake(opts: RpcFakeOpts = {}): { factory: () => WorktreeFacesRpc; calls: RpcCalls } {
  const calls: RpcCalls = { create: [], delete: [], list: [] }
  const factory = (() =>
    ({
      projects: {
        list: async () => {
          if (opts.projectsError !== undefined) throw opts.projectsError
          return opts.projects ?? projectRows(1)
        },
      },
      worktree: {
        list: async (q: { projectRoot: string }) => {
          calls.list.push(q)
          if (opts.listError !== undefined) throw opts.listError
          return {
            isGit: opts.isGit ?? true,
            worktreeDir: 'C:/repo/.forge/worktrees',
            entries: opts.entries ?? entriesFixture(),
          }
        },
        branches: async () => ({ branches: ['main', 'feat/a'], defaultBranch: 'main' }),
        aheadBehind: async (q: { path: string }) => ({
          counts: q.path.endsWith('wt-a') ? { ahead: 2, behind: 1 } : null,
        }),
        checks: async () => {
          if (opts.checks === undefined) throw new Error('checks unavailable')
          return opts.checks
        },
        create: async (q: { branch: string; base: string; path: string }) => {
          calls.create.push({ branch: q.branch, base: q.base, path: q.path })
          return { entry: entriesFixture()[0]! }
        },
        delete: async (q: { path: string }) => {
          calls.delete.push({ path: q.path })
          return { removed: true }
        },
      },
    }) as unknown as WorktreeFacesRpc)
  return { factory, calls }
}

interface RegisteredEntry {
  options: Record<string, unknown>
  component: unknown
}

function slotsFake() {
  const registered: RegisteredEntry[] = []
  const injects: string[] = []
  return {
    registered,
    injects,
    slots: {
      inject: (key: string, callback: () => (() => void) | undefined) => {
        injects.push(key)
        return callback()
      },
      register: (options: Record<string, unknown>, component: unknown) => {
        registered.push({ options, component })
        return () => undefined
      },
    },
  }
}

async function mountSection(props: {
  rpc?: { factory: () => WorktreeFacesRpc; calls: RpcCalls }
  subject?: { kind: string; pkg: { name: string } }
}): Promise<{ host: HTMLElement; root: ReturnType<typeof createRoot>; calls: RpcCalls }> {
  const cfg = props ?? {}
  const rpc = cfg.rpc ?? rpcFake()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <ProjectWorktreesSection
        subject={cfg.subject ?? { kind: 'bundle', pkg: { name: PROJECT_PKG } }}
        makeRpc={rpc.factory}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
  return { host, root, calls: rpc.calls }
}

// ── 注册装配（plugins.detail.section list 缝） ─────────────────────

describe('registerWorktreeDetailSection（plugins.detail.section）', () => {
  it('注册：detail.section list 缝——id/component 锚定', () => {
    const fake = slotsFake()
    const disposer = registerWorktreeDetailSection(fake.slots as never)
    expect(fake.injects).toEqual([DETAIL_SECTION_SLOT])
    expect(fake.registered).toHaveLength(1)
    const entry = fake.registered[0]!
    expect(entry.options.name).toBe(DETAIL_SECTION_SLOT)
    expect(entry.options.id).toBe(WORKTREE_DETAIL_SECTION_ID)
    expect(WORKTREE_DETAIL_SECTION_ID).toBe('project-worktree-management')
    expect(entry.component).toBe(ProjectWorktreesSection)
    expect(typeof disposer).toBe('function')
  })

  it('slots 劣形（inject 缺席）= 注册返回 undefined 不炸装配', () => {
    expect(registerWorktreeDetailSection({} as never)).toBeUndefined()
  })

  it('dsh.client.inject 不新增 configForms 消费边（detail.section 不依赖 configForms）', async () => {
    const { projectClient } = await import('../index.js')
    expect(projectClient.inject).not.toContain('configForms')
  })
})

// ── 项目锚（Typert projects.list 行自带 wsPath） ──────────────────

describe('项目锚解析（Typert projects.list）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('唯一非 archived 项目 = projectRoot 取行自带 wsPath', async () => {
    const { host, calls } = await mountSection()
    expect(host.querySelector('[data-dswf-wt-panel]')).not.toBeNull()
    expect(calls.list).toEqual([{ projectRoot: ROOT }])
  })

  it('多项目 = 无锚不猜首个（warn 留痕退无面板）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const multi = await mountSection({ rpc: rpcFake({ projects: projectRows(2) }) })
    expect(multi.host.querySelector('[data-dswf-wt-panel]')).toBeNull()
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(multi.calls.list).toEqual([])
  })

  it('零项目 = 首用空态兜底（空态行 + 添加项目入口在场——1.8 D 类，不再静默无面板）', async () => {
    const { host } = await mountSection({ rpc: rpcFake({ projects: [] }) })
    expect(host.querySelector('[data-dswf-wt-panel]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-wt-empty]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-wt-add-project]')).not.toBeNull()
  })

  it('空态兜底入口接线：流程宿主随面板挂载——页内缝发布，点击直达流程模态（1.8 D 类）', async () => {
    const { publishAddProjectFlow, openAddProjectFlow } = await import('../add-project/flow-open.js')
    publishAddProjectFlow(undefined)
    try {
      const { host } = await mountSection({ rpc: rpcFake({ projects: [] }) })
      expect(openAddProjectFlow(), '流程宿主缝在场').toBe(true)
      await act(async () => {
        host.querySelector<HTMLButtonElement>('[data-dswf-wt-add-project]')!.click()
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await Promise.resolve()
      })
      expect(document.querySelector('[data-dswf-ap]'), '流程模态呈现（官方 Modal 门户壳——portal 出面板宿主）').not.toBeNull()
    } finally {
      publishAddProjectFlow(undefined)
    }
  })

  it('archived 行不充锚：唯一行 archived = 首用空态兜底（同零项目口径）', async () => {
    const { host } = await mountSection({ rpc: rpcFake({ projects: projectRows(1, true) }) })
    expect(host.querySelector('[data-dswf-wt-add-project]')).not.toBeNull()
  })

  it('projects.list 失败 = 退无面板（warn 留痕不静默）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { host } = await mountSection({ rpc: rpcFake({ projectsError: new Error('remote absent') }) })
    // 重试窗（250+500ms）耗尽后方落 warn 终态
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900))
    })
    expect(host.querySelector('[data-dswf-wt-panel]')).toBeNull()
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})

// ── 列表渲染 / 创建 / 删除 / 封存态（fake rpc 四链） ───────────────

describe('ProjectWorktreesSection（fake WorktreeFacesRpc 注入）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('列表渲染：分支/树名/主树标记/ahead-behind/封存态逐行呈现', async () => {
    const { host } = await mountSection()
    const html = host.innerHTML
    expect(html).toContain('data-dswf-wt-panel')
    expect(html).toContain('feat/a')
    expect(html).toContain('wt-a')
    expect(html).toContain('主树')
    const inline = host.querySelector('[data-dswf-wt-ahead-behind]')?.textContent
    expect(inline).toContain('2↑')
    expect(inline).toContain('1↓')
    expect(host.querySelector('[data-dswf-wt-sealed]'), 'present:false 行呈封存态').not.toBeNull()
  })

  it('创建调用：弹窗填分支提交 → worktree.create 以 joinWorktreePath 口径路径调用并刷新清单', async () => {
    const rpc = rpcFake()
    const { host, calls } = await mountSection({ rpc })
    const open = host.querySelector('[data-dswf-wt-create]')
    expect(open, '新建入口应呈现').not.toBeNull()
    await act(async () => {
      open!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const branchInput = document.querySelector<HTMLInputElement>('[data-dswt-branch-input]')
    expect(branchInput, '新建弹窗分支输入应呈现').not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(branchInput!, 'feat/new')
      branchInput!.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    const submit = document.querySelector<HTMLButtonElement>('[data-dswt-create-submit]')
    expect(submit, '创建提交钮应呈现').not.toBeNull()
    expect(submit!.disabled, '表单就绪后提交钮应可用').toBe(false)
    await act(async () => {
      submit!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(calls.create).toEqual([
      { branch: 'feat/new', base: 'main', path: 'C:\\repo\\.forge\\worktrees\\feat\\new' },
    ])
  })

  it('删除 fail-closed：checks 拉取失败 = 确认钮禁用（A11 保守拦截）', async () => {
    const { host, calls } = await mountSection()
    const row = host.querySelector<HTMLElement>('[data-dswf-wt-row][data-path="C:/repo/.forge/worktrees/wt-a"]')
    expect(row, 'wt-a 行应呈现').not.toBeNull()
    await act(async () => {
      row!.querySelector<HTMLButtonElement>('[data-dswf-wt-delete]')!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    const confirm = document.querySelector<HTMLButtonElement>('[data-dswt-delete-confirm]')
    expect(confirm, '删除确认钮应呈现').not.toBeNull()
    expect(confirm!.disabled, 'checks 缺席 = 保守拦截').toBe(true)
    expect(calls.delete).toEqual([])
  })

  it('删除放行：三清单全净 = 确认可用 → worktree.delete 调用并刷新', async () => {
    const rpc = rpcFake({ checks: { dirtyCount: 0, aheadCount: 0, attachedSessions: 0 } })
    const { host, calls } = await mountSection({ rpc })
    const row = host.querySelector<HTMLElement>('[data-dswf-wt-row][data-path="C:/repo/.forge/worktrees/wt-a"]')
    await act(async () => {
      row!.querySelector<HTMLButtonElement>('[data-dswf-wt-delete]')!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    const confirm = document.querySelector<HTMLButtonElement>('[data-dswt-delete-confirm]')
    expect(confirm!.disabled, '双清 = 放行').toBe(false)
    await act(async () => {
      confirm!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(calls.delete).toEqual([{ path: 'C:/repo/.forge/worktrees/wt-a' }])
  })

  it('劣形：worktree.list 首调抛错 = 退无面板（恒不渲染，零悬空）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { host } = await mountSection({ rpc: rpcFake({ listError: new Error('typert degraded') }) })
    expect(host.querySelector('[data-dswf-wt-panel]'), '劣形退无面板').toBeNull()
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('subject 门控：他包 / item / 缺席 = render null（无面板 fail-soft）', () => {
    expect(
      renderToStaticMarkup(<ProjectWorktreesSection subject={{ kind: 'bundle', pkg: { name: '@dsh-forge/other' } }} />),
    ).toBe('')
    expect(renderToStaticMarkup(<ProjectWorktreesSection />)).toBe('')
    expect(renderToStaticMarkup(<ProjectWorktreesSection subject={{ kind: 'item', pkg: { name: PROJECT_PKG } }} />)).toBe('')
  })

  it('非 git（isGit false）= 降级提示行，零行集零控件悬空', async () => {
    const { host } = await mountSection({ rpc: rpcFake({ isGit: false, entries: [] }) })
    expect(host.querySelector('[data-dswf-wt-non-git]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-wt-row]')).toBeNull()
  })
})
