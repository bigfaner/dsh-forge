// 派生行数据源封装（定位：业务——UF-4 升级 4.3 Integration #1：注册表单任务清单派生行的
// RPC 预检位纯读）。Hard Rule：派生行单源 = core deriveTaskStoreDir（RPC 通道
// forge:projects/deriveTaskStoreDir 下发）——前端禁任何自算回退（form-model 自算路径
// 本任务废除）。形制沿 dir-source（注入面 + 缺省 RPC 真身 + 纯异步相位映射——永不
// reject，不炸壳）：
//   · 成功 → ready(dir)（SC2 断言锚：与实际建库位置逐字一致——dir 逐字透传零拼装）；
//   · RpcClientError{code: ERR_SUSPECTED_MOVE, data: SuspectedMoveData} →
//     suspected-move（错误条 + 手工指引留场——拒绝零副作用，中央行未落库）；
//   · 其余失败（preload 缺席/服务未注册/未映射码/data 载荷畸形）→ error 兜底
//     （tech-design Propagation「未映射码 → 通用错误条」——message 归一，永无裸 code
//     泄漏；非阻断确认位——注册闭包复检恒权威）。
import type { DeriveTaskStoreDirResult, SuspectedMoveData } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, RpcClientError } from '../../rpc/index.js'
import type { DerivedTaskStorePhase } from './derived-store-row.js'

/** 派生数据源（注入面：RPC 真身 rpcDeriveSource() / 测试桩） */
export type DeriveSource = (workspaceDir: string) => Promise<DeriveTaskStoreDirResult>

/**
 * 缺省数据源真身：preload RPC 面（forge:projects/deriveTaskStoreDir）。transport 构造
 * 延迟到调用点——preload 缺席（非 Electron 载体）由 fetchDerivePhase 收敛为 error 相位。
 */
export function rpcDeriveSource(): DeriveSource {
  return (workspaceDir) => preloadRpcClientFactory().projects.deriveTaskStoreDir(workspaceDir)
}

/**
 * SuspectedMoveData 形状守卫（RpcClientError.data = unknown）：existingDir/derivedDir/
 * guidance 三串在场才认领；畸形载荷回落 error 兜底（指引文案单源 core，本层零捏造）。
 */
function suspectedMoveDataOf(error: RpcClientError): SuspectedMoveData | null {
  const data: unknown = error.data
  if (data === null || typeof data !== 'object') return null
  const { existingDir, derivedDir, guidance } = data as Record<string, unknown>
  if (typeof existingDir !== 'string' || typeof derivedDir !== 'string' || typeof guidance !== 'string') {
    return null
  }
  return { existingDir, derivedDir, guidance }
}

/**
 * 单次派生预检的相位映射（纯异步面——永不 reject）：成功 → ready；疑似移动 →
 * suspected-move（手工指引载荷单源 core 透传）；其余 → error 兜底（message 归一）。
 */
export async function fetchDerivePhase(
  source: DeriveSource,
  workspaceDir: string,
): Promise<DerivedTaskStorePhase> {
  try {
    const { dir } = await source(workspaceDir)
    return { state: 'ready', dir }
  } catch (error) {
    if (error instanceof RpcClientError && error.code === 'ERR_SUSPECTED_MOVE') {
      const data = suspectedMoveDataOf(error)
      if (data !== null) return { state: 'suspected-move', data }
    }
    return { state: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
