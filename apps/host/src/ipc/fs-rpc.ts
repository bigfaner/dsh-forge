// forge:fs/* 通道注册（2.8 注册行；定位：基础——宿主文件系统能力面，只读目录列举）。
// UF-3 文件浏览器数据源：renderer 不开 Node fs 通道（任务 2.8 Hard Rules），本机目录
// 读取经本通道（Interface 4 allowlist 面）。handler 本体 = 宿主自有能力（node:fs 只读），
// 非 core 域服务（core = SQLite 数据内核，无盘面语义）——boot-channel 同型的宿主原生行。
// 不可达/不存在路径 = 预期运行条件（UI 错误条相位）：包装为带 canonical 路径的普通
// Error 经 Electron 拒绝面上抛——六错误码无 fs 码位（契约不扩表），rpcEnvelope 对
// 非 typed 错误 fail-loud 原样放行，web 侧 fetchDirListing 收敛为错误相位。
import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { FS_CHANNELS, type DirListing, type ListDirRequest } from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 列举目录（canonical 化 = path.resolve——调用方以此为对账基准）。
 * 仅真实子目录入列（符号链接目录/文件不入列，P1 口径）；名称序。
 * @param req - dirPath 缺省 = 用户主目录（浏览器起始态）
 */
export async function listDir(req: ListDirRequest): Promise<DirListing> {
  const target =
    typeof req?.dirPath === 'string' && req.dirPath !== '' ? resolve(req.dirPath) : homedir()
  let dirents: readonly Dirent[]
  try {
    dirents = await readdir(target, { withFileTypes: true })
  } catch (cause) {
    throw new Error(
      `目录不可达：${target}（${cause instanceof Error ? cause.message : String(cause)}）`,
    )
  }
  const entries = dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => ({ name: dirent.name, path: resolve(target, dirent.name) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const parent = dirname(target)
  return { path: target, parentPath: parent === target ? null : parent, entries }
}

/** fs 通道注册（listDir 单通道；allowlist 校验由 createForgeIpc 守门） */
export function registerFsChannels(ipc: ForgeIpc): void {
  ipc.register(FS_CHANNELS.listDir, rpcEnvelope(listDir))
}
