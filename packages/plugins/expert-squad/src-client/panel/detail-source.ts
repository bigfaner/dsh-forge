// panel/detail-source —— 详情 Dialog 状态机（ui-design F2 查看/编辑双模式）：框架
// 无关控制器（subscribe/getSnapshot 形状与 useSyncExternalStore 对接，list-source
// 同范式）。保存 = 校验门 → update 路由 → 专家换新回查看态 + Toast 热刷新；启停 =
// enable/disable 路由即时生效；校验失败字段级报错不落盘。

import type { ExpertView } from "./filter.js";
import {
  addSkill,
  draftOf,
  toggleInList,
  validateDraft,
  type ExpertDraft,
} from "./detail-logic.js";

/** 双模式。 */
export type DetailMode = "view" | "edit";

/** 控制器快照（open = Dialog 是否在场）。 */
export interface DetailState {
  readonly open: boolean;
  readonly mode: DetailMode;
  /** 当前呈现的专家（保存/启停成功后原子换新）。 */
  readonly expert: ExpertView;
  /** 编辑草稿（编辑态消费；查看态保持最近草稿）。 */
  readonly draft: ExpertDraft;
  /** 字段级校验错误（空对象 = 通过）。 */
  readonly errors: { readonly title?: string; readonly personaMd?: string };
  /** 在途请求（保存/启停按钮防重）。 */
  readonly busy: boolean;
  /** Toast 文案（热刷新生效 / 启停结果 / 错误透出）。 */
  readonly toast: string | undefined;
}

/** 详情变更缝（update / enable / disable fetch 路由装配面；测试注入替身）。 */
export interface DetailMutations {
  /** 档案 upsert（POST /api/expert-squad/update）；成功返回换新后的档案。 */
  update(name: string, draft: ExpertDraft): Promise<ExpertView>;
  /** 启停切换（POST /api/expert-squad/enable|disable）；成功返回换新后的档案。 */
  setEnabled(name: string, enabled: boolean): Promise<ExpertView>;
}

const IDLE: DetailState["errors"] = {};

/**
 * 详情 Dialog 控制器：open/startEdit/cancelEdit/setField/toggleTool/toggleSkill/
 * addSkill/save/toggleEnabled/close。save 通过校验门才调 update；成功换新专家并
 * 回查看态（Toast「热刷新生效」），失败停留编辑态（Toast 透出错误）；toggleEnabled
 * 即时切换启用态（Toast「已禁用/已启用」）。
 */
export class ExpertDetailController {
  private state: DetailState | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly mutations: DetailMutations) {}

  getSnapshot(): DetailState {
    return (
      this.state ?? {
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
        draft: { title: "", description: "", personaMd: "", tools: [], skills: [] },
        errors: IDLE,
        busy: false,
        toast: undefined,
      }
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 打开 Dialog（查看态；再次 open 重置回查看态——卡片点击语义）。 */
  open(expert: ExpertView): void {
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

  close(): void {
    if (this.state === undefined) return;
    this.state = undefined;
    this.emit();
  }

  /** 进入编辑态（字段预填）。 */
  startEdit(): void {
    if (this.state === undefined) return;
    this.state = { ...this.state, mode: "edit", draft: draftOf(this.state.expert), errors: IDLE };
    this.emit();
  }

  /** 丢弃草稿回查看态。 */
  cancelEdit(): void {
    if (this.state === undefined) return;
    this.state = { ...this.state, mode: "view", errors: IDLE };
    this.emit();
  }

  /** 草稿字段更新（编辑态输入面）。 */
  setField<K extends "title" | "description" | "personaMd">(
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

  /** 保存：校验门 → update 路由 → 回查看态 + Toast 热刷新；失败不落盘。 */
  async save(): Promise<void> {
    const current = this.state;
    if (current === undefined || current.busy || current.mode !== "edit") return;
    const errors = validateDraft(current.draft);
    if (errors.title !== undefined || errors.personaMd !== undefined) {
      this.state = { ...current, errors };
      this.emit();
      return;
    }
    this.state = { ...current, busy: true, errors: IDLE };
    this.emit();
    try {
      const updated = await this.mutations.update(current.expert.name, current.draft);
      this.state = {
        ...this.getSnapshot(),
        expert: updated,
        mode: "view",
        busy: false,
        toast: "档案已保存（热刷新生效）",
      };
    } catch (err) {
      this.state = {
        ...this.getSnapshot(),
        busy: false,
        toast: `保存失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    this.emit();
  }

  /** 启停切换（enable/disable 路由；即时生效换新专家 + Toast）。 */
  async toggleEnabled(): Promise<void> {
    const current = this.state;
    if (current === undefined || current.busy) return;
    const next = !current.expert.enabled;
    this.state = { ...current, busy: true };
    this.emit();
    try {
      const updated = await this.mutations.setEnabled(current.expert.name, next);
      this.state = {
        ...this.getSnapshot(),
        expert: updated,
        busy: false,
        toast: `${updated.name} 已${updated.enabled ? "启用" : "禁用"}`,
      };
    } catch (err) {
      this.state = {
        ...this.getSnapshot(),
        busy: false,
        toast: `启停失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }
}
