// @dsh-forge/quote-reference —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。input-history 判例同构：组合 apply（{ apply } 对象）——对策
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// inject 声明硬门：本 face 引用的 ctx 服务 = sessions + inputTriggers（dsh.client.inject
// 清单已声明 `@deepseek-ai/dsh-api-session-controller` 与 `@deepseek-ai/dsh-client-ui-
// input-trigger`——装载序落在其后，属性访问运行期可达；运行期读取仍走 fail-soft 结构
// 读取，服务缺席 = 降级不炸）；
// conversation 走 ctx.reflect.get 只读反射（官方面：绕过 inject 义务的只读反射，
// 缺席 = undefined——apps/web/src/client-plugin/plugin.ts 惰性配方先例，非规避硬门）。
//
// 接线本体（selection-menu 缝合）：sessions 在场 + document 在场 = mountSelectionMenu
//（document mouseup → scope 过滤 → primitives Menu 弹层 → insertReferenceAtTail 同径
// 落 quote chip → 自动聚焦）。活跃会话 = sessions.list 快照 retainedBy.mainView 在留行
//（官方 SessionListState 无 current 字段——apps/web activeSessionIdOf 判例同构镜像）。
// 全缝 fail-soft：sessions/document 任一缺席只降本面，不炸 cordis 组合。
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { installQuoteReferenceStyles, type StyleDocument } from './styles.js'
import { resolveSelectionScope } from './scope.js'
import {
  mountSelectionMenu,
  type QuoteInsertServices,
  type QuoteComposerFace,
  type ScopedEventBail,
  type SelectionMenuHandle,
} from './selection-menu.js'
import { createQuoteReferenceSource, normalizeQuoteMessageText, type QuoteReferenceSource } from './quote-source.js'

/** client face 激活产物（组合 apply 接线面）。 */
export interface QuoteReferenceClientFace {
  /** sessions 注入缝在场性（desktop 组合常态供给；缺席 = 空态降级，不炸组合） */
  readonly sessionsAvailable: boolean
  /** 全量撤销（监听/弹层卸载 disposer 聚合点；幂等） */
  dispose(): void
}

/** sessions 具名服务读取（fail-soft：cordis 缺席服务属性访问可抛）。 */
function readSessionsOf(source: unknown): ISessions | undefined {
  try {
    return (source as { sessions?: ISessions }).sessions ?? undefined
  } catch {
    return undefined
  }
}

/** conversation 只读反射读取（ctx.reflect.get——缺席 = undefined）。 */
function readConversationOf(ctx: Context): unknown {
  try {
    const reflect = (ctx as { reflect?: { get?: (name: string) => unknown } }).reflect
    if (typeof reflect?.get === 'function') return reflect.get('conversation')
    return (ctx as { conversation?: unknown }).conversation ?? undefined
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
    const reflect = (source as { reflect?: { get?: (n: string) => unknown } }).reflect
    if (typeof reflect?.get === 'function') return reflect.get(name)
  } catch {
    // fail-soft
  }
  return undefined
}

/** ctx.bail 窄面读取（缺席 = undefined）。 */
function readBailOf(ctx: Context): ScopedEventBail | undefined {
  const bail = (ctx as { bail?: (actx: unknown, name: string, payload: unknown) => unknown }).bail
  if (typeof bail !== 'function') return undefined
  return bail.bind(ctx)
}

/**
 * 活跃会话解析（官方快照形状——retainedBy.mainView 锚，apps/web 判例同构镜像）：
 * byId 行 `retainedBy.mainView > 0` 即主视图在留（该会话已被 retain——binding 按
 * 「borrow an already-retained binding」语义可用）。快照缺席/形状漂移 = undefined。
 */
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  if (typeof byId !== 'object' || byId === null) return undefined
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof id === 'string' && id !== '' && typeof mainView === 'number' && mainView > 0) return id
  }
  return undefined
}

/** composer 输入 face 结构同型读取（官方 SessionInput 消费切片——形状漂移 = undefined）。 */
function composerFaceOf(conversation: unknown, actx: unknown): QuoteComposerFace | undefined {
  if (typeof conversation !== 'object' || conversation === null) return undefined
  try {
    return (conversation as { input?: { for?: (a: unknown) => QuoteComposerFace | undefined } }).input?.for?.(actx) ?? undefined
  } catch {
    return undefined
  }
}

/** 引用插入服务组装（真实 ctx 服务切片 → QuoteInsertServices 窄面；服务逐项
 * scope 优先、ctx 兜底——inject 注入 scope 只承载被注入服务（真机判例：
 * conversation/reflect 不在注入 scope 上），其余服务仍以主 ctx 读取）。 */
