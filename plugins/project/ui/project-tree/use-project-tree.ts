// 项目树数据层——Typert 下发 hook（1.8 D 类）：forge:projects/list → 逐活项目
// forge:worktree/list（Typert 正典 ui/rpc face——插件自供缝，消费点现查不缓存）→
// projectWorktreeTreeOf 层级投影。相位机与 use-forge-projects 同构：loading → ready |
// error（projects.list 失败归 error 相位 fail-soft 不抛；单项目清单失败 = 节点 error
// 摘要 + 空列，不炸相位——投影层 fail-soft 口径）。
// 下发注记：worktree.list 载荷 projectRoot = ProjectSummary.wsPath（host 身份归并单点
// 判据——客户端零拼接）；并发行拉取 Promise.allSettled——单失败不拖垮整树。
import { useCallback, useEffect, useState } from 'react'
import type { WorktreeListResult } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../rpc.js'
import { projectWorktreeTreeOf, type ProjectWorktreeNode } from './projection.js'

export type { ProjectWorktreeNode } from './projection.js'

/** 项目树相位 */
export type ProjectTreePhase =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly tree: readonly ProjectWorktreeNode[] }
  | { readonly phase: 'error'; readonly message: string }

/** 逐项目清单拉取（并发 allSettled——单失败 = 空列 + error 摘要，节点保留） */
async function worktreesByProjectOf(
  client: ForgeRpcClient,
  roots: readonly string[],
): Promise<ReadonlyMap<string, WorktreeListResult>> {
  const settled = await Promise.allSettled(
    roots.map((projectRoot) => client.worktree.list({ projectRoot })),
  )
  const byProject = new Map<string, WorktreeListResult>()
  roots.forEach((projectRoot, i) => {
    const outcome = settled[i]
    if (outcome?.status === 'fulfilled') byProject.set(projectRoot, outcome.value)
  })
  return byProject
}

/**
 * 单次拉取 + 层级投影（纯异步面——错误归一为 error 相位，永不 reject）。
 * @param makeClient - RPC client 构造器（Typert 真身缺省；注入 = 测试面）
 */
export async function fetchProjectTreePhase(makeClient: RpcClientFactory): Promise<ProjectTreePhase> {
  try {
    const client = makeClient()
    const projects = await client.projects.list()
    const live = projects.filter((project) => !project.archived)
    const byProject = await worktreesByProjectOf(client, live.map((project) => project.wsPath))
    return { phase: 'ready', tree: projectWorktreeTreeOf(live, byProject) }
  } catch (error) {
    return { phase: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 拉取项目树（mount + refreshKey 变化 + 显式重试 + 静默重拉——useForgeProjects 同构）。
 * @param refreshKey - 刷新锚（身份变化即重拉——注册/删除项目后对齐）
 * @param makeClient - RPC client 构造器（缺省 = Typert 真身；注入 = 测试面）
 */
export function useProjectWorktreeTree(
  refreshKey: unknown,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [ProjectTreePhase, () => void, () => void] {
  const [state, setState] = useState<ProjectTreePhase>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    void fetchProjectTreePhase(makeClient).then((next) => {
      if (alive) setState(next)
    })
    return () => {
      alive = false
    }
  }, [nonce, refreshKey, makeClient])
  const retry = useCallback(() => {
    setState({ phase: 'loading' })
    setNonce((n) => n + 1)
  }, [])
  const silentRefresh = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  return [state, retry, silentRefresh] as const
}
