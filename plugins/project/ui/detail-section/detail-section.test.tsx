// detail-section worktree 管理面单测（1.32——plugins.detail.section list 缝，官方已声明槽）：
// fake WorktreeServicePort 注入四链——列表渲染（分支/状态/ahead-behind/封存态）、创建调用
// （port.create 载荷 = joinWorktreePath 口径）、删除 fail-closed（checks 三清单，null = 拦）、
// 劣形三形态退无面板（seam-face 镜像 host/assembly/seams.ts injectProjectSeam 语义——
// ①注册值非函数（含缺席）②实例化抛错/非对象 ③首调抛错 → 恒无面板）。
// 不依赖 configForms：apply 期直接注册 detail.section。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PROJECT_PKG,
  DETAIL_SECTION_SLOT,
} from '../settings-section/index.js'
import { PROJECT_SEAM_KEYS } from '../../host/assembly/seams.js'
import {
  WORKTREE_DETAIL_SECTION_ID,
  WORKTREE_SEAM_KEY,
  ProjectWorktreesSection,
  registerWorktreeDetailSection,
} from './index.js'
import type { WorktreeServicePort } from '@dsh-forge/lib-api'
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

interface PortCalls {
  create: { branch: string; base: string; path: string }[]
  delete: { path: string }[]
}

function portFake(entries: WorktreeEntryDto[] = entriesFixture()): WorktreeServicePort {
  const calls: PortCalls = { create: [], delete: [] }
  const port = {
    list: async () => ({ isGit: true, worktreeDir: 'C:/repo/.forge/worktrees', entries }),
    create: async (q: { branch: string; base: string; path: string }) => {
      calls.create.push({ branch: q.branch, base: q.base, path: q.path })
      return { entry: entries[0]! }
    },
    delete: async (q: { path: string }) => {
      calls.delete.push({ path: q.path })
      return { removed: true }
    },
    ensureWorkspace: async () => ({}),
    select: async () => ({ ok: true }),
    seal: async () => ({ isGit: true, sealed: false, binding: null }),
    resolve: async () => ({ resolved: [] }),
    getWorktreeDir: () => 'C:/repo/.forge/worktrees',
    resolveProject: async () => null,
    __calls: calls,
  } as unknown as WorktreeServicePort & { __calls: PortCalls }
  return port
}

function callsOf(port: WorktreeServicePort): PortCalls {
  return (port as unknown as { __calls: PortCalls }).__calls
}

function rpcFake(opts: { checks?: unknown } = {}): () => WorktreeFacesRpc {
  return (() =>
    ({
      worktree: {
        branches: async () => ({ branches: ['main', 'feat/a'], defaultBranch: 'main' }),
        aheadBehind: async (q: { path: string }) => ({
          counts: q.path.endsWith('wt-a') ? { ahead: 2, behind: 1 } : null,
        }),
        checks: async () => {
          if (opts.checks === undefined) throw new Error('checks unavailable')
          return opts.checks
        },
      },
    }) as unknown as WorktreeFacesRpc)
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
  port: WorktreeServicePort
  projectRoot?: string
  makeRpc?: () => WorktreeFacesRpc
  subject?: { kind: string; pkg: { name: string } }
}): Promise<{ host: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <ProjectWorktreesSection
        subject={props.subject ?? { kind: 'bundle', pkg: { name: PROJECT_PKG } }}
        port={props.port}
        projectRoot={props.projectRoot ?? ROOT}
        makeRpc={props.makeRpc ?? rpcFake()}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
  return { host, root }
}

// ── seam-face（劣形三形态）+ 注册装配 ─────────────────────────────

