// 手机远程入口注册面（定位：装配——官方 `sidebar.footer.action` 扩展槽占用者）。
// 1.40 自 apps/web 壳侧 plugin.ts registerRemoteEntry 迁入本包（fix-13 模式：注册归插件
// 域，宿主只做 wiring——官方宿主不装载产品壳时本面仍随插件 bundle 自注册）；注入面构造
// buildRemoteStatusSource 及其私有辅助随迁，语义逐字保持（快照读数细节见各内联注释）。
// bundle 自含纪律：零跨 chunk import（dshForge preload 桥 = 页内全局直读——官方宿主
// 非 Electron 载体缺席 = fail-soft off 快照，不虚报不炸装配）。
import { ForgeRemoteEntry } from './remote-entry/ForgeRemoteEntry.js'
import type { PskTrioFace } from './remote-entry/ForgeRemoteEntry.js'
import { remoteSnapshotOf } from './remote-entry/remote-status.js'
import type { RemoteStatusSnapshot, TunnelProvider } from './remote-entry/remote-status.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_PROJECT_LOCALE_DICTS, FORGE_PROJECT_LOCALE_NS, type LocaleServiceFace } from './locale.js'

/** 官方侧栏底行扩展槽名（dsh-client-ui-sidebar SlotMap——kind list / scope root） */
export const SIDEBAR_FOOTER_ACTION_SLOT = 'sidebar.footer.action'
/** 手机远程入口登记 id（list 槽行键——与壳侧退役常量同源字面量） */
export const FORGE_REMOTE_ENTRY_ID = 'dswf-remote'
/** 手机远程入口登记序（官方设置钮为底行本体——产品行排其右，order 取 10 留序） */
export const FORGE_REMOTE_ENTRY_ORDER = 10

/**
 * 手机远程状态面（fix-3 重启生效形态——用户裁决 2026-10-14）：开关改写产品自有配置
 * （forge-settings.json remoteApproval.enabled，经 preload RPC forge:settings/* 单门——
 * 官方 remote.settings 无 webserver 可写命名空间[dsh-settings volatileForm 整行排除]且
 * 上游明文拒绝运行期 rebind[dsh-web-app startup.js:40]）。快照相位 = 配置意图 × 实际
 * 绑定 host（boot manifest.remoteHost——宿主装配期读同一配置的结果面，经 ready 消息透传）
 * 双源纯派生（remote-status.ts remoteSnapshotOf 单源）：配置↔实况不一致 = pending
 * （「待重启生效」提示态——不伪装 listening）。dshForge 桥缺席（非 Electron 载体）/调用
 * 失败/信封畸形 = fail-soft off 快照（不虚报不炸装配）；setEnabled = forge:settings/set
 * 分节覆写（只携 remoteApproval 节——core 读-改-写保留 worker 段）+ 即时 refresh。
 */
export interface ForgeRemoteStatusFace {
  /** 快照源（ForgeRemoteEntry useSyncExternalStore 直连契约） */
  readonly source: {
    getSnapshot(): RemoteStatusSnapshot
    subscribe(listener: () => void): () => void
  }
  /** 重新读产品配置 + boot manifest（成功/失败均收敛为合法快照并通知订阅者） */
  refresh(): Promise<void>
  /** 开关回写（forge:settings/set remoteApproval 分节；成功 → refresh 后 true；缺席/失败 = false fail-soft） */
  setEnabled(next: boolean): Promise<boolean>
  /** fix-10：断开连接（forge:remote/disconnect 撤该设备会话 + 即时 refresh；缺席/失败 = false） */
  disconnectDevice(): Promise<boolean>
  /** fix-17 ②：tab 切换重连（dsh-forge:remote/tunnel-toggle 触发隧道建立/读数刷新 + refresh；桥缺席/失败 = false） */
  tunnelEnsure(): Promise<boolean>
  /** fix-18 ②：显式换线（dsh-forge:remote/tunnel-fallback 触发 TunnelManager.fallback + refresh；桥缺席/失败 = false） */
  tunnelFallback(): Promise<boolean>
  /** fix-18 ③：PIN 重置（dsh-forge:remote/pin-reset 触发 pinIssuer.rotate——新 PIN 随 manifest 回流；桥缺席/失败 = false） */
  pinReset(): Promise<boolean>
  /** fix-26：长效密码开关（dsh-forge:remote/pin-consent 触发 pinIssuer.setDurable + refresh——durable 面随 manifest 回流；桥缺席/失败 = false） */
  pinConsent(consent: boolean): Promise<boolean>
  /** 1.107：三件套读数（dsh-forge:remote/psk-read——读数即显；桥缺席/失败/形状非法 = undefined） */
  pskRead(): Promise<PskTrioFace | undefined>
  /** 1.107：三件套轮换（dsh-forge:remote/psk-rotate——rotatePsk 再生成，结果 = 新读数；桥缺席/失败 = undefined） */
  pskRotate(): Promise<PskTrioFace | undefined>
}

