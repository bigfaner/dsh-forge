// 对话面注册面（定位：装配——1.43 自 apps/web 壳侧 plugin.ts 迁入本包的 worktree 切换闸
// 虚线标记行；1.13 迁移退役：① dispatchTask 工具行与 ② 事件折叠组三段随六组件迁批迁
// @dsh-forge/task-loop（ui/conversation-views-face.ts），本面只余 ③ worktree 切换闸标记
// （project 域承接——bug 267dcac1 纯视觉命中锚）。
// bundle 自含纪律：官方 uiConversation 服务 = 结构同型镜像消费切片（official-seams 同型）。
import { ForgeWorktreeSwitchMarker } from "./worktree-picker/picker.js";
import { registerKeyedSection, type SectionSlotsFace } from "./keyed-section.js";

/** 官方 composer 区 overlay 缝名（InputBar overlayAnchor——input 元素上方官方缝） */
export const CONVERSATION_INPUT_OVERLAY_SLOT = "conversation.input.overlay";
/** worktree 切换闸虚线标记 overlay 登记 id（bug 267dcac1——纯视觉命中锚，禁输行为归官方 conversation.blocks 缝） */
export const WORKTREE_SWITCH_ENTRY_ID = "dswf-worktree-switch";

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface ConversationToolFacesDiagnostics {
  readonly registered: string[];
}

/**
 * 对话面注册（apply 编排）：worktree 切换闸虚线标记行（官方 cardWorkspaceTrigger 同配方
 * dashed 规则 :has 命中宿主卡；禁输行为全归官方 conversation.blocks 缝，本行纯视觉）。
 * 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
 */
export function registerConversationToolFaces(
  ctx: unknown,
  slots: SectionSlotsFace,
): ConversationToolFacesDiagnostics {
  void ctx;
  const registered: string[] = [];
  try {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_INPUT_OVERLAY_SLOT,
      id: WORKTREE_SWITCH_ENTRY_ID,
      component: ForgeWorktreeSwitchMarker,
    }) === undefined) throw new Error("slots face unavailable");
    registered.push(WORKTREE_SWITCH_ENTRY_ID);
  } catch (error) {
    console.warn(`[dsh-forge/project] conversation tool face '${WORKTREE_SWITCH_ENTRY_ID}' registration failed——降级不注册`, error);
  }
  return { registered };
}
