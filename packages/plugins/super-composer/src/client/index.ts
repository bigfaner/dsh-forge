// @dsh-forge/super-composer —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。input-history 判例同构：组合 apply（{ apply } 对象）——对策
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// inject 声明硬门：本 face 引用的 ctx 服务 = sessions（dsh.client.inject 清单已声明
// `@deepseek-ai/dsh-api-session-controller`，与包清单一致——mini-composer 数据面消费）；
// conversation 走 ctx.reflect.get 只读反射（官方面：绕过 inject 义务的只读反射，
// 缺席 = undefined——quote-reference 判例同构）；bail 为 ctx 自带事件缝，不入清单。
//
// 接线本体：createFullscreenTracker（fullscreen.ts 纯逻辑）——正门 tabInfo hook
// 快照 getter（React 渲染侧订阅缝由 mini-composer 在替身组件树内回填；本面先接
// DOM 兜底源，watch = MutationObserver 属性变化监听）+ mini-composer 替身挂载
//（MiniComposerCard + createSuperComposerDataFace 真实服务切片，createRoot 替身
// 容器——data-dscf-* 锚在卡片本体 data-testid）。全缝 fail-soft：document 缺席
//（Node）= 不装配，不炸 cordis 组合。
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createFullscreenTracker, type FullscreenTracker } from './fullscreen.js'
import { MiniComposerCard } from './mini-composer.js'
import { createSuperComposerDataFace, miniComposerPropsOf, type SessionInputFaceMirror } from './data-face.js'
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

/** ctx.bail 窄面读取（缺席 = undefined）。 */
function readBailOf(ctx: Context): ((actx: unknown, name: string, payload: unknown) => unknown) | undefined {
  const bail = (ctx as { bail?: (actx: unknown, name: string, payload: unknown) => unknown }).bail
  if (typeof bail !== 'function') return undefined
  return bail.bind(ctx)
}

/**
 * mini-composer 替身挂载（document 在场前提）：createRoot 替身容器渲染
 * MiniComposerCard——数据面 = createSuperComposerDataFace（真实 ctx 服务切片：
 * sessions + conversation.input.for + bail，同 quote-reference 模式；inputTriggers
 * 未声明 = mention 空态）。face.subscribe 扇出重渲染（流式增量上屏）。
 * 返回全量撤销（摘订阅 + root.unmount + 容器摘除 + face.dispose）。
 */
export function mountMiniComposer(doc: Document, ctx: Context): () => void {
  const container = doc.createElement('div')
  doc.body.appendChild(container)
  // conversation.input.for 切片（quote-reference composerFaceOf 判例同构——形状漂移 = undefined）
  const conversation = readConversationOf(ctx)
  const composerFaceOf = (actx: unknown): SessionInputFaceMirror | undefined => {
    if (typeof conversation !== 'object' || conversation === null) return undefined
    try {
      return (conversation as { input?: { for?: (a: unknown) => SessionInputFaceMirror | undefined } }).input?.for?.(actx) ?? undefined
    } catch {
      return undefined
    }
  }
  const face = createSuperComposerDataFace({
    sessions: readSessionsOf(ctx) as never,
    conversation: { input: { for: composerFaceOf } },
    bail: readBailOf(ctx),
  })
  const root = createRoot(container)
  const render = (): void => {
    root.render(createElement(MiniComposerCard, miniComposerPropsOf(face)))
  }
  const off = face.subscribe(render)
  render()
  let torn = false
  return () => {
    if (torn) return
    torn = true
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
      // mini-composer 替身挂载（fail-soft：替身面异常只降本面，tracker 仍收口）
      let disposeCard = (): void => {}
      try {
        disposeCard = mountMiniComposer(doc, ctx)
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
