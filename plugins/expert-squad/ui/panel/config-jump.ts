// config-jump —— 「⚙ 配置」跳转官方导航缝解析器（纯逻辑面，零 UI import——单测直测）。
// 官方正门：dsh-client-ui-plugin-manager 经 ctx.reflect.provide("pluginNavigation",
// { openBundle(pkg) }) 提供「切换「插件」面板 + 打开包详情页」导航；调用期惰性解析
// （插件管理器面板可能后于本面板就绪——消费点现查，不缓存）。
//
// 承载 bundle 自锚探测（bundle 聚合安装形态——expert-squad 零感知聚合包名）：
// solo 形态下本包自己是安装卡，openBundle(本包名) 直达；bundle 形态下本包不是安装卡
// （openBundle 对缺席包只回落插件列表——官方 index.ts 注记），须先经
// remote.pluginManager.listBundles() 找「声明了本包 moduleName 行」的承载 bundle 开它
// （判定键只有本包名——装进任何聚合 bundle 自动生效）。探针缺席/失败 = 兜底仍开
// openBundle(本包名)（与旧行为一致，不比现状差）。

/** 本插件包名（插件详情页定位键——detail.section subject.pkg.name 门控同源）。 */
export const EXPERT_SQUAD_PKG = "@dsh-forge/expert-squad";

/** cordis ctx 窄面（ui/index.ts LazyCtx 同型——reflect.get 缺席返 undefined）。 */
export interface NavLazyCtx {
  reflect?: { get(name: string): unknown };
}

/** remote.pluginManager 官方面消费切片（listBundles 结构同型镜像——只取跳转判定面）。 */
interface PluginManagerNs {
  listBundles?: () => Promise<unknown>;
}

/** listBundles 应答窄面（BundleInfo 结构同型镜像——name + rows[].moduleName）。 */
interface BundleEntry {
  readonly name?: unknown;
  readonly rows?: unknown;
}

/**
 * 「配置」跳转解析器：装配期返回「点击时点解析缝」的 thunk。缝（pluginNavigation）
 * 缺席/形状漂移/异常 = undefined（调用方降级既有 DOM 导航先例，不炸）；在场 = 跳转
 * 闭包（async——先自锚探测承载 bundle 再 openBundle，见文件头注记）。
 */
export function pluginConfigJumpOf(ctx: NavLazyCtx): () => (() => Promise<void>) | undefined {
  return () => {
    try {
      const nav = ctx.reflect?.get("pluginNavigation") as { openBundle?: (pkg: string) => void } | undefined;
      const openBundle = nav?.openBundle;
      if (typeof openBundle !== "function") return undefined;
      const open = (pkg: string): void => openBundle.call(nav, pkg);
      return async () => {
        open(await hostBundlePkgOf(ctx) ?? EXPERT_SQUAD_PKG);
      };
    } catch {
      return undefined;
    }
  };
}

/**
 * 承载 bundle 包名自锚探测（点击时点现查，§1.6 在场性纪律——不缓存）：
 * listBundles 应答中找「本包自己是安装卡 ∨ rows 声明了本包 moduleName 行」的 bundle。
 * 返回 undefined = solo 形态（直接开本包）或探针缺席/失败（兜底开本包）。
 */
async function hostBundlePkgOf(ctx: NavLazyCtx): Promise<string | undefined> {
  try {
    const reflect = ctx.reflect;
    if (reflect === undefined) return undefined;
    // 'remote' 嵌套双径（ui/index.ts agentPresetsOf 同径——direct 优先、remote 命名空间次之）
    const direct = reflect.get("remote.pluginManager") as PluginManagerNs | undefined;
    const ns = (direct ?? (reflect.get("remote") as { pluginManager?: PluginManagerNs } | undefined)?.pluginManager) as
      | PluginManagerNs
      | undefined;
    if (ns === undefined || typeof ns.listBundles !== "function") return undefined;
    const bundles = asBundles(await ns.listBundles());
    const carrier = bundles.find(
      (bundle) =>
        bundle.name === EXPERT_SQUAD_PKG ||
        (Array.isArray(bundle.rows) &&
          bundle.rows.some((row) => asRecord(row)?.["moduleName"] === EXPERT_SQUAD_PKG)),
    );
    return typeof carrier?.name === "string" ? carrier.name : undefined;
  } catch {
    return undefined;
  }
}

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** listBundles 应答 → bundle 条目窄化（非数组 = 空——探针失败语义归调用方兜底）。 */
function asBundles(value: unknown): readonly BundleEntry[] {
  return Array.isArray(value) ? (value as readonly BundleEntry[]) : [];
}
