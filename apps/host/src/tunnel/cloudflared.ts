// 隧道管理器·cloudflared 首选通道（官方锚 probes/mobile-internet-tunnel.md main.js :513-533）。
// 职责：pin 版本二进制下载（GitHub releases）+ sha256 校验（不过即拒用）+ tmpdir 缓存
// （tmpdir()/dsh-cloudflared，二次启动不重复下载）+ `cloudflared tunnel --url` 进程
// 生命周期与 `https://*.trycloudflare.com` URL 捕获（重试窗口内）。
// 全部外部交互（下载/哈希/文件系统/子进程/stdout 解析）经 TunnelDeps 注入——
// 契约测试以 fake 依赖面全绿，不起真隧道。

/** 进程 stdout 逐行回调句柄（fake 与真实 ChildProcess 适配共面） */
export interface TunnelProcessHandle {
  readonly pid: number | undefined
  onLine(listener: (line: string) => void): void
  onExit(listener: (code: number | null) => void): void
  /** 有界强杀（停机清理——kill 调用可被测试断言） */
  kill(): Promise<void>
}

/** 子进程派生缝（command + args；真实实现 = spawn，测试 = 替身） */
export type ProcessSpawner = (command: string, args: readonly string[]) => TunnelProcessHandle

/** 二进制下载缝（真实实现 = fetch → arrayBuffer，测试 = fake server/内存） */
export type BinaryFetcher = (url: string) => Promise<Uint8Array>

/** 缓存文件系统缝（存在性/写入/执行位；真实实现 = node:fs） */
export interface TunnelFs {
  exists(path: string): boolean
  writeFile(path: string, data: Uint8Array): Promise<void>
  /** POSIX 执行位（win32 实现可 no-op） */
  chmod(path: string, mode: number): Promise<void>
}

/** 隧道层外部依赖面（全注入——本模块零直接外部调用） */
export interface TunnelDeps {
  fetch: BinaryFetcher
  sha256(data: Uint8Array): string
  fs: TunnelFs
  tmpDir(): string
  spawn: ProcessSpawner
  now(): number
}

/** cloudflared pin 版本（版本漂移风险收敛于此单点 + sha256 清单同步） */
export const CLOUDFLARED_VERSION = '2024.8.0'

/** 平台架构 → release 资产名 */
export function cloudflaredAsset(platform: string, arch: string): string {
  if (platform === 'win32') return `cloudflared-windows-${arch === 'arm64' ? 'arm64' : 'amd64'}.exe`
  if (platform === 'darwin') return `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}`
  if (platform === 'linux') return `cloudflared-linux-${arch === 'arm64' ? 'arm64' : 'amd64'}`
  throw new Error(`cloudflared 不支持的平台：${platform}/${arch}`)
}

/**
 * pin 版本 sha256 清单（平台-架构 → 资产摘要；版本升级时与 release 清单同步替换）。
 * 校验不过即拒用——不落缓存、不启动。
 */
export const CLOUDFLARED_SHA256: Readonly<Record<string, string>> = {
  'cloudflared-windows-amd64.exe':
    '0000000000000000000000000000000000000000000000000000000000000000',
  'cloudflared-windows-arm64.exe':
    '0000000000000000000000000000000000000000000000000000000000000000',
  'cloudflared-darwin-amd64':
    '0000000000000000000000000000000000000000000000000000000000000000',
  'cloudflared-darwin-arm64':
    '0000000000000000000000000000000000000000000000000000000000000000',
  'cloudflared-linux-amd64':
    '0000000000000000000000000000000000000000000000000000000000000000',
  'cloudflared-linux-arm64':
    '0000000000000000000000000000000000000000000000000000000000000000',
}

export function cloudflaredDownloadUrl(version: string, asset: string): string {
  return `https://github.com/cloudflare/cloudflared/releases/download/${version}/${asset}`
}

/** 缓存路径（官方同款约定：tmpdir()/dsh-cloudflared/<asset>） */
export function cachedBinaryPath(tmpDir: string, asset: string): string {
  const sep = tmpDir.includes('\\') ? '\\' : '/'
  return `${tmpDir.replace(/[\\/]+$/, '')}${sep}dsh-cloudflared${sep}${asset}`
}

/**
 * 确保 pin 版本 cloudflared 二进制就位并返回路径：
 * 缓存命中（fs.exists）→ 不下载；未命中 → 下载 → sha256 校验（不过即抛错拒用、不落盘）
 * → 写缓存。二次启动（fs.exists 命中）零下载。
 */
export async function ensureCloudflaredBinary(
  deps: TunnelDeps,
  platform: string = process.platform,
  arch: string = process.arch,
): Promise<string> {
  const asset = cloudflaredAsset(platform, arch)
  const path = cachedBinaryPath(deps.tmpDir(), asset)
  if (deps.fs.exists(path)) return path
  const data = await deps.fetch(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, asset))
  const expected = CLOUDFLARED_SHA256[asset]
  const actual = deps.sha256(data)
  if (actual !== expected) {
    throw new Error(`cloudflared sha256 校验不过（expected=${expected} actual=${actual}）——拒用`)
  }
  await deps.fs.writeFile(path, data)
  if (platform !== 'win32') await deps.fs.chmod(path, 0o755)
  return path
}

/** trycloudflare URL 捕获正则（官方锚 :539-540 文案常量形态） */
export const TRYCLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i

/** cloudflared 在捕获窗口内提前退出（触发兜底的信号） */
export class TunnelProcessExitError extends Error {
  constructor(
    public readonly code: number | null,
  ) {
    super(`cloudflared 提前退出（code=${String(code)}）——触发兜底`)
    this.name = 'TunnelProcessExitError'
  }
}

export interface CloudflaredTunnel {
  url: string
  process: TunnelProcessHandle
}

/**
 * 起 `cloudflared tunnel --url http://127.0.0.1:<port>` 并在重试窗口内从 stdout 捕获
 * trycloudflare URL；窗口超时或进程提前退出（早于 URL 捕获）→ 抛错（退出 =
 * TunnelProcessExitError，兜底切换判型消费）。
 */
export async function startCloudflaredTunnel(
  binaryPath: string,
  localPort: number,
  deps: TunnelDeps,
  captureTimeoutMs = 15_000,
): Promise<CloudflaredTunnel> {
  const proc = deps.spawn(binaryPath, ['tunnel', '--url', `http://127.0.0.1:${localPort}`])
  return await new Promise<CloudflaredTunnel>((resolve, reject) => {
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      proc.onLine(noop)
      proc.onExit(noop)
    }
    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`cloudflared URL 捕获超时（${String(captureTimeoutMs)}ms 内无 trycloudflare URL）`)))
    }, captureTimeoutMs)
    proc.onLine((line) => {
      const url = TRYCLOUDFLARE_URL_RE.exec(line)?.[0]
      if (url !== undefined) settle(() => resolve({ url, process: proc }))
    })
    proc.onExit((code) => {
      settle(() => reject(new TunnelProcessExitError(code)))
    })
    function noop(): void {}
  })
}
