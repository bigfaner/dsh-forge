// task-loop 对话面注册面（1.13 自 @dsh-forge/project ui/conversation-views-face.ts 迁包——
// fix-13 判例：组件迁包而注册代码留壳 = 官方宿主 UI 静默缺失，注册面同批随迁）。
// ① dispatchTask 工具行（tool.call.toolview keyed 'dispatchTask'）② 事件折叠组三段
// （uiConversation.events.register ×2 + conversation.chat.node keyed 'forge-event-group'）。
// ③ worktree 切换闸标记（conversation.input.overlay）属 project 域——留 project 包不迁。
// uiConversation 缺席/定义注册被拒 = 事件组全跳 fail-soft（工具行不受影响）。
// bundle 自含纪律：官方 uiConversation 服务 = 结构同型镜像消费切片（official-seams 同型）。
import { ForgeDispatchToolRow } from "./dispatch-tool-row/DispatchToolRow.js";
import { ForgeEventEntries } from "./event-node/ForgeEventEntries.js";
import {
  FORGE_EVENT_NODE_KIND,
  FORGE_EVENT_NODE_SLOT,
  forgeEventGroupDefinition,
  forgeEventStreamDefinition,
  setForgeEventNodeDiag,
} from "./event-node/forge-event-node.js";
import { tapForgeProgressEvent } from "./event-node/progress-log-tap.js";
import { KEYED_SHADOW_PRIORITY, registerKeyedSection, type SectionSlotsFace } from "./keyed-section.js";
import { FORGE_TASK_LOOP_LOCALE_NS } from "./locale.js";
import { asRecord, type OfficialSeamCtx } from "./official-seams.js";

/** 官方 ui-tool 原子工具行 keyed 槽名（按 wire 工具名分发——未注册名走官方通用行 fallback） */
export const TOOL_CALL_TOOLVIEW_SLOT = "tool.call.toolview";
/** dispatchTask 工具行 keyed 键（= task-loop wire 工具名——plugin-forge FORGE_TOOL_NAMES 单源字面量镜像） */
export const DISPATCH_TASK_TOOL_KEY = "dispatchTask";

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface ConversationToolFacesDiagnostics {
  readonly registered: string[];
}

/**
 * task-loop 对话面注册（apply 编排）：① dispatchTask 工具行；② 事件折叠组三段
 * （stream 状态机[match 旁路 tap] + 组节点定义 + keyed body）。
 * 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
 */
export function registerConversationToolFaces(
  ctx: OfficialSeamCtx,
  slots: SectionSlotsFace,
): ConversationToolFacesDiagnostics {
  const registered: string[] = [];
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace();
      registered.push(name);
    } catch (error) {
      console.warn(`[dsh-forge/task-loop] conversation tool face '${name}' registration failed——降级不注册`, error);
    }
  };

  // ① dispatchTask 对话工具行（keyed 最小面：key = wire 工具名；locale = 行文案 NS）
  face(DISPATCH_TASK_TOOL_KEY, () => {
    if (registerKeyedSection(slots, {
      slot: TOOL_CALL_TOOLVIEW_SLOT,
      key: DISPATCH_TASK_TOOL_KEY,
      locale: FORGE_TASK_LOOP_LOCALE_NS,
      priority: KEYED_SHADOW_PRIORITY,
      component: ForgeDispatchToolRow,
    }) === undefined) throw new Error("slots face unavailable");
  });

  // ② 事件折叠组三段（fail-visible 诊断注入面——client 束豁免面 console.warn）。
  // keyed body = slots 缝，与 uiConversation 服务无依赖，apply 期一次登记；
  // stream 状态机注册经回放录取薄包装（match 纯观察旁路——fold 语义零改动）。
  // registered 诊断 = 定义注册落座事实；uiConversation 属性缺席 = 劣形宿主 fail-soft。
  try {
    setForgeEventNodeDiag((message) => console.warn(message));
    if (registerKeyedSection(slots, {
      slot: FORGE_EVENT_NODE_SLOT,
      key: FORGE_EVENT_NODE_KIND,
      locale: FORGE_TASK_LOOP_LOCALE_NS,
      priority: KEYED_SHADOW_PRIORITY,
      component: ForgeEventEntries,
    }) === undefined) throw new Error("slots face unavailable");
    const streamWithTap = {
      ...forgeEventStreamDefinition,
      match: (event: { readonly type?: unknown; readonly seq?: unknown; readonly data?: unknown }): { id: string; role: "start" } | null => {
        tapForgeProgressEvent(event);
        return forgeEventStreamDefinition.match(event as never);
      },
    };
    const events = asRecord(asRecord((ctx as unknown as { uiConversation?: unknown }).uiConversation)?.["events"]);
    const registerEvents = events?.["register"];
    if (typeof registerEvents !== "function") {
      throw new Error("ctx.uiConversation.events.register absent（静态边缺席 = 劣形宿主 fail-soft）");
    }
    registerEvents.call(events, streamWithTap);
    registerEvents.call(events, forgeEventGroupDefinition);
    registered.push(FORGE_EVENT_NODE_KIND);
  } catch (error) {
    console.warn(`[dsh-forge/task-loop] conversation tool face '${FORGE_EVENT_NODE_KIND}' registration failed——降级不注册`, error);
  }

  return { registered };
}
