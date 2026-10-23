// factory-bridge —— 官方 conversation.content 工厂桥（1.30 slots 复用裁决）。
//
// 核销依据（官方包源码穷尽核查）：
// - `conversation.content` 注册在官方 slots 工厂注册表（ui-conversation lib/client.js
//   registerFactory，scope session-maybe，inject 闭包 composerBlock store/selectWorkspace
//   由官方插件注册时自带——替身按 sessionId 渲染工厂，官方 seat 自供）。
// - renderFactorySlot/useFactorySlot 是 renderer 交付给「renderer-created 组件」的
//   props 面（ui-renderer scoped-slots.tsx；SlotRegistry ctx 级只有 renderSlot('root')），
//   且 FactoryOccurrence/scope 绑定走 React context——替身卡的独立 createRoot 内
//   渲染工厂必然断 context。唯一合法缝 = 官方树内槽位入口：`shell.overlay`（ui-layout
//   AppFrame 声明的 list 槽，registry.d.ts 官方注释点名「浮动面」用途）。
//
// 机制：官方树内入口组件持有 renderer 交付的 renderFactorySlot；替身卡（独立 React
// root）S2 对话态落 [data-dscf-factory-host] 宿主元素进快照店；入口经 createPortal
// 把工厂 occurrence 渲进宿主元素——portal 保官方根 React context，react 单实例红线
// 不破（同一 react 实例、双 root，既有装配形态不变）。
//
// 工厂 occurrence props = 官方 ConversationContentInputProps（variant/phase/hero）；
// sessionId 来自 session-maybe 标准 seat（ui-session merge：sessionId | undefined），
// 消息流（conversation.session）/composer bar（conversation.composer.bar）由官方
// 子槽自供——1.28 复制件消息渲染退役（official-chatview 目录删除）。
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createSnapshotStore, type SnapshotStore } from "./official-input/store.js";

/** renderFactorySlot 窄面（renderer 交付 props——结构同型镜像，零运行时依赖）。 */
export type RenderFactorySlotFace = (
  name: string,
  props: Record<string, unknown>,
  options?: { slots?: Record<string, unknown>; fallback?: ReactNode },
) => ReactNode;

/** 工厂桥入口组件 props（renderer 交付面——只消费 renderFactorySlot）。 */
export interface FactoryBridgeEntryProps {
  readonly renderFactorySlot?: RenderFactorySlotFace;
}

/** 工厂宿主元素快照店（替身卡 S2 落锚 → 桥入口读锚 portal；null = 无锚不渲染）。 */
const factoryTarget: SnapshotStore<Element | null> = createSnapshotStore<Element | null>(null);

/** 替身卡落工厂宿主锚（FactoryChatView mount/unmount 生命周期调用）。 */
export function setFactoryTarget(target: Element | null): void {
  factoryTarget.set(target);
}

/**
 * 官方树内槽位入口（shell.overlay——root scope list 槽）：读宿主锚，portal 渲染
 * conversation.content 工厂 occurrence。锚缺席（非 S2/非全屏/桥未挂）= render(null)
 * 不常驻。
 */
export function FactoryBridgeEntry(props: FactoryBridgeEntryProps): ReactNode {
  const target = useSyncExternalStore(factoryTarget.subscribe, factoryTarget.getSnapshot);
  const renderFactorySlot = props.renderFactorySlot;
  // 诊断锚：renderer 已交付 renderFactorySlot（入口在官方树内挂载）即常驻 0 尺寸标记
  //——真机判读面（区分「未注册」与「已注册待锚」）；无标记 = 桥缺席。
  if (typeof renderFactorySlot !== "function") return null;
  if (target === null) return <div data-dscf-factory-bridge="" style={{ display: "contents" }} />;
  return createPortal(
    renderFactorySlot("conversation.content", { variant: "embedded", phase: "active", hero: false }),
    target,
  );
}

