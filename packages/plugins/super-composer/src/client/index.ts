// @dsh-forge/super-composer —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。input-history 判例同构：组合 apply（{ apply } 对象）——对策
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// inject 声明硬门：本 face 引用的 ctx 服务 = sessions（dsh.client.inject 清单已声明
// `@deepseek-ai/dsh-api-session-controller`，与包清单一致——mini-composer 数据面消费）；
// conversation / inputTriggers / sidebarRight 走只读反射/结构读取（官方面：
// inputTriggers = InputTriggerService（client/service.d.ts——sessionOf(actx) 取每会话
// controller）、sidebarRight = ISidebarRight（toggleFullscreen = 官方 chrome 同径退全屏），
// 缺席 = undefined 空态降级）；bail 为 ctx 自带事件缝，不入清单。
//
// 装配序兜底（quote-reference 判例同构——bug ba885f7d ②）：真机 sessions provide 晚于
// apply，主径走 inject(['sessions']) 兜底回调，以注入后 scope 装配替身（scope 优先、
// ctx 兜底取服务切片）。
//
// 接线本体：createFullscreenTracker（fullscreen.ts 纯逻辑）DOM 兜底源（watch =
// MutationObserver）门控替身挂载可见——非全屏呈现态 render(null) 不常驻（AC5）；
// ⧉ = sidebarRight.toggleFullscreen(commandTarget(pane)) 官方同径真实退全屏。
// 全缝 fail-soft：document 缺席（Node）= 不装配，不炸 cordis 组合。
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createFullscreenTracker, type FullscreenTracker } from './fullscreen.js'
import { MiniComposerCard } from './mini-composer.js'
import { createSuperComposerDataFace, mentionMenuOf, miniComposerPropsOf, type SessionInputFaceMirror } from './data-face.js'
import { installSuperComposerStyles, type StyleDocument } from './styles.js'

/** client face 激活产物（组合 apply 接线面）。 */
export interface SuperComposerClientFace {
  /** 全屏感知 tracker（document 在场时装配；缺席 = undefined 空态） */
  readonly tracker: FullscreenTracker | undefined
  /** 全量撤销（tracker 停 watch；幂等） */
  dispose(): void
}

/**
 * dispose 挂官方 cordis 生命周期缝（ctx.effect——Context extends Pick<Fiber,'effect'>，
 * 产物 disposer 在 fiber unload 时自动执行；input-history 判例同构）。effect 缝缺席
 * （非 cordis ctx，测试/直驱）= 只接线不挂卸载。
 */
function mountDisposeOnContext(ctx: Context, mount: () => () => void): void {
  const effect = (ctx as { effect?: (execute: () => unknown) => unknown }).effect
  if (typeof effect !== 'function') {
    mount()
    return
  }
  effect.call(ctx, mount)
}

/** sessions 具名服务读取（fail-soft：cordis 缺席服务属性访问可抛）。 */
function readSessionsOf(source: unknown): unknown {
  try {
    return (source as { sessions?: unknown }).sessions ?? undefined
  } catch {
    return undefined
  }
}

/** cordis ctx 只读反射/属性读取（具名服务窄面——缺席/漂移 = undefined）。 */
function readServiceOf(source: unknown, name: string): unknown {
  try {
    const direct = (source as { [key: string]: unknown } | null)?.[name]
    if (direct != null) return direct
  } catch {
    // fail-soft
  }
  try {
    const reflect = (source as { reflect?: { get?: (name: string) => unknown } }).reflect
    if (typeof reflect?.get === 'function') return reflect.get(name)
  } catch {
    // fail-soft
  }
  return undefined
}

/** conversation 只读反射读取（ctx.reflect.get——缺席 = undefined）。 */
function readConversationOf(ctx: Context): unknown {
  return readServiceOf(ctx, 'conversation')
}

/** ctx.bail 窄面读取（缺席 = undefined）。 */
function readBailOf(ctx: Context): ((actx: unknown, name: string, payload: unknown) => unknown) | undefined {
  const bail = (ctx as { bail?: (actx: unknown, name: string, payload: unknown) => unknown }).bail
  if (typeof bail !== 'function') return undefined
  return bail.bind(ctx)
}

/** 官方 InputTriggerService 窄面（sessionOf 在场判读——漂移 = undefined；方法须
 * 绑定 service 调用——裸提取丢 this，官方 sessionOf 内部读 this.ctx 即炸）。 */
function readInputTriggersOf(source: unknown): { sessionOf: (actx: unknown) => unknown } | undefined {
  const service = readServiceOf(source, 'inputTriggers') as { sessionOf?: unknown } | undefined
  if (service === undefined || typeof service.sessionOf !== 'function') return undefined
  const sessionOf = service.sessionOf as (this: unknown, actx: unknown) => unknown
  return { sessionOf: (actx) => sessionOf.call(service, actx) }
}

