// @dsh-forge/spec — client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。组合 cordis 插件形态（对齐 expert-squad/task-loop/input-history 同型判例——
// 占位产物无 apply → 宿主 materialize 后 `invalid plugin … received object` 装载失败，
// bug cdd5b0f8 判例）。
//
// M5 UI 三视图随批落位前本面零消费服务：inject 声明空集（零固定税——非介入面零行为
// 差异），apply 为合法装配面入口（cordis 组合契约：返回值当 effect 消费，必须返回
// undefined）；UI 面落位时在此注册 slots 消费切片并同步扩 inject 声明。
const specClient = {
  /** cordis 装载契约：消费服务注入边声明（当前零消费 = 空集）。 */
  inject: [] as string[],
  /** 官方组合正门：materialize 后由宿主调用；返回值铁律 = undefined。 */
  apply(_ctx: unknown): void {
    // M5 前零装配：host 面提示段/patch 注册不依赖 client 半——本面仅在位保形。
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——esbuild CJS namespace 会丢 `inject` 声明（cordis 只在 unwrapExports
 * 后的插件对象上读 plugin.inject），default 导出经 unwrapExports（__esModule →
 * default）还原插件对象本体。
 */
export default specClient;
export const apply = specClient.apply.bind(specClient);
export type { Envelope, Result } from "../shared/result.js";