/** slots 服务窄面（结构读取——漂移/缺席 = undefined）。 */
interface SlotsServiceFace {
  register?: (
    options: { name: string; id?: string },
    component: (props: FactoryBridgeEntryProps) => ReactNode,
  ) => () => void;
}

/** cordis ctx 只读反射/属性读取（与 client/index.ts readServiceOf 同缝）。 */
function readSlotsOf(source: unknown): SlotsServiceFace | undefined {
  try {
    const direct = (source as { slots?: unknown } | null)?.slots;
    if (direct != null) return direct as SlotsServiceFace;
  } catch {
    // fail-soft
  }
  try {
    const reflect = (source as { reflect?: { get?: (name: string) => unknown } }).reflect;
    if (typeof reflect?.get === "function") {
      const service = reflect.get("slots");
      if (service != null) return service as SlotsServiceFace;
    }
  } catch {
    // fail-soft
  }
  return undefined;
}

/**
 * 装配工厂桥：ctx.slots.register('shell.overlay') 官方缝注册入口组件（disposer 经
 * caller ctx.effect 挂 fiber——SlotRegistry 契约；返回值再手动收口一次幂等）。slots
 * 服务缺席（无官方 renderer 的宿主）= undefined，替身 S2 呈现空流区（降级不炸组合）。
 */
export function installFactoryBridge(ctx: unknown, fallbackSource?: unknown): (() => void) | undefined {
  const slots = readSlotsOf(ctx) ?? readSlotsOf(fallbackSource);
  if (typeof slots?.register !== "function") {
    // 真机判读留痕（services provide 晚序判例——调用方须重试补挂，不可一次性焊死）
    console.warn("[dsh-forge/super-composer] ctx.slots 服务缺席——工厂桥暂缺，待晚序补挂");
    return undefined;
  }
  try {
    // list 槽注册须带 id（SlotCore load-time 校验——真机判例 sc130：缺 id fail-loud）
    return slots.register({ name: "shell.overlay", id: "super-composer-factory-bridge" }, FactoryBridgeEntry);
  } catch (error) {
    console.error("[dsh-forge/super-composer] factory bridge register failed——工厂桥缺席，替身 S2 降级空流区", error);
    return undefined;
  }
}

/**
 * 替身卡 S2 对话态宿主：落工厂宿主锚（mount 置锚 / unmount 清锚），工厂 occurrence
 * （官方 ConversationContent：消息流 + composer bar）经桥 portal 渲进本元素。
 * data-testid="dscf-messages" 沿用 1.28 前消息流锚（状态机测试口径不变）。
 *
 * 1.34 布局融合：composer 与 chat-view 同面（宿主单面承载工厂 occurrence，官方
 * embedded 布局 composerSeat 常驻底部——无独立高度块）。
 * 1.38 渐进展开（用户 UX 裁决 2026-10-22）：不再发送/流式一步伸到最高——增高态
 * （grown）高度 = min(实测内容高, 上限)；内容每增长，高度平滑跟着增长（逐块递进，
 * ResizeObserver 监听工厂 occurrence 内容尺寸）。上限 = 标题栏底部分隔线锚
 * （grownMaxHeight）再减留白 GROW_RESERVE——顶缘与分隔线保留一段距离，不顶格。
 * 无布局环境（happy-dom 等 RO 缺席）回落 = 上限定值（锚核销口径不丢）。
 */
/** 增长上限留白（1.40 参数裁决 2026-10-22：32px→100px）：chat-view 顶缘距标题栏底部分隔线的保留距离。 */
const GROW_RESERVE = "100px";

