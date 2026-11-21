// @dsh-forge/md-mermaid —— client face（浏览器半；官方宿主 client bundle 装载入口）。
// scripts/bundle-client.mjs 按官方 clientBundle 配方产 dist/client.js，经
// exports["./client"] 以 classic <script> 装载——materialize 后的 module.exports 本身
// 为 cordis 插件面（function 或含 apply 的对象；input-history 判例同型，嵌套不识别）。
//
// 接线全在 apply 内：createMermaidEnhancer + start；卸载经 ctx.effect 缝随 fiber
// 级联 stop（effect 缝缺席 = 只接线不挂卸载，语义同旧行为）。双挂载互斥由 enhancer
// 全局哨兵（MD_MERMAID_MOUNT_SENTINEL，document 侧单例键）承担——与壳构建期挂载
// 先到先得、后到 fail-soft，恒单实例（提案 md-mermaid-client-bundle 承重设计点）。
// 全缝 fail-soft：document 缺席 / 启动异常只降本面（console 留痕供真机判读，
// client 束 console 豁免面），不外溢炸宿主组合。
import { createMermaidEnhancer } from './enhancer.js'

/** client face 激活产物（组合 apply 接线面） */
export interface MermaidClientFace {
  /** 已启动的增强器 disposer（stop + 哨兵释放；幂等） */
  readonly dispose: () => void
}

/** cordis ctx 最小面（effect 卸载缝——Context extends Pick<Fiber,'effect'>） */
interface MermaidClientContextFace {
  effect?: (execute: () => unknown) => unknown
}

/** 启动 DOM 增强器（测试与诊断显式取用面；apply 的 try 体外置归由外层缝承担） */
export function mountMermaidClient(ctx?: MermaidClientContextFace): MermaidClientFace {
  const enhancer = createMermaidEnhancer()
  enhancer.start()
  const dispose = (): void => {
    enhancer.stop()
  }
  const effect = ctx?.effect
  if (typeof effect === 'function') effect.call(ctx, () => dispose)
  return { dispose }
}

/** 组合 apply 插件对象（非 DI 库件——装载器物化后由 cordis 组合调用 apply） */
export const mdMermaidClient = {
  apply(ctx: MermaidClientContextFace): void {
    try {
      mountMermaidClient(ctx)
    } catch (error) {
      console.error('[dsh-forge/md-mermaid] client apply failed——降级空态', error)
    }
  },
}

/** 装载器正门（client-modules 装载契约：module.exports 顶层 apply） */
export const apply = mdMermaidClient.apply.bind(mdMermaidClient)
