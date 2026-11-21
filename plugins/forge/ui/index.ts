// @dsh-forge/forge —— client 自有视图最小入口（forge-aggregate-bundle 1.6）：
// 五件 client 各自带 apply 半侧、经 client-modules 逐件扫描装载（id 互异零冲突）；
// 本入口仅承载 forge 自有视图面。
//
// 阶段一零视图（最小自有入口）：Workbench 三面视图归 forge-workbench 期在此生长
// （视图模块随包构建自动并入 bundle-client 产物，六插行与 file: 依赖零变化）。
//
// 装载形态 = cordis 插件 apply 面（bug 95c1fed6——官方 web client-modules 按
// registry.plugin 判定要求 module.exports 携带 apply，缺 apply → `invalid plugin,
// received object` 装载失败；对齐 spec/expert-squad 同型判例与官方 client-ui-* 件）：
// esbuild CJS namespace 丢 `inject` 声明（cordis 只在 unwrapExports 后的插件对象上读
// plugin.inject），default 导出经 unwrapExports 还原插件对象本体；`apply` 具名导出
// 为宿主判定面兜底。产物形状守卫归 scripts/bundle-client.mjs 构建期 vm 复放门。
export const FORGE_VIEW_ID = "@dsh-forge/forge";

const forgeClient = {
  /** cordis 装载契约：消费服务注入边声明（当前零消费 = 空集）。 */
  inject: [] as string[],
  /** 官方组合正门：materialize 后由宿主调用；返回值铁律 = undefined。 */
  apply(_ctx: unknown): void {
    // 阶段一零装配：本面仅在位保形；视图面落位时在此注册 slots 消费切片并同步扩 inject。
  },
};

export default forgeClient;
export const apply = forgeClient.apply.bind(forgeClient);