/**
 * 官方退全屏窄面（ISidebarRight.toggleFullscreen——chrome 按钮同径）：仅当真实右栏
 * 处于全屏（fullscreen panel 内的真实 dockkit pane 在场）时捕获该 pane 后 toggle；
 * 无真实全屏 pane = no-op（bug d976ed15：文档首个 [data-dockkit-pane] 可为注入式
 * 假标记/常规 pane——把常规视图翻进全屏即语义反转）。服务缺席 = no-op（fail-soft）。
 */
function exitFullscreenOf(source: unknown, doc: Document, fallback?: unknown): () => void {
  return () => {
    try {
      const sidebarRight = (readServiceOf(source, 'sidebarRight') ?? readServiceOf(fallback, 'sidebarRight')) as
        | { commandTarget?: (el?: Element | null) => unknown; toggleFullscreen?: (t: unknown) => void }
        | undefined
      if (typeof sidebarRight?.commandTarget !== 'function' || typeof sidebarRight.toggleFullscreen !== 'function') return
      const pane = doc.querySelector('[data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]')
      if (pane === null) return
      // 官方公开命令径（sidebar-right client.js:9122 同型）：commandTarget() 无参捕获
      //（activeElement 在会话外 = 回落 active dock pane，布局自洽目标）。DOM pane 元素
      // 仅作方向门（真实全屏 pane 在场才动作）；捕获走官方径，避免 DOM 派生目标与
      // isTargetCurrent 的 occurrence/revision 校验错位。
      const target = sidebarRight.commandTarget()
      if (target != null) sidebarRight.toggleFullscreen(target)
    } catch {
      // fail-soft：官方面漂移只降本动作，不外溢
    }
  }
}

/** mini-composer 替身挂载选项（服务切片源 + 全屏门控 + 退全屏动作可注入）。 */
export interface MountMiniComposerOptions {
  /** 服务切片源（inject 兜底回调传入注入后 scope——scope 优先、ctx 兜底） */
  readonly source?: unknown
  /** 全屏感知 tracker（在场 = 替身按全屏呈现门控挂载可见） */
  readonly tracker?: FullscreenTracker
  /**「⧉」退全屏动作（缺省 = no-op） */
  readonly exitFullscreen?: () => void
}

/**
 * mini-composer 替身挂载（document 在场前提）：createRoot 替身容器渲染
 * MiniComposerCard——数据面 = createSuperComposerDataFace（真实服务切片：
 * sessions + conversation.input.for + bail + inputTriggers，同 quote-reference 模式）。
 * tracker 在场 = 替身仅在全屏呈现源激活时渲染（非全屏 render(null) 不常驻——AC5）。
 * face.subscribe（input state + eventSource + mention menu store）扇出重渲染。
 * 返回全量撤销（摘订阅 + root.unmount + 容器摘除 + face.dispose）。
 */
export function mountMiniComposer(doc: Document, ctx: Context, options: MountMiniComposerOptions = {}): () => void {
  const origin = (options.source ?? ctx) as Context
  const container = doc.createElement('div')
  doc.body.appendChild(container)
  // 服务逐项 scope 优先、ctx 兜底（真机判例：inject 注入 scope 只承载被注入服务
  // sessions——conversation/inputTriggers 等仍在主 ctx 上且 provide 晚于 apply，
  // 一律每操作时点惰性解析，挂载期捕获 = 恒 undefined）
  // conversation.input.for 切片（quote-reference composerFaceOf 判例同构——形状漂移 = undefined）
  const composerFaceOf = (actx: unknown): SessionInputFaceMirror | undefined => {
    const conversation = readServiceOf(ctx, 'conversation') ?? readConversationOf(origin)
    if (typeof conversation !== 'object' || conversation === null) return undefined
    try {
      return (conversation as { input?: { for?: (a: unknown) => SessionInputFaceMirror | undefined } }).input?.for?.(actx) ?? undefined
    } catch {
      return undefined
    }
  }
  const face = createSuperComposerDataFace({
    sessions: readSessionsOf(origin) as never ?? readSessionsOf(ctx) as never,
    conversation: { input: { for: composerFaceOf } },
    bail: readBailOf(ctx) ?? readBailOf(origin),
    // inputTriggers 惰性切片（bug 80421b57：服务 provide 晚序可达分钟级——挂载期一次性
    // 捕获会把 undefined 永久焊死在数据面上；getter 每次调用时点重读）
    inputTriggers: {
      get sessionOf(): ((actx: unknown) => never) | undefined {
        return (readInputTriggersOf(ctx) ?? readInputTriggersOf(origin))?.sessionOf as never
      },
    } as never,
  })
  const root = createRoot(container)
  const render = (): void => {
    // 全屏门控：非全屏呈现态不渲染替身（fullscreenMarkers=0 时不常驻——AC5）
    if (options.tracker !== undefined && !options.tracker.isFullscreen()) {
      root.render(null)
      return
    }
    root.render(
      createElement(
        MiniComposerCard,
        // mention 同壳面随渲染组装（bug 80421b57：menu store 订阅扇出已到 render，
        // 但 props.mention 此前从未组装——菜单模型永远进不了替身渲染）
        miniComposerPropsOf(face, {
          onExitFullscreen: options.exitFullscreen ?? (() => undefined),
          mention: mentionMenuOf(face),
        }),
      ),
    )
  }
  const off = face.subscribe(render)
  const offFullscreen = options.tracker?.subscribe(render)
  // 晚序服务补挂重试（conversation/inputTriggers provide 晚于挂载——有界轮询直至全源
  // 挂上；真机判例 inputTriggers provide 晚序可达分钟级，上界 150 次 = 5 分钟）
  let syncTries = 0
  const syncTimer = setInterval(() => {
    syncTries += 1
    if (torn || syncTries > 150 || face.syncSubscriptions(render)) clearInterval(syncTimer)
  }, 2_000)
  render()
  let torn = false
  return () => {
    if (torn) return
    torn = true
    clearInterval(syncTimer)
    offFullscreen?.()
    off()
    root.unmount()
    container.remove()
    face.dispose()
  }
}
function mutationWatch(doc: Document): ((notify: () => void) => () => void) | undefined {
  const observerCtor = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver
  if (typeof observerCtor !== 'function') return undefined
  return (notify) => {
    const observer = new observerCtor(() => notify())
    observer.observe(doc, { attributes: true, subtree: true })
    return () => observer.disconnect()
  }
}

