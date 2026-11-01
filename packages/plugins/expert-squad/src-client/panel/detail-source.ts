// panel/detail-source —— 详情 Dialog 状态机（ui-design F2 查看/编辑双模式）：框架
// 无关控制器（subscribe/getSnapshot 形状与 useSyncExternalStore 对接，list-source
// 同范式）。保存 = 校验门 → 双写分流（experts 配置缝在场：内容字段走 update 档案径 +
// Agent选项/工具写 experts.<实例ID> 条目——settings 服务 revisioned 正门，不混写；
// 缺席 = 旧装配降级走既有档案径）→ 专家换新回查看态 + Toast 热刷新；启停 =
// experts.<实例ID>.disabled 位写（bug 950b845c：来源级，settings revisioned 缝——旧
// per-workspace 启停径退役）；校验失败字段级报错不落盘。

import { entryIdOf, type ExpertView } from "./filter.js";
import {
  addSkill,
  archiveContentWireOf,
  draftOf,
  expertsEntryOf,
  isContentDirty,
  toggleInList,
  validateDraft,
  wireDraft,
  type ExpertDraft,
  type ExpertsEntryPatch,
  type ExpertWireDraft,
} from "./detail-logic.js";

/** 三模式（1.61 裁决③：查看/编辑/两两对比——对比只读，退出回查看态）。 */
export type DetailMode = "view" | "edit" | "compare";

/**
 * Esc 键纯决策（bug f4020406 ⑤：对比态 Esc 先退对比回查看态，再按才关 Dialog；
 * 查看/编辑态 Esc 关 Dialog）。
 */
export function escNext(mode: DetailMode): "exitCompare" | "close" {
  return mode === "compare" ? "exitCompare" : "close";
}

/** 控制器快照（open = Dialog 是否在场）。 */
export interface DetailState {
  readonly open: boolean;
  readonly mode: DetailMode;
  /** 当前呈现的专家（保存/启停成功后原子换新）。 */
  readonly expert: ExpertView;
  /** 编辑草稿（编辑态消费；查看态保持最近草稿）。 */
  readonly draft: ExpertDraft;
  /** 字段级校验错误（空对象 = 通过）。 */
  readonly errors: {
    readonly title?: string;
    readonly personaMd?: string;
    readonly provider?: string;
    readonly model?: string;
  };
  /** 在途请求（保存/启停按钮防重）。 */
  readonly busy: boolean;
  /** Toast 文案（热刷新生效 / 启停结果 / 错误透出）。 */
  readonly toast: string | undefined;
  /**
   * 两两对比对象（compare 态消费）。Root cause（bug f4020406）：曾存整条 ExpertView
   * 快照——轮询换新后快照陈旧、对比表读旧值。改存 origin（稳定判别键），渲染时由
   * Dialog 从同键最新条目重解析（sameKeyEntries），对比表随轮询自动换新。
   */
  readonly compareTargetOrigin?: string;
}

/** 详情变更缝（update 档案径 / experts 配置写 fetch 路由装配面；测试注入替身）。 */
export interface DetailMutations {
  /** 档案 upsert（POST /api/expert-squad/update）；成功返回换新后的档案。载荷 = 路由归一形态（provider/model 空串归缺键）。 */
  update(name: string, draft: ExpertWireDraft): Promise<ExpertView>;
  /**
   * experts.<实例ID> 条目写（settings 服务 revisioned 正门——装配侧经官方 configForms
   * 现读 experts 映射、浅合并本条目后整字段 set；disabled/skills 位保留，agentOptions
   * 与 tools 整组替换）。可选缝：缺席 = 旧装配降级，保存走既有档案径（wireDraft）。
   * bug 950b845c：启停亦归此缝（experts.<实例ID>.disabled 位）——旧 per-workspace
   * enable/disable 启停径从 Dialog 面退役（setEnabled 工作区径不再被 Dialog 消费）。
   */
  writeExpertsConfig?(instanceId: string, entry: ExpertsEntryPatch): Promise<void>;
}

/**
 * 专家实例 ID 取法（experts 配置映射寻址键——list 应答逐条透出 instanceId
 * （registry ExpertEntry），ExpertView 类型面未声明故经记录窄化；缺席 = undefined
 * （旧宿主载荷漂移——保存时 fail-loud，不静默丢路由覆写））。
 */
export function configKeyOf(entry: ExpertView): string | undefined {
  const id = (entry as { instanceId?: unknown }).instanceId;
  return typeof id === "string" && id !== "" ? id : undefined;
}

