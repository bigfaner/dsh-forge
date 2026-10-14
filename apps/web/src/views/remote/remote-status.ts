// 远程状态模型（定位：业务——mobile-remote-approval 1.2/fix-3 手机远程入口/面板的纯派生层）。
// fix-3 重启生效形态（用户裁决 2026-10-14）：官方 remote.settings 无 webserver 可写命名
// 空间（volatileForm 整行排除）且上游明文拒绝运行期 rebind——开关改写产品自有配置
// （forge-settings.json remoteApproval.enabled），宿主装配期（boot overlay webserver 行覆写）
// 读之决定绑定，下次启动生效。相位 = 配置意图 × 实际绑定 host（boot manifest.remoteHost——
// 装配期读数的结果面）双源纯映射派生，本模块零缓存零副本零轮询；读数面缺席 = fail-soft off。
// 相位语义：
//   off       远程关（配置关 × 未暴露——灰）
//   pending   待重启生效（配置 ↔ 实际绑定不一致：开启未生效 / 关闭未收回——不伪装
//             listening，对齐用户预期）
//   listening 监听中（配置开 × 全卡绑定实况——绿）
//   connected 有设备已连接（亮态——设备连接读数源缺席恒不达，缺席 = fail-soft 不虚报）

/** 远程入口相位（图标 data-phase 与面板状态行同源） */
export type RemotePhase = 'off' | 'pending' | 'listening' | 'connected'

/** dsh-mobile-tunnel：隧道链路类型（host manifest 透传——cloudflared 首选 / pinggy 兜底） */
export type TunnelProvider = 'cloudflared' | 'pinggy'

/** dsh-mobile-tunnel：隧道面（互联网 tab 状态卡单源——manifest tunnel 三字段收拢） */
export interface TunnelFace {
  readonly url: string
  readonly provider: TunnelProvider
  /** Pinggy TTL 到期时刻（epoch ms——「约 N 分钟后失效」横幅读数；cloudflared = 缺席） */
  readonly expiresAt?: number
}

/** 远程状态快照（插件注入面 remote-face 产出——组件 useSyncExternalStore 直读） */
export interface RemoteStatusSnapshot {
  readonly phase: RemotePhase
  /** 局域网展示地址（监听中且端口读数在场；其余相位缺席 → 面板回退提示） */
  readonly lanAddress?: string
  /** fix-6：配对令牌到期时刻（epoch ms——QR 倒计时单源；与 lanAddress 同生同灭） */
  readonly pairExpiresAt?: number
  /** dsh-mobile-tunnel：隧道面（manifest tunnelUrl/链路类型/TTL 在场才携带——缺席 = 空态） */
  readonly tunnel?: TunnelFace
}
/**
 * 相位派生（纯函数——配置意图 × 实际绑定双源）：意图（产品配置 enabled）与实况（本 boot
 * webserver 绑定 host === '0.0.0.0'）不一致 = pending（重启生效缝——开/关两向同语义）；
 * 一致关 = off；一致开 = listening（devicesConnected 读数在场且真才抬 connected）。
 */
export function remotePhaseOf(input: {
  enabled: boolean
  exposureActive?: boolean
  devicesConnected?: boolean
}): RemotePhase {
  const active = input.exposureActive === true
  if (input.enabled !== active) return 'pending'
  if (!input.enabled) return 'off'
  return input.devicesConnected === true ? 'connected' : 'listening'
}

/** boot manifest 读数切片（dshForge.getBootManifest 消费面——remoteHost + remotePairUrl） */
export interface BootManifestRead {
  readonly url?: string
  readonly remoteHost?: string
  /** fix-5：官方配对/连接地址（宿主 /pair?token= 形状——LAN IPv4 + 端口 + 配对令牌；
   *  缺席 = 旧 child / 无局域网 IPv4 降级，面板回退提示——不自造地址） */
  readonly remotePairUrl?: string
  /** fix-6：配对令牌到期时刻（epoch ms——QR 倒计时单源；可选缺席降级） */
  readonly remotePairExpiresAt?: number
  /** fix-7：/pair 握手成功读数（host manifest 透传——true = 手机已连接粘性位） */
  readonly remoteDeviceConnected?: boolean
  /** dsh-mobile-tunnel：隧道配对地址（`${tunnelUrl}/pair?token=` 形状——与 LAN 同一 /pair 协议） */
  readonly tunnelUrl?: string
  /** dsh-mobile-tunnel：当前链路类型（与 tunnelUrl 同生同灭） */
  readonly tunnelProvider?: TunnelProvider
  /** dsh-mobile-tunnel：Pinggy TTL 到期时刻（epoch ms——UI「约 N 分钟后失效」横幅读数） */
  readonly tunnelExpiresAt?: number
}

/**
 * 产品配置意图 + boot manifest 实况 → 快照（纯映射——插件 remote-face 消费）。
 * 配置读数缺席（undefined——读面失败/畸形）= fail-soft off 快照，不虚报不炸装配。
 * fix-5 地址缝：真宿主载体为自定 scheme（location.hostname 非可达地址）——lanAddress 只认
 * manifest.remotePairUrl（官方配对地址单源），不再由页面 location 自造拼接。
 */
export function remoteSnapshotOf(
  enabled: boolean | undefined,
  manifest: BootManifestRead | undefined,
): RemoteStatusSnapshot {
  if (enabled === undefined) return { phase: 'off' }
  const exposureActive = manifest?.remoteHost === '0.0.0.0'
  const phase = remotePhaseOf({
    enabled,
    exposureActive,
    devicesConnected: manifest?.remoteDeviceConnected === true, // fix-7：/pair 握手成功读数抬 connected
  })
  // dsh-mobile-tunnel：隧道面收拢（url 非空串 × 链路类型合法齐备才携带——缺席/畸形 = 字段不出现）
  const tunnelUrl = manifest?.tunnelUrl
  const tunnelProvider = manifest?.tunnelProvider
  const tunnel =
    typeof tunnelUrl === 'string' && tunnelUrl !== '' && (tunnelProvider === 'cloudflared' || tunnelProvider === 'pinggy')
      ? ({
          url: tunnelUrl,
          provider: tunnelProvider,
          ...(typeof manifest?.tunnelExpiresAt === 'number' &&
          Number.isFinite(manifest.tunnelExpiresAt) &&
          manifest.tunnelExpiresAt > 0
            ? { expiresAt: manifest.tunnelExpiresAt }
            : {}),
        } satisfies TunnelFace)
      : undefined
  if (phase !== 'listening') {
    return { phase, ...(tunnel !== undefined ? { tunnel } : {}) }
  }
  const pairUrl = manifest?.remotePairUrl
  const lanAddress = typeof pairUrl === 'string' && pairUrl !== '' ? pairUrl : undefined
  const expiresAt = manifest?.remotePairExpiresAt
  const pairExpiresAt =
    typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined
  return {
    phase,
    lanAddress,
    ...(pairExpiresAt !== undefined ? { pairExpiresAt } : {}),
    ...(tunnel !== undefined ? { tunnel } : {}),
  }
}