/**
 * 全屏感知装配（document 在场前提）：DOM 兜底 tracker + MutationObserver watch。
 * 正门 tabInfo hook 快照 getter 由 mini-composer 任务在 React 组件树内回填
 * （hook 只可在 React 渲染期调用——本骨架先落兜底面，正门缝已预留）。
 */
export function mountFullscreenTracker(doc: Document): FullscreenTracker {
  return createFullscreenTracker({ doc, watch: mutationWatch(doc) })
}

/**
 * 组合 apply 插件对象（装载器物化后由 cordis 组合调用 apply）。返回值铁律：cordis
 * 组合把 apply 返回值当 effect 消费（真机判例——返回任意非空对象 = TypeError
 * 「Invalid effect」→ entry failed → 壳整页 boot 失败），apply 必须返回 undefined。
 */
export const superComposerClient = {
  apply(ctx: Context): void {
    // 组合缝 fail-loud log + fail-soft 降级：接线面任一未捕获异常只降本面（console
    // 留痕供真机判读），不外溢炸 cordis 组合。
    try {
      const doc = (globalThis as { document?: Document }).document
      if (doc === undefined) return
      const tracker = mountFullscreenTracker(doc)
      // Root cause: 真机 web 壳 sessions provide 晚于本 apply——主径恒走兜底分支，
      // 兜底回调必须以注入后 scope 完成接线（空回调/ctx 重读 = 替身数据面恒空态）。
      let disposeCard = (): void => {}
      let wired = false
      const wire = (source?: unknown): void => {
        if (wired) return // 幂等防重挂：已接线不再二次 mount/dispose
        wired = true
        disposeCard = mountMiniComposer(doc, ctx, {
          source,
          tracker,
          exitFullscreen: exitFullscreenOf(ctx, doc, source),
        })
      }
      try {
        if (readSessionsOf(ctx) != null) {
          wire()
        } else {
          // 装配序兜底（官方 inject face——AGENTS.md §1.1 合法缝）：服务 provide 晚于本
          // apply 时运行期注入，provide 时以注入后 scope 接线；已提供则前分支已走。
          const inject = (ctx as {
            inject?: (names: readonly string[], cb: (scope: unknown) => void) => unknown
          }).inject
          if (typeof inject === 'function') {
            inject.call(ctx, ['sessions'], (scope: unknown) => {
              if (readSessionsOf(scope) == null) return
              try {
                wire(scope)
              } catch (error) {
                console.error('[dsh-forge/super-composer] late wiring failed——降级空态', error)
              }
            })
          }
        }
      } catch (error) {
        console.error('[dsh-forge/super-composer] mini-composer mount failed——降级空态', error)
      }
      mountDisposeOnContext(ctx, () => () => {
        tracker.dispose()
        disposeCard()
      })
    } catch (error) {
      console.error('[dsh-forge/super-composer] client apply failed——降级空态', error)
    }
  },
}

/** 接线本体（测试与诊断显式取面；tracker 在场性判读 + 撤销聚合）。 */
export function wireSuperComposerClient(ctx: Context): SuperComposerClientFace {
  const doc = (globalThis as { document?: Document }).document
  const tracker = doc !== undefined ? mountFullscreenTracker(doc) : undefined
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    tracker?.dispose()
  }
  if (tracker !== undefined) mountDisposeOnContext(ctx, () => dispose)
  return { tracker, dispose }
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 判例同型）；嵌套
 * 导出不被识别（真机「invalid plugin, expect function or object with an apply
 * method」判例）。
 */
export const apply = superComposerClient.apply.bind(superComposerClient)

// 样式 factory 同步段注入（§5 取一：bundle 顶层、apply 之外——官方 modules 在模块
// factory 物化同步返回后清点未打标 <style>（claimStyles）打 data-plugin 标，停用时
// 随卸载移除；Node/无 DOM 求值环境由 styles.ts 静默跳过）。
installSuperComposerStyles((globalThis as { document?: StyleDocument }).document)
