// config-jump —— 「⚙ 配置」跳转官方导航缝解析器（纯逻辑面，零 UI import——单测直测）。
// 官方正门：dsh-client-ui-plugin-manager 经 ctx.reflect.provide("pluginNavigation",
// { openBundle(pkg) }) 提供「切换「插件」面板 + 打开包详情页」导航；详情页渲染
// plugins.bundle.config keyed 槽（键 = 包名，即本插件「默认 Agent 选项」面板）。
// 调用期惰性解析（插件管理器面板可能后于本面板就绪——消费点现查，不缓存）。

/** 本插件包名（插件详情页定位键——plugins.bundle.config keyed 登记键同源）。 */
export const EXPERT_SQUAD_PKG = "@dsh-forge/expert-squad";

/** cordis ctx 窄面（src-client/index.ts LazyCtx 同型——reflect.get 缺席返 undefined）。 */
export interface NavLazyCtx {
  reflect?: { get(name: string): unknown };
}

/**
 * 「配置」跳转解析器：装配期返回「点击时点解析缝」的 thunk；缝在场 = 返回跳转闭包
 * （openBundle 定位本插件详情页，receiver 经 .call 保真），缝缺席/形状漂移/异常 =
 * undefined（调用方降级既有 DOM 导航先例，不炸）。
 */
export function pluginConfigJumpOf(ctx: NavLazyCtx): () => (() => void) | undefined {
  return () => {
    try {
      const nav = ctx.reflect?.get("pluginNavigation") as
        | { openBundle?: (pkg: string) => void }
        | undefined;
      const openBundle = nav?.openBundle;
      if (typeof openBundle !== "function") return undefined;
      const namespace = nav;
      return () => openBundle.call(namespace, EXPERT_SQUAD_PKG);
    } catch {
      return undefined;
    }
  };
}