/** dshForge preload 桥窄面（结构同型镜像——bundle 自持禁跨 chunk import）。
 *  域外直转族（tunnel/pin/psk）= preload 具名函数直通（不经 forge invoke allowlist——
 *  bug febc51d9 同族实证：bridge.invoke 打守卫门，dsh-forge:* 通道全数被拒且 fail-soft
 *  掩蔽——tunnelEnsure 靠 host 装配期自动建隧道、PIN 靠 manifest 回流而长期未显形）。 */
interface ForgePreloadBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  getBootManifest(): Promise<{
    url?: string
    remoteHost?: string
    remotePairUrl?: string
    remotePairExpiresAt?: number
    remoteDeviceConnected?: boolean
    tunnelUrl?: string
    tunnelProvider?: string
    tunnelExpiresAt?: number
    tunnelUnexpectedlyClosed?: boolean
    remotePin?: string
    remotePinExpiresAt?: number
    remotePinDurable?: boolean
  }>
  tunnelToggle?(): Promise<void>
  tunnelFallback?(): Promise<void>
  pinReset?(): Promise<void>
  pinConsent?(consent: boolean): Promise<void>
  pskRead?(): Promise<unknown>
  pskRotate?(): Promise<unknown>
}

/** dshForge 桥读取（缺席/形状不符 = undefined——fail-soft off 面，不炸装配） */
function preloadBridgeOf(): ForgePreloadBridge | undefined {
  const bridge = (globalThis as { dshForge?: unknown }).dshForge
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const record = bridge as Record<string, unknown>
  if (typeof record['invoke'] !== 'function' || typeof record['getBootManifest'] !== 'function') {
    return undefined
  }
  return bridge as ForgePreloadBridge
}

/** RPC 信封 → 载荷（{ok:true,data} 窄判——他形 = undefined fail-soft） */
function rpcDataOf(envelope: unknown): unknown {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const record = envelope as Record<string, unknown>
  return record['ok'] === true ? record['data'] : undefined
}

/** 配置载荷 → remoteApproval.enabled 读数（键缺席/畸形 = undefined——未配置 ≠ 关？缺席
 *  按关判：宿主装配期 remoteApprovalEnabledOf 同口径严格 === true 才开） */
function remoteApprovalEnabledOf(settings: unknown): boolean | undefined {
  if (typeof settings !== 'object' || settings === null) return false
  const section = (settings as Record<string, unknown>)['remoteApproval']
  if (section === undefined) return false
  if (typeof section !== 'object' || section === null) return undefined
  const enabled = (section as Record<string, unknown>)['enabled']
  return typeof enabled === 'boolean' ? enabled : undefined
}

/** forge:settings/* 通道字面量（contracts SETTINGS_CHANNELS 同源镜像——bundle 零外部 import） */
const SETTINGS_CHANNEL_GET = 'forge:settings/get'
const SETTINGS_CHANNEL_SET = 'forge:settings/set'

