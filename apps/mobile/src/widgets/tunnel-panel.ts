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
// 纯函数：非密材料缓存（方案 A 2026-10-22——SPKI/PIN 本机预填，PSK 恒不落 storage）
// ---------------------------------------------------------------------------

export interface TunnelCacheStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 配对域隔离键（models recentStorageKey 同制）。 */
export function tunnelCacheKey(pairDomain: string, field: 'pin' | 'hostKey'): string {
  return `dshf.mobile.tunnel.${field}.${pairDomain}`
}

/** 读缓存（损坏/缺席 = undefined 静默降级——非密材料，零安全面）。 */
export function loadCachedField(store: TunnelCacheStore | null, key: string): string | undefined {
  if (store === null) return undefined
  try {
    const raw = store.getItem(key)
    return typeof raw === 'string' && raw !== '' ? raw : undefined
  } catch {
    return undefined
  }
}

/** 写缓存（存储不可用静默丢弃）。 */
export function saveCachedField(store: TunnelCacheStore | null, key: string, value: string): void {
  if (store === null) return
  try {
    store.setItem(key, value)
  } catch {
    /* 静默降级 */
  }
}

/** 清缓存（重置钮——配置信息一并清空）。 */
export function clearCachedField(store: TunnelCacheStore | null, key: string): void {
  if (store === null) return
  try {
    store.removeItem(key)
  } catch {
    /* 静默降级 */
  }
}

/** localStorage 适配（不可用环境 → null）。 */
export function defaultCacheStore(): TunnelCacheStore | null {
  try {
    if (typeof window === 'undefined' || window.localStorage === null) return null
    return window.localStorage
  } catch {
    return null
  }
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
  /** 配对域（方案 A 缓存隔离键——缺席 = 不缓存不预填）。 */
  readonly pairDomain?: string
  /** 缓存存储注入（测试；缺省 localStorage）。 */
  readonly cacheStore?: TunnelCacheStore | null
  /** 已激活初态（抽屉内嵌形态——材料在装配方持有时状态行直显已激活）。 */
  readonly activated?: boolean
}

export interface TunnelPanel {
  readonly root: HTMLElement
  /** 当前激活材料（装配面传输重建用；未激活 = undefined）。 */
  material(): TunnelMaterial | undefined
}

