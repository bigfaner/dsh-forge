// @dsh-forge/expert-squad —— host 入口（Node，cordis loader 装载面）。
// 装配缝（本文件只做 wiring，功能面各居其模块——plugin-portability 装配缝归属插件域）：
//   ① ctx.storage 自有 domain → ExpertSquadState（启停状态持久层，§13 D4）；
//   ② ctx.connection.fetch 五条精确路由（list/get/update/enable/disable，§6 D4）；
//   ③ ExpertsRegistry（三层 root：project=请求 workspace 向上解析 project root，
//      无 .git 祖先时以 workspace 本身为 project root——临时工作区等非 git 目录同径
//      可用；user/plugin 层按 scan 模块正门解析）。
//   ④ tool 面（fix-10）：registerExpertTools（5 管理工具）+ registerDelegateExpertTool
//      经官方 ctx.tools.register 正门接线（D1 注册面零改动）；preset 绑定工具子集
//      经官方 scoped tools.restrict（restrictTools 配置——HR 组合 deny delegate_expert）。

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import { parseExpertFile } from "./store/frontmatter.js";
import { ExpertsRegistry, ExpertNotFoundError } from "./registry.js";
import { registerExpertSquadRoutes, type ConnectionLike } from "./routes.js";
import { ExpertSquadState, expertSquadStateDomainSpec } from "./state.js";
import { registerExpertTools, serializeExpertMd, type ToolRegisterFace } from "./tools.js";
import {
  ExpertRunPanelState,
  registerDelegateExpertTool,
  type SubagentsStartFace,
} from "./dispatch/dispatch.js";
import {
  resolvePluginExpertsRoot,
  resolveUserExpertsRoot,
  type ExpertRoot,
} from "./store/scan.js";
import { ExpertWatchManager, makeFsObservedInvalidator, type FsObservedTarget } from "./store/watch.js";

export const EXPERT_SQUAD_PLUGIN_NAME = 'expert-squad' as const

/** storage 服务窄面（官方 ctx.storage.domain.open 正门——state.test 同径）。 */
interface StorageFace {
  readonly domain: {
    open(spec: typeof expertSquadStateDomainSpec): Promise<Domain<typeof expertSquadStateDomainSpec>>;
  };
}

/** dsh tools 服务子面（官方 ToolRuntime.register/restrict——D1 全局注册 + scoped 限制）。 */
interface ExpertSquadToolsFace extends ToolRegisterFace {
  /** 官方 scoped tools.restrict（仅 scoped ctx 可用——preset 组合内限定工具子集）。 */
  restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): unknown;
}

/** 插件配置（preset 行 config 传入；缺省 = 全量注册零限制——D1 语义不变）。 */
export interface ExpertSquadPluginConfig {
  /** preset 绑定工具子集（官方 scoped tools.restrict 同形过滤器；HR 组合 deny delegate_expert）。 */
  readonly restrictTools?: {
    readonly allow?: readonly string[];
    readonly deny?: readonly string[];
  };
}

