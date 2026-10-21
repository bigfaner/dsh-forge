// @dsh-forge/super-composer —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。input-history 判例同构：组合 apply（{ apply } 对象）——对策
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// inject 声明硬门：本 face 当前零 ctx 服务消费（全屏感知 = tabInfo hook 快照 +
// DOM 标记，均不落 cordis 服务）——dsh.client.inject 清单为空集；后续任务
// （mini-composer 同草稿机操作）新增 conversation/sessions 消费时同步扩清单。
//
// 接线本体：createFullscreenTracker（fullscreen.ts 纯逻辑）——正门 tabInfo hook
// 快照 getter（React 渲染侧订阅缝由 mini-composer 任务在替身组件树内回填；本骨架
// 先接 DOM 兜底源，watch = MutationObserver 属性变化监听）+ ctx.effect 挂卸载。
// 全缝 fail-soft：document 缺席（Node）= 不装配，不炸 cordis 组合。
import type { Context } from '@deepseek-ai/cordis'
import { createFullscreenTracker, type FullscreenTracker } from './fullscreen.js'
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

/** MutationObserver 属性变化 watch（DOM 兜底源的变化推送——attributes + subtree）。 */
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
      mountDisposeOnContext(ctx, () => () => tracker.dispose())
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
