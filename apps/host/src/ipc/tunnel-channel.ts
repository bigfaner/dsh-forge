// fix-17 ② + fix-18：隧道/远程直转缝 IPC 通道（定位：基础——dshForge 域外直转面先例同制：
// harness-channel 同构，不进 forge invoke allowlist）。UI 切互联网 tab 隧道不在线时
// renderer 经 window.dshForge.tunnelToggle() 触达；fix-18 增补换线（tunnel-fallback——
// TunnelManager.fallback 显式换线）与 PIN 重置（pin-reset——child pinIssuer.rotate）两缝；
// handler 本体 = main 侧转发对应消息至 boot child（结果面走 tunnel/pair 推送 + manifest
// 轮询单源回流）。
import type { IpcMainLike } from './forge-channels.js'

/** 通道名（dshForge 直转面命名制——非 forge: 前缀，不经 FORGE_CHANNEL_ALLOWLIST） */
export const TUNNEL_TOGGLE_CHANNEL = 'dsh-forge:remote/tunnel-toggle'
/** fix-18：显式换线通道（官方 POST /desktop/tunnel/fallback 同语义） */
export const TUNNEL_FALLBACK_CHANNEL = 'dsh-forge:remote/tunnel-fallback'
/** fix-18：连接密码重置通道（官方 POST /desktop/pin/reset 同语义） */
export const PIN_RESET_CHANNEL = 'dsh-forge:remote/pin-reset'
/** fix-26：长效密码开关通道（官方 POST /desktop/pin/consent {consent} 同语义） */
export const PIN_CONSENT_CHANNEL = 'dsh-forge:remote/pin-consent'
/** 1.107：连接密钥三件套读数通道（读数即显——child remotePsk.read 桥 RPC 直转） */
export const PSK_READ_CHANNEL = 'dsh-forge:remote/psk-read'
/** 1.107：连接密钥轮换通道（rotatePsk 再生成——旧钥宽限期 ≤5min 只验不密） */
export const PSK_ROTATE_CHANNEL = 'dsh-forge:remote/psk-rotate'

/** 隧道直转动作面（main.ts 注入 host 缝——缺席由调用侧守卫） */
export interface TunnelToggleActions {
  toggle(): void
  /** fix-18：显式换线（TunnelManager.fallback——停当前链路起另一条） */
  fallback(): void
  /** fix-18：连接密码重置（pinIssuer.rotate——新 PIN 经 pair 消息回推 manifest） */
  pinReset(): void
  /** fix-26：长效密码开关（child pinIssuer.setDurable——durable 面经 pair 消息回推 manifest） */
  consentPin(consent: boolean): void
  /** 1.107：三件套读数（host.pskRead——bridge remotePsk.read 直转；结果面即返回值） */
  pskRead(): Promise<unknown>
  /** 1.107：三件套轮换（host.pskRotate——bridge remotePsk.rotate 直转；结果 = 新读数） */
  pskRotate(): Promise<unknown>
}

/** 注册 handler（invoke → 各 actions 直转——fire-and-forget 缝结果走推送回流；psk 双缝带值返回） */
export function registerTunnelChannel(ipcMain: IpcMainLike, actions: TunnelToggleActions): void {
  ipcMain.handle(TUNNEL_TOGGLE_CHANNEL, () => actions.toggle())
  ipcMain.handle(TUNNEL_FALLBACK_CHANNEL, () => actions.fallback())
  ipcMain.handle(PIN_RESET_CHANNEL, () => actions.pinReset())
  ipcMain.handle(PIN_CONSENT_CHANNEL, (_event, consent: unknown) => actions.consentPin(consent === true))
  ipcMain.handle(PSK_READ_CHANNEL, () => actions.pskRead())
  ipcMain.handle(PSK_ROTATE_CHANNEL, () => actions.pskRotate())
}

/** 撤除 handler（before-quit 清理面——harness-channel 同构；六缝同撤） */
export function removeTunnelChannel(ipcMain: Pick<IpcMainLike, 'removeHandler'>): void {
  ipcMain.removeHandler(TUNNEL_TOGGLE_CHANNEL)
  ipcMain.removeHandler(TUNNEL_FALLBACK_CHANNEL)
  ipcMain.removeHandler(PIN_RESET_CHANNEL)
  ipcMain.removeHandler(PIN_CONSENT_CHANNEL)
  ipcMain.removeHandler(PSK_READ_CHANNEL)
  ipcMain.removeHandler(PSK_ROTATE_CHANNEL)
}
