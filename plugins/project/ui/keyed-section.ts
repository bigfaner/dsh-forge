// keyed section 插槽扩展点 —— tab keyed 占用者模式泛化（1.16）。tab 面先例
// （sidebar.right.pane.tab keyed 'dswf-bug'——BugPreview）的装载形态收拢为单一登记契约：
// 目标槽声明缝（官方 SlotRegistry.inject——「声明在场（或入座）即装」随 fiber 卸载级联）
// + keyed 占用者落座（官方 SlotCore.register——keyed 槽按 key 唯一、同 cell 同 priority
// 再注册抛错）。消费面（插件页双缝配置节 ui/settings-section）与本扩展点同型——
// 泛化后新 keyed/list 型节只写声明行，不复制装载样板。
//
// M2 预留（settings-unification 提案 settings-unification/proposal.md 圆桌裁定）：
// 知识库目录节接口——keyed section 插槽的在场性由宿主（project）单点声明；knowledge 等
// 消费方 apply 期现查 project 具名服务（PROJECT_SECTION_HOST_SERVICE）在场才注册插槽
// （whileServed 门控 + 宿主在场性声明）——project 缺席时零等待零悬挂；槽名/形状契约由
// 双包快照测试互检，不靠运行期超时。本批只落契约常量与形状，挂载实现随 M2。
// bundle 自含纪律：零上游 import（结构与 @deepseek-ai/dsh-client-ui-slots 消费切片同型镜像）。

/** keyed/list 型节登记契约（泛化自 tab keyed 占用者两段注册——slot+kind options 逐字透传）。 */
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
  /** 节组件本体（官方五份额组合 props 契约——本扩展点零裁剪透传）。 */
  readonly component: unknown;
}

/** 官方 slots 服务消费切片（结构同型镜像——bundle 自含零上游 import）。 */
export interface SectionSlotsFace {
  /** 槽声明缝：声明在场（或入座）即装 cb；cb 返回释放器随 fiber 卸载级联。 */
  inject?(key: string, callback: () => (() => void) | undefined): (() => void) | undefined;
  /** 注册占用者（options.name = 槽名；key/id/order/label/priority = kind 形状字段）。 */
  register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
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
    console.error("[dsh-forge/project] keyed section registration failed——降级不注册", error);
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
    console.warn("[dsh-forge/project] ctx.slots.inject absent; keyed section not mounted");
    return undefined;
  }
  const { slot, key, id, order, label, locale, priority, inject: face, component } = registration;
  const options: Record<string, unknown> = { name: slot };
  if (key !== undefined) options.key = key;
  if (id !== undefined) options.id = id;
  if (order !== undefined) options.order = order;
  if (label !== undefined) options.label = label;
  if (locale !== undefined) options.locale = locale;
  if (priority !== undefined) options.priority = priority;
  if (face !== undefined) options.inject = face;
  return inject.call(slots, slot, () => safeRegisterSection(slots, options, component));
}

// ── M2 预留：知识库目录节（本批契约锚，零运行时行为） ──────────────

/** 宿主在场性声明服务名（project 插件具名服务——knowledge 消费方 apply 期现查锚）。 */
export const PROJECT_SECTION_HOST_SERVICE = "project.sections";

/** 知识库目录节槽名（M2 挂载点；槽名契约由双包快照测试互检——settings-unification 圆桌裁定）。 */
export const KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT = "project.section.knowledge-dir";

/**
 * 宿主 section 服务形状（M2 消费切片预留）：knowledge 现查 ctx[PROJECT_SECTION_HOST_SERVICE]
 * 在场后，经 whileServed 门控注册 keyed 目录节（宿主缺席 = 零等待零悬挂——AGENTS 1.6
 * 在场性检测永不缓存、消费点现查）。
 */
export interface ProjectSectionHostFace {
  /** 宿主单点声明的 keyed section 槽名（现值 = KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT）。 */
  readonly slot: string;
  /** 在场门控（官方 configForms.whileServed 同型——namespace 未被服务即拆卸）。 */
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
}
