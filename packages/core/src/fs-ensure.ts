// fs-ensure（定位：装配——umask 免疫的目录落盘）。
// Root cause: mkdirSync 未传显式 mode 时目录权限 = 0o777 & ~umask，全由宿主进程启动
// 环境决定——umask 0077 的机器（macOS 加固 shell）上 .forge/.knowledge 落盘即 700
// 属主独占，事后非属主身份读取（validateMermaid 等）被拒。mkdir 的 mode 参数同样
// 会被 umask 再削，故 mkdir 后补 chmod 0o755（确定性）；chmod fail-soft——不支持
// 位权限的文件系统/平台（Windows ACL 面）失败不抛断调用方。mkdir 失败原样上抛，
// 由调用方按各自 typed 面收口（ProjectWriteError 等）。
import { chmodSync, mkdirSync } from 'node:fs'

/** chmod 注入缝（单测替身；缺省 = node:fs 同步 chmod） */
export interface EnsureDirReadableDeps {
  readonly chmodSync?: (dir: string, mode: number) => void
}

/**
 * 递归建目录并显式 chmod 0o755（rwxr-xr-x：属主全权，他人可读可进入——目录 x 位 =
 * 遍历权，即 700 现场挡住 validator 的那一位）。幂等：在场 no-op mkdir，chmod 仍施加
 * （对既有受限目录同样补正）。
 */
export function ensureDirReadable(dir: string, deps: EnsureDirReadableDeps = {}): void {
  const chmod = deps.chmodSync ?? ((d: string, mode: number) => chmodSync(d, mode))
  mkdirSync(dir, { recursive: true })
  try {
    chmod(dir, 0o755)
  } catch {
    // fail-soft：chmod 不可用面（Windows/特殊文件系统）零影响——mkdir 语义已达成
  }
}
