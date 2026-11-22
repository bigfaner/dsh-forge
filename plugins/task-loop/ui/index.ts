// @dsh-forge/task-loop client UI 出口（1.13 六组件迁批落位——ui-slots.md §② 六组件×缝
// 映射正本）：装配 = apply 插件面（官方 client-modules classic script 装载正门——
// module.exports 本身须为含 apply 的 cordis 插件面，esbuild CJS namespace 丢 inject
// 声明 → default 导出走 unwrapExports，expert-squad 实证配方）。
//
// 六组件映射（迁后注册面全归本包——fix-13 判例：组件迁包而注册代码留壳 = 官方宿主 UI
// 静默缺失；壳 plugin.ts 零 task-loop 六键注册行残留[机检 = tests/ui/ui-machine-checks]）：
//   ① DispatchToolRow       → tool.call.toolview keyed 'dispatchTask'（conversation-views-face）
//   ② ForgeEventEntries     → uiConversation.events ×2 + conversation.chat.node keyed
//                             'forge-event-group' 三段（conversation-views-face）
//   ③ DispatchEventsPanel   → conversation.session.header.utilities list（改缝注册——
//                             壳 ShellHost overlay 直挂退役；dispatch-events-face）
//   ④ 概览 dock tab         → sidebarRightTabs 类型 + sidebar.right.pane.tab keyed 概览键
//                             （双形态注册切换 + 主指标 AC 核销进度；dock-tabs-face）
//   ⑤ tasks-changed 订阅    → forgeTasks follow 流 + 快照镜像（tasks-hub——50ms 合并窗
//                             latest-wins 判例沿用；降级终态 = 静默重取）
//   ⑥ forge:tasks/* 读通道  → forgeTasks Typert namespace 快照方法族（tasks-rpc——键名
//                             沿用、transport 改型；./remote 生成工件锁两半形状）
//
// inject 声明（官方同型先例——slots 为槽注册唯一必需服务；uiConversation 静态边 =
// entry fiber 依赖表 Loader 级等待 + 后到补激活[bug 2dde7c9e 候选 A 配方]；'remote' 边
// 主面不消费——namespace 边由 apply 期 ctx.inject 子 fiber 声明，主插件声明 = 等待自身
// apply 产物自锁死锁，project w33 真机实证；sessions/uiWorkspace/sidebarRightTabs 消费
// 点现查不经静态边——官方服务惰性实例化，apply 点 undefined 闭包缓存判例 fba7913c）。
// fix-5（bug d731b785）：locale 入 inject 名单——官方缝声明边（knowledge fix-9 同型判例：
// 缺声明 = apply 期 cannot get property "locale" without inject → 注册链中断）；缺席
// fail-soft 不阻断（label 回退 NS 键名）。
import { registerConversationToolFaces } from "./conversation-views-face.js";
import { registerDockTabsFace } from "./dock-tabs-face.js";
import { registerDispatchEventsFace } from "./dispatch-events-face.js";
import { FORGE_TASK_LOOP_LOCALE_DICTS, FORGE_TASK_LOOP_LOCALE_NS, type LocaleServiceFace } from "./locale.js";
import { asRecord, type OfficialSeamCtx } from "./official-seams.js";
import { FORGE_TASKS_REMOTE_CONTRIBUTION } from "./remote.js";
import { installForgeTasksFace, type ForgeTasksNamespaceFace } from "./tasks-rpc.js";
import { installSelfAnchorFiber } from "./self-anchor.js";
import { forgeFaceOf, installForgeRemoteFace, markForgeRemoteMountSettled } from "./rpc.js";
import type { SectionSlotsFace } from "./keyed-section.js";

/** client 组合插件面（官方宿主 apply 消费形态） */
export interface TaskLoopClientPlugin {
  inject: readonly string[];
  apply: (ctx: unknown) => void;
}

