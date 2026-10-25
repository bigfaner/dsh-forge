// @dsh-forge/expert-squad —— client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。组合 cordis 插件形态（对策 annotator gotcha-web-boot 判例——无 apply →
// 真机 `invalid plugin`）。装配缝（官方 ui-slots 正门，dsh-forge client-plugin 同径）：
//   ① main keyed 'expert-squad' 占用者 = 专家卡片网格面板（panel/，ui-design F1）；
//   ② sidebar.panellist 行（id = main key 同源）= 左栏面板入口（字形 + label）。
// 返回值铁律：apply 必须返回 undefined（cordis 组合把返回值当 effect 消费）。
import { ExpertPanelApp, ExpertPanelGlyph, type SummonOpener } from "./panel/index.js";
import {
  openSummonSession,
  type SummonOutcome,
  type SummonPlatform,
} from "./panel/summon-session.js";

/** 官方 ui-layout main keyed 槽键（ui-layout SlotMap——中区面板 roster）。 */
const MAIN_SLOT = "main";
/** 官方 ui-sidebar panellist 槽键（左栏面板行 roster——行 id = main key 同源）。 */
const PANEL_LIST_SLOT = "sidebar.panellist";
/** 本插件面板键（main keyed 登记键 = panellist 行 id 同源）。 */
export const PANEL_KEY = "expert-squad";
/** 面板行排位（产品知识行 order 20 之后留序）。 */
const PANEL_ORDER = 30;
/** 面板行 label（locale NS 接入前的字面量——与面板标题同词）。 */
const PANEL_LABEL = "专家团";

/** 官方 slots 服务消费切片（ForgeSlotsService 结构同型镜像；缺席成员 = 降级）。 */
interface SlotsFace {
  /** 依赖洞位声明：声明在场即装 cb；cb 返回即释放器（随 fiber 卸载级联）。 */
  inject?(key: string, callback: () => (() => void) | undefined): () => void;
  /** 注册占用者（options.name = 洞名；key = keyed 槽键；id/order = list 槽行；
   *  inject = 注入面工厂（组件 props 递达——plugin.ts main keyed 注入同径）。 */
  register?(options: {
    name: string;
    key?: string;
    id?: string;
    order?: number;
    label?: string;
    priority?: number;
    inject?: () => unknown;
  }, component: unknown): () => void;
}

/** cordis ctx 窄面（可选服务惰性取法——ctx.reflect.get 缺席返 undefined，异常吞为缺席；
 *  host 半 index.ts readOptionalService 同径先例：uiWorkspace/remote 为可选服务，
 *  静态 inject 声明会使 fiber 在服务缺席环境永久 pending——调用期惰性解析）。
 *  清扫留档（用户裁决 2026-10-25，具名服务优先——两处残留均为「结构性只能惰性」）：
 *  · uiWorkspace：官方有 typed 正门（dsh-client-ui-workspace navigation.d.ts:91-95
 *    `declare module '@deepseek-ai/cordis' { interface Context { uiWorkspace: UiWorkspace } }`），
 *    取调用期惰性系生命周期理由而非取法缺失——本面板 inject 仅 ["slots"]，静态 inject
 *    uiWorkspace 会使 fiber 在服务缺席环境永久 pending（召唤在用户点击时点才解析，
 *    届时服务必就绪）；
 *  · remote：官方 dsh-api-remotes 确有 `remote: ClientRemote` 具名正门，同一生命周期理由
 *    （apps/web client-plugin m3.1 D25 model catalog 同径先例），加 inject 边 = 面板挂载
 *    被 remote 生命周期绑架，弃直取留惰性。 */
interface LazyCtx {
  reflect?: { get(name: string): unknown };
}

/** uiWorkspace 官方面消费切片（openWorkspace 缝——官方 startSession 同径 reuse-or-create）。 */
function uiWorkspaceOf(ctx: LazyCtx): SummonPlatform["openWorkspace"] | undefined {
  try {
    const service = ctx.reflect?.get("uiWorkspace") as
      | { openWorkspace?: SummonPlatform["openWorkspace"] }
      | undefined;
    const open = service?.openWorkspace;
    if (typeof open !== "function") return undefined;
    // Root cause（bug 9d9d1bd3）：官方方法以 this 消费服务面（首行 this.ctx.layout）——
    // 裸引用剥离后经 platform 字面量调用即 this 脱绑（召唤必败 TypeError）。包装保持
    // 方法调用形态。语境注记：open-session.ts:377 先例 = face 内经
    // services.uiWorkspace.openWorkspace(...) 成员访问调用保 receiver；此处 open 经裸引用
    // 自 platform 字面量调用，故以 .call 显式保 receiver——同一机制（this 不脱绑）两处落地。
    return (workspaceId, beforeOpen) => open.call(service, workspaceId, beforeOpen);
  } catch {
    return undefined;
  }
}

