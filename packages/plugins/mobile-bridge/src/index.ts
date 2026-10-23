// @dsh-forge/mobile-bridge 插件（mobile-ui ask 断链收口——bug f73315a1）：
// 组合期装载（boot overlay insert 行，先于 api-remotes 捕获监听），把 mobile ask 桥
// 注册为 user-questions/request waterfall answerer。桥本体（emit 扇出/连接注册表）
// 属宿主装配面——child 在 runProfile 前经全局锚注入本插件读取；锚缺席/ctx.on 缺席
// = 零挂接 fail-soft（宿主不受影响）。
//
// 形态：Cordis Plugin.Function——loader 取 default 导出（exports.default ?? exports，
// dsh-forge-core 同径）；返回句柄 disposer（本插件零资源，恒空查）。

/** child 注入的全局锚形状（桥 handle + 诊断面）。 */
export interface MobileBridgeHolder {
  handle(request: unknown, next: (req: unknown) => Promise<unknown>): Promise<unknown>
  diag?(line: string): void
}

const HOLDER_KEY = '__dshMobileAskBridge'

/** 全局锚读取（宿主注入；缺席 = undefined）。 */
export function mobileBridgeHolder(): MobileBridgeHolder | undefined {
  const holder = (globalThis as Record<string, unknown>)[HOLDER_KEY]
  if (typeof holder === 'object' && holder !== null && typeof (holder as MobileBridgeHolder).handle === 'function') {
    return holder as MobileBridgeHolder
  }
  return undefined
}

function apply(ctx: unknown): () => void {
  const holder = mobileBridgeHolder()
  const on = (ctx as Record<string, unknown>)['on']
  if (holder === undefined || typeof on !== 'function') {
    holder?.diag?.('[pair-diag] mobile-bridge 插件：锚或 ctx.on 缺席——零挂接')
    return () => {}
  }
  ;(on as (event: string, h: (request: unknown, next: (req: unknown) => Promise<unknown>) => Promise<unknown>) => unknown).call(
    ctx,
    'user-questions/request',
    (request, next) => holder.handle(request, next),
  )
  holder.diag?.('[pair-diag] mobile-bridge 插件：user-questions/request answerer 挂接完成（组合期）')
  return () => {}
}

const plugin = Object.assign(apply, {
  /** 零硬依赖（远程服务可达性由宿主装配保证；ctx.on 为 cordis 基础面）。 */
  inject: [] as readonly string[],
})

export default plugin
