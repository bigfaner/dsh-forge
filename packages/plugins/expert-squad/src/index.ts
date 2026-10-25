// @dsh-forge/expert-squad —— host 入口（Node，cordis loader 装载面）。
// 装配缝（本文件只做 wiring，功能面各居其模块——plugin-portability 装配缝归属插件域）：
//   ① ctx.storage 自有 domain → ExpertSquadState（启停状态持久层，§13 D4）；
//   ② ctx.connection.fetch 六条精确路由（list/get/update/enable/disable/run-state，
//      §6 D4；run-state = 面板运行状态读口，bug 767e7580）；
//   ③ ExpertsRegistry（三层 root：project=请求 workspace 向上解析 project root，
//      无 .git 祖先时以 workspace 本身为 project root——临时工作区等非 git 目录同径
//      可用；user/plugin 层按 scan 模块正门解析）+ 服务键 experts provide
//      （ctx.experts 正门，bug 7b1c9ed4）；
//   ④ tool 面（fix-10）：registerExpertTools（5 管理工具）+ registerDelegateExpertTool
//      经官方 ctx.tools.register 正门接线（D1 注册面零改动）；组合绑定工具子集经
//      excludeTools 装配期排除（1.46 核销裁定：官方 tools.restrict 只能命名 restricting
//      scope 的 inherited global 工具——dsh-tools lib/index.js:2889-2891/:2906-2908 +
//      view() own-layer 排除 :2959-2978；preset 局部注册的工具不落 inherited 面，
//      同组合内 deny 必 throw「names unknown global tool」并拖垮整预设 mount
//      （agent-preset-registry mountPreset audit.failed 拒绝，lib/index.js:270-272）——
//      故排除语义落装配期：excludeTools 点名工具直接跳过注册，不进可见面）。

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import { parseExpertFile } from "./store/frontmatter.js";
import { ExpertsRegistry, ExpertNotFoundError, EXPERTS_SERVICE_KEY } from "./registry.js";
import { registerExpertSquadRoutes, type ConnectionLike } from "./routes.js";
import { ExpertSquadState, expertSquadStateDomainSpec } from "./state.js";
import { registerExpertTools, serializeExpertMd, type ToolRegisterFace } from "./tools.js";
import {
  DELEGATE_EXPERT_TOOL_NAME,
  ExpertRunPanelState,
  observeSubagentEnd,
  registerDelegateExpertTool,
  type SubagentEventsFace,
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

/** dsh tools 服务窄面（官方 ToolRuntime.register 正门——D1 注册面零改动）。 */
interface ExpertSquadToolsFace extends ToolRegisterFace {}

/** 插件配置（组合行 config 传入；缺省 = 全量注册——D1 语义不变）。 */
export interface ExpertSquadPluginConfig {
  /** 组合绑定工具子集（装配期排除：点名工具跳过注册——HR 组合排除 delegate_expert）。
   *  核销裁定（1.46）：官方 tools.restrict 仅支持 inherited global 工具过滤
   *  （dsh-tools lib/index.js:2889-2891），preset 局部注册工具不适用。 */
  readonly excludeTools?: readonly string[];
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
    next.catch(() => {}); // watch 链 fire-and-forget：刷新失败不落 unhandled rejection（registryFor 侧失败逐出重试）
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
      // Root cause: 首刷 rejected promise 永久缓存 = 五路由恒 400（毒化缓存）——
      // 失败即逐出条目，下次请求重建 registry 重试（bug f9410209）。
      hit.catch(() => {
        if (registries.get(workspace) === hit) registries.delete(workspace);
      });
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
    const disposeOn = ctx.on("fs/observed", (target: unknown, observation: unknown, actor: unknown) => {
      invalidate(target as FsObservedTarget, observation, actor);
    });
    // 通道二监听器 disposer 消费（cordis effect 契约：cb 返回值即 disposer——卸载摘除）。
    if (typeof disposeOn === "function") ctx.effect(() => () => disposeOn());
  } else {
    console.warn("[expert-squad] ctx.on absent——fs/observed 通道未接线（仅 chokidar 通道承载热刷新）");
  }

  // 面板运行状态（bug 767e7580 接线）：subagent/end 监听唯一落点（纯 UI，不进会话
  // 流），经 run-state 读口（路由族第六条）对外取数。监听经 observeSubagentEnd 挂在
  // 宿主事件总线（ctx.on），disposer 经 effect 消费——fiber 卸载即退订（级联）。
  const panel = new ExpertRunPanelState();
  if (ctx.on !== undefined) {
    const eventsFace: SubagentEventsFace = {
      on: (event, listener) =>
        ctx.on!(event, listener as (...args: unknown[]) => unknown) as () => void,
    };
    const disposeEnd = observeSubagentEnd(eventsFace, panel);
    if (typeof disposeEnd === "function") ctx.effect(() => () => disposeEnd());
  } else {
    console.warn("[expert-squad] ctx.on absent——subagent/end 面板监听未接线（run-state 恒空）");
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
    // 面板读口（bug 767e7580）：subagent/end 换代后的当前快照（纯 UI 数据）。
    runState: () => panel.list(),
  };
  registerExpertSquadRoutes(connection, routes);

  // 服务键 experts provide（bug 7b1c9ed4）：官方 provide 机械（cordis reflect.ts
  // `provide(name, value)`——经 fiber.effect 注册，服务生命周期归属插件 fiber、卸载
  // 级联注销；typed 正门 ctx.provide 的 reflect 层同语义入口，core/index.ts 先例同
  // 径）。registry 取 cwd 工作区一代（dsh-forge 宿主 = 单工作区进程，tool 面同径）；
  // registerRoot 追加的 extraRoots 下次 refresh 生效。宿主形状缺席（无 reflect 层或
  // 无 provide 面）→ warn 降级（ctx.experts 正门不可用，路由/tool 面不受影响）。
  // reflect 层直读（readOptionalService 语义是 reflect.get 取服务，不适用于层本身）。
  const reflectLayer = (ctx as { reflect?: { provide?(name: string, value: unknown): unknown } })
    .reflect;

  // tool 面接线（fix-10，AGENTS 1.3 装配缝归属插件域）：tools 面缺席 fail-soft
  // （warn + 跳过 tool 注册，路由/服务面不受影响——client 侧 slots 缺席同径）。
  const toolsFace = readOptionalService(ctx, "tools") as ExpertSquadToolsFace | undefined;

  // cwd registry 仅在服务键 provide 或 tool 面需要时构建（懒建：watch manager 惰性
  // 挂目录的爬升开销不转嫁给纯路由消费方）。首刷失败不阻断装配（registry 逐出重试
  // 属读路径，f9410209 同因）——降级为未刷新实例（provide 不缺席；get/list 前经
  // 读路径换代）。
  let toolRegistry: ExpertsRegistry | undefined;
  if (reflectLayer?.provide !== undefined || toolsFace !== undefined) {
    try {
      toolRegistry = await registryFor(process.cwd());
    } catch (error) {
      console.warn(`[expert-squad] cwd registry 首刷失败（provide 降级为未刷新实例）: ${String(error)}`);
      toolRegistry = new ExpertsRegistry({
        roots: () => expertRootsFor(process.cwd()),
        state,
        workspace: process.cwd(),
      });
    }
  }
  if (reflectLayer?.provide === undefined) {
    console.warn("[expert-squad] ctx.reflect/provide absent——experts 服务键未 provide（ctx.experts 正门不可用）");
  } else {
    reflectLayer.provide(EXPERTS_SERVICE_KEY, toolRegistry);
  }
  if (toolsFace === undefined) {
    console.warn("[expert-squad] ctx.tools absent——tool 面未注册（管理/委派工具不可用）");
    return;
  }
  // tool 面共享 registry：apply 期无会话工作区锚（preset mount 一次、多 agent 共享），
  // 以进程 cwd 兜底（dsh-forge 宿主 = 单工作区进程，即注册工作区）；D4 tool 侧
  // 「调用 agent scope cwd」取值点需 tools.ts 面改造（execute 携 exec），超出接线
  // 边界——多工作区宿主为残余风险（fix-10 resume 留痕）。
  const registry = toolRegistry as ExpertsRegistry;
  const subagents = readOptionalService(ctx, "subagents") as SubagentsStartFace | undefined;
  // excludeTools 装配期排除（1.46 核销裁定——官方 tools.restrict 不适用 preset 局部
  // 注册工具，见文件头 ④）：点名 delegate_expert = 组合零委派可见面（HR 组合语义）。
  const excluded = new Set(config.excludeTools ?? []);
  if (excluded.has(DELEGATE_EXPERT_TOOL_NAME)) {
    console.warn("[expert-squad] excludeTools 排除 delegate_expert——本组合零委派可见面");
  } else if (subagents === undefined) {
    console.warn("[expert-squad] ctx.subagents absent——delegate_expert 未注册（委派不可用；管理面照常）");
  } else {
    registerDelegateExpertTool(toolsFace, {
      registry,
      subagents,
      panel,
      provider: "spawn",
    });
  }
  registerExpertTools(toolsFace, { registry, userRoot: resolveUserExpertsRoot });
}

expertSquadPlugin.inject = ['connection'];

export default expertSquadPlugin;
