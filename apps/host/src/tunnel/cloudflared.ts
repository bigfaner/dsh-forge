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

/** 缓存文件系统缝（存在性/读取/写入/建目录/执行位；真实实现 = node:fs） */
export interface TunnelFs {
  exists(path: string): boolean
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  /** 递归建目录（缓存目录先于 writeFile 建立——官方 :583 mkdir recursive 同径） */
  mkdir(path: string): Promise<void>
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
  /** 退避重试等待缝（真实实现 = setTimeout；测试 = 即时 resolve 记录延迟） */
  sleep(ms: number): Promise<void>
}

/** cloudflared pin 版本（官方锚 DSH Desktop 0.10.0 main.js:508 = 2026.8.2；版本漂移风险收敛于此单点 + sha256 清单同步） */
export const CLOUDFLARED_VERSION = '2026.8.2'

/** 平台架构 → release 资产名（darwin = 官方 .tgz 形态——下载后经 tar 解包；win-arm64 上游无资产 = 官方同款不支持；main.js:511-535） */
export function cloudflaredAsset(platform: string, arch: string): string {
  if (platform === 'win32') {
    if (arch === 'arm64') throw new Error(`cloudflared 不支持的平台：${platform}/${arch}（上游无 win-arm64 资产）`)
    return 'cloudflared-windows-amd64.exe'
  }
  if (platform === 'darwin') return `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`
  if (platform === 'linux') return `cloudflared-linux-${arch === 'arm64' ? 'arm64' : 'amd64'}`
  throw new Error(`cloudflared 不支持的平台：${platform}/${arch}`)
}

/**
 * pin 版本 sha256 清单（资产名 → 摘要；官方锚 main.js:511-535 逐字）。
 * darwin 为 .tgz 压缩包摘要（校验后解包）；校验不过即拒用——不落缓存、不启动。
 * // Root cause: be04ce95 前清单为占位全零——下载后校验必然 mismatch，首选链路恒败。
 */
export const CLOUDFLARED_SHA256: Readonly<Record<string, string>> = {
  'cloudflared-windows-amd64.exe':
    'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5',
  'cloudflared-darwin-arm64.tgz':
    '9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442',
  'cloudflared-darwin-amd64.tgz':
    'f1727723c586500e2092368ae21871b3df7ddfd2cb097f22d81bee4a9c458bb4',
  'cloudflared-linux-amd64':
    'fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2',
  'cloudflared-linux-arm64':
    '7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790',
}

export function cloudflaredDownloadUrl(version: string, asset: string): string {
  return `https://github.com/cloudflare/cloudflared/releases/download/${version}/${asset}`
}

/** 缓存目录（tmpdir()/dsh-cloudflared——官方同款约定；tar -C 目标） */
export function cacheDirOf(tmpDir: string): string {
  const sep = tmpDir.includes('\\') ? '\\' : '/'
  return `${tmpDir.replace(/[\\/]+$/, '')}${sep}dsh-cloudflared`
}

/** 缓存路径（官方同款约定：tmpdir()/dsh-cloudflared/<asset>） */
export function cachedBinaryPath(tmpDir: string, asset: string): string {
  const sep = tmpDir.includes('\\') ? '\\' : '/'
  return `${cacheDirOf(tmpDir)}${sep}${asset}`
}

/**
 * 确保 pin 版本 cloudflared 二进制就位并返回路径（产品自洽链——用户可无 dsh）：
 * ①产品自身缓存（fs.exists）→ 不下载；②种子收编：externalSeeds 候选（官方 DSH Desktop
 * `userData/bin/cloudflared[.exe]` 已下载二进制）在盘 → 读字节 + sha256 对 pin 清单校验
 * （不过即跳过——版本漂移不收编）→ **拷贝进产品自身缓存**（不引用不搬移 dsh 目录）；
 * ③下载 → sha256 校验（不过即抛错拒用、不落盘）→ 落缓存。darwin .tgz 资产校验后经
 * `tar -xzf` 解包到缓存目录（官方 :601-603 同径），产物名 = 资产名去 .tgz；非 tgz 直接
 * 写缓存。二次启动（fs.exists 命中）零下载零收编。
 */
export async function ensureCloudflaredBinary(
  deps: TunnelDeps,
  platform: string = process.platform,
  arch: string = process.arch,
  externalSeeds: readonly string[] = [],
): Promise<string> {
  const asset = cloudflaredAsset(platform, arch)
  const isTarGz = asset.endsWith('.tgz')
  // 缓存判定/产物名：tgz → 解包产物（去 .tgz）；否则 = 资产名本身
  const cacheName = isTarGz ? asset.replace(/\.tgz$/, '') : asset
  const path = cachedBinaryPath(deps.tmpDir(), cacheName)
  if (deps.fs.exists(path)) return path
  // bug a98a4cda：缓存目录先于一切落盘建立（node writeFile 不建父目录——官方 :583 同径）
  await deps.fs.mkdir(cacheDirOf(deps.tmpDir()))
  // 种子收编：与 pin 清单校验一致才拷贝进产品缓存（dsh 缓存只是字节来源，非运行期依赖）
  if (!isTarGz) {
    const expected = CLOUDFLARED_SHA256[asset]
    for (const seed of externalSeeds) {
      if (!deps.fs.exists(seed)) continue
      const bytes = await deps.fs.readFile(seed)
      if (deps.sha256(bytes) === expected) {
        await deps.fs.writeFile(path, bytes)
        return path
      }
    }
  }
  const data = await deps.fetch(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, asset))
  const expected = CLOUDFLARED_SHA256[asset]
  const actual = deps.sha256(data)
  if (actual !== expected) {
    throw new Error(`cloudflared sha256 校验不过（expected=${expected} actual=${actual}）——拒用`)
  }
  if (isTarGz) {
    // tgz：先落临时压缩包 → tar 解包到缓存目录（产物名 = 压缩包内成员名 = cacheName）
    const tgzPath = cachedBinaryPath(deps.tmpDir(), asset)
    await deps.fs.writeFile(tgzPath, data)
    const tar = deps.spawn('tar', ['-xzf', tgzPath, '-C', cacheDirOf(deps.tmpDir())])
    await new Promise<void>((resolve, reject) => {
      tar.onExit((code) => (code === 0 ? resolve() : reject(new Error(`tar 解包失败（code=${String(code)}）`))))
    })
  } else {
    await deps.fs.writeFile(path, data)
  }
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
