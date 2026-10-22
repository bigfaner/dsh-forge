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
import {
  createDocumentActivityTracker,
  type DocumentActivityTracker,
  type DocActivityDom,
} from './document-activity.js'
import { MiniComposerCard } from './mini-composer.js'
import { createSuperComposerDataFace, mentionMenuOf, miniComposerPropsOf, type SessionInputFaceMirror } from './data-face.js'
import { installFactoryBridge } from './factory-bridge.js'
import { installSuperComposerStyles, installOfficialInputStyles, type StyleDocument } from './styles.js'

/** client face 激活产物（组合 apply 接线面）。 */
export interface SuperComposerClientFace {
  /** 全屏感知 tracker（document 在场时装配；缺席 = undefined 空态） */
  readonly tracker: FullscreenTracker | undefined
  /** 文档活动 tracker（1.39：dockkit 布局面缺席 = 恒 true 降级） */
  readonly activity: DocumentActivityTracker | undefined
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
  /** 文档活动 tracker（1.39：在场 = 替身按「全屏 ∧ 文档活动」合取门控挂载可见） */
  readonly activity?: DocumentActivityTracker
  /**「⧉」退全屏动作（缺省 = no-op） */
  readonly exitFullscreen?: () => void
}

/** 服务注册官方面（ctx.reflect.provide 窄面——host core forgeServices 判例同缝；
 * reflect 缝缺席/漂移 = 静默跳过，不炸组合）。 */
function provideServiceOnContext(ctx: Context, name: string, value: unknown): void {
  try {
    const reflect = (ctx as { reflect?: { provide?: (n: string, v?: unknown) => unknown } }).reflect
    if (typeof reflect?.provide !== 'function') return
    reflect.provide(name, value)
  } catch {
    // fail-soft：服务注册失败只降本面
  }
}

/**
 * 全屏替身输入区聚焦缝（bug 1ab2f4e6 组合面）：替身容器内 dscf 输入锚在场（= 全屏
 * 替身已渲染，非全屏门控 render(null) 不常驻）→ 聚焦并返回 true；替身不在场/聚焦
 * 失败 = false（quote-reference 回落主 composer face）。零 DOM 之外的全局态。
 */