/** fix-10 断开连接通道字面量（contracts REMOTE_CHANNELS.disconnect 同源镜像——bundle 零外部 import） */
const REMOTE_CHANNEL_DISCONNECT = 'forge:remote/disconnect'

/** 读数形状守卫（dshForge 直转返回值——display/checksum/spki 三串齐备才携带；门未配置/畸形 = undefined） */
function pskTrioFaceOf(raw: unknown): PskTrioFace | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (record['configured'] !== true) return undefined
  const display = record['display']
  const checksum = record['checksum']
  const spki = record['spki']
  if (typeof display !== 'string' || display === '' || typeof checksum !== 'string' || typeof spki !== 'string' || spki === '') {
    return undefined
  }
  return {
    display,
    checksum,
    spki,
    ...(record['pinConfigured'] === true ? { pinConfigured: true } : {}),
    ...(record['pinDurable'] === true ? { pinDurable: true } : {}),
  }
}

/** 信封 ok 判（set 返回 data 为空——ok 布尔本身即结果面） */
function isOkEnvelope(envelope: unknown): boolean {
  return typeof envelope === 'object' && envelope !== null &&
    (envelope as Record<string, unknown>)['ok'] === true
}

/** manifest 读数切片（remote-status.ts BootManifestRead 兼容形状——窄化用局部类型） */
interface ManifestRead {
  readonly url?: string
  readonly remoteHost?: string
  readonly remotePairUrl?: string
  readonly remotePairExpiresAt?: number
  readonly remoteDeviceConnected?: boolean
  readonly tunnelUrl?: string
  readonly tunnelProvider?: TunnelProvider
  readonly tunnelExpiresAt?: number
  readonly tunnelUnexpectedlyClosed?: boolean
  readonly remotePin?: string
  readonly remotePinExpiresAt?: number
  readonly remotePinDurable?: boolean
}

/** 配置意图 + boot manifest 实况 → 快照（remoteSnapshotOf 单源消费——语义与判据见彼处注释） */
function snapshotOfReads(enabled: boolean | undefined, manifest: ManifestRead | undefined): RemoteStatusSnapshot {
  return remoteSnapshotOf(enabled, manifest)
}

