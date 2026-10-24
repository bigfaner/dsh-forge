// 断连终态横幅呈现面（问题①——connection-watch 编排的 DOM 薄胶水）：
// ctx.connection 官方具名服务消费（AGENTS 具名服务取法——reflect 防御读取，缺席 = 零安装
// fail-soft）；横幅挂产品自有顶层（document.body 直挂——断连期官方组件树各域服务半死，
// slot 消费面不可靠），DESIGN 令牌错误色条带，connected 自动撤除。交互归实机走查。
import { installConnectionWatch, type ConnectionStateFace } from './connection-watch.js'

/** 官方 connection 状态窄面防御读取（reflect.get 宽松位——服务缺席/形状漂移 = undefined） */
function readConnectionFace(ctx: unknown): ConnectionStateFace | undefined {
  try {
    const reflect = (ctx as { reflect?: { get(name: string, strict?: boolean): unknown } }).reflect
    const raw = reflect?.get?.('connection', false) as
      | { state?: { getSnapshot?: unknown; subscribe?: unknown } }
      | undefined
    const state = raw?.state
    if (
      state !== null &&
      typeof state === 'object' &&
      typeof state.getSnapshot === 'function' &&
      typeof state.subscribe === 'function'
    ) {
      return state as unknown as ConnectionStateFace
    }
    return undefined
  } catch {
    return undefined // cordis 缺席解析抛错形态（4.0.4 属性/get 面语义）——零安装
  }
}

/** 横幅条带（DESIGN 令牌——错误色面 + label-primary 反白；一次性 DOM 挂 body 顶层） */
function mountBanner(): HTMLElement {
  const banner = document.createElement('div')
  banner.setAttribute('data-dswf-connection-lost', '')
  banner.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:2147483000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'gap:8px', // dsw-raw 全宽条带行内缝（局部刻度）
    'padding:8px 16px', // dsw-raw 全宽条带内距（局部刻度）
    'font:var(--dsw-font-xs-13, 13px sans-serif)',
    'color:var(--dsw-alias-label-on-primary, #fff)',
    'background:var(--dsw-alias-state-error-primary, #d64545)',
    'pointer-events:none',
  ].join(';')
  banner.textContent = '与宿主的连接已断开超过 1 分钟——会话不可用，请重启应用。'
  return banner
}

/**
 * 断连终态横幅安装（ctx.connection.state 订阅 → connecting 卡死 60s 升级条带，
 * connected 自动撤除）。返回撤销面（横幅摘除 + 订阅撤）；connection 服务缺席 =
 * undefined 零安装（fail-soft——官方版本漂移/非 desktop 载体零行为差异）。
 */
export function installConnectionLostBanner(ctx: unknown): (() => void) | undefined {
  const state = readConnectionFace(ctx)
  if (state === undefined) return undefined
  let banner: HTMLElement | undefined
  return installConnectionWatch(state, {
    onShow: () => {
      if (banner !== undefined) return
      banner = mountBanner()
      document.body.appendChild(banner)
    },
    onHide: () => {
      banner?.remove()
      banner = undefined
    },
  })
}
