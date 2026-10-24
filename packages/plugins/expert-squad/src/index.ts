// @dsh-forge/expert-squad —— host 入口（Node，cordis loader 装载面）。
// 装配缝（本文件只做 wiring，功能面各居其模块——plugin-portability 装配缝归属插件域）：
//   ① ctx.storage 自有 domain → ExpertSquadState（启停状态持久层，§13 D4）；
//   ② ctx.connection.fetch 五条精确路由（list/get/update/enable/disable，§6 D4）；
//   ③ ExpertsRegistry（三层 root：project=请求 workspace 向上解析 project root，
//      无 .git 祖先时以 workspace 本身为 project root——临时工作区等非 git 目录同径
//      可用；user/plugin 层按 scan 模块正门解析）。
// tool 面（delegate_expert / 查询工具）由后续任务按 tech-design 填充（不在本装配缝）。

import { join } from "node:path";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import { ExpertsRegistry } from "./registry.js";
import { registerExpertSquadRoutes, type ConnectionLike } from "./routes.js";
import { ExpertSquadState, expertSquadStateDomainSpec } from "./state.js";
import {
  resolvePluginExpertsRoot,
  resolveUserExpertsRoot,
  type ExpertRoot,
} from "./store/scan.js";

export const EXPERT_SQUAD_PLUGIN_NAME = 'expert-squad' as const

/** storage 服务窄面（官方 ctx.storage.domain.open 正门——state.test 同径）。 */
interface StorageFace {
  readonly domain: {
    open(spec: typeof expertSquadStateDomainSpec): Promise<Domain<typeof expertSquadStateDomainSpec>>;
  };
}

/** 宿主 ctx 窄面（结构同型——本装配缝只消费 storage/connection/effect 三成员）。 */
interface ExpertSquadCtx {
  readonly storage?: StorageFace;
  readonly connection?: ConnectionLike;
  effect(dispose: () => unknown): unknown;
}

/** 三层 root（D3/D4）：fetch 路由的 workspace 参数 = 注册项目根（D4 钉死取值点），
 *  project 层 = `<workspace>/.dsh/experts/` 直挂——不做 .git 向上解析（参数已是项目根；
 *  向上走会在嵌套场景爬出真实项目，tech-design §5 project 层语义以注册根为锚）。 */
function expertRootsFor(workspace: string): ExpertRoot[] {
  return [
    { origin: "project", dir: join(workspace, ".dsh", "experts") },
    { origin: "user", dir: resolveUserExpertsRoot() },
    { origin: "plugin", dir: resolvePluginExpertsRoot() },
  ];
}

/** 可选服务读取（守卫外取法：reflect.get 缺席返 undefined；异常吞为缺席）。 */
function readOptionalService(ctx: ExpertSquadCtx, name: string): unknown {
  try {
    return (ctx as { reflect?: { get(name: string): unknown } }).reflect?.get(name);
  } catch {
    return undefined;
  }
}

/** host face（Plugin.Function apply；async——state 面（可选）就绪后路由族注册）。
 *  静态 inject：cordis 守卫要求声明注入边方可读 ctx.storage / ctx.connection
 *  （缺声明 = apply 期 `cannot get property ... without inject`——client 侧同因）。
 *  inject 仅 connection（宿主组合恒在场）；storage 宿主组合不供（presence 探测降级
 *  ——registry FMEA：state 缺席 = 启停内存态、重启回全启用，§AD2 降级语义）。 */
async function expertSquadPlugin(ctx: ExpertSquadCtx): Promise<void> {
  const connection = ctx.connection;
  if (connection === undefined) throw new Error("expert-squad: ctx.connection absent（宿主形状漂移——路由面无法装配）");

  let state: ExpertSquadState | undefined;
  // storage = 可选服务（宿主组合不供）：ctx.storage 属性读被 cordis 守卫拦截
  // （未声明 inject 即抛），且声明 inject 会让 fiber 永久 pending（服务缺席）——
  // 可选取法走 ctx.reflect.get（mobile-remote-approval disc-1 先例同径）。
  const storage = readOptionalService(ctx, "storage") as StorageFace | undefined;
  if (storage !== undefined) {
    const domain = await storage.domain.open(expertSquadStateDomainSpec);
    state = new ExpertSquadState(domain);
    // effect 回调返回值即 disposer（cordis 语义，web-client webServer.register 同款）。
    ctx.effect(() => () => state?.close());
  } else {
    console.warn("[expert-squad] ctx.storage absent——启停状态降级内存态（重启回全启用，FMEA）");
  }

  // 每工作区一 registry（首用刷新一代快照；启停态经 state 落盘——registry 内存缓存同步读）。
  const registries = new Map<string, Promise<ExpertsRegistry>>();
  const registryFor = (workspace: string): Promise<ExpertsRegistry> => {
    let hit = registries.get(workspace);
    if (hit === undefined) {
      const registry = new ExpertsRegistry({
        roots: () => expertRootsFor(workspace),
        state,
        workspace,
      });      hit = registry.refresh().then(() => registry);
      registries.set(workspace, hit);
    }
    return hit;
  };

  const routes: Parameters<typeof registerExpertSquadRoutes>[1] = {
    list: async (workspace, includeDisabled) =>
      (await registryFor(workspace)).list({ includeDisabled }),
    get: async (workspace, key) => (await registryFor(workspace)).get(key),
    setEnabled: async (workspace, key, enabled) => {
      const registry = await registryFor(workspace);
      registry.setEnabled(key, enabled).catch((error) => {
        console.warn(`[expert-squad] setEnabled(${key}, ${enabled}) 落盘失败（内存态生效）: ${String(error)}`);
      });
    },
    // 档案 upsert 写面（store 层序列化器）由后续任务填充——通道存在、fail-loud 文本应答。
    update: async () => {
      throw new Error("expert update channel not assembled yet（档案写面后续任务填充）");
    },
  };
  registerExpertSquadRoutes(connection, routes);
}

expertSquadPlugin.inject = ['connection'];

export default expertSquadPlugin;
