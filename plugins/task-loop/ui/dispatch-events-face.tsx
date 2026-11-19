// DispatchEventsPanel 改缝注册面（1.13——ui-slots.md §② 例外面收口：壳 ShellHost overlay
// 常驻树直挂退役，改官方缝挂载——候选缝核销后定形 = `conversation.session.header.utilities`
// [official-seams.ts 槽面核销 2026-11：kind list / scope session / owner 会话头 utilities
// 带]；本面 = 悬浮面板本体挂该缝，几何仍锚官方对话区真盒，可见性随投影判读）。
// 数据通道零改型：账本行 projectionValues['forge-dispatch-events'] 窄读 + 官方 sessions
// store subscribe（ctx.get('sessions').list——inject 期现查，AGENTS 1.6 检测永不缓存）。
// 机检锚：壳 overlay 树零 forge 派发残留 + 本包 dist/client 零 window.dshForge 引用。
import { type ReactNode } from "react";
import { DispatchEventsPanel } from "./dispatch-events-panel/DispatchEventsPanel.js";
import { SESSION_HEADER_UTILITIES_SLOT, type OfficialSeamCtx } from "./official-seams.js";
import { registerKeyedSection, type SectionSlotsFace } from "./keyed-section.js";

/** 本缝登记 id（list 行键——单装/集成双宿主同键） */
export const DISPATCH_EVENTS_ENTRY_ID = "dswf-dispatch-events";

/** 会话账本快照源窄面（官方 sessions.list 消费切片——SnapshotSource 同型镜像） */
interface SessionsStoreFace {
  getSnapshot(): unknown;
  subscribe(listener: () => void): () => void;
}

/** 官方 sessions 服务窄面（ctx.get('sessions') 消费切片——list = store 本体） */
interface SessionsServiceFace {
  readonly list?: SessionsStoreFace;
}

/** 官方 uiWorkspace 服务窄面（openSession 动作面——行点击 worker 子会话直跳） */
interface UiWorkspaceFace {
  openSession(target: string): void;
}

/** owner props sessionId 窄读（会话 scope 缝 owner 面形状容忍——缺席 = 面不出场 fail-soft） */
function sessionIdOf(ownerProps: Record<string, unknown>): string | undefined {
  const direct = ownerProps["sessionId"];
  if (typeof direct === "string" && direct !== "") return direct;
  const session = ownerProps["session"];
  if (typeof session === "object" && session !== null) {
    const id = (session as Record<string, unknown>)["id"];
    if (typeof id === "string" && id !== "") return id;
  }
  return undefined;
}

/** utilities 缝 seat（挂载点组装：owner sessionId + inject face 数据/动作面 → 面板本体） */
export function DispatchEventsSeat(props: Record<string, unknown>): ReactNode {
  const sessionId = sessionIdOf(props);
  const sessions = props["sessions"] as SessionsStoreFace | undefined;
  if (sessionId === undefined || sessions === undefined) return null;
  const onOpenWorkerSession = props["onOpenWorkerSession"];
  return (
    <DispatchEventsPanel
      sessionId={sessionId}
      sessions={sessions as never}
      {...(typeof onOpenWorkerSession === "function" ? { onOpenWorkerSession: onOpenWorkerSession as (child: string, parent?: string) => void } : {})}
    />
  );
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface DispatchEventsFaceDiagnostics {
  readonly registered: string[];
}

/**
 * DispatchEventsPanel 改缝注册（apply 编排）：`conversation.session.header.utilities`
 * list 行登记（sessions/uiWorkspace 服务 inject 时点现查——官方服务惰性实例化，apply 点
 * undefined 被闭包缓存 → 挂载点现查命中补挂，bug fba7913c 同径）；服务缺席 = 数据面
 * 整体缺键 → 面不出场（fail-soft 不炸装配）。
 */
export function registerDispatchEventsFace(ctx: OfficialSeamCtx, slots: SectionSlotsFace): DispatchEventsFaceDiagnostics {
  const registered: string[] = [];
  try {
    if (registerKeyedSection(slots, {
      slot: SESSION_HEADER_UTILITIES_SLOT,
      id: DISPATCH_EVENTS_ENTRY_ID,
      inject: () => {
        // 消费点现查（apply 期闭包缓存退役——bug fba7913c 同径）
        const sessions = (ctx.get("sessions") as SessionsServiceFace | undefined)?.list;
        const uiWorkspace = ctx.get("uiWorkspace") as UiWorkspaceFace | undefined;
        return {
          ...(sessions !== undefined ? { sessions } : {}),
          ...(sessions !== undefined && uiWorkspace !== undefined
            ? {
                onOpenWorkerSession: (childSessionId: string): void => {
                  uiWorkspace.openSession(childSessionId);
                },
              }
            : {}),
        };
      },
      component: DispatchEventsSeat,
    }) === undefined) throw new Error("slots face unavailable");
    registered.push(DISPATCH_EVENTS_ENTRY_ID);
  } catch (error) {
    console.warn(`[dsh-forge/task-loop] dispatch events face '${DISPATCH_EVENTS_ENTRY_ID}' registration failed——降级不注册`, error);
  }
  return { registered };
}
