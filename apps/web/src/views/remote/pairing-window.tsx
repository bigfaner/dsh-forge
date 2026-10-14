// 配对独立窗口页（fix-7——bug 9fd9b6b1 ①③）：host「连接移动设备」独立窗加载的
// 产品配对页（`?forgePair=1` 路由，apps/web main.ts 分支直挂——不进官方壳，同手机受限
// 视图 1.3 分支形态）。页内状态源 = 产品配置（forge:settings/get remoteApproval.enabled）
// × boot manifest（remoteHost 绑定 / remotePairUrl / remoteDeviceConnected）双源纯派生
// （remote-status.ts remoteSnapshotOf 单源），官方 800ms 状态轮询刻度（DSH Desktop
// 0.10.0 :1194——「手机已连接」态卡随 /pair 握手成功读数回流呈现）。配对面 = RemotePanel
// 既有件复用（fix-7 布局对齐面在其内），开关回写 forge:settings/set 同插件 remote-face。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { REMOTE_DIALOG_TITLE, RemotePanel } from './ForgeRemoteEntry.js'
import { remoteSnapshotOf, type BootManifestRead, type RemoteStatusSnapshot } from './remote-status.js'
import './remote.css'

/** 配对窗路由判定（main.ts 分支锚——`?forgePair=1`；isRestrictedRemoteViewLocation 同型） */
export function isPairingWindowLocation(location: { search: string; hash: string }): boolean {
  return /(?:^\?|&)(?:forgePair=1)(?:&|$)/.test(location.search)
}

/** 官方状态轮询刻度（DSH Desktop 0.10.0 :1194——800ms） */
export const PAIR_STATUS_POLL_MS = 800

/** dshForge preload 桥窄面（client-plugin plugin.ts ForgePreloadBridge 结构同型镜像） */
export interface PairingBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  getBootManifest(): Promise<BootManifestRead>
}

/** dshForge 桥读取（缺席/形状不符 = undefined——fail-soft off 面，不炸装配） */
function pairingBridgeOf(): PairingBridge | undefined {
  const bridge = (globalThis as { dshForge?: unknown }).dshForge
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const record = bridge as Record<string, unknown>
  if (typeof record['invoke'] !== 'function' || typeof record['getBootManifest'] !== 'function') {
    return undefined
  }
  return bridge as PairingBridge
}

/** RPC 信封 → 载荷（{ok:true,data} 窄判——他形 = undefined fail-soft） */
function rpcDataOf(envelope: unknown): unknown {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const record = envelope as Record<string, unknown>
  return record['ok'] === true ? record['data'] : undefined
}

/** 配置载荷 → remoteApproval.enabled 读数（plugin remoteApprovalEnabledOf 同型镜像） */
function remoteApprovalEnabledOf(settings: unknown): boolean | undefined {
  if (typeof settings !== 'object' || settings === null) return false
  const section = (settings as Record<string, unknown>)['remoteApproval']
  if (section === undefined) return false
  if (typeof section !== 'object' || section === null) return undefined
  const enabled = (section as Record<string, unknown>)['enabled']
  return typeof enabled === 'boolean' ? enabled : undefined
}

const SETTINGS_CHANNEL_GET = 'forge:settings/get'
const SETTINGS_CHANNEL_SET = 'forge:settings/set'

/** 信封 ok 判（set 返回 data 为空——ok 布尔本身即结果面） */
function isOkEnvelope(envelope: unknown): boolean {
  return typeof envelope === 'object' && envelope !== null &&
    (envelope as Record<string, unknown>)['ok'] === true
}

export interface PairingStatusFace {
  readonly source: {
    getSnapshot(): RemoteStatusSnapshot
    subscribe(listener: () => void): () => void
  }
  refresh(): Promise<void>
  setEnabled(next: boolean): Promise<boolean>
}

/**
 * 配对页状态源（plugin.ts buildRemoteStatusSource 同型镜像——跑在主 bundle 侧，读数经
 * views/remote/remote-status.ts remoteSnapshotOf 单源派生；桥缺席/调用失败 = fail-soft off）。
 */
export function createPairingStatusSource(bridge: PairingBridge | undefined = pairingBridgeOf()): PairingStatusFace {
  const listeners = new Set<() => void>()
  let snapshot: RemoteStatusSnapshot = { phase: 'off' }
  const publish = (): void => {
    for (const listener of listeners) listener()
  }
  const face: PairingStatusFace = {
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
          (manifest) => (typeof manifest === 'object' && manifest !== null ? manifest : undefined),
          () => undefined,
        )
      return Promise.all([readConfig, readManifest])
        .then(([enabled, manifest]) => {
          snapshot = remoteSnapshotOf(enabled, manifest)
        })
        .then(publish, publish)
    },
    setEnabled: (next) => {
      if (bridge === undefined) return Promise.resolve(false)
      return Promise.resolve()
        .then(() => bridge.invoke(SETTINGS_CHANNEL_SET, { remoteApproval: { enabled: next } }))
        .then(
          isOkEnvelope,
          () => false,
        )
        .then((ok) => face.refresh().then(() => ok))
    },
  }
  return face
}

/**
 * 配对独立窗页面（标题「连接移动设备」+ RemotePanel 配对面；挂载期初刷一次 + 官方 800ms
 * 状态轮询——卸载级联清除）。source 注入面 = 测试替身/复用缝；缺席 = 页内桥自建单源。
 */
export function ForgePairingWindow(props: {
  readonly source?: PairingStatusFace
}): ReactNode {
  const [face, setFace] = useState<PairingStatusFace | undefined>(() => props.source)
  useEffect(() => {
    if (props.source !== undefined) {
      setFace(props.source)
      return
    }
    const created = createPairingStatusSource()
    setFace(created)
  }, [props.source])
  const refresh = useCallback(() => (face ?? createPairingStatusSource()).refresh(), [face])
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), PAIR_STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])
  const snapshot = face?.source.getSnapshot() ?? { phase: 'off' as const }
  return (
    <div className="dswf-pairing-page" aria-label={REMOTE_DIALOG_TITLE}>
      <h1 className="dswf-pairing-title">{REMOTE_DIALOG_TITLE}</h1>
      <RemotePanel
        snapshot={snapshot}
        onToggle={face !== undefined ? (next) => face.setEnabled(next).then(() => undefined) : undefined}
        onRefresh={refresh}
      />
    </div>
  )
}
