// fix-25 传输缝 + 回退判定校准（mobile-remote-approval——bug ea46a3c8 数据面架构缺口②③）。
// 传输选择单源（本模块——禁组件内散判）：注入替身 > preload 桥（桌面 Electron 形态，
// 行为不变）> fetch 传输（手机浏览器形态——相对路径同源 POST，会话 cookie 自携，
// webserver /remote/__rpc 受限端点承载）。回退判定：数据面不可达的判据 = 传输失败
// 重试后仍失败（首请求竞态不回退——connecting 相位持有，二次失败才 unreachable 回
// 引导页）；ready 期瞬时失败不回退（保持快照面，轮询自愈）。
import type { ForgeTransport } from '../../rpc/transport.js'

/** HTTP RPC 端点（同源相对路径——webserver /remote/ 挂载点同侧受限端点） */
export const REMOTE_HTTP_RPC_ENDPOINT = '/remote/__rpc'

/** preload 暴露面的 RPC 切片（window.dshForge.invoke——rpc/transport.ts 同型镜像） */
export interface DshForgeInvokeGlobal {
  invoke(channel: string, payload?: unknown): Promise<unknown>
}

/**
 * fetch 传输（手机形态真身）：POST JSON {channel,payload} → RPC 信封透传；HTTP 层失败
 * （401/403/5xx/网络）→ 抛错（回退判定消费面——信封失败与传输失败同判据归一）。
 */
export function createHttpTransport(fetchImpl?: typeof fetch): ForgeTransport {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  return async (channel, payload) => {
    const response = await doFetch(REMOTE_HTTP_RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel, payload }),
    })
    if (!response.ok) throw new Error(`remote http rpc: HTTP ${response.status}`)
    return (await response.json()) as unknown
  }
}

/** preload 桥窄读（在场 = 非 undefined） */
function preloadBridge(): DshForgeInvokeGlobal | undefined {
  const bridge = (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
  return bridge !== undefined && typeof bridge.invoke === 'function' ? bridge : undefined
}

/**
 * 传输选择单源：注入替身 > preload 桥 > fetch 兜底。fetch 载体缺席（非浏览器且无
 * preload 的奇异测试环境）= undefined（调用方引导相位回退，不炸单页）。
 */
export function resolveRemoteTransport(injected?: ForgeTransport): ForgeTransport | undefined {
  if (injected !== undefined) return injected
  const bridge = preloadBridge()
  if (bridge !== undefined) return (channel, payload) => bridge.invoke(channel, payload)
  if (typeof fetch !== 'function') return undefined
  return createHttpTransport()
}

/** 受限数据面相位（回退判定状态机——纯派生，组件只消费不判读） */
export type RemoteFacePhase = 'connecting' | 'ready' | 'unreachable'

export interface RemoteFaceState {
  readonly phase: RemoteFacePhase
  /** connecting 期连续失败计数（2 = 重试后仍失败 → unreachable） */
  readonly failures: number
}

/** 初始态：connecting（首请求竞态不回退——引导页不因首败闪现） */
export function initialRemoteFaceState(): RemoteFaceState {
  return { phase: 'connecting', failures: 0 }
}

/**
 * 一次加载结算 → 相位（纯函数）：ok → ready（清零）；connecting 期 fail → 失败计数
 * +1，累计 2（首败 + 重试仍败）→ unreachable；ready 期 fail → 保持 ready（瞬时失败
 * 不回退——轮询自愈）；unreachable 期 ok → ready（恢复径）。
 */
export function remoteFacePhaseOf(state: RemoteFaceState, outcome: 'ok' | 'fail'): RemoteFaceState {
  if (outcome === 'ok') return { phase: 'ready', failures: 0 }
  if (state.phase === 'connecting') {
    const failures = state.failures + 1
    return failures >= 2 ? { phase: 'unreachable', failures } : { phase: 'connecting', failures }
  }
  return state
}
