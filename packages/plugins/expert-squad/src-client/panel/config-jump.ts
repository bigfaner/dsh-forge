// config-jump —— 「⚙ 配置」跳转官方导航缝解析器（纯逻辑面，零 UI import——单测直测）。
// 官方正门：dsh-client-ui-plugin-manager 经 ctx.reflect.provide("pluginNavigation",
// { openBundle(pkg) }) 提供「切换「插件」面板 + 打开包详情页」导航。
// 2026-11-02 bundle 形态退役（插件页单记录裁决）后目标页 = 官方组 item 详情页
//（plugins.item view:"page"——「默认 Agent 选项」单源在屏）；官方缝现无 openItem
// 正门 → openItem 在场优先（上游前瞻正门），否则借道 openBundle（selectPanel +
// setView；bundle 退役后落列表页）+ DOM 点击官方组卡片「查看」钮打开 item 详情页
//（e2e 同款 data-plugin-item 锚）。
// 调用期惰性解析（插件管理器面板可能后于本面板就绪——消费点现查，不缓存）。

/** 本插件包名（插件详情页定位键——detail.section subject.pkg.name 门控同源）。 */
export const EXPERT_SQUAD_PKG = "@dsh-forge/expert-squad";

/** 本插件官方组 item 条目 id（plugins.item 注册 id——settings/index.tsx ITEM_ID 同源字面量）。 */
export const EXPERT_SQUAD_ITEM_ID = "expert-squad";

/** cordis ctx 窄面（src-client/index.ts LazyCtx 同型——reflect.get 缺席返 undefined）。 */
export interface NavLazyCtx {
  reflect?: { get(name: string): unknown };
}

/** 配置跳转导航的 DOM 窄面（真实 Document/Element 结构满足——单测以最小假体直测）。 */
export interface ItemNavDoc {
  querySelector(selectors: string): { click(): void } | null;
}

/** 官方组卡片「查看」钮（ItemCard onOpen——e2e data-plugin-item 同锚）。 */
const ITEM_CARD_BUTTON_SEL = '[data-plugin-item="expert-squad"] button';

/** 调度注入型（默认真机 setTimeout；单测同步驱动）。 */
export type NavSchedule = (fn: () => void, ms: number) => void;

/** 借道落列表后点官方组卡片「查看」钮（面板渲染等待 20×100ms 上限；标签漂移 = 静默停在列表页）。 */
function clickItemCard(doc: ItemNavDoc | undefined, schedule: NavSchedule): void {
  if (doc === undefined) return;
  let tries = 0;
  const click = (): void => {
    const button = doc.querySelector(ITEM_CARD_BUTTON_SEL) ?? null;
    if (button !== null) {
      button.click();
      return;
    }
    if (tries < 20) {
      tries += 1;
      schedule(click, 100);
    }
  };
  schedule(click, 100);
}

/**
 * 「配置」跳转解析器：装配期返回「点击时点解析缝」的 thunk；缝在场 = 返回跳转闭包，
 * 缝缺席/形状漂移/异常 = undefined（调用方降级既有 DOM 导航先例，不炸）。
 * 优先级：官方 openItem 正门 > openBundle 借道 + DOM 卡片点击 > undefined。
 */
export function pluginConfigJumpOf(
  ctx: NavLazyCtx,
  doc: ItemNavDoc | undefined = globalThis.document as unknown as ItemNavDoc,
  schedule: NavSchedule = (fn, ms) => setTimeout(fn, ms),
): () => (() => void) | undefined {
  return () => {
    try {
      const nav = ctx.reflect?.get("pluginNavigation") as
        | { openBundle?: (pkg: string) => void; openItem?: (id: string) => void }
        | undefined;
      if (typeof nav?.openItem === "function") {
        return () => nav.openItem!.call(nav, EXPERT_SQUAD_ITEM_ID);
      }
      if (typeof nav?.openBundle !== "function") return undefined;
      return () => {
        nav.openBundle!.call(nav, EXPERT_SQUAD_PKG);
        clickItemCard(doc, schedule);
      };
    } catch {
      return undefined;
    }
  };
}