/** 官方 ctx.remote 窄形（fiber ctx——forgeTasks namespace 归一取法：Map → 对象 → 顶层） */
function forgeTasksFaceFromFiber(fiberCtx: unknown): ForgeTasksNamespaceFace | undefined {
  const remote = asRecord(fiberCtx)?.["remote"];
  if (remote === undefined || remote === null || typeof remote !== "object") return undefined;
  const face = remote as Record<string, unknown>;
  const namespaces = face["namespaces"];
  if (namespaces instanceof Map) {
    const entry = namespaces.get("forgeTasks") as { service?: unknown } | undefined;
    const service = entry?.service;
    return service !== undefined && service !== null && typeof service === "object" ? (service as ForgeTasksNamespaceFace) : undefined;
  }
  const holder = typeof namespaces === "object" && namespaces !== null ? (namespaces as Record<string, unknown>) : face;
  const ns = holder["forgeTasks"];
  return ns !== undefined && ns !== null && typeof ns === "object" ? (ns as ForgeTasksNamespaceFace) : undefined;
}

export const taskLoopClient: TaskLoopClientPlugin = {
  inject: ["slots", "remote", "uiConversation", "locale"],
  apply(ctx: unknown): void {
    const rec = ctx as OfficialSeamCtx | undefined;
    const slots = asRecord(rec)?.["slots"] as SectionSlotsFace | undefined;
    if (slots === undefined || typeof slots.inject !== "function") {
      // 官方 slots 面缺席（宿主形状漂移）——fail-soft：UI 静默缺失优于 boot 崩溃。
      console.warn("[dsh-forge/task-loop] ctx.slots.inject absent; ui faces not mounted");
      return;
    }
    // forgeTasks Typert namespace 解析缝（apply 期 ctx.inject 子 fiber——官方 client-ui-forge
    // mount.ts:339 同型：子 fiber 停驻至 host 半 namespace 服务在场后激活；remote 缺席宿主
    // = 缝不安装，调用期诚实降级[投影快照单源 + 静默重取]）。
    // fix-6（bug b0569de6）：$mount 前置挂载段——project 正典配方承袭（project/ui/remote.ts
    // + project ui/index.ts:288-315）：generator 产 forgeTasks 贡献（./remote 投影）经
    // remote.$mount 进调用方 fiber，gateway client 半 namespace 才物化，下方子 fiber 停驻
    // 至 namespace 在场后激活——注册先于首个探测（bug 253b8265 同族判据），unmount 撤回随
    // 包 fiber 生命周期级联，mount 重试 = promise settle 事件驱动（零固定短窗）。mount
    // settle 三分支各发布一次页内终态锚（fix-2 竞速分类钉——rpc.ts 键注）。
    try {
      const reflect = asRecord(rec)?.["reflect"] as { get?: (key: string) => unknown } | undefined;
      const readReflect = (key: string): unknown => {
        try {
          return typeof reflect?.get === "function" ? reflect.get(key) : undefined;
        } catch {
          return undefined;
        }
      };
      const remote = (readReflect("remote") ?? asRecord(rec)?.["remote"]) as
        | { $mount?: (contribution: unknown) => Promise<unknown> }
        | undefined;
      if (remote !== undefined && typeof remote.$mount === "function") {
        void Promise.resolve(remote.$mount(FORGE_TASKS_REMOTE_CONTRIBUTION))
          .then(() => {
            markForgeRemoteMountSettled();
            console.info("[dsh-forge/task-loop] forgeTasks remote contribution mounted");
          })
          .catch((error: unknown) => {
            markForgeRemoteMountSettled();
            console.warn("[dsh-forge/task-loop] forgeTasks remote contribution mount failed——调用期诚实降级", error);
          });
      } else {
        markForgeRemoteMountSettled();
        console.warn("[dsh-forge/task-loop] ctx.remote.$mount absent——forgeTasks 贡献不挂载（诚实降级）");
      }
    } catch (error) {
      markForgeRemoteMountSettled();
      console.warn("[dsh-forge/task-loop] forgeTasks remote mount seam failed——调用期诚实降级", error);
    }
    try {
      const injectFn = asRecord(rec)?.["inject"] as ((deps: readonly string[], mixin: (c: unknown) => unknown) => unknown) | undefined;
      if (typeof injectFn === "function") {
        injectFn.call(rec, ["remote", "remote.forgeTasks"], (fiberCtx: unknown) => {
          installForgeTasksFace(() => forgeTasksFaceFromFiber(fiberCtx), (line) => console.warn(`[dsh-forge/task-loop] ${line}`));
          // dock tab 族数据通道解析缝（forgeProjects/forgeDocs 等六族——dir-rows/docs tab
          // 消费面；face 六族齐备才落座，单装缺席 = 调用期 typed 降级）。
          installForgeRemoteFace(() => forgeFaceOf(fiberCtx), (line) => console.warn(`[dsh-forge/task-loop] ${line}`));
          return undefined;
        });
        // 概览自解析缝正门（sessions/workspaces 具名服务边——project 正典同型：跨 realm
        // reflect 拿不到顶层实现形态下，reflect 回退恒 undefined → self-anchor 恒未解析；
        // 子 fiber 激活即装持有位，消费点双通道现查（self-anchor.ts 收口）。缺席宿主 =
        // 子 fiber 停驻，reflect 回退语义不变）。
        injectFn.call(rec, ["sessions", "workspaces"], (fiberCtx: unknown) => {
          installSelfAnchorFiber(fiberCtx);
          return undefined;
        });
      } else {
        console.warn("[dsh-forge/task-loop] ctx.inject absent——forgeTasks remote face fiber 不开（诚实降级）");
      }
    } catch (error) {
      console.warn("[dsh-forge/task-loop] forgeTasks remote face install failed——调用期诚实降级", error);
    }
    // locale 词典登记（缺席 = label 回退 NS 键名呈现，注册面不阻断）。
    try {
      const locale = asRecord(rec)?.["locale"] as LocaleServiceFace | undefined;
      if (locale !== undefined && typeof locale.register === "function" && typeof locale.bind === "function") {
        locale.register(FORGE_TASK_LOOP_LOCALE_NS, FORGE_TASK_LOOP_LOCALE_DICTS);
      } else {
        console.warn("[dsh-forge/task-loop] ctx.locale absent; labels fall back to ns keys");
      }
    } catch (error) {
      console.warn("[dsh-forge/task-loop] locale dict registration failed——label 回退呈现", error);
    }
    // ①② 对话面（dispatchTask 工具行 + 事件折叠组三段）。
    try {
      const toolFaces = registerConversationToolFaces(rec as never, slots);
      console.info(`[dsh-forge/task-loop] conversation tool faces registered=[${toolFaces.registered.join(", ")}]`);
    } catch (error) {
      console.warn("[dsh-forge/task-loop] conversation tool faces registration interrupted", error);
    }
    // ④ 概览 dock tab 族（页型类型 + keyed body）。
    try {
      const locale = asRecord(rec)?.["locale"] as LocaleServiceFace | undefined;
      const dock = registerDockTabsFace(rec as never, slots, locale);
      console.info(`[dsh-forge/task-loop] dock tab faces registered=[${dock.registered.join(", ")}]`);
    } catch (error) {
      console.warn("[dsh-forge/task-loop] dock tab faces registration interrupted", error);
    }
    // ③ DispatchEventsPanel 改缝注册（壳 overlay 直挂退役替代面）。
    try {
      const panel = registerDispatchEventsFace(rec as never, slots);
      console.info(`[dsh-forge/task-loop] dispatch events face registered=[${panel.registered.join(", ")}]`);
    } catch (error) {
      console.warn("[dsh-forge/task-loop] dispatch events face registration interrupted", error);
    }
  },
};

/** 装载器正门（client-modules 装载契约——default 导出经 unwrapExports 还原插件对象本体） */
export default taskLoopClient;
export const apply = taskLoopClient.apply.bind(taskLoopClient);
