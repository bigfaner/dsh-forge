// 项目列表加载（定位：业务——AC2 项目树读 forge:projects/list）。
// 相位机：loading（首拉/重试）→ ready | error（fail-soft：RPC 面/通道/传输任一失败都不炸壳，
// 错误条相位由面板呈现——profile 中 core 行未启用期即此相位）。
// 刷新锚 = workspace 归属快照身份变化（注册/删除 workspace 会改变快照对象身份）——挂项目
// 后自动对齐，无需 2.10 额外接线；projects 为应用侧数据（SC2 零副本纪律只约 dsh 账本面）。
import { useCallback, useEffect, useState } from 'react'
import type { ProjectSummary } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../rpc/index.js'

/** 项目列表相位 */
export type ProjectsPhase =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly projects: readonly ProjectSummary[] }
  | { readonly phase: 'error'; readonly message: string }

/**
 * 单次拉取的相位映射（纯异步面——错误归一为 error 相位，永不 reject）。
 * @param makeClient - RPC client 构造器（preload 缺席/通道未注册/typed error 统一收敛于此）
 */
export async function fetchProjectsPhase(makeClient: RpcClientFactory): Promise<ProjectsPhase> {
  try {
    const projects = await makeClient().projects.list()
    return { phase: 'ready', projects }
  } catch (error) {
    return { phase: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 拉取 forge:projects/list（mount + refreshKey 变化 + 显式重试 + 静默重拉）。
 * @param refreshKey - 刷新锚（workspace 归属快照对象——身份变化即重拉）
 * @param makeClient - RPC client 构造器
 */
export function useForgeProjects(
  refreshKey: unknown,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [ProjectsPhase, () => void, () => void] {
  const [state, setState] = useState<ProjectsPhase>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    void fetchProjectsPhase(makeClient).then((next) => {
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
  // 静默重拉（fix-24 ①）：nonce 递增但保留现行相位——弹层开合等高频面刷新不闪 loading
  // 骨架（应用侧行删除/归档不触发 workspace 快照锚，open 边沿重拉兜住陈旧面）
  const silentRefresh = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  return [state, retry, silentRefresh] as const
}
