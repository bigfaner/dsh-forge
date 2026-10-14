// 远程状态模型（定位：业务——mobile-remote-approval 1.2 手机远程入口/面板的纯派生层）。
// 状态单源纪律（SC2 同径）：相位只从官方反射面读数（remote.settings describe 信封）
// 纯映射派生，本模块零缓存零副本零轮询；反射面缺席/失败 = fail-soft off（灰态）。
// 三态语义（提案验收 1）：off 远程关（灰）/ listening 监听中（绿）/ connected 有设备已
// 连接（亮态）——connected 需设备连接读数，官方装配缺该反射命名空间时恒 listening
// （缺席 = fail-soft，不虚报）。

/** 远程入口三态（图标 data-phase 与面板状态行同源） */
export type RemotePhase = 'off' | 'listening' | 'connected'

/** 远程状态快照（插件注入面 remote-face 产出——组件 useSyncExternalStore 直读） */
export interface RemoteStatusSnapshot {
  readonly phase: RemotePhase
  /** 局域网展示地址（监听中/已连接且 host=0.0.0.0 时在场；关闭态缺席 → 面板回退提示） */
  readonly lanAddress?: string
}

/** 三态派生（关闭态压倒一切——历史残留设备读数不抬相位） */
export function remotePhaseOf(input: { enabled: boolean; devicesConnected?: boolean }): RemotePhase {
  if (!input.enabled) return 'off'
  return input.devicesConnected === true ? 'connected' : 'listening'
}

/** 官方 remote.settings describe 读数切片（webserver 命名空间——回写面 host/revision 随行） */
export interface RemoteSettingsProbe {
  readonly ns: string
  readonly enabled: boolean
  readonly host?: string
  readonly port?: number
  readonly revision?: number
}

/**
 * 官方 remote.settings describe 信封 → webserver 命名空间读数。
 * 信封形 `{ok:true, value:{namespaces:[{ns, value, revision}]}}`（dsh-api-settings-controller
 * SettingsDescribeValue 消费切片）；识别规则 = ns 名含 'webserver' 优先，否则取首个人有
 * host 字段（host ∈ 回环/全卡字面量）的命名空间——宿主命名空间命名漂移防御。
 * 他形（!ok / 缺 namespaces）= undefined——反射面缺席 fail-soft 灰态面。
 * （plugin.ts remote-face 侧有结构同型镜像——bundle 自持禁跨 chunk import 纪律。）
 */
export function remoteSettingsProbeOf(envelope: unknown): RemoteSettingsProbe | undefined {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const record = envelope as Record<string, unknown>
  if (record['ok'] !== true) return undefined
  const namespaces = (record['value'] as Record<string, unknown> | undefined)?.['namespaces']
  if (!Array.isArray(namespaces)) return undefined
  let shapeFallback: RemoteSettingsProbe | undefined
  for (const entry of namespaces) {
    if (typeof entry !== 'object' || entry === null) continue
    const ns = entry as Record<string, unknown>
    const name = ns['ns']
    const value = ns['value']
    if (typeof name !== 'string' || typeof value !== 'object' || value === null) continue
    const section = value as Record<string, unknown>
    const host = section['host']
    if (host !== '127.0.0.1' && host !== '0.0.0.0') continue
    const probe: RemoteSettingsProbe = {
      ns: name,
      enabled: host === '0.0.0.0',
      host,
      port: typeof section['port'] === 'number' ? section['port'] : undefined,
      revision: typeof ns['revision'] === 'number' ? ns['revision'] : undefined,
    }
    if (name.includes('webserver')) return probe
    shapeFallback ??= probe
  }
  return shapeFallback
}

/**
 * 局域网展示地址派生：监听中（host=0.0.0.0）→ `http://<宿主机名>:<port>`（宿主机名 =
 * 当前页面 hostname——本 GUI 即宿主 webserver 承载，同一监听面）；关闭/回环/缺 port =
 * undefined（面板地址行回退提示语）。
 */
export function remoteLanAddressOf(
  probe: RemoteSettingsProbe,
  hostname: string,
): string | undefined {
  if (!probe.enabled || probe.host !== '0.0.0.0' || probe.port === undefined) return undefined
  return `http://${hostname}:${probe.port}`
}