export function createTunnelPanel(deps: TunnelPanelDeps): TunnelPanel {
  const root = el('div', 'tunnel-panel')
  const cache = deps.cacheStore !== undefined ? deps.cacheStore : defaultCacheStore()
  const pinCacheKey = deps.pairDomain !== undefined ? tunnelCacheKey(deps.pairDomain, 'pin') : undefined
  const hostCacheKey = deps.pairDomain !== undefined ? tunnelCacheKey(deps.pairDomain, 'hostKey') : undefined

  let pskInput: HTMLInputElement | undefined
  let pinInput: HTMLInputElement | undefined
  let hostInput: HTMLInputElement | undefined
  let statusLine: HTMLElement | undefined
  let active: TunnelMaterial | undefined

  const IDLE_STATUS = deps.activated === true ? '已激活 · 连接保持中' : TUNNEL_COPY.readonlyGate

  /** 字段块：label 行（+ ? 帮助钮——点按展开内联解释）+ 输入框。 */
  function fieldBlock(label: string, input: HTMLInputElement, helpText: string): HTMLElement {
    const block = el('div', 'tunnel-field')
    const head = el('div', 'tunnel-label-row')
    const btn = el('button', 'tunnel-help', '?')
    btn.type = 'button'
    btn.setAttribute('aria-label', `字段说明：${label}`)
    btn.addEventListener('click', () => {
      const existing = block.querySelector('.tunnel-hint')
      if (existing === null) {
        block.append(el('div', 'tunnel-hint', helpText))
        btn.textContent = '×'
      } else {
        existing.remove()
        btn.textContent = '?'
      }
    })
    head.append(el('span', 'tunnel-label', label), btn)
    block.append(head, input)
    return block
  }

  function setStatus(text: string): void {
    if (statusLine !== undefined) statusLine.textContent = text
  }

  /** 重置（用户裁决 2026-10-22）：清空 PSK/PIN/SPKI 录入 + 本机信任基线，回待激活态。 */
  function resetFields(): void {
    if (pskInput === undefined || pinInput === undefined || hostInput === undefined) return
    pskInput.value = ''
    pinInput.value = ''
    hostInput.value = ''
    active = undefined
    setStatus(IDLE_STATUS)
    // 重置 = 配置信息一并清空（缓存 PIN/SPKI + 信任基线）
    if (pinCacheKey !== undefined) clearCachedField(cache, pinCacheKey)
    if (hostCacheKey !== undefined) clearCachedField(cache, hostCacheKey)
    try {
      if (typeof window !== 'undefined' && window.localStorage !== null) {
        window.localStorage.removeItem('forge.psk.trustBaseline')
      }
    } catch {
      /* 存储不可用静默跳过 */
    }
    for (const node of root.querySelectorAll('.tunnel-hint')) node.remove()
    for (const btn of root.querySelectorAll('.tunnel-help')) btn.textContent = '?'
  }

  function build(): void {
    root.textContent = ''
    statusLine = el('div', 'tunnel-status', IDLE_STATUS)

    pskInput = document.createElement('input')
    pskInput.className = 'tunnel-input'
    pskInput.type = 'password'
    pskInput.placeholder = '粘贴或逐字录入'
    pskInput.autocomplete = 'off'

    pinInput = document.createElement('input')
    pinInput.className = 'tunnel-input'
    pinInput.type = 'password'
    pinInput.placeholder = '6 位数字'
    pinInput.autocomplete = 'off'
    pinInput.inputMode = 'numeric'

    hostInput = document.createElement('input')
    hostInput.className = 'tunnel-input'
    hostInput.type = 'text'
    hostInput.placeholder = 'base64 SPKI 串'
    hostInput.autocomplete = 'off'
    hostInput.spellcheck = false

    // 方案 A 预填：SPKI/PIN 本机缓存回填（PSK 红线——恒不落 storage，恒手输）
    if (pinCacheKey !== undefined) pinInput.value = loadCachedField(cache, pinCacheKey) ?? ''
    if (hostCacheKey !== undefined) hostInput.value = loadCachedField(cache, hostCacheKey) ?? ''
    if ((pinInput.value !== '' || hostInput.value !== '') && statusLine !== undefined) {
      statusLine.textContent = '已记住配对 PIN 与 host 公钥——仅需录入连接密钥（PSK）'
    }

    const activate = el('button', 'tunnel-activate', '激活连接')
    activate.type = 'button'
    activate.addEventListener('click', () => void activateConnection())

    const reset = el('button', 'tunnel-reset', '重置')
    reset.type = 'button'
    reset.addEventListener('click', resetFields)

    root.append(
      statusLine,
      fieldBlock('连接密钥（PSK）', pskInput, 'PSK（预共享密钥）：加密隧道的根——桌面「连接密钥」面板一键复制全部后逐字段粘贴'),
      fieldBlock('配对 PIN', pinInput, '配对 PIN：与 PSK 共同派生会话密钥的第二因子——与桌面「配对 PIN」同值'),
      fieldBlock('host 公钥（SPKI）', hostInput, 'SPKI：电脑的签名公钥——验证响应确实来自你的电脑，防中间人伪造'),
      activate,
      reset,
    )
    void isEd25519Supported().then((supported) => {
      if (!supported) setStatus(TUNNEL_COPY.ed25519Floor)
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
    // 明文即时清除（红线：PSK 明文串不落 DOM/storage——value = ''）
    pskInput.value = ''
    // 方案 A：PIN/SPKI 非密材料激活成功即记本机（下次预填免重输）
    if (pinCacheKey !== undefined) saveCachedField(cache, pinCacheKey, input.pin.trim())
    if (hostCacheKey !== undefined) saveCachedField(cache, hostCacheKey, input.hostKey.trim())
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