describe('WORKTREE_SEAM_KEY / registerWorktreeDetailSection（plugins.detail.section）', () => {
  it('seam 键 pin：client 镜像键 = host 装配单源 forge.worktrees', () => {
    expect(WORKTREE_SEAM_KEY).toBe('forge.worktrees')
    expect(WORKTREE_SEAM_KEY).toBe(PROJECT_SEAM_KEYS.worktrees)
  })

  it('seam 在场：detail.section list 缝注册——id/component/inject face 携 fake port', () => {
    const port = portFake()
    const fake = slotsFake()
    const ctx = { reflect: { get: () => () => port } }
    const disposer = registerWorktreeDetailSection(ctx as never, fake.slots as never)
    expect(fake.injects).toEqual([DETAIL_SECTION_SLOT])
    expect(fake.registered).toHaveLength(1)
    const entry = fake.registered[0]!
    expect(entry.options.name).toBe(DETAIL_SECTION_SLOT)
    expect(entry.options.id).toBe(WORKTREE_DETAIL_SECTION_ID)
    expect(WORKTREE_DETAIL_SECTION_ID).toBe('project-worktree-management')
    expect(entry.component).toBe(ProjectWorktreesSection)
    expect((entry.options.inject as () => { port: WorktreeServicePort })().port).toBe(port)
    expect(typeof disposer).toBe('function')
  })

  it('劣形① 注册值非函数（含缺席）= 不注册 fail-soft（warn 留痕）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fake = slotsFake()
    expect(registerWorktreeDetailSection({ reflect: { get: () => undefined } } as never, fake.slots as never)).toBeUndefined()
    expect(registerWorktreeDetailSection({ reflect: { get: () => 42 } } as never, fake.slots as never)).toBeUndefined()
    expect(fake.registered).toHaveLength(0)
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2)
    warn.mockRestore()
  })

  it('劣形② 工厂实例化抛错 / 产出非对象 = 不注册 fail-soft', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fake = slotsFake()
    expect(
      registerWorktreeDetailSection({ reflect: { get: () => () => { throw new Error('boom') } } } as never, fake.slots as never),
    ).toBeUndefined()
    expect(registerWorktreeDetailSection({ reflect: { get: () => () => 'not-an-object' } } as never, fake.slots as never)).toBeUndefined()
    expect(fake.registered).toHaveLength(0)
    warn.mockRestore()
  })

  it('slots 劣形（inject 缺席）= 注册返回 undefined 不炸装配', () => {
    const port = portFake()
    expect(registerWorktreeDetailSection({ reflect: { get: () => () => port } } as never, {} as never)).toBeUndefined()
  })

  it('dsh.client.inject 不新增 configForms 消费边（detail.section 不依赖 configForms）', async () => {
    const { projectClient } = await import('../index.js')
    expect(projectClient.inject).not.toContain('configForms')
  })
})

// ── 列表渲染 / 创建 / 删除 / 封存态（fake port 四链） ─────────────

describe('ProjectWorktreesSection（fake WorktreeServicePort 注入）', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('列表渲染：分支/树名/主树标记/ahead-behind/封存态逐行呈现', async () => {
    const { host } = await mountSection({ port: portFake() })
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

  it('创建调用：弹窗填分支提交 → port.create 以 joinWorktreePath 口径路径调用并刷新清单', async () => {
    const port = portFake()
    const { host } = await mountSection({ port })
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
    expect(callsOf(port).create).toEqual([
      { branch: 'feat/new', base: 'main', path: 'C:\\repo\\.forge\\worktrees\\feat\\new' },
    ])
  })

  it('删除 fail-closed：checks 拉取失败 = 确认钮禁用（A11 保守拦截）', async () => {
    const port = portFake()
    const { host } = await mountSection({ port, makeRpc: rpcFake({}) })
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
    expect(callsOf(port).delete).toEqual([])
  })

  it('删除放行：三清单全净 = 确认可用 → port.delete 调用并刷新', async () => {
    const port = portFake()
    const { host } = await mountSection({ port, makeRpc: rpcFake({ checks: { dirtyCount: 0, aheadCount: 0, attachedSessions: 0 } }) })
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
    expect(callsOf(port).delete).toEqual([{ path: 'C:/repo/.forge/worktrees/wt-a' }])
  })

  it('劣形③ 首调抛错 = 退无面板（恒不渲染，零悬空）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken = { ...portFake(), list: async () => { throw new Error('seam degraded') } } as unknown as WorktreeServicePort
    const { host } = await mountSection({ port: broken })
    expect(host.querySelector('[data-dswf-wt-panel]'), '劣形缝退无面板').toBeNull()
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('subject 门控：他包 / item / port 缺席 = render null（无面板 fail-soft）', async () => {
    const port = portFake()
    expect(
      renderToStaticMarkup(<ProjectWorktreesSection subject={{ kind: 'bundle', pkg: { name: '@dsh-forge/other' } }} port={port} projectRoot={ROOT} />),
    ).toBe('')
    expect(renderToStaticMarkup(<ProjectWorktreesSection port={port} projectRoot={ROOT} />)).toBe('')
    expect(renderToStaticMarkup(<ProjectWorktreesSection subject={{ kind: 'bundle', pkg: { name: PROJECT_PKG } }} projectRoot={ROOT} />)).toBe('')
    expect(renderToStaticMarkup(<ProjectWorktreesSection subject={{ kind: 'bundle', pkg: { name: PROJECT_PKG } }} port={port} />)).toBe('')
  })

  it('非 git（isGit false）= 降级提示行，零行集零控件悬空', async () => {
    const port = { ...portFake([]), list: async () => ({ isGit: false, entries: [] }) } as unknown as WorktreeServicePort
    const { host } = await mountSection({ port })
    expect(host.querySelector('[data-dswf-wt-non-git]')).not.toBeNull()
    expect(host.querySelector('[data-dswf-wt-row]')).toBeNull()
  })
})
