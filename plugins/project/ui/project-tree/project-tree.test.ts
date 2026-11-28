// project-tree 投影单测（1.8 D 类——矩阵行 13/28/29 数据层面）：projects→worktrees
// 层级投影纯函数（archived 剔除 / 列表序保持 / 单项目清单缺失 fail-soft 空列 + error
// 摘要）+ fetchProjectTreePhase 相位映射（Typert 注入桩——成功 / projects.list 失败 /
// face 缺席归一 / 单项目清单失败节点保留）。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/lib-api/dto/project'
import type { WorktreeEntryDto, WorktreeListResult } from '@dsh-forge/lib-api/dto/worktree'
import { createForgeRpcClient, type ForgeRpcClient } from '../rpc.js'
import { projectWorktreeTreeOf } from './projection.js'
import { fetchProjectTreePhase } from './use-project-tree.js'

function project(id: string, wsPath: string, archived = false): ProjectSummary {
  return { id, workspaceId: `ws-${id}`, name: `proj-${id}`, wsPath, archived }
}

function entry(path: string, worktreeName: string, isMain = false): WorktreeEntryDto {
  return { path, branch: 'main', worktreeName, isMain, present: true, detached: false, bare: false }
}

function listResult(entries: readonly WorktreeEntryDto[]): WorktreeListResult {
  return { isGit: true, worktreeDir: 'C:/repo/.forge/worktrees', entries: [...entries] }
}

describe('projectWorktreeTreeOf（层级投影——纯函数）', () => {
  it('项目 → worktree 两级层级：archived 行剔除、入参序保持', () => {
    const tree = projectWorktreeTreeOf(
      [project('p2', 'C:/b'), project('p1', 'C:/a'), project('p3', 'C:/c', true)],
      new Map([
        ['C:/a', listResult([entry('C:/a', 'a', true), entry('C:/a/.forge/worktrees/wt', 'wt')])],
        ['C:/b', listResult([entry('C:/b', 'b', true)])],
      ]),
    )
    expect(tree.map((node) => node.project.id)).toEqual(['p2', 'p1'])
    expect(tree[0]!.worktrees.map((row) => row.worktreeName)).toEqual(['b'])
    expect(tree[1]!.worktrees.map((row) => row.worktreeName)).toEqual(['a', 'wt'])
    expect(tree[1]!.worktrees[0]!.isMain).toBe(true)
    expect(tree.every((node) => node.error === undefined)).toBe(true)
  })

  it('清单缺失（Map 无键）= 空列 + error 摘要（项目行保留——fail-soft）', () => {
    const tree = projectWorktreeTreeOf(
      [project('p1', 'C:/a'), project('p2', 'C:/b')],
      new Map([['C:/a', listResult([entry('C:/a', 'a', true)])]]),
    )
    expect(tree).toHaveLength(2)
    expect(tree[0]!.worktrees).toHaveLength(1)
    expect(tree[1]!.worktrees).toEqual([])
    expect(tree[1]!.error).toContain('C:/b')
  })

  it('空项目入参 = 空树（零行零投影响）', () => {
    expect(projectWorktreeTreeOf([], new Map())).toEqual([])
  })
})

// ── fetchProjectTreePhase（Typert 下发相位映射） ─────────────────

function clientWith(overrides: {
  list?: () => Promise<ProjectSummary[]>
  worktreeList?: (q: { projectRoot: string }) => Promise<WorktreeListResult>
}): ForgeRpcClient {
  const client = createForgeRpcClient()
  return {
    ...client,
    projects: { ...client.projects, list: overrides.list ?? (client.projects.list as () => Promise<ProjectSummary[]>) },
    worktree: { ...client.worktree, list: overrides.worktreeList ?? client.worktree.list },
  }
}

describe('fetchProjectTreePhase（Typert 下发）', () => {
  it('成功 → ready（层级投影承载；worktree.list 载荷 projectRoot = wsPath）', async () => {
    const roots: string[] = []
    const out = await fetchProjectTreePhase(() =>
      clientWith({
        list: async () => [project('p1', 'C:/a'), project('p2', 'C:/b', true)],
        worktreeList: async (q) => {
          roots.push(q.projectRoot)
          return listResult([entry(q.projectRoot, 'main', true)])
        },
      }),
    )
    expect(out.phase).toBe('ready')
    expect(roots).toEqual(['C:/a'])
    const tree = (out as { tree: readonly { project: ProjectSummary; worktrees: unknown[] }[] }).tree
    expect(tree).toHaveLength(1)
    expect(tree[0]!.worktrees).toHaveLength(1)
  })

  it('projects.list 失败 → error 相位（fail-soft 不抛）', async () => {
    const out = await fetchProjectTreePhase(() =>
      clientWith({ list: async () => { throw new Error('forge remote 缺席') } }),
    )
    expect(out.phase).toBe('error')
    expect((out as { message: string }).message).toBe('forge remote 缺席')
  })

  it('face 缺席（makeClient 抛 typed 降级 Error）→ error 相位归一', async () => {
    const out = await fetchProjectTreePhase(() => {
      throw new Error('官方 forge remote 面缺席（forgeProjects.list）')
    })
    expect(out.phase).toBe('error')
    expect((out as { message: string }).message).toContain('缺席')
  })

  it('单项目 worktree.list 失败 = 该节点空列保留（其余项目不受牵连）', async () => {
    const out = await fetchProjectTreePhase(() =>
      clientWith({
        list: async () => [project('p1', 'C:/a'), project('p2', 'C:/b')],
        worktreeList: async (q) => {
          if (q.projectRoot === 'C:/b') throw new Error('list degraded')
          return listResult([entry('C:/a', 'a', true)])
        },
      }),
    )
    expect(out.phase).toBe('ready')
    const tree = (out as { tree: readonly { project: ProjectSummary; worktrees: unknown[]; error?: string }[] }).tree
    expect(tree).toHaveLength(2)
    expect(tree[0]!.worktrees).toHaveLength(1)
    expect(tree[1]!.worktrees).toEqual([])
    expect(tree[1]!.error).toContain('C:/b')
  })
})
