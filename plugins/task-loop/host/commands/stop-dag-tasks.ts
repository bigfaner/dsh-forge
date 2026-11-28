// commands · /stop-dag-tasks 指令 handler（plugin-forge src/commands/stop-dag-tasks.ts 直迁
// ——proposal plugin-task-loop 任务 1.11；slug 化：回执 slug 单轨措辞）。
// 无参直停同一会话（ownerSessionId = 敲指令会话）启动的活循环——取消 in-flight + 收口
// 叙述 + 循环终态全归驱动器 stop 面；本 handler 只做会话作用域透传与回执。本会话无活循环
// = no-op 文本「本会话没有派发任务」，不附归属、不误停其它会话循环（跨会话隔离判定在
// 驱动器 registry.byOwner）。
import type { ForgeCommandInvocation, ForgeCommandResult, ForgeDiagEmitFace } from "./faces.js";
import { emitForgeDiag } from "../faces.js";
import type { LoopDriver } from "../loop/driver-face.js";

/** 本会话无活循环的 no-op 回执（逐字口径——零归属信息） */
export const NO_ACTIVE_LOOP_TEXT = "本会话没有派发任务";

export interface StopDagTasksDeps {
  readonly driver: LoopDriver;
  /** 诊断发射缝（打断失败 fail-soft 告警走 diag 面；缺席 = console 按级兜底） */
  readonly diag?: ForgeDiagEmitFace;
}

/** handler（ForgeCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createStopDagTasksHandler(
  deps: StopDagTasksDeps,
): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async ({ agent }: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    // agent 结构化鸭子读（官方 Agent 子面：session.id / status / cancel——零上游 import）
    const duck = agent as
      | {
          readonly session?: { readonly id?: string };
          readonly status?: string;
          readonly cancel?: (input: unknown, options?: unknown) => void;
        }
      | undefined;
    const sessionId = duck?.session?.id ?? "";
    // 停止即打断（bug a098e20c——回执被在途 owner 模型轮压住）：owner 会话模型轮在途时
    // 先以官方 Agent.cancel 打断（keepInbox: true——queued/steering 输入保留），在途轮让渡
    // 后 stop 收口与回执才落在重试窗口内；官方 cancel 对空闲 agent 是 no-op，故仅在
    // status==='running' 且 cancel 面在场时触发（结构化子面 fail-soft）。
    if (duck?.cancel !== undefined && duck.status === "running") {
      try {
        duck.cancel({ kind: "user" }, { keepInbox: true });
      } catch (cause) {
        emitForgeDiag(deps.diag, {
          level: "warn",
          event: "forge-stop-dag-tasks",
          message: `forge stop-dag-tasks: interrupt in-flight turn failed (fail-soft, stop continues): ${cause instanceof Error ? cause.message : String(cause)}`,
          sessionId,
        });
      }
    }
    // 停止作用域键 = 敲指令会话——驱动器按归属拒绝他会话循环
    const record = deps.driver.activeOf(sessionId);
    const result = await deps.driver.stop({ ownerSessionId: sessionId });
    if (!result.ok) {
      return { kind: "success", text: NO_ACTIVE_LOOP_TEXT };
    }
    const slug = record?.source.slug;
    const inflight = result.hadInFlight ? "，正在执行的任务已暂停，下次派发会继续" : "";
    return { kind: "success", text: `已停止${slug !== undefined ? `容器 ${slug} 的` : ""}派发循环${inflight}` };
  };
}