const IDLE: DetailState["errors"] = {};

/** Toast 自动消失时长（3s——一次性提示不自留；错误 toast 同径，重操作会再出新 toast）。 */
export const TOAST_AUTO_DISMISS_MS = 3000;

/** 关闭态缺省快照（引用稳定单例——useSyncExternalStore 快照契约，见 getSnapshot 注记）。 */
const IDLE_SNAPSHOT: DetailState = {
  open: false,
  mode: "view",
  expert: {
    name: "",
    title: "",
    description: "",
    personaMd: "",
    tools: [],
    skills: [],
    origin: "",
    enabled: false,
  },
  draft: { title: "", description: "", personaMd: "", tools: [], skills: [], provider: "", model: "", reasoning: "" },
  errors: IDLE,
  busy: false,
  toast: undefined,
};

/**
 * 详情 Dialog 控制器：open/startEdit/cancelEdit/setField/toggleTool/toggleSkill/
 * addSkill/save/toggleEnabled/close。save 通过校验门才调 update；成功换新专家并
 * 回查看态（Toast「热刷新生效」），失败停留编辑态（Toast 透出错误）；toggleEnabled
 * 即时切换启用态（Toast「已禁用/已启用」）。
 */
export class ExpertDetailController {
  private state: DetailState | undefined;
  private readonly listeners = new Set<() => void>();
  // 代际计数（list-source.ts 同法先例）：open/close 各换代一次，save/toggleEnabled
  // 在途回包按发出时代号比对——过期回包不落态（bug e234f626：A 回包覆盖 B state、
  // 关闭态回包破坏 IDLE 单例契约——busy 只防同代并发，不作废在途）。
  private generation = 0;
  // 失靶守卫旗（bug 13f807c4）：stale 由 Dialog 渲染期派生（sameKeyEntries 是否含打开
  // 条目——控制器不持装配数据），经 setStale 通知回落；save/toggleEnabled 据此短路——
  // UI disabled 只是渲染面，控制器层短路面防入口绕过（update 为 upsert，放行即复活已删条目）。
  private stale = false;
  // Toast 自动消失定时器（单飞——新 toast 出场即重置；关闭态到点为无害 no-op）
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly mutations: DetailMutations) {}

  getSnapshot(): DetailState {
    // 关闭态返回引用稳定单例（useSyncExternalStore 快照契约：每次调用同引用——
    // 新对象字面量会被判为快照变化 → 无限重渲染 React #185，面板恒骨架，fix-4）
    return this.state ?? IDLE_SNAPSHOT;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 打开 Dialog（查看态；再次 open 重置回查看态——卡片点击语义）。 */
  open(expert: ExpertView): void {
    this.generation += 1; // 换代：作废上一代在途回写
    this.stale = false; // 守卫旗随代重置（重开由渲染期重新派生）
    this.state = {
      open: true,
      mode: "view",
      expert,
      draft: draftOf(expert),
      errors: IDLE,
      busy: false,
      toast: undefined,
    };
    this.emit();
  }

  /**
   * 失靶守卫旗回落（bug 13f807c4）：Dialog 渲染期派生 stale 后调用。不改快照对象
   * （stale 不入 DetailState——快照由装配 props 派生，入快照即双写漂移），故不 emit；
   * 等值短路保证渲染期重复调用无副作用。
   */
  setStale(stale: boolean): void {
    if (this.stale === stale) return;
    this.stale = stale;
  }

  close(): void {
    if (this.state === undefined) return;
    this.generation += 1; // 换代：关闭态在途回包不落态（IDLE 单例契约保持）
    this.stale = false; // 守卫旗随代重置（重开由渲染期重新派生）
    if (this.toastTimer !== undefined) {
      clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }
    this.state = undefined;
    this.emit();
  }

  /** 进入编辑态（字段预填；对比态先回查看——对比目标清空）。 */
  startEdit(): void {
    if (this.state === undefined) return;
    this.state = {
      ...this.state,
      mode: "edit",
      draft: draftOf(this.state.expert),
      errors: IDLE,
      compareTargetOrigin: undefined,
    };
    this.emit();
  }

  /** 进入两两对比态（1.61 裁决③：仅查看态可入；只存靶条目身份 entryIdOf（sourcePath）
   *  ——同 origin 多份内置注册下 origin 不足以定位；渲染时重解析最新条目）。 */
  startCompare(target: ExpertView): void {
    if (this.state === undefined || this.state.mode !== "view") return;
    this.state = { ...this.state, mode: "compare", compareTargetOrigin: entryIdOf(target) };
    this.emit();
  }

  /** 对比对象单选切换（compare 态内；单值换靶——禁三列并排；只存身份渲染时重解析）。 */
  selectCompareTarget(target: ExpertView): void {
    if (this.state === undefined || this.state.mode !== "compare") return;
    this.state = { ...this.state, compareTargetOrigin: entryIdOf(target) };
    this.emit();
  }

  /** 退出对比回查看态（对比对象清空）。 */
  exitCompare(): void {
    if (this.state === undefined || this.state.mode !== "compare") return;
    this.state = { ...this.state, mode: "view", compareTargetOrigin: undefined };
    this.emit();
  }

  /** 丢弃草稿回查看态。 */
  cancelEdit(): void {
    if (this.state === undefined) return;
    this.state = { ...this.state, mode: "view", errors: IDLE };
    this.emit();
  }

  /** 草稿字段更新（编辑态输入面）。 */
  setField<K extends "title" | "description" | "personaMd" | "provider" | "model" | "reasoning">(
    field: K,
    value: ExpertDraft[K],
  ): void {
    if (this.state === undefined) return;
    this.state = { ...this.state, draft: { ...this.state.draft, [field]: value } };
    this.emit();
  }

  /** 工具白名单勾选/取消。 */
  toggleTool(tool: string): void {
    if (this.state === undefined) return;
    this.state = {
      ...this.state,
      draft: { ...this.state.draft, tools: toggleInList(this.state.draft.tools, tool) },
    };
    this.emit();
  }

  /** 技能勾选/取消。 */
  toggleSkill(skill: string): void {
    if (this.state === undefined) return;
    this.state = {
      ...this.state,
      draft: { ...this.state.draft, skills: toggleInList(this.state.draft.skills, skill) },
    };
    this.emit();
  }

  /** 技能新增（multi-select allowAdd 面）。 */
  appendSkill(value: string): void {
    if (this.state === undefined) return;
    this.state = {
      ...this.state,
      draft: { ...this.state.draft, skills: addSkill(this.state.draft.skills, value) },
    };
    this.emit();
  }

  /** Toast 3s 自动消失（同文案到点才清——新 toast 重置计时；关闭态到点 no-op）。 */
  private scheduleToastDismiss(text: string): void {
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (this.state !== undefined && this.state.toast === text) {
        this.state = { ...this.state, toast: undefined };
        this.emit();
      }
    }, TOAST_AUTO_DISMISS_MS);
  }

  /** 保存：校验门 → update 路由 → 回查看态 + Toast 热刷新；失败不落盘。 */
  async save(): Promise<void> {
    const current = this.state;
    // bug 13f807c4：stale（条目已被删）短路——update 为 upsert，放行即复活已删条目
    if (current === undefined || current.busy || current.mode !== "edit" || this.stale) return;
    const errors = validateDraft(current.draft);
    if (
      errors.title !== undefined ||
      errors.personaMd !== undefined ||
      errors.provider !== undefined ||
      errors.model !== undefined
    ) {
      this.state = { ...current, errors };
      this.emit();
      return;
    }
    this.state = { ...current, busy: true, errors: IDLE };
    this.emit();
    const generation = this.generation;
    try {
      // 写径分流（experts 配置缝在场 = 双写不混写；缺席 = 旧装配降级走既有档案径）：
      // 内容差异检测前置（bug 7ca12bc8，字段归属矩阵见 detail-logic CONTENT_HALF_FIELDS）：
      // · 内容半全等 → 跳过 update，仅写配置半——档案零改动，内置专家来源保持「内置」；
      // · 内容半任一不等 → update（内置升级 user 层副本、来源翻「用户」）+ 配置半照常
      //   双写同锚（e9eb4ac5 语义不变）；
      // · 配置半（provider/model/reasoning/tools/skills）：写 experts.<实例ID> 条目
      //   （settings 服务 revisioned；逐项清空 = 键归缺 = 回退档案值）。
      const writeConfig = this.mutations.writeExpertsConfig;
      let updated: ExpertView;
      if (writeConfig === undefined) {
        // wireDraft：provider/model trim 后空串归缺键——不落半组、清空两字段即回落继承
        updated = await this.mutations.update(current.expert.name, wireDraft(current.draft));
      } else {
        const contentDirty = isContentDirty(current.draft, current.expert);
        // 档案锚：内容半脏才走 update 档案径；纯路由 = 保持现视图（零档案写）
        const anchor = contentDirty
          ? await this.mutations.update(
              current.expert.name,
              archiveContentWireOf(current.draft, current.expert),
            )
          : current.expert;
        // 配置写锚（bug 66908627 双写同锚）：内容半写径发生时随 update 回包换新视图
        // （内置被 user 层副本遮蔽后生效实例 ID 已漂移）；纯路由 = 现视图（无漂移）。
        await this.writeConfigOrThrow(anchor, current.draft);
        // 所见即所得补折（list 轮询前的即时呈现）：锚视图档案半未含 experts 折叠——
        // 条目有值的位就地覆盖（清空位保留锚视图的档案值 = 回退语义同构）。
        const patch = expertsEntryOf(current.draft);
        updated = {
          ...anchor,
          provider: patch.agentOptions?.provider ?? anchor.provider,
          model: patch.agentOptions?.model ?? anchor.model,
          reasoning: patch.agentOptions?.reasoning ?? anchor.reasoning,
          tools: patch.tools ?? anchor.tools,
          skills: patch.skills ?? anchor.skills,
        };
      }
      if (generation !== this.generation) return; // 迟到回包：换代后不落态
      const toast = "档案已保存（热刷新生效）";
      this.state = { ...this.getSnapshot(), expert: updated, mode: "view", busy: false, toast };
      this.scheduleToastDismiss(toast);
    } catch (err) {
      if (generation !== this.generation) return; // 迟到回包：换代后不落态
      const toast = `保存失败：${err instanceof Error ? err.message : String(err)}`;
      this.state = { ...this.getSnapshot(), busy: false, toast };
      this.scheduleToastDismiss(toast);
    }
    this.emit();
  }

  /**
   * experts 条目写（配置缝径；实例 ID 缺席 = fail-loud——路由覆写丢写即显示失真，
   * 静默跳过违反所见即所得）。返回档案换新条目（update 回包透传）。
   */
  private async writeConfigOrThrow(
    expert: ExpertView,
    draft: ExpertDraft,
  ): Promise<ExpertView> {
    const write = this.mutations.writeExpertsConfig;
    if (write === undefined) return expert; // 不可达（save 分流保证）——类型收窄面
    const key = configKeyOf(expert);
    if (key === undefined) {
      throw new Error(`缺少专家实例 ID（instanceId），无法写路由覆写：${expert.name}`);
    }
    await write(key, expertsEntryOf(draft));
    return expert;
  }

  /**
   * 启停切换（bug 950b845c：写 experts.<实例ID>.disabled 位——settings 服务 revisioned
   * 缝，来源级对所有工作区生效；旧 per-workspace enable/disable 径不再被 Dialog 消费）。
   * 即时生效换新专家 + Toast；配置缝缺席/实例 ID 缺席 = fail-loud Toast 不落位。
   */
  async toggleEnabled(): Promise<void> {
    const current = this.state;
    if (current === undefined || current.busy || this.stale) return; // stale 短路（bug 13f807c4，同 save）
    const write = this.mutations.writeExpertsConfig;
    const key = configKeyOf(current.expert);
    if (write === undefined || key === undefined) {
      const toast =
        write === undefined
          ? "启停写径不可用（experts 配置缝缺席）——无法写来源级禁用位"
          : `缺少专家实例 ID（instanceId），无法写禁用位：${current.expert.name}`;
      this.state = { ...current, busy: false, toast };
      this.scheduleToastDismiss(toast);
      this.emit();
      return;
    }
    const next = !current.expert.enabled;
    this.state = { ...current, busy: true };
    this.emit();
    const generation = this.generation;
    try {
      await write(key, { disabled: !next });
      if (generation !== this.generation) return; // 迟到回包：换代后不落态
      const toast = `${current.expert.name} 已${next ? "启用" : "禁用"}`;
      this.state = {
        ...this.getSnapshot(),
        expert: { ...current.expert, enabled: next },
        busy: false,
        toast,
      };
      this.scheduleToastDismiss(toast);
    } catch (err) {
      if (generation !== this.generation) return; // 迟到回包：换代后不落态
      const toast = `启停失败：${err instanceof Error ? err.message : String(err)}`;
      this.state = { ...this.getSnapshot(), busy: false, toast };
      this.scheduleToastDismiss(toast);
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }
}
