// @dsh-forge/spec — client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。组合 cordis 插件形态（对齐 expert-squad/task-loop/input-history 同型判例——
// 占位产物无 apply → 宿主 materialize 后 `invalid plugin … received object` 装载失败，
// bug cdd5b0f8 判例）。
//
// forgeSpecs remote 贡献挂载（project/task-loop 正典配方承袭——project/ui/remote.ts +
// project ui/index.ts $mount 段）：generator 产 forgeSpecs 贡献（./remote 投影）经
// remote.$mount 进调用方 fiber，官方宿主 remote.namespaces 才物化 forgeSpecs 条目——
// 缺此段 = client 半 namespace 永不物化，概览 Spec 列表恒报 forgeSpecs.list 面缺席。
// mount settle 三分支各发布一次页内终态锚（ui/remote.ts 键单源）；缺席/失败 fail-soft
// 降级不炸装配。M5 UI 三视图随批落位前本面零消费服务：inject 声明最小集（remote——
// $mount 挂载面），apply 返回 undefined（cordis 组合契约：返回值当 effect 消费）。
import {
  FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY,
  FORGE_SPECS_REMOTE_CONTRIBUTION,
  markForgeSpecRemoteMountSettled,
} from "./remote.js";

const specClient = {
  /** cordis 装载契约：消费服务注入边声明（remote——$mount 贡献挂载面）。 */
  inject: ["remote"] as string[],
  /** 官方组合正门：materialize 后由宿主调用；返回值铁律 = undefined。 */
  apply(ctx: unknown): void {
    const rec = ctx as Record<string, unknown> | undefined;
    // $mount 前置挂载段（project 正典配方承袭）：贡献进调用方 fiber → gateway client
    // 半 namespace 物化；unmount 撤回随包 fiber 生命周期级联，mount 重试 = promise
    // settle 事件驱动（零固定短窗）。
    try {
      const reflect = rec?.["reflect"] as { get?: (key: string) => unknown } | undefined;
      const readReflect = (key: string): unknown => {
        try {
          return typeof reflect?.get === "function" ? reflect.get(key) : undefined;
        } catch {
          return undefined;
        }
      };
      // remote 取法 = reflect 单径（生产归一口——cordis ctx.remote 注入亦经 reflect 同源；
      // 回退径删除——非 cordis 形状由外层 try/catch fail-soft 承担）
      const remote = readReflect("remote") as
        | { $mount?: (contribution: unknown) => Promise<unknown> }
        | undefined;
      if (remote !== undefined && typeof remote.$mount === "function") {
        void Promise.resolve(remote.$mount(FORGE_SPECS_REMOTE_CONTRIBUTION))
          .then(() => {
            markForgeSpecRemoteMountSettled();
            console.info("[dsh-forge/spec] forgeSpecs remote contribution mounted");
          })
          .catch((error: unknown) => {
            markForgeSpecRemoteMountSettled();
            console.warn("[dsh-forge/spec] forgeSpecs remote contribution mount failed——调用期诚实降级", error);
          });
      } else {
        markForgeSpecRemoteMountSettled();
        console.warn("[dsh-forge/spec] ctx.remote.$mount absent——forgeSpecs 贡献不挂载（诚实降级）");
      }
    } catch (error) {
      markForgeSpecRemoteMountSettled();
      console.warn("[dsh-forge/spec] forgeSpecs remote mount seam failed——调用期诚实降级", error);
    }
    // M5 前零装配：host 面提示段/patch 注册不依赖 client 半其余面——本面仅在位保形。
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——esbuild CJS namespace 会丢 `inject` 声明（cordis 只在 unwrapExports
 * 后的插件对象上读 plugin.inject），default 导出经 unwrapExports（__esModule →
 * default）还原插件对象本体。
 */
export { specClient };
export default specClient;
export const apply = specClient.apply.bind(specClient);
export { FORGE_SPECS_MOUNT_SETTLED_ANCHOR_KEY };
export type { Envelope, Result } from "../shared/result.js";
