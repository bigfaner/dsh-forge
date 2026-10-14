// boot manifest 形状（G1 契约面清单第 1 项：`{url, injections}` 注入格式；定位：基础）。
// injections 行形状归 dsh（dsh-host-webserver IndexInjection——style/script 等），
// host 只运输不解释；apps/web 壳内核（1.5）以 applyIndexInjections 同形消费。
import type { TunnelProvider } from '../tunnel/index.js'

export interface BootManifest {
  /** 已认证 web 面 URL（ctx.connection.authenticatedUrl 构造） */
  url: string
  /** 官方 ui-* client bundle 与产品插件注入行（ctx.webServer.collectIndexInjections 原样） */
  injections: readonly unknown[]
  /** fix-3：webserver 实际绑定 host（'127.0.0.1' | '0.0.0.0'——UI 远程 pending/listening
   *  判读单源；可选：旧 child / 读取降级 = 缺席） */
  remoteHost?: string
  /** fix-5：官方配对/连接地址（fix-6 起产 `http://<lan-ip>:<port>/pair?token=<token>` 形状
   *  ——手机扫码经 /pair 握手换官方会话 cookie；UI QR/地址行单源消费；可选：回环绑定 /
   *  无局域网 IPv4 / 旧 child = 缺席） */
  remotePairUrl?: string
  /** fix-6：配对令牌到期时刻（epoch ms——桌面 QR 倒计时单源；与 remotePairUrl 同生同灭） */
  remotePairExpiresAt?: number
  /** fix-7：/pair 握手成功读数（扫码连接完成——UI「手机已连接」态卡单源；粘性 until 宿主
   *  重启；缺席/false = 未连接，不虚报） */
  remoteDeviceConnected?: boolean
  /** dsh-mobile-tunnel：隧道配对地址（`${tunnelUrl}/pair?token=<token>` 形状——与 LAN
   *  remotePairUrl 并存同一 /pair 协议；UI 互联网面单源消费；隧道关闭/失效 = 撤除） */
  tunnelUrl?: string
  /** dsh-mobile-tunnel：当前链路类型（cloudflared 首选 / pinggy 兜底——UI 换线呈现单源；
   *  与 tunnelUrl 同生同灭） */
  tunnelProvider?: TunnelProvider
  /** dsh-mobile-tunnel：Pinggy 链路 TTL 到期时刻（epoch ms——UI「约 N 分钟后失效」倒计时
   *  单源；随 pair 旋转隧道消息刷新；cloudflared 无 TTL 语义 = 缺席） */
  tunnelExpiresAt?: number
}

/** 网卡读数窄面（node:os networkInterfaces 值元结构——纯函数零 node 依赖） */
export interface NetInterfaceRead {
  readonly family: unknown
  readonly address: string
  readonly internal: boolean
}

/** dsh-mobile-tunnel 隧道 manifest 面（buildBootManifest 第七参隧道载荷——三字段同生同灭） */
export interface TunnelManifestState {
  /** 隧道配对地址（tunnelPairUrlOf 产物——`${tunnelUrl}/pair?token=<token>` 形状） */
  readonly url: string
  /** 当前链路类型 */
  readonly provider: TunnelProvider
  /** Pinggy TTL 到期时刻（epoch ms；cloudflared = 缺席） */
  readonly expiresAt?: number
}

/**
 * fix-5 官方配对地址宿主选址（纯函数）：首个非回环 IPv4（排除 link-local 169.254.*）；
 * 无 = undefined（remotePairUrl 缺席——UI 空态回退，不自造地址）。
 */
export function lanIpv4Of(interfaces: readonly (readonly NetInterfaceRead[] | undefined)[]): string | undefined {
  for (const list of interfaces) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) return net.address
    }
  }
  return undefined
}

/**
 * fix-6 官方 /pair 配对地址形状（纯函数——URL 形状单源，官方 :1489 同构）：
 * `http://<lan-ip>:<port>/pair?token=<token>`。手机扫码 GET 该地址 → /pair 缝恒时校验
 * 后 302 官方认证 URL（BrowserAuth 铸 HttpOnly SameSite=Strict 会话 cookie——官方
 * dsh_mobile 同语义）。
 */
export function remotePairUrlOf(lanIpv4: string, port: number, token: string): string {
  return `http://${lanIpv4}:${port}/pair?token=${token}`
}

/**
 * dsh-mobile-tunnel 隧道配对地址形状（纯函数——与 LAN 同一 /pair 协议，URL 形状单源）：
 * `${tunnelUrl}/pair?token=<token>`。手机经公网隧道 GET 该地址 → 同一 /pair 缝校验握手。
 */
export function tunnelPairUrlOf(tunnelBaseUrl: string, token: string): string {
  return `${tunnelBaseUrl}/pair?token=${token}`
}

/** manifest 隧道面回读（run.ts 轮换/connected 重建保隧道面——单一提取避免三处漂移） */
export function tunnelStateOf(manifest: BootManifest): TunnelManifestState | undefined {
  if (manifest.tunnelUrl === undefined || manifest.tunnelProvider === undefined) return undefined
  return {
    url: manifest.tunnelUrl,
    provider: manifest.tunnelProvider,
    ...(manifest.tunnelExpiresAt !== undefined ? { expiresAt: manifest.tunnelExpiresAt } : {}),
  }
}

/** 组装 boot manifest（纯函数：校验 url/injections 基本形状后冻结返回；tunnel 载荷 =
 *  隧道激活态，undefined = 隧道面撤除——WiFi 面不受影响） */
export function buildBootManifest(
  url: string,
  injections: readonly unknown[],
  remoteHost?: string,
  remotePairUrl?: string,
  remotePairExpiresAt?: number,
  remoteDeviceConnected?: boolean,
  tunnel?: TunnelManifestState,
): BootManifest {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error(`[host:boot] manifest.url 须为 http(s) URL，实得：${String(url)}`)
  }
  if (!Array.isArray(injections)) {
    throw new Error('[host:boot] manifest.injections 须为数组（collectIndexInjections 原样）')
  }
  return Object.freeze({
    url,
    injections: Object.freeze([...injections]),
    ...(typeof remoteHost === 'string' && remoteHost !== '' ? { remoteHost } : {}),
    ...(typeof remotePairUrl === 'string' && remotePairUrl !== '' ? { remotePairUrl } : {}),
    ...(typeof remotePairExpiresAt === 'number' && Number.isFinite(remotePairExpiresAt) && remotePairExpiresAt > 0
      ? { remotePairExpiresAt }
      : {}),
    ...(remoteDeviceConnected === true ? { remoteDeviceConnected: true } : {}),
    ...(tunnel !== undefined
      ? {
          tunnelUrl: tunnel.url,
          tunnelProvider: tunnel.provider,
          ...(typeof tunnel.expiresAt === 'number' && Number.isFinite(tunnel.expiresAt) && tunnel.expiresAt > 0
            ? { tunnelExpiresAt: tunnel.expiresAt }
            : {}),
        }
      : {}),
  })
}
