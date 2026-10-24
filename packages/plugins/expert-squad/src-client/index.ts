// @dsh-forge/expert-squad —— client face（浏览器半；scripts/bundle-client.mjs 按官方
// clientBundle 配方产出 dist/client.js，经 exports["./client"] 以 classic <script>
// 装载）。组合 cordis 插件形态（对策 annotator gotcha-web-boot 判例——无 apply →
// 真机 `invalid plugin`）；apply 内经官方 slots 服务注入面挂载 main 槽缝（面板 UI
// 本体由阶段四任务填充，本任务只落挂载缝）。返回值铁律：apply 必须返回
// undefined（cordis 组合把返回值当 effect 消费，非空对象 = Invalid effect）。

/** 官方 ui-slots 主槽键（apps/web client-plugin 同族常量——主工作区洞位）。 */
const MAIN_SLOT = 'main'

/** 官方 slots 服务消费切片（SlotRegistry.inject 面，apps/web ForgeSlotsService 同型镜像）。 */
interface SlotsFace {
  /** 依赖洞位声明：声明在场即装 cb；cb 返回即释放器（随 fiber 卸载级联）。 */
  inject?(key: string, callback: () => (() => void) | undefined): () => void
}

/**
 * main 槽挂载缝（面板挂载点；阶段四面板组件化后由 cb 返回挂载器/释放器）。
 * 当前骨架期零渲染——cb 返回 undefined，仅声明洞位在场供装载链路判读。
 */
function mountPanel(): (() => void) | undefined {
  console.debug('[dsh-forge/expert-squad] main slot mounted (skeleton, panel lands in phase 4)')
  return undefined
}

/** client face 组合 apply 插件对象（main 槽挂载缝就位，面板本体阶段四填充）。 */
export const expertSquadClient = {
  apply(ctx: unknown): void {
    const slots = (ctx as { slots?: SlotsFace } | undefined)?.slots
    if (typeof slots?.inject !== 'function') {
      // 官方 slots 面缺席（宿主形状漂移）——fail-soft：UI 静默缺失优于 boot 崩溃。
      console.warn('[dsh-forge/expert-squad] ctx.slots.inject absent; panel not mounted')
      return
    }
    const dispose = slots.inject(MAIN_SLOT, mountPanel)
    console.debug('[dsh-forge/expert-squad] client apply (main slot seam wired)')
    // 骨架期释放器不落长期登记——阶段四面板接手后随 fiber 卸载级联接管。
    void dispose
  },
}

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 须本身为
 * cordis 插件面——function 或含 apply 方法的对象（input-history 同型判例）。
 */
export const apply = expertSquadClient.apply.bind(expertSquadClient)