/** 宿主 ctx 窄面（结构同型——本装配缝只消费 storage/connection/tools/subagents/effect/on）。 */
interface ExpertSquadCtx {
  readonly storage?: StorageFace;
  readonly connection?: ConnectionLike;
  readonly tools?: ExpertSquadToolsFace;
  /** 宿主事件总线（fs/observed 通道二挂点；缺席 → 通道二降级跳过，通道一照常）。 */
  on?(event: string, listener: (...args: unknown[]) => unknown): unknown;
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
async function expertSquadPlugin(ctx: ExpertSquadCtx, config: ExpertSquadPluginConfig = {}): Promise<void> {
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
  // 热刷新双通道（bug 09356510 装配接线）：通道一 = 每工作区 ExpertWatchManager
  // （chokidar 深度 1，真 FS 增量）；通道二 = ctx.on("fs/observed") 首方失效
  // （官方 skill-filesystem 同缝）。失效回调经串行链 refresh 整体换代——同代内竞速
  // 事件合并（watch 层 microtask）+ 重扫互斥（promise 链）。
  const registries = new Map<string, Promise<ExpertsRegistry>>();
  const watchManagers: ExpertWatchManager[] = [];
  const refreshChains = new Map<string, Promise<void>>();
  const enqueueRefresh = (workspace: string, registry: ExpertsRegistry): void => {
    const prior = refreshChains.get(workspace) ?? Promise.resolve();
    const next = prior.then(
      () => registry.refresh(),
      () => registry.refresh(), // 上代刷新失败不阻塞换代
    );
    refreshChains.set(workspace, next);
  };
  const registryFor = (workspace: string): Promise<ExpertsRegistry> => {
    let hit = registries.get(workspace);
    if (hit === undefined) {
      const registry = new ExpertsRegistry({
        roots: () => expertRootsFor(workspace),
        state,
        workspace,
      });
      hit = registry.refresh().then(() => registry);
      registries.set(workspace, hit);
      const manager = new ExpertWatchManager(expertRootsFor(workspace), {
        onInvalidated: () => enqueueRefresh(workspace, registry),
        onError: (error) => console.warn(`[expert-squad] ${String(error)}`),
      });
      watchManagers.push(manager);
      ctx.effect(() => () => void manager.dispose());
      void manager.start().catch(() => {}); // openWatcher 内部已上报，start 聚合面兜底
    }
    return hit;
  };
  // 通道二：首方（模型 edit/write）失效直呼——路径按各工作区 manager 的包含判定路由
  // （observeHostMutation 对非本工作区路径零操作）；事件面缺席 = 宿主形状降级（仅 warn）。
  if (ctx.on !== undefined) {
    const invalidate = makeFsObservedInvalidator({
      observeHostMutation: (path: string) => {
        for (const manager of watchManagers) manager.observeHostMutation(path);
      },
    });
    ctx.on("fs/observed", (target: unknown, observation: unknown, actor: unknown) => {
      invalidate(target as FsObservedTarget, observation, actor);
    });
  } else {
    console.warn("[expert-squad] ctx.on absent——fs/observed 通道未接线（仅 chokidar 通道承载热刷新）");
  }

  const routes: Parameters<typeof registerExpertSquadRoutes>[1] = {
    list: async (workspace, includeDisabled) =>
      (await registryFor(workspace)).list({ includeDisabled }),
    get: async (workspace, key) => (await registryFor(workspace)).get(key),
    // 启停（bug 34a284e3）：await registry.setEnabled（键不存在 fail-loud → 400）；
    // 落盘失败仅降级告警（FMEA 内存态生效），回包 = 换新档案（含新 enabled）。
    setEnabled: async (workspace, key, enabled) => {
      const registry = await registryFor(workspace);
      try {
        await registry.setEnabled(key, enabled);
      } catch (error) {
        if (error instanceof ExpertNotFoundError) throw error;
        console.warn(`[expert-squad] setEnabled(${key}, ${enabled}) 落盘失败（内存态生效）: ${String(error)}`);
      }
      const fresh = registry
        .list({ includeDisabled: true })
        .find((entry) => entry.name === key);
      if (fresh === undefined) throw new Error(`expert not found: ${key}`);
      return fresh;
    },
    // 档案 upsert 写面（bug 4ed8549f 装配）：落点 = project 层 <workspace>/.dsh/experts/
    // <key>.md（面板 workspace 域内；对 user/plugin 层同键档案构成遮蔽——scan 层
    // 既有语义）。写路径与 recruit/update_expert tool 同源：serializeExpertMd →
    // parseExpertFile 全量门（必填/裸 {{/name 不可改——文件名即建档键），不过不落盘；
    // 写后 refresh 一代换新，回包 = 换新 ExpertEntry。
    update: async (input) => {
      const registry = await registryFor(input.workspace);
      const expertsDir = join(input.workspace, ".dsh", "experts");
      const file = join(expertsDir, `${input.name}.md`);
      const content = serializeExpertMd(
        {
          name: input.name,
          title: input.title,
          description: input.description,
          tools: input.tools,
          skills: input.skills,
          ...(input.model !== undefined ? { model: input.model } : {}),
        },
        input.personaMd ?? "",
      );
      const verdict = parseExpertFile(file, content);
      if (!verdict.ok) throw new Error(verdict.reason);
      await mkdir(expertsDir, { recursive: true });
      await writeFile(file, content, "utf8");
      await registry.refresh();
      const fresh = registry
        .list({ includeDisabled: true })
        .find((entry) => entry.name === input.name);
      if (fresh === undefined) throw new Error(`expert not found after update: ${input.name}`);
      return fresh;
    },
  };
  registerExpertSquadRoutes(connection, routes);

  // tool 面接线（fix-10，AGENTS 1.3 装配缝归属插件域）：tools 面缺席 fail-soft
  // （warn + 跳过 tool 注册，路由/服务面不受影响——client 侧 slots 缺席同径）。
  const toolsFace = readOptionalService(ctx, "tools") as ExpertSquadToolsFace | undefined;
  if (toolsFace === undefined) {
    console.warn("[expert-squad] ctx.tools absent——tool 面未注册（管理/委派工具不可用）");
    return;
  }
  // tool 面共享 registry：apply 期无会话工作区锚（preset mount 一次、多 agent 共享），
  // 以进程 cwd 兜底（dsh-forge 宿主 = 单工作区进程，即注册工作区）；D4 tool 侧
  // 「调用 agent scope cwd」取值点需 tools.ts 面改造（execute 携 exec），超出接线
  // 边界——多工作区宿主为残余风险（fix-10 resume 留痕）。
  const toolRegistry = await registryFor(process.cwd());
  const panel = new ExpertRunPanelState();
  const subagents = readOptionalService(ctx, "subagents") as SubagentsStartFace | undefined;
  if (subagents === undefined) {
    console.warn("[expert-squad] ctx.subagents absent——delegate_expert 未注册（委派不可用；管理面照常）");
  } else {
    registerDelegateExpertTool(toolsFace, {
      registry: toolRegistry,
      subagents,
      panel,
      provider: "spawn",
    });
  }
  registerExpertTools(toolsFace, { registry: toolRegistry, userRoot: resolveUserExpertsRoot });

  // preset 绑定工具子集（fix-10 AC2 裁决：官方 scoped tools.restrict 支持按 preset
  // 限定——restriction 落在 preset scope 层，对其下 agent（会话）过滤继承面生效；
  // own-layer 注册豁免 restrict 是官方机械语义，非本层行为）。HR 组合 deny delegate_expert。
  if (config.restrictTools !== undefined) {
    if (toolsFace.restrict === undefined) {
      throw new Error("expert-squad: restrictTools configured but tools face lacks restrict()（宿主形状漂移）");
    }
    toolsFace.restrict(config.restrictTools);
  }
}

expertSquadPlugin.inject = ['connection'];

export default expertSquadPlugin;
