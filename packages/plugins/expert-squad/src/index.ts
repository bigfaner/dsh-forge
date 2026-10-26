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
//      经官方 ctx.tools.register 正门接线（D1 注册面零改动）；HR 组合委派排除走
//      denyTools 守卫微件态（方案 B，fix-20）：preset 域 scoped apply 内官方
//      ctx.tools.restrict({deny}) 摘除 inherited global 委派工具——excludeTools 装配期
//      排除已废（1.46 核销：实例级 config 无组合级落点；官方 dsh-agent-preset[-registry]
//      无 preset 级 deny 配置缝——全量检索仅 ToolRestriction 类型声明无消费点，核销
//      留档）。

import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { parseExpertFile } from "./store/frontmatter.js";
import { ExpertsRegistry, ExpertNotFoundError, EXPERTS_SERVICE_KEY } from "./registry.js";
import { registerExpertSquadRoutes, type ConnectionLike } from "./routes.js";
import { ExpertSquadState, expertSquadStateDomainSpec } from "./state.js";
import { registerExpertTools, serializeExpertMd, type ToolRegisterFace } from "./tools.js";
import {
  ExpertRunPanelState,
  observeSubagentEnd,
  registerDelegateExpertTool,
  type SubagentEventsFace,
} from "./dispatch/dispatch.js";
import {
  resolveCwdProjectExpertsRoot,
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

/** 官方 tools 面守卫缝窄面（ToolRuntime.restrict——scoped apply 内 deny inherited
 *  global 工具；dsh-tools lib/index.js:2895-2897 纯 context 调用必 throw「requires a
 *  scoped context」，preset 域实例 ctx 恒 scoped——守卫态由此只能落 preset 行）。 */
interface ToolsRestrictFace {
  restrict(filter: { deny?: readonly string[] }): () => void;
}

/** 插件配置（组合行 config 传入；缺省 = 全量注册——D1 语义不变）。 */
export interface ExpertSquadPluginConfig {
  /** HR 守卫微件（方案 B，fix-20）：在场 = 守卫态单缝——scoped apply 内官方
   *  tools.restrict({deny}) 摘除点名工具后即返回，零功能面注册（routes/state/
   *  watcher/tool 全跳过，与全局单实例零冲突）。deny 只能命名 inherited global
   *  工具（全局单实例注册面——probe2 已实证主会话可见/HR 不可见）；restrict 抛错
   *  fail-soft warn（不拖垮 preset mount）。 */
  readonly denyTools?: readonly string[];
}

/** 宿主 ctx 窄面（结构同型——本装配缝只消费 storage/connection/tools/subagents/effect/on）。
 *  subagents = 官方具名正门（bug 5a1e1132：@deepseek-ai/dsh-subagent 经 cordis Context
 *  模块扩充声明 `subagents: SubagentRuntime` 非可选，宿主恒供 → 静态 inject + 直取；
 *  AGENTS 1.5——type-only import 保全量类型安全，不再 reflect 字符串键丢类型取法）。 */
interface ExpertSquadCtx {
  readonly storage?: StorageFace;
  readonly connection?: ConnectionLike;
  readonly tools?: ExpertSquadToolsFace;
  /** 官方 subagent 服务正门（inject: ["subagents"]——形状校验保留在取用点）。 */
  readonly subagents?: Pick<SubagentRuntime, "startContinuable">;
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

/**
 * cwd 兜底锚（bug a7bdf03f）：打包/无会话环境下 process.cwd() 可能解析到应用安装
 * 目录（非项目根）——直挂 project 层会让 watcher 锚定应用目录并爬升监听 Chromium
 * data（EBUSY 风暴）。cwd 形态走 resolveCwdProjectExpertsRoot 合理性校验（判据
 * 留档：.git 项目根可解析 + 排除 node_modules 特征段），非法则不产生 project 层
 * root（user/plugin 层照常）；注册工作区锚（fetch 路由显式 workspace 参数，D4
 * 钉死为注册项目根）不经此校验，维持直挂语义。
 */
function cwdExpertRoots(): ExpertRoot[] {
  const projectDir = resolveCwdProjectExpertsRoot(process.cwd());
  return [
    ...(projectDir !== null ? [{ origin: "project" as const, dir: projectDir }] : []),
    { origin: "user", dir: resolveUserExpertsRoot() },
    { origin: "plugin", dir: resolvePluginExpertsRoot() },
  ];
}

/** 可选服务读取（守卫外取法：reflect.get 缺席返 undefined；异常吞为缺席）。
 *  清扫留档（用户裁决 2026-10-25，具名服务优先）：本函数现仅存 storage/tools 两个
 *  调用点，均为「官方有具名正门、结构上只能守卫外惰性取」——
 *  · storage：官方 dsh-storage 声明 `storage: Storage` 正门，但宿主组合不供本服务
 *    （可选消费），cordis 4.0.4 无 '?' 可选 inject 后缀，静态声明会使 fiber 在缺席
 *    环境永久 pending（plugin-forge faces.ts forgeSettings 先例同因）；
 *  · tools：官方 dsh-tools 声明 `tools: ToolRuntime` 正门，但本插件按可选消费
 *    （denyTools 守卫域 + 缺席 fail-soft 跳过注册），同 fiber-pending 成因。
 *  subagents 不在此列：官方声明非可选、宿主恒供，已改具名正门直取（inject 边）。 */
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
 *  inject：connection（宿主组合恒在场）+ subagents（官方具名正门，bug 5a1e1132——
 *  非可选声明，宿主恒供）；storage 宿主组合不供（presence 探测降级
 *  ——registry FMEA：state 缺席 = 启停内存态、重启回全启用，§AD2 降级语义）。 */
async function expertSquadPlugin(ctx: ExpertSquadCtx, config: ExpertSquadPluginConfig = {}): Promise<void> {
  // Root cause: excludeTools 是插件 apply 期一次性实例 config，全局单实例挂载下无
  // 组合级落点——HR 组合级委派排除改走 preset 域守卫微件（方案 B，fix-20）。
  if (config.denyTools !== undefined) {
    const tools = readOptionalService(ctx, "tools") as ToolsRestrictFace | undefined;
    if (tools?.restrict === undefined) {
      console.warn("[expert-squad] denyTools 守卫态 ctx.tools.restrict 缺席——委派排除未生效（fail-soft）");
      return;
    }
    try {
      const dispose = tools.restrict({ deny: [...config.denyTools] });
      ctx.effect(() => dispose);
    } catch (error) {
      // restrict 抛错（如 deny 命名未知 global 工具——全局行缺席形态）不得拖垮整预设
      // mount（agent-preset-registry mountPreset audit.failed 拒绝先例），fail-soft warn。
      console.warn(`[expert-squad] restrict deny 失败（preset mount fail-soft 不拖垮）：${String((error as Error)?.message ?? error)}`);
    }
    return;
  }

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
  const watchManagers = new Map<string, ExpertWatchManager>();
  const refreshChains = new Map<string, Promise<void>>();
  // bug a7bdf03f：workspace 锚 = 进程 cwd（兜底形态）时走 cwdExpertRoots 合理性
  // 校验；显式注册工作区锚照旧。registry 扫描与 watch manager 同源，roots 一致。
  const rootsFor = (workspace: string): ExpertRoot[] =>
    resolve(workspace) === resolve(process.cwd()) ? cwdExpertRoots() : expertRootsFor(workspace);
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
        roots: () => rootsFor(workspace),
        state,
        workspace,
      });
      hit = registry.refresh().then(() => registry);
      // Root cause: 首刷 rejected promise 永久缓存 = 五路由恒 400（毒化缓存）——
      // 失败即逐出条目，下次请求重建 registry 重试（bug f9410209）。
      hit.catch(() => {
        if (registries.get(workspace) === hit) {
          registries.delete(workspace);
          // Root cause: 逐出只删 registries 条目时旧 manager 仅插件卸载才释放——
          // 持续失败场景同 workspace watcher 无界累积（bug 31a989d2）。失败逐出
          // 同步 dispose 并摘除，watcher 数与 workspace 一一对应有界；重试由
          // 下次请求的 registryFor 重建承担。
          const stale = watchManagers.get(workspace);
          if (stale !== undefined) {
            watchManagers.delete(workspace);
            // 逐出时 start 可能在途/迟到（bug 38f87c0f）——close 拒绝不得成未处理 rejection
            void stale.dispose().catch(() => {});
          }
        }
      });
      registries.set(workspace, hit);
      const manager = new ExpertWatchManager(rootsFor(workspace), {
        onInvalidated: () => enqueueRefresh(workspace, registry),
        onError: (error) => console.warn(`[expert-squad] ${String(error)}`),
      });
      watchManagers.set(workspace, manager);
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
        for (const manager of watchManagers.values()) manager.observeHostMutation(path);
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
        roots: () => rootsFor(process.cwd()),
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
  // subagents 取法（bug 5a1e1132）：官方具名正门 ctx.subagents 直取（cordis Context
  // 模块扩充，@deepseek-ai/dsh-subagent lib/types/index.d.ts:62-64——subagents:
  // SubagentRuntime 非可选，宿主恒供 → inject 声明边即可守卫内直读）。此前
  // readOptionalService 的 reflect 字符串键取法与具名服务失配，真机 delegate_expert
  // 不注册。形状校验保留：startContinuable 非函数面同按缺席降级。
  const subagents = ctx.subagents;
  if (typeof subagents?.startContinuable !== "function") {
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

expertSquadPlugin.inject = ['connection', 'subagents'];

export default expertSquadPlugin;