/** 手机远程状态注入面构造（测试与注册面同源；快照读数细节见类型注释） */
export function buildRemoteStatusSource(): ForgeRemoteStatusFace {
  const listeners = new Set<() => void>()
  let snapshot: RemoteStatusSnapshot = { phase: 'off' }
  const publish = (): void => {
    for (const listener of listeners) listener()
  }
  const face: ForgeRemoteStatusFace = {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    refresh: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) {
        snapshot = { phase: 'off' }
        publish()
        return Promise.resolve()
      }
      const readConfig = Promise.resolve()
        .then(() => bridge.invoke(SETTINGS_CHANNEL_GET))
        .then(
          (envelope) => remoteApprovalEnabledOf(rpcDataOf(envelope)),
          () => undefined,
        )
      const readManifest = Promise.resolve()
        .then(() => bridge.getBootManifest())
        .then(
          (manifest) => (typeof manifest === 'object' && manifest !== null ? (manifest as ManifestRead) : undefined),
          () => undefined,
        )
      return Promise.all([readConfig, readManifest])
        .then(([enabled, manifest]) => {
          snapshot = snapshotOfReads(enabled, manifest)
        })
        .then(publish, publish)
    },
    setEnabled: (next) => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(SETTINGS_CHANNEL_SET, { remoteApproval: { enabled: next } }))
        .then(
          isOkEnvelope,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    disconnectDevice: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(REMOTE_CHANNEL_DISCONNECT, null))
        .then(
          isOkEnvelope,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-17 ②：tab 切换重连（tunnelToggle 具名缝直转——结果经 manifest 轮询单源回流；失败 = false fail-soft）
    tunnelEnsure: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined || bridge.tunnelToggle === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.tunnelToggle!())
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-18 ②：显式换线（tunnelFallback 具名缝直转——新链路经 tunnel 推送 + manifest 轮询单源回流）
    tunnelFallback: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined || bridge.tunnelFallback === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.tunnelFallback!())
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-18 ③：PIN 重置（pinReset 具名缝直转——新 PIN 经 pair 推送 + manifest 轮询单源回流）
    pinReset: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined || bridge.pinReset === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.pinReset!())
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // fix-26：长效密码开关（pinConsent 具名缝直转——durable 面经 pair 推送 + manifest 轮询单源回流）
    pinConsent: (consent) => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined || bridge.pinConsent === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.pinConsent!(consent))
        .then(
          () => true,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
    // 1.107：三件套读数（pskRead 具名缝直转——读数即显零缓存；桥/缝缺席/失败/门未配置 = undefined）。
    // 失败路径显性化（console.warn——client 束诊断豁免面）：区分缝缺席 / invoke 拒绝 /
    // 形状收拢失败三断点，链路诊断不再盲区。
    pskRead: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined) {
        console.warn('[dsh-forge/project] psk-read: preload bridge 缺席（invokeFace 未注入）')
        return Promise.resolve(undefined)
      }
      if (bridge.pskRead === undefined) {
        console.warn('[dsh-forge/project] psk-read: 具名缝缺席（旧 preload bundle？）')
        return Promise.resolve(undefined)
      }
      return Promise.resolve()
        .then(() => bridge.pskRead!())
        .then(
          (raw) => {
            const trio = pskTrioFaceOf(raw)
            if (trio === undefined) console.warn('[dsh-forge/project] psk-read: 形状收拢失败——raw =', JSON.stringify(raw))
            return trio
          },
          (cause) => {
            console.warn('[dsh-forge/project] psk-read: invoke 拒绝——', cause instanceof Error ? cause.message : String(cause))
            return undefined
          },
        )
    },
    // 1.107：三件套轮换（pskRotate 具名缝直转——结果 = 新读数，展示面即时换新；失败 = undefined）
    pskRotate: () => {
      const bridge = preloadBridgeOf()
      if (bridge === undefined || bridge.pskRotate === undefined) return Promise.resolve(undefined)
      return Promise.resolve()
        .then(() => bridge.pskRotate!())
        .then(pskTrioFaceOf, () => undefined)
    },
  }
  return face
}

/**
 * 底行手机远程入口注册面（apply 编排）：官方 `sidebar.footer.action` 扩展槽 list 行
 * 'dswf-remote'（order 10，设置钮右侧）。注入面 = 状态快照源（产品自有配置 × boot
 * manifest 双源）+ 开关/断开/隧道/PIN/PSK 动作族（preload 桥直转）；label 经插件自有
 * locale NS thunk（active locale 逐读）。桥缺席（非 Electron 载体，含官方 dsh web）=
 * 组件 fail-soft 灰态（源恒在场，快照 off）——注册面不受桥在场性影响。
 */
