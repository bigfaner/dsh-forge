// anchored-projects 单测 —— 项目锚定装载共享面（fix-36：自 ShellHost 迁入的归属锚
// 子件/窄判定 + useAnchoredProjects 共享 hook 的锚在场性面）。
// 快照上抛效应与重拉锚归 e2e；此处直测 = 纯判定 + SSR 渲染期读取 + 条件锚挂载。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { ReactNode } from 'react'
import type { KitSelectorHook } from '../views/session/ConversationViews.js'
import {
  WorkspacesAnchor,
  isWorkspacesSnapshot,
  resolveWorkspaceProjectMap,
  useAnchoredProjects,
  type AnchoredProjects,
} from './anchored-projects.js'
import type { RpcClientFactory } from '../rpc/index.js'

describe('isWorkspacesSnapshot 快照窄判定', () => {
  it('最小形状（items 数组）通过；其余（null/非对象/缺 items/非数组）降级 false', () => {
    expect(isWorkspacesSnapshot({ items: [] })).toBe(true)
    expect(isWorkspacesSnapshot(null)).toBe(false)
    expect(isWorkspacesSnapshot(undefined)).toBe(false)
    expect(isWorkspacesSnapshot({})).toBe(false)
    expect(isWorkspacesSnapshot({ items: 'x' })).toBe(false)
  })
})

describe('WorkspacesAnchor workspace 归属锚子件（SSR 渲染期钩子读取面）', () => {
  it('SSR 渲染期执行钩子读取（快照选择器直连）且渲染为 null（效应回调归 e2e）', () => {
    const seen: unknown[] = []
    const markup = renderToStaticMarkup(
      <WorkspacesAnchor
        hook={(sel) => {
          const value = sel({ items: [] } as never)
          seen.push(value)
          return value
        }}
        onChange={() => {}}
      />,
    )
    expect(markup).toBe('')
    expect(seen).toEqual([{ items: [] }])
  })
})

describe('useAnchoredProjects 共享 hook（条件锚挂载 + 相位直通）', () => {
  function Probe({ useWorkspaces }: { readonly useWorkspaces?: KitSelectorHook }): ReactNode {
    const out: AnchoredProjects = useAnchoredProjects(useWorkspaces)
    return (
      <div
        data-anchor-present={out.anchor !== null ? 'yes' : 'no'}
        data-phase={out.projects.phase}
        data-workspaces={out.workspaces === null ? 'null' : 'present'}
      />
    )
  }

  it('kit hook 缺席 = 锚 null + workspaces null（非壳载体降级——项目相位照常装载）', () => {
    const markup = renderToStaticMarkup(<Probe />)
    expect(markup).toContain('data-anchor-present="no"')
    expect(markup).toContain('data-workspaces="null"')
    expect(markup).toContain('data-phase="loading"')
  })

  it('kit hook 在场 = 锚子件挂载（钩子于子件内无条件调用——hooks 规则合规形制保持）', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(<Probe useWorkspaces={selectorHook({ items: [] })} />)
    expect(markup).toContain('data-anchor-present="yes"')
  })
})

describe('resolveWorkspaceProjectMap 纯解析面（bug 52fc94db 后续——管线可测化）', () => {
  const WT = 'Z:\\proj\\.forge\\worktrees\\wt-a'
  const entry = { path: WT, projectId: 'p-owner', projectRoot: 'Z:\\proj', projectName: 'proj' }
  const makeClientOf = (
    resolved: readonly { path: string; projectId: string; projectRoot: string; projectName: string }[],
  ): RpcClientFactory => {
    let calls = 0
    const client = {
      calls: () => calls,
      worktree: {
        resolve: async (req: { readonly paths: readonly string[] }) => {
          calls += 1
          return { resolved: resolved.filter((e) => req.paths.includes(e.path)) }
        },
      },
    }
    return (() => client) as unknown as RpcClientFactory
  }

  it('命中：条目按归一工作区路径键映射 projectId', async () => {
    const map = await resolveWorkspaceProjectMap([WT], makeClientOf([entry]))
    expect(map.get(normalizeFsPath(WT))).toBe('p-owner')
  })

  it('空路径集零 RPC 短路空映射（省一次批量通道往返）', async () => {
    const factory = makeClientOf([entry])
    const map = await resolveWorkspaceProjectMap([], factory)
    expect(map.size).toBe(0)
    expect((factory as unknown as () => { calls: () => number })().calls()).toBe(0)
  })

  it('未解析路径（非 git/未注册）不入映射——fail-soft 缺席语义', async () => {
    const map = await resolveWorkspaceProjectMap(['Z:\\native-unbound'], makeClientOf([entry]))
    expect(map.size).toBe(0)
  })

  it('通道故障上抛（hook 径 catch 降级空映射——本函数只做纯转换不吞错）', async () => {
    const client = (() => {
      throw new Error('rpc down')
    }) as unknown as RpcClientFactory
    await expect(resolveWorkspaceProjectMap([WT], client)).rejects.toThrow('rpc down')
  })

  it('多路径多项目混合解析全映射', async () => {
    const client = makeClientOf([
      entry,
      { path: 'Z:\\idea\\.forge\\worktrees\\wt-b', projectId: 'p-idea', projectRoot: 'Z:\\idea', projectName: 'idea' },
    ])
    const map = await resolveWorkspaceProjectMap([WT, 'Z:\\idea\\.forge\\worktrees\\wt-b'], client)
    expect(map.get(normalizeFsPath(WT))).toBe('p-owner')
    expect(map.get(normalizeFsPath('Z:\\idea\\.forge\\worktrees\\wt-b'))).toBe('p-idea')
  })
})
