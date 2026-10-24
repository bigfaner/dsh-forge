// @dsh-forge/expert-squad —— client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。组合 cordis 插件形态（对策 annotator gotcha-web-boot 判例——无 apply →
// 真机 `invalid plugin`）。装配缝（官方 ui-slots 正门，dsh-forge client-plugin 同径）：
//   ① main keyed 'expert-squad' 占用者 = 专家卡片网格面板（panel/，ui-design F1）；
//   ② sidebar.panellist 行（id = main key 同源）= 左栏面板入口（字形 + label）。
// 返回值铁律：apply 必须返回 undefined（cordis 组合把返回值当 effect 消费）。
import { ExpertPanelApp, ExpertPanelGlyph } from "./panel/index.js";

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
  /** 注册占用者（options.name = 洞名；key = keyed 槽键；id/order = list 槽行）。 */
  register?(options: {
    name: string;
    key?: string;
    id?: string;
    order?: number;
    label?: string;
    priority?: number;
  }, component: unknown): () => void;
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
function registerExpertPanel(slots: SlotsFace): void {
  if (typeof slots.inject !== "function") {
    console.warn("[dsh-forge/expert-squad] ctx.slots.inject absent; panel not mounted");
    return;
  }
  slots.inject(MAIN_SLOT, () =>
    safeRegister(slots, { name: MAIN_SLOT, key: PANEL_KEY }, ExpertPanelApp));
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
    registerExpertPanel(slots)
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
