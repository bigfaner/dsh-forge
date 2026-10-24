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

/** main 面板 + panellist 行登记（返回联合释放器；register 缺席 = 降级 no-op）。 */
function registerExpertPanel(slots: SlotsFace): (() => void) | undefined {
  if (typeof slots.register !== "function") {
    console.warn("[dsh-forge/expert-squad] ctx.slots.register absent; panel not registered")
    return undefined
  }
  const disposePanel = slots.register({ name: MAIN_SLOT, key: PANEL_KEY }, ExpertPanelApp)
  const disposeRow = slots.register(
    { name: PANEL_LIST_SLOT, id: PANEL_KEY, order: PANEL_ORDER, label: PANEL_LABEL },
    ExpertPanelGlyph,
  )
  return () => {
    disposePanel?.()
    disposeRow?.()
  }
}

/** client face 组合 apply 插件对象（main 槽登记缝 + 面板本体）。 */
export const expertSquadClient = {
  apply(ctx: unknown): void {
    const slots = (ctx as { slots?: SlotsFace } | undefined)?.slots
    if (typeof slots?.inject !== "function") {
      // 官方 slots 面缺席（宿主形状漂移）——fail-soft：UI 静默缺失优于 boot 崩溃。
      console.warn("[dsh-forge/expert-squad] ctx.slots.inject absent; panel not mounted")
      return
    }
    // 官方装配序缝（plugin.ts 同径）：登记挂 inject 回调——洞位声明在场即装、随 fiber
    // 卸载级联回收；注册动作面异常只降本面板（console 留痕），不外溢炸组合。
    slots.inject(MAIN_SLOT, () => {
      try {
        return registerExpertPanel(slots)
      } catch (error) {
        console.error("[dsh-forge/expert-squad] panel registration failed——降级空态", error)
        return undefined
      }
    })
  },
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 同型判例）。
 */
export const apply = expertSquadClient.apply.bind(expertSquadClient)