export function FactoryChatView(props: {
  streaming: boolean;
  /** 发送触发增高（mini-composer 消息流增长判据；缺省 false = 初始 40vh 块） */
  grown?: boolean;
  /** 增高上限锚（标题栏底部分隔线 calc——mini-composer 按实测标题栏高计算） */
  grownMaxHeight?: string;
  /**
   * fix-21（bug 0cf1818b）：本视图卸载（S2 收起）回调——S2 官方 composer 副本
   * 卸载会把 shell editor root 置 null（官方 ComposerContentEditable cleanup），
   * 挂载层据此重绑主视图官方 composer。挂载层注入稳定引用。
   */
  onFactoryUnmount?: () => void;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // 内容驱动递进：真实内容实测高（null = 未测量/无 RO 环境 → 回落上限锚）。
  // 测量面 = 官方 embedded 消息流的内部滚动容器（[data-conversation-scroll]）的
  // 内容盒（首子元素——消息列表本体，盒高随消息/流式增量真实增长）+ chrome
  // （宿主盒 − scrollport 视口 = composer seat + 间距）。直接观察 occurrence 根
  // 不可用——根 flex:1 拉伸至宿主高（自反馈环，1.38 真机判例 sc138）。
  const [contentH, setContentH] = useState<number | null>(null);
  const factoryUnmountRef = useRef(props.onFactoryUnmount);
  factoryUnmountRef.current = props.onFactoryUnmount;
  useEffect(() => {
    setFactoryTarget(hostRef.current);
    return () => {
      setFactoryTarget(null);
      // fix-21（bug 0cf1818b）：官方 S2 InputBar 卸载 cleanup（shell editor root
      // 置 null）晚于本 effect——延迟一拍到挂载层重绑缝（rebind 内 root 在场即
      // 零干预，幂等；重试时序由挂载层有界承担）。
      setTimeout(() => factoryUnmountRef.current?.(), 0);
    };
  }, []);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host == null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      let block = 0;
      for (const entry of entries) {
        block = Math.max(block, entry.borderBoxSize?.[0]?.blockSize ?? 0);
      }
      if (block <= 0) return;
      const child = host.firstElementChild as HTMLElement | null;
      const scroll = child?.querySelector<HTMLElement>("[data-conversation-scroll]") ?? null;
      const chrome =
        child != null && scroll != null
          ? Math.max(0, child.offsetHeight - scroll.clientHeight)
          : 0;
      const measured = block + chrome;
      // 单调递增：只长不缩（渐进展开语义——回落/收起由状态机整体复位）
      setContentH((prev) => (prev == null ? measured : Math.max(prev, measured)));
    });
    let observed: Element | null = null;
    const sync = (): void => {
      const child = host.firstElementChild;
      if (child == null) return;
      const scroll = child.querySelector<HTMLElement>("[data-conversation-scroll]");
      const content = (scroll?.firstElementChild as HTMLElement | null) ?? child;
      if (content === observed) return;
      if (observed != null) ro.unobserve(observed);
      observed = content;
      ro.observe(content);
    };
    const mo =
      typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
    mo?.observe(host, { childList: true, subtree: true });
    sync();
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, []);
  const capHeight =
    props.grownMaxHeight !== undefined
      ? `calc(${props.grownMaxHeight} - ${GROW_RESERVE})`
      : undefined;
  // 高度 = 实测内容高（逐块递进）；钳制交给 maxHeight = 上限锚减留白（不顶格）——
  // 避免 CSS min()（测试环境 CSS 解析不识别，且 max-height 语义更直白）。
  const grown = props.grown === true && capHeight !== undefined;
  const height = grown
    ? contentH !== null
      ? `${Math.ceil(contentH)}px`
      : capHeight
    : "40vh";
  return (
    <div
      ref={hostRef}
      data-testid="dscf-messages"
      data-streaming={props.streaming ? "true" : undefined}
      data-grown={props.grown === true ? "true" : undefined}
      data-dscf-factory-host=""
      style={{
        display: "flex",
        flexDirection: "column",
        height,
        maxHeight: grown ? capHeight : undefined,
        minHeight: 140,
        borderTop: "0.5px solid var(--dsw-alias-border-l2)",
        overflow: "hidden",
        transition: "height .25s var(--ds-ease-in-out, ease)",
      }}
    />
  );
}