function quoteInsertServicesFrom(ctx: Context, source?: unknown): QuoteInsertServices | undefined {
  const origin = (source ?? ctx) as Context
  const sessions = readSessionsOf(origin) ?? readSessionsOf(ctx)
  const bail = readBailOf(ctx) ?? readBailOf(origin)
  if (sessions === undefined || bail === undefined) return undefined
  return {
    sessions: { binding: (id) => sessions.binding(id as Parameters<typeof sessions.binding>[0]) },
    // conversation 惰性解析（每操作时点读——provide 晚于 apply，挂载期捕获 = 恒 undefined）
    conversation: {
      input: {
        for: (actx) => composerFaceOf(readConversationOf(ctx) ?? readConversationOf(origin), actx),
      },
    },
    bail,
  }
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

// 样式 factory 同步段注入（§5 取一：bundle 顶层、apply 之外——官方 modules 在模块
// factory 物化同步返回后清点未打标 <style>（claimStyles）打 data-plugin 标，停用时
// 随卸载移除；Node/无 DOM 求值环境由 styles.ts 静默跳过）。
installQuoteReferenceStyles((globalThis as { document?: StyleDocument }).document)

/**
 * 选区浮出菜单装配（sessions + document 在场前提）：
 * mouseup → scope 过滤 → primitives Menu 弹层 → insertReferenceAtTail 同径落 chip
 * → 自动聚焦对应面。全屏替身聚焦缝（focusFullscreenInput）经 cordis 具名服务
 * `superComposer` 组合注入（super-composer apply 经 ctx.reflect.provide 注册——
 * host core forgeServices 判例同缝；每点击时点惰性读取，服务缺席/替身不在场 = 回落
 * 主 composer face。本包不感知全屏实现，只消费聚焦结果布尔）。任一前提缺席 = 不装配。
 * @param source 服务切片源（inject 兜底回调传入注入后 scope——scope 优先、ctx 兜底；
 *   直驱/快路径缺省 = ctx。Root cause: inject 回调时点服务落在注入 scope 上，
 *   重读 ctx.sessions = undefined → 菜单永不挂载）
 */
export function mountQuoteSelectionMenu(ctx: Context, source?: unknown, quoteSource?: QuoteReferenceSource): SelectionMenuHandle | undefined {
  if (typeof document === 'undefined') return undefined
  const origin = (source ?? ctx) as Context
  const sessions = readSessionsOf(origin) ?? readSessionsOf(ctx)
  const services = quoteInsertServicesFrom(ctx, source)
  if (sessions === undefined || services === undefined) return undefined
  // 全屏替身聚焦缝 + 引用现身反馈缝（1.45）：每点击时点读 cordis `superComposer`
  // 服务（super-composer 晚于本包 provide 也可达——挂载期一次性捕获会把缺席焊死）。
  // 服务/方法/调用任一漂移：聚焦 = false 回落；现身 = 静默跳过。
  const superComposerFace = (): { focusFullscreenInput?: unknown; surfaceOnReference?: unknown } | undefined => {
    const svc = readServiceOf(origin, 'superComposer') ?? readServiceOf(ctx, 'superComposer')
    return typeof svc === 'object' && svc !== null ? (svc as { focusFullscreenInput?: unknown; surfaceOnReference?: unknown }) : undefined
  }
  const focusFullscreenInput = (): boolean => {
    const focus = superComposerFace()?.focusFullscreenInput
    if (typeof focus !== 'function') return false
    try {
      return (focus as () => unknown).call(undefined) === true
    } catch {
      return false
    }
  }
  const surfaceReplacement = (): void => {
    const surface = superComposerFace()?.surfaceOnReference
    if (typeof surface !== 'function') return
    ;(surface as () => unknown).call(undefined)
  }
  return mountSelectionMenu({
    doc: document,
    roots: resolveSelectionScope().selectionRoots,
    resolveSessionId: () => activeSessionIdOf(sessions.list),
    services,
    source: quoteSource ?? createQuoteReferenceSource(),
    focusFullscreenInput,
    surfaceReplacement,
  })
}

/**
 * 组合 apply 插件对象（装载器物化后由 cordis 组合调用 apply）。返回值铁律：cordis
 * 组合把 apply 返回值当 effect 消费（真机判例——返回任意非空对象 = TypeError
 * 「Invalid effect」→ entry failed → 壳整页 boot 失败），apply 必须返回 undefined。
 */
export const quoteReferenceClient = {
  apply(ctx: Context): void {
    // 组合缝 fail-loud log + fail-soft 降级：接线面任一未捕获异常只降本面（console
    // 留痕供真机判读），不外溢炸 cordis 组合。
    try {
      // Root cause: 真机 web 壳 sessions provide 晚于本 apply——主径恒走兜底分支，
      // 兜底回调必须自身完成接线（空回调 = 菜单永不装配）。
      let menu: SelectionMenuHandle | undefined
      let disposeWired = false
      let disposedFlag = false
      // scope 优先（inject 兜底回调传入注入后 scope——服务切片从 scope 读，ctx 只作缺省）
      const quoteSource = createQuoteReferenceSource()
      let disposeSource = (): void => {}
      // quote chip source 挂官方 inputTriggers 名册（proposal 复用核销表正门——
      // serialize codec 的 owner 缺席 = 发送期 serializeReference 拒绝 → 发送被阻断）。
      // 注册依赖服务 provide 晚序——短周期重试直至生效（registered 幂等判据），上限 30 次。
      let registered = false
      let sinkWrapped = false
      let tries = 0
      // bug e12a37ed：块间空行归一化落点——conversation 服务 sendSession 方法 wrap
      // （AGENTS §1.1 合法缝·方法 wrap）。官方 sinkSerialized 零分隔拼接 + 逐块
      // serialize 无法感知邻居，含 quote 块消息的连续 ≥3 换行在全文汇聚点收敛为
      // 恰一空行（normalizeQuoteMessageText；无 quote 块文本原样透传——非介入面
      // 零行为差异）。conversation 与 inputTriggers 同为 provide 晚序服务——同一
      // 有界重试循环内补挂；缺席 = 降级不炸（引用块间留白退回 fix-25 形态）。
      const wrapSink = (): void => {
        if (sinkWrapped) return
        const conversation = readConversationOf(ctx) as
          | { sendSession?: (...args: unknown[]) => unknown }
          | null
        if (typeof conversation?.sendSession !== 'function') return
        const original = conversation.sendSession.bind(conversation)
        conversation.sendSession = (...args: unknown[]): unknown => {
          if (typeof args[1] === 'string') args[1] = normalizeQuoteMessageText(args[1])
          return original(...args)
        }
        sinkWrapped = true
      }
      const registerTriggerSource = (): boolean => {
        if (registered) return true
        const service = readServiceOf(ctx, 'inputTriggers') as
          | { registerSource?: (src: unknown) => unknown }
          | undefined
        const register = service?.registerSource
        if (typeof register !== 'function') return false
        try {
          const dispose = register.call(service, quoteSource)
          if (typeof dispose === 'function') disposeSource = dispose as () => void
          registered = true
          return true
        } catch (error) {
          // duplicate trigger/name = 重复注册（前次已生效）——视同成功
          if (/duplicate/i.test(String(error))) {
            registered = true
            return true
          }
          console.error('[dsh-forge/quote-reference] trigger source register failed——降级空态', error)
          return false
        }
      }
      const registrationTimer = setInterval(() => {
        tries += 1
        wrapSink()
        if ((registered && sinkWrapped) || disposedFlag || tries > 30) {
          clearInterval(registrationTimer)
          return
        }
        if (registerTriggerSource() && sinkWrapped) {
          clearInterval(registrationTimer)
        }
      }, 2_000)
      // 评审 A5：registrationTimer 有界泄漏缝兜底——wire 只在 sessions 到达后挂卸载，
      // sessions 恒不 provide + fiber 早 unload 时轮询定时器无人清。顶层 ctx.effect
      // 兜底清算（与 wire 内 disposer 叠加，clearInterval 幂等）；effect 缝缺席
      //（非 cordis ctx）不注册——直驱场景定时器由 30 次上界自然收敛。
      const topEffect = (ctx as { effect?: (execute: () => unknown) => unknown }).effect
      if (typeof topEffect === 'function') {
        topEffect.call(ctx, () => () => {
          disposedFlag = true
          clearInterval(registrationTimer)
        })
      }
      const wire = (source?: unknown): void => {
        if (disposeWired) return // 幂等防重挂：已接线不再二次 mount/dispose
        disposeWired = true
        registerTriggerSource()
        menu = mountQuoteSelectionMenu(ctx, source, quoteSource)
        mountDisposeOnContext(ctx, () => () => {
          disposedFlag = true
          clearInterval(registrationTimer)
          menu?.dispose()
          disposeSource()
        })
      }
      const sessions = readSessionsOf(ctx)
      if (sessions != null) {
        wire()
        return
      }
      // 装配序兜底（官方 inject face——AGENTS.md §1.1 合法缝）：服务 provide 晚于本
      // apply 时运行期注入，provide 时以注入后 scope 接线；已提供则前分支已走。
      const inject = (ctx as {
        inject?: (names: readonly string[], cb: (scope: unknown) => void) => unknown
      }).inject
      if (typeof inject !== 'function') return
      inject.call(ctx, ['sessions'], (scope: unknown) => {
        const late = readSessionsOf(scope)
        if (late == null) return
        try {
          wire(scope)
        } catch (error) {
          console.error('[dsh-forge/quote-reference] late wiring failed——降级空态', error)
        }
      })
    } catch (error) {
      console.error('[dsh-forge/quote-reference] client apply failed——降级空态', error)
    }
  },
}

/** 接线本体（测试与诊断显式取面；sessions 在场性判读 + 选区菜单装配/撤销聚合）。 */
export function wireQuoteReferenceClient(ctx: Context): QuoteReferenceClientFace {
  const sessionsAvailable = readSessionsOf(ctx) != null
  const menu = sessionsAvailable ? mountQuoteSelectionMenu(ctx) : undefined
  let disposed = false
  return {
    sessionsAvailable,
    dispose(): void {
      if (disposed) return
      disposed = true
      menu?.dispose()
    },
  }
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 判例同型）；嵌套
 * 导出不被识别（真机「invalid plugin, expect function or object with an apply
 * method」判例）。
 */
export const apply = quoteReferenceClient.apply.bind(quoteReferenceClient)
