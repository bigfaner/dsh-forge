// @dsh-forge/quote-reference —— client face（浏览器半；打包脚本 scripts/bundle-client.mjs
// 按官方 clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic
// <script> 装载）。input-history 判例同构：组合 apply（{ apply } 对象）——对策
// gotcha-web-boot:43 判例（client face 为 DI 库件、无 apply → 真机 cordis
// `invalid plugin, expect function or object with an "apply" method`）。
//
// inject 声明硬门：本 face 引用的 ctx 服务 = sessions（dsh.client.inject 清单已声明
// `@deepseek-ai/dsh-api-session-controller`——装载序落在其后，属性访问运行期可达）；
// conversation 走 ctx.reflect.get 只读反射（官方面：绕过 inject 义务的只读反射，
// 缺席 = undefined——apps/web/src/client-plugin/plugin.ts 惰性配方先例，非规避硬门）。
//
// 骨架接线（功能本体——选区监听/浮出菜单/quote chip source/插入径——由后续任务在
// 本 apply 内组装，参考 apps/web/src/client-plugin/open-session.ts#insertReferenceAtTail）：
//   ① sessions 注入缝解析（装配序兜底：boot-graph inject 边只保证 bundle 装载序，
//      服务 provide 仍可能晚于本插件 apply——运行期注入，provide 时接线）；
//   ② 样式 factory 同步段注入（styles.ts——进官方 claimStyles 清点窗口，§5 二法取一）。
// 全缝 fail-soft：sessions/document 任一缺席只降本面，不炸 cordis 组合。
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { installQuoteReferenceStyles, type StyleDocument } from './styles.js'

/** client face 激活产物（组合 apply 接线面）。 */
export interface QuoteReferenceClientFace {
  /** sessions 注入缝在场性（desktop 组合常态供给；缺席 = 空态降级，不炸组合） */
  readonly sessionsAvailable: boolean
  /** 全量撤销（后续任务接线面的 disposer 聚合点；幂等） */
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
 * 组合 apply 插件对象（装载器物化后由 cordis 组合调用 apply）。返回值铁律：cordis
 * 组合把 apply 返回值当 effect 消费（真机判例——返回任意非空对象 = TypeError
 * 「Invalid effect」→ entry failed → 壳整页 boot 失败），apply 必须返回 undefined。
 */
export const quoteReferenceClient = {
  apply(ctx: Context): void {
    // 组合缝 fail-loud log + fail-soft 降级：接线面任一未捕获异常只降本面（console
    // 留痕供真机判读），不外溢炸 cordis 组合。
    try {
      const sessions = readSessionsOf(ctx)
      if (sessions != null) {
        mountDisposeOnContext(ctx, () => () => undefined)
        return
      }
      // 装配序兜底（官方 inject face——AGENTS.md §1.1 合法缝）：服务 provide 晚于本
      // apply 时运行期注入，provide 时接线；已提供则前分支已走。
      const inject = (ctx as {
        inject?: (names: readonly string[], cb: (scope: unknown) => void) => unknown
      }).inject
      if (typeof inject !== 'function') return
      inject.call(ctx, ['sessions'], () => undefined)
    } catch (error) {
      console.error('[dsh-forge/quote-reference] client apply failed——降级空态', error)
    }
  },
}

/** 接线本体（测试与诊断显式取面；骨架期 = sessions 在场性判读 + disposer 聚合点）。 */
export function wireQuoteReferenceClient(ctx: Context): QuoteReferenceClientFace {
  const sessionsAvailable = readSessionsOf(ctx) != null
  let disposed = false
  return {
    sessionsAvailable,
    dispose(): void {
      if (disposed) return
      disposed = true
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