/** remote.agentPresets 官方面消费切片（'remote' 嵌套双径——plugin.ts model catalog 同径）。 */
function agentPresetsOf(ctx: LazyCtx): SummonPlatform["selectPreset"] | undefined {
  try {
    const reflect = ctx.reflect;
    if (reflect === undefined) return undefined;
    const direct = reflect.get("remote.agentPresets") as { select?: unknown } | undefined;
    const ns = (direct ?? (reflect.get("remote") as { agentPresets?: { select?: unknown } } | undefined)?.agentPresets) as
      | { select?: SummonPlatform["selectPreset"] }
      | undefined;
    // 机制注记（如实——绑定形态未核销）：select 消费 this 面的绑定策略未经源码核销
    // （疑闭包绑定 namespace），.call 保 receiver 包装中性无害，防御性保留
    // （先落非可选局部再 .call）。
    const namespace = ns;
    const select = namespace?.select;
    if (namespace === undefined || typeof select !== "function") return undefined;
    return (sessionId, presetId) => select.call(namespace, sessionId, presetId);
  } catch {
    return undefined;
  }
}

/**
 * [召唤] 官方会话缝装配（调用期惰性解析——服务缺席/形状漂移 = 阶段化失败降级引导，
 * 不炸面板）。返回编排闭包（openSummonSession 纯编排面 + ctx 解析适配）。
 */
export function summonOpenerOf(ctx: LazyCtx): SummonOpener {
  return (workspace) => {
    const openWorkspace = uiWorkspaceOf(ctx);
    const selectPreset = agentPresetsOf(ctx);
    if (openWorkspace === undefined || selectPreset === undefined) {
      const outcome: SummonOutcome = {
        ok: false,
        stage: "create",
        message: "官方会话缝缺席（uiWorkspace.openWorkspace / remote.agentPresets.select）——无法打开 HR 会话",
      };
      return Promise.resolve(outcome);
    }
    const platform: SummonPlatform = { openWorkspace, selectPreset };
    return openSummonSession(platform, workspace);
  };
}

/** 单行登记（注册面异常只降本行——console 留痕，不外溢炸组合；返回联合释放器随 fiber 级联）。 */
function safeRegister(slots: SlotsFace, options: Parameters<NonNullable<SlotsFace["register"]>>[0], component: unknown): (() => void) | undefined {
  if (typeof slots.register !== "function") return undefined;
  try {
    return slots.register(options, component);
  } catch (error) {
    console.error("[dsh-forge/expert-squad] panel registration failed——降级空态", error);
    return undefined;
  }
}

/** main 面板 + panellist 行登记（登记挂所属槽的 inject 回调——槽声明在场即装、随 fiber 卸载级联回收）。 */
function registerExpertPanel(ctx: LazyCtx, slots: SlotsFace): void {
  if (typeof slots.inject !== "function") {
    console.warn("[dsh-forge/expert-squad] ctx.slots.inject absent; panel not mounted");
    return;
  }
  slots.inject(MAIN_SLOT, () =>
    safeRegister(slots, { name: MAIN_SLOT, key: PANEL_KEY, inject: () => ({ summon: summonOpenerOf(ctx) }) }, ExpertPanelApp));
  // 行注册挂 panellist 槽自身的声明缝——ui-sidebar 插件声明该槽后才合法（先注册 = 
  // `slot "sidebar.panellist" is not declared`；web-client registerSlotEntry 同径）。
  slots.inject(PANEL_LIST_SLOT, () =>
    safeRegister(slots, { name: PANEL_LIST_SLOT, id: PANEL_KEY, order: PANEL_ORDER, label: PANEL_LABEL }, ExpertPanelGlyph));
}

/** client face 组合 apply 插件对象（main 槽登记缝 + 面板本体）。 */
export const expertSquadClient = {
  // cordis 装载契约：取 ctx.slots 前必须声明注入边（缺声明 = apply 期
  // `cannot get property "slots" without inject`，fiber FAILED——web-client
  // FORGE_CLIENT_INJECT 同径先例，slots 为唯一消费服务）。
  inject: ["slots"],
  apply(ctx: unknown): void {
    const slots = (ctx as { slots?: SlotsFace } | undefined)?.slots
    if (typeof slots?.inject !== "function") {
      // 官方 slots 面缺席（宿主形状漂移）——fail-soft：UI 静默缺失优于 boot 崩溃。
      console.warn("[dsh-forge/expert-squad] ctx.slots.inject absent; panel not mounted")
      return
    }
    // 官方装配序缝（plugin.ts registerSlotEntry 同径）：登记动作面异常只降本面板。
    registerExpertPanel(ctx as LazyCtx, slots)
  },
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 同型判例）。
 * esbuild CJS namespace 会丢 `inject` 声明（cordis 只在 unwrapExports 后的插件对象上
 * 读 plugin.inject，缺声明 = apply 期 `cannot get property "slots" without inject`）——
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default expertSquadClient
export const apply = expertSquadClient.apply.bind(expertSquadClient)