export function registerRemoteEntryFace(
  slots: SectionSlotsFace,
  locale: LocaleServiceFace,
): boolean {
  const t = locale.bind(FORGE_PROJECT_LOCALE_NS)
  const remote = buildRemoteStatusSource()
  const dispose = registerKeyedSection(slots, {
    slot: SIDEBAR_FOOTER_ACTION_SLOT,
    id: FORGE_REMOTE_ENTRY_ID,
    order: FORGE_REMOTE_ENTRY_ORDER,
    locale: FORGE_PROJECT_LOCALE_NS,
    label: (): string => t('remote.entry'),
    inject: () => ({
      status: remote.source,
      onToggle: (next: boolean): Promise<void> => remote.setEnabled(next).then(() => undefined),
      // fix-8（用户裁决 2026-10-14）：配对面承载改回官方 Modal dialog——图标点击开合
      // 入口组件内 dialog（ForgeRemoteEntry 自持 open 态）
      // fix-3 挂载期初刷（重启生效形态）：重启后装配期绑定变化只能在挂载时捕获——
      // 组件 mount useEffect 消费（缺席 = 兼容旧组件面，快照保默认 off）
      refresh: (): Promise<void> => remote.refresh(),
      // fix-10：断开连接（官方锚 :1176 outline 钮——forge:remote/disconnect 撤该设备
      // 会话缝 + 即时 refresh；成功后快照回等待扫码）
      onDisconnect: (): Promise<void> => remote.disconnectDevice().then(() => undefined),
      // fix-17 ②：tab 切换重连（切互联网 tab 隧道不在线 → tunnel-toggle 触发建立 + refresh）
      onTunnelEnsure: (): Promise<void> => remote.tunnelEnsure().then(() => undefined),
      // fix-18 ②：换线（互联网 tab 换线链接 → tunnel-fallback 触发显式换线 + refresh）
      onFallback: (): Promise<void> => remote.tunnelFallback().then(() => undefined),
      // fix-18 ③：PIN 重置（PIN 方框「重置密码」→ pin-reset 触发 pinIssuer.rotate + refresh）
      onPinReset: (): Promise<void> => remote.pinReset().then(() => undefined),
      // fix-26：长效密码开关（consent checkbox/「取消长效密码」→ pin-consent 触发 setDurable + refresh）
      onPinConsent: (consent: boolean): Promise<void> => remote.pinConsent(consent).then(() => undefined),
      // 1.107：三件套读数/轮换（psk-read/psk-rotate 直转——读数即显零缓存，轮换结果即时换新展示面）
      pskRead: (): Promise<PskTrioFace | undefined> => remote.pskRead(),
      onPskRotate: (): Promise<PskTrioFace | undefined> => remote.pskRotate(),
    }),
    component: ForgeRemoteEntry,
  })
  return dispose !== undefined
}

/**
 * 插件侧词典登记（bug 8b88f1e6：重入幂等——守门收进登记缝内部，调用面零改动）。
 * 词典挂在官方 client LocaleRuntime，插件 fiber 撤销不级联撤销登记；bundle reload
 * （官方 modules loader 重跑 apply）重入时对同 ns+locale 二次 register 会被官方抛
 * `already has locale` → 整块降级。收口 = 模块级锚持有 disposer + 页内全局锚同步发布
 * （FORGE_REMOTE_FACE_ANCHOR_KEY 锚契约先例同型，rpc.ts:89-128）：重入先撤销旧登记
 * 再重登记；返回的 disposer 撤销登记并清锚（清后重入视为全新登记）。
 */
export const FORGE_PROJECT_LOCALE_ANCHOR_KEY = '__dshForgeProjectLocaleDisposer'

/** 页内锚读取（跨 bundle 副本单例——另一副本模块级锚缺席时回退读页内锚） */
function localeAnchorOf(): (() => void) | undefined {
  const anchor = (globalThis as Record<string, unknown>)[FORGE_PROJECT_LOCALE_ANCHOR_KEY]
  return typeof anchor === 'function' ? (anchor as () => void) : undefined
}

/** 锚生效登记撤销（模块级锚优先，缺席回退页内锚——官方 disposer 幂等，双撤安全） */
function revokeAnchoredLocale(): void {
  localeAnchorOf()?.()
}

export function registerProjectLocale(locale: LocaleServiceFace): () => void {
  revokeAnchoredLocale()
  const disposer = locale.register(FORGE_PROJECT_LOCALE_NS, FORGE_PROJECT_LOCALE_DICTS)
  ;(globalThis as Record<string, unknown>)[FORGE_PROJECT_LOCALE_ANCHOR_KEY] = disposer
  return () => {
    disposer()
    const anchor = localeAnchorOf()
    if (anchor === disposer) delete (globalThis as Record<string, unknown>)[FORGE_PROJECT_LOCALE_ANCHOR_KEY]
  }
}