function focusFullscreenInputOf(container: HTMLElement): () => boolean {
  return () => {
    // 复制件输入面（fix-12）：官方 DraftEditor 的 Lexical contenteditable（textarea
    // 旧径已退役）
    const input = container.querySelector('[data-dscf-official-input] [data-composer-input]') as HTMLElement | null
    if (input === null) return false
    try {
      input.focus()
    } catch {
      return false
    }
    return true
  }
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
  // 替身 composer 专用数据面（fix-12：复制件 InputBar/DraftEditor 宿主的单一订阅者
  // ——与外层渲染扇出 face 分实例，互不覆写订阅）
  const composerFace = createSuperComposerDataFace({
    sessions: readSessionsOf(origin) as never ?? readSessionsOf(ctx) as never,
    conversation: { input: { for: composerFaceOf } },
    bail: readBailOf(ctx) ?? readBailOf(origin),
    inputTriggers: {
      get sessionOf(): ((actx: unknown) => never) | undefined {
        return (readInputTriggersOf(ctx) ?? readInputTriggersOf(origin))?.sessionOf as never
      },
    } as never,
  })
  // bug 1ab2f4e6：全屏聚焦缝跨包组合——cordis 具名服务注册（quote-reference 每点击
  // 时点经 ctx 读 `superComposer`；本包 provide 即正门装配，无全局变量/事件魔改）。
  provideServiceOnContext(ctx, 'superComposer', { focusFullscreenInput: focusFullscreenInputOf(container) })
  // 1.30 slots 复用裁决：conversation.content 工厂桥（官方树内 shell.overlay 入口
  // 持 renderFactorySlot，portal 进替身卡 S2 宿主锚）。slots 服务晚序 provide 判例
  // 同构（sessions/inputTriggers）——立即尝试 + syncTimer 有界补挂；服务缺席 = 降级。
  let bridgeDisposers: Array<() => void> = []
  const tryInstallBridge = (): boolean => {
    const dispose = installFactoryBridge(ctx, origin)
    if (dispose === undefined) return false
    bridgeDisposers.push(dispose)
    return true
  }
  const render = (): void => {
    // 可见性门控（1.39 两信号合取）：①全屏呈现（fullscreenMarkers>0，AC5 既有）；
    // ②文档活动（dockkit 布局面在场时可见 content 内文档体锚在场——官方
    // documentpreview textpreview 锚 ∨ 产品 doc panel 锚；离文档/插件页/非文档
    // tab 即隐藏；布局面缺席 = 判据未知降级不收窄）。activity 缺席
    // （未装配方）= 不引入第二信号，保持全屏单信号语义。
    // 交叉真值表（终态）：
    //   全屏 ∧ 文档     → 显示；全屏 ∧ 非文档（dockkit 切走/关闭文档/插件页）→ 隐藏
    //   非全屏 ∧ 文档   → 隐藏（AC5）；非全屏 ∧ 非文档 → 隐藏
    // 隐藏期 = render(null) 整卡卸载：30s 空闲收球/Esc 状态机/未读圆点计时随组件
    // 卸载冻结（定时器 effect 清理），恢复显示即全新挂载重算——隐藏期间不误触发。
    if (options.tracker !== undefined && !options.tracker.isFullscreen()) {
      root.render(null)
      return
    }
    if (options.activity !== undefined && !options.activity.isActive()) {
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
          composer: composerFace,
        }),
      ),
    )
  }
  const off = face.subscribe(render)
  const offFullscreen = options.tracker?.subscribe(render)
  const offActivity = options.activity?.subscribe(render)
  let torn = false
  // 晚序服务补挂重试（conversation/inputTriggers provide 晚于挂载——有界轮询直至全源
  // 挂上；真机判例 inputTriggers provide 晚序可达分钟级，上界 150 次 = 5 分钟）
  let syncTries = 0
  const syncTimer = setInterval(() => {
    syncTries += 1
    if (torn || syncTries > 150) {
      clearInterval(syncTimer)
      return
    }
    // 工厂桥晚序补挂（slots 服务 provide 晚于挂载——成功即不再尝试）
    if (bridgeDisposers.length === 0) tryInstallBridge()
    if (face.syncSubscriptions(render)) clearInterval(syncTimer)
  }, 2_000)
  render()
  return () => {
    if (torn) return
    torn = true
    clearInterval(syncTimer)
    offActivity?.()
    offFullscreen?.()
    off()
    for (const disposeBridge of bridgeDisposers) disposeBridge()
    bridgeDisposers = []
    root.unmount()
    container.remove()
    face.dispose()
    composerFace.dispose()
  }
}
function mutationWatch(doc: Document): ((notify: () => void) => () => void) | undefined {
  const observerCtor = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver
  if (typeof observerCtor !== 'function') return undefined
  return (notify) => {
    const observer = new observerCtor(() => notify())
    // Root cause (bug 1b807ddb): 会话切换以 childList 摘/插文档锚——attributes-only
    // observer 在中间态卸载替身后收不到新锚落位，卡死不回挂；补 childList 使
    // 结构变化同样扇出 notify（MutationObserver 回调按微任务合批，同步换装零闪卸）。
    observer.observe(doc, { attributes: true, childList: true, subtree: true })
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
 * 文档活动感知装配（document 在场前提）：官方文档体锚读数 + MutationObserver watch。
 * 判据与降级语义见 document-activity.ts 文件头（官方源码核销注记）。
 */
export function mountDocumentActivityTracker(doc: Document): DocumentActivityTracker {
  return createDocumentActivityTracker({ doc: doc as unknown as DocActivityDom, watch: mutationWatch(doc) })
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
      const activity = mountDocumentActivityTracker(doc)
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
          activity,
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
          // 评审 C4：inject 缝缺席 = 装配断裂（sessions 晚 provide 时替身永不挂载）
          //——不再零日志静默，console 留痕供真机判读。
          if (typeof inject === 'function') {
            inject.call(ctx, ['sessions'], (scope: unknown) => {
              if (readSessionsOf(scope) == null) return
              try {
                wire(scope)
              } catch (error) {
                console.error('[dsh-forge/super-composer] late wiring failed——降级空态', error)
              }
            })
          } else {
            console.error('[dsh-forge/super-composer] ctx.inject 缝缺席且 sessions 未就绪——装配断裂，替身不挂载')
          }
        }
      } catch (error) {
        console.error('[dsh-forge/super-composer] mini-composer mount failed——降级空态', error)
      }
      mountDisposeOnContext(ctx, () => () => {
        tracker.dispose()
        activity.dispose()
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
  const activity = doc !== undefined ? mountDocumentActivityTracker(doc) : undefined
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    tracker?.dispose()
    activity?.dispose()
  }
  if (tracker !== undefined) mountDisposeOnContext(ctx, () => dispose)
  return { tracker, activity, dispose }
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
// 随卸载移除；Node/无 DOM 求值环境由 styles.ts 静默跳过）。复制件官方 CSS 同段注入
//（bundle 期 css-module 插件已把作用域化样式推入全局收集器——import 先于模块体求值）。
installSuperComposerStyles((globalThis as { document?: StyleDocument }).document)
installOfficialInputStyles((globalThis as { document?: StyleDocument }).document)
