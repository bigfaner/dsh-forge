// keyed section 插槽扩展点（task-loop 自含副本——tab keyed 占用者模式泛化）：
// 目标槽声明缝（官方 SlotRegistry.inject——「声明在场（或入座）即装」随 fiber 卸载级联）
// + keyed 占用者落座（官方 SlotCore.register——keyed 槽按 key 唯一、同 cell 同 priority
// 再注册抛错）。泛化后新 keyed/list 型节只写声明行，不复制装载样板。
//
// task-loop 差异面：conversation/dock-tab 族 keyed 槽与宿主 project 插件同键——落座走
// KEYED_SHADOW_PRIORITY 负值遮蔽（见下）；单装形态（无占用者）同值落座零行为差异。
// bundle 自含纪律：零上游 import（结构与 @deepseek-ai/dsh-client-ui-slots 消费切片同型镜像）。

/**
 * keyed 槽遮蔽 priority（fix-10 bug 400b3952 + fix-12 撞车残余）：同宿主 project 插件
 * 先装、已按同键 priority 0 占用 keyed 槽——同 key 同 priority 注册被官方 slots 拒收
 * （报错明示正缝：「register at a different priority to shadow it (lowest renders)」）。
 * 负 priority 遮蔽占用者（升序分发最低者渲染），单装形态（无占用者）同值落座零行为差异。
 */
export const KEYED_SHADOW_PRIORITY = -10;

export interface KeyedSectionRegistration {
  /** 目标槽名（官方 SlotMap key——声明缝与落座同名）。 */
  readonly slot: string;
  /** keyed 槽占用键（kind: keyed 必填；list 型节缺省）。 */
  readonly key?: string;
  /** list 槽行键（kind: list 必填；keyed 型节缺省）。 */
  readonly id?: string;
  /** list 槽行序。 */
  readonly order?: number;
  /** 行显示标签（字符串或 thunk——官方 SlotLabel 形状，thunk 随 active locale 逐读）。 */
  readonly label?: string | (() => string);
  /** 行 label 所属命名空间（登记面声明，官方 roster 消费——locale.register 的 NS 同源）。 */
  readonly locale?: string;
  /** cell 影子/链序（官方 priority——升序，同 cell 同值抛错）。 */
  readonly priority?: number;
  /** 节 inject face 工厂（登记面声明——槽 runtime 与 ownerProps 并合透传组件）。 */
  readonly inject?: () => Record<string, unknown>;
  /** 子槽声明表（官方 SlotCore.register children 协议——声明即占有，宿主单点声明缝）。 */
  readonly children?: Record<string, unknown>;
  /** 节组件本体（官方五份额组合 props 契约——本扩展点零裁剪透传）。 */
  readonly component: unknown;
}

/** 槽 ledger 条目投影窄面（官方 entries 条目 options 消费切片——占用者在座性判读） */
export interface SlotEntryProjection {
  readonly options?: Record<string, unknown>;
}

/** 官方 slots 服务消费切片（结构同型镜像——bundle 自含零上游 import）。 */
export interface SectionSlotsFace {
  /** 槽声明缝：声明在场（或入座）即装 cb；cb 返回释放器随 fiber 卸载级联。 */
  inject?(key: string, callback: () => (() => void) | undefined): (() => void) | undefined;
  /** 注册占用者（options.name = 槽名；key/id/order/label/priority = kind 形状字段）。 */
  register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
  /** 槽 ledger 只读查询（官方 SlotService.entries 原始账本——跨插件占用者在座性现查，
   *  含各条目 options.key/priority；检测永不缓存——每个消费点现查，AGENTS 1.6）。 */
  entries?(slot: string): readonly SlotEntryProjection[];
  /** 槽变更订阅（官方 SlotCore.subscribe——通知微任务批量送达，声明前订阅合法；
   *  返回撤销器，驱动占用者切换重绑。缺席 = fail-soft 不订阅）。 */
  subscribe?(slot: string, listener: () => void): (() => void) | undefined;
}

/**
 * 单行登记守卫（注册面异常只降本行——console.error 留痕不外溢炸装配；
 * expert-squad safeRegister 同款微复制——两处均为槽登记守卫，抽共享模块反增耦合）。
 */
export function safeRegisterSection(
  slots: SectionSlotsFace,
  options: Record<string, unknown>,
  component: unknown,
): (() => void) | undefined {
  if (typeof slots.register !== "function") return undefined;
  try {
    return slots.register(options, component);
  } catch (error) {
    console.error("[dsh-forge/task-loop] keyed section registration failed——降级不注册", error);
    return undefined;
  }
}

/**
 * 注册一个 keyed/list 型节（两段式：slots.inject(slot) 声明缝 → safeRegisterSection 落座）。
 * slots 劣形（inject/register 缺席）= fail-soft 不注册（warn 留痕，不炸组合）。
 */
export function registerKeyedSection(
  slots: SectionSlotsFace | undefined,
  registration: KeyedSectionRegistration,
): (() => void) | undefined {
  const inject = slots?.inject;
  if (slots === undefined || typeof inject !== "function") {
    console.warn("[dsh-forge/task-loop] ctx.slots.inject absent; keyed section not mounted");
    return undefined;
  }
  const { slot, key, id, order, label, locale, priority, inject: face, children, component } = registration;
  const options: Record<string, unknown> = { name: slot };
  if (key !== undefined) options.key = key;
  if (id !== undefined) options.id = id;
  if (order !== undefined) options.order = order;
  if (label !== undefined) options.label = label;
  if (locale !== undefined) options.locale = locale;
  if (priority !== undefined) options.priority = priority;
  if (face !== undefined) options.inject = face;
  if (children !== undefined) options.children = children;
  // 落座结果如实回传（fix-10 bug 400b3952 修型）：声明缝同步落座（宿主 slot 已在场的
  // 常态）→ 返回 safeRegisterSection 落座结果——注册撞车降级（undefined）可被调用方
  // `=== undefined` 门如实裁决，boot 日志不再假阳性；声明边迟到激活（slot 未声明，
  // cb 异步触发）→ 返回 inject 撤销器（落座成败随激活期如实留痕）。
  let installed: (() => void) | undefined;
  let settled = false;
  const disposer = inject.call(slots, slot, () => {
    installed = safeRegisterSection(slots, options, component);
    settled = true;
    return installed;
  });
  return settled ? installed : disposer;
}

// ── 宿主 section 消费切片（契约锚；M2 目录节消费面随宿主落地） ──────────────

/** 宿主在场性声明服务名（project 插件具名服务——消费方 apply 期现查锚）。 */
export const PROJECT_SECTION_HOST_SERVICE = "project.sections";

/** 知识库目录节槽名（M2 挂载点；槽名契约由双包快照测试互检——settings-unification 圆桌裁定）。 */
export const KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT = "project.section.knowledge-dir";

/**
 * 宿主 section 服务形状（消费切片预留）：消费方现查 ctx[PROJECT_SECTION_HOST_SERVICE]
 * 在场后，经 whileServed 门控注册 keyed 节（宿主缺席 = 零等待零悬挂——AGENTS 1.6
 * 在场性检测永不缓存、消费点现查）。
 */
export interface ProjectSectionHostFace {
  /** 宿主单点声明的 keyed section 槽名（现值由宿主声明缝给出）。 */
  readonly slot: string;
  /** 在场门控（官方 configForms.whileServed 同型——namespace 未被服务即拆卸）。 */
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
}
