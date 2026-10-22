/**
 * 隧道连接设置段 + 只读闸门（mobile-ui/1.31——tunnel-psk v3 §3/§5 mobile 侧 UX 面）。
 *
 * · settings 屏新增段：PSK（base32 分组）+ PIN（双因子）+ host 公钥（静态验签根）
 *   同屏三字段——激活链 establishTunnelMaterial（校验段核对 → HKDF → non-extractable
 *   导入）；激活成功明文串即时清除（value = ''），不落 storage；
 * · 能力检测：WebCrypto Ed25519 缺席 = 下限注记（Chrome/Edge 113+、Safari 17+、
 *   Firefox 129+）；
 * · 只读闸门：隧道 + 无材料 = 闸门提示面（TUNNEL_COPY.readonlyGate）；
 *   轮换 401 = rotation 引导文案。
 *
 * 纯逻辑面（单测主战场）：validateTunnelInput / gateCopy / 能力注记。
 */

import { isEd25519Supported } from '../core/psk-crypto.ts'
import { establishTunnelMaterial, type ActivateResult, type TunnelMaterial } from '../core/tunnel-transport.ts'
import { TUNNEL_COPY } from '../core/tunnel.ts'
import { el } from './msg-cards.ts'

// ---------------------------------------------------------------------------
// 纯函数：输入校验 / 闸门文案
// ---------------------------------------------------------------------------

export interface TunnelInput {
  readonly psk: string
  readonly pin: string
  readonly hostKey: string
}

export type InputVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** 同步前置校验（结构面——校验段/派生在激活链内）。 */
export function validateTunnelInput(input: TunnelInput): InputVerdict {
  if (input.psk.replace(/[\s-]+/g, '') === '') return { ok: false, reason: 'psk-empty' }
  if (input.pin.trim() === '') return { ok: false, reason: 'pin-empty' }
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(input.hostKey.trim())) return { ok: false, reason: 'host-key' }
  return { ok: true }
}

export type GateKind = 'readonly' | 'rotation' | 'degraded' | 'offline'

/** 闸门/覆盖层文案（tunnel 形态区分「隧道模式（降级）」/ LAN 既有文案）。 */
export function gateCopy(kind: GateKind, tunnel: boolean): string {
  if (kind === 'degraded') return tunnel ? TUNNEL_COPY.degraded : TUNNEL_COPY.degradedLan
  if (kind === 'readonly') return TUNNEL_COPY.readonlyGate
  if (kind === 'rotation') return TUNNEL_COPY.rotation
  return TUNNEL_COPY.offline
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface TunnelPanelDeps {
  /** 激活成功回调（装配面持材料建传输——返回 void 即可）。 */
  readonly onActivated: (material: TunnelMaterial, hostKeyId: string) => void
  readonly sid: string
  /** 期望校验段（host 带外告知；缺席 = 跳过核对）。 */
  readonly expectedChecksum?: string
}

export interface TunnelPanel {
  readonly root: HTMLElement
  /** 当前激活材料（装配面传输重建用；未激活 = undefined）。 */
  material(): TunnelMaterial | undefined
}

export function createTunnelPanel(deps: TunnelPanelDeps): TunnelPanel {
  const root = el('div', 'tunnel-panel')

  let pskInput: HTMLInputElement | undefined
  let pinInput: HTMLInputElement | undefined
  let hostInput: HTMLInputElement | undefined
  let statusLine: HTMLElement | undefined
  let active: TunnelMaterial | undefined

  function build(): void {
    root.textContent = ''
    statusLine = el('div', 'msearch-hint', active === undefined ? TUNNEL_COPY.readonlyGate : `已激活 · host ${active.hostKeyId}`)

    pskInput = document.createElement('input')
    pskInput.className = 'msearch-input'
    pskInput.type = 'password'
    pskInput.placeholder = '连接密钥（base32 分组）'
    pskInput.autocomplete = 'off'

    pinInput = document.createElement('input')
    pinInput.className = 'msearch-input'
    pinInput.type = 'password'
    pinInput.placeholder = '配对 PIN（第二因子）'
    pinInput.autocomplete = 'off'

    hostInput = document.createElement('input')
    hostInput.className = 'msearch-input'
    hostInput.type = 'text'
    hostInput.placeholder = 'host 公钥（base64 SPKI）'
    hostInput.autocomplete = 'off'
    hostInput.spellcheck = false

    const activate = el('button', 'ask-btn primary', '激活连接')
    activate.addEventListener('click', () => void activateConnection())

    root.append(statusLine, pskInput, pinInput, hostInput, activate)
    void isEd25519Supported().then((supported) => {
      if (!supported && statusLine !== undefined) statusLine.textContent = TUNNEL_COPY.ed25519Floor
    })
  }

  async function activateConnection(): Promise<void> {
    if (pskInput === undefined || pinInput === undefined || hostInput === undefined || statusLine === undefined) return
    const input: TunnelInput = { psk: pskInput.value, pin: pinInput.value, hostKey: hostInput.value }
    const verdict = validateTunnelInput(input)
    if (!verdict.ok) {
      statusLine.textContent = `输入不完整（${verdict.reason}）`
      return
    }
    statusLine.textContent = '校验中…'
    let result: ActivateResult
    try {
      result = await establishTunnelMaterial(
        { pskText: input.psk, pin: input.pin, hostSpkiB64: input.hostKey.trim() },
        { sid: deps.sid, ...(deps.expectedChecksum !== undefined ? { expectedChecksum: deps.expectedChecksum } : {}) },
      )
    } catch (error) {
      // Ed25519 缺席等 WebCrypto 能力缺口在此显性化（否则 await 抛出 = 状态行永停「校验中…」）
      statusLine.textContent = `激活失败（${
        error instanceof Error && error.message !== '' ? error.message.slice(0, 80) : '浏览器加密能力不可用'
      }）`
      return
    }
    if (!result.ok) {
      statusLine.textContent = result.reason === 'checksum' ? '校验段不符——请核对密钥' : `激活失败（${result.reason}）`
      return
    }
    // 明文即时清除（红线：明文串不落 DOM/storage）
    pskInput.value = ''
    pinInput.value = ''
    active = result.material
    statusLine.textContent = `已激活 · host ${result.hostKeyId}`
    deps.onActivated(result.material, result.hostKeyId)
  }

  build()
  return {
    root,
    material: () => active,
  }
}

/** 只读闸门提示面（隧道 + 无材料装配挂点——全屏 conn-overlay 形态复用）。 */
export function createReadonlyGate(): HTMLElement {
  const gate = el('div', 'conn-overlay')
  gate.appendChild(el('span', undefined, TUNNEL_COPY.readonlyGate))
  return gate
}

/** 轮换期引导覆盖层（401 到达 → 宽限期文案，非裸断连）。 */
export function createRotationOverlay(): HTMLElement {
  const gate = el('div', 'conn-overlay')
  gate.appendChild(el('span', undefined, TUNNEL_COPY.rotation))
  return gate
}
