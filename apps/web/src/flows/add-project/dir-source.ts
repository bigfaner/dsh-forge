// 目录数据源封装（定位：业务——UF-3 段一目录数据获取；Hard Rules：本机目录读取经 RPC
// （forge:fs/listDir），renderer 不开 Node fs 通道）。相位映射纯异步面（同 2.7
// use-forge-projects 的 fetchProjectsPhase 形制：错误归一为 error 相位，永不 reject）。
import type { DirListing } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport } from '../../rpc/index.js'

/** 目录数据源（注入面：RPC 真身 rpcDirSource() / 测试内存替身） */
export type DirSource = (dirPath?: string) => Promise<DirListing>

/** 列举相位（浏览器态内三相位——AC4：错误不出浏览器态，错误条呈现） */
export type ListingPhase =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly listing: DirListing }
  | { readonly phase: 'error'; readonly message: string }

/**
 * 单次列举的相位映射（纯异步面——RPC/通道/传输任一失败都归一为 error 相位，永不 reject）。
 * @param source - 目录数据源
 * @param dirPath - 目标目录（缺省 = 用户主目录——浏览器起始态）
 */
export async function fetchDirListing(source: DirSource, dirPath?: string): Promise<ListingPhase> {
  try {
    return { phase: 'ready', listing: await source(dirPath) }
  } catch (error) {
    return { phase: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 缺省数据源真身：preload RPC 面（forge:fs/listDir）。transport 构造延迟到调用点——
 * preload 缺席（非 Electron 载体）时由 fetchDirListing 收敛为错误相位，不炸壳。
 */
export function rpcDirSource(): DirSource {
  return (dirPath) => {
    const client = createForgeRpcClient(preloadTransport())
    return client.fs.listDir(dirPath)
  }
}
