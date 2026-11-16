// commands · 结构化最小面（plugin-forge src/faces.ts 指令/诊断切片直迁——proposal
// plugin-task-loop 任务 1.11；结构化子面，注释标官方形状子集）。

/**
 * 指令执行回执（官方 CommandResult 消费子面）：UI command plane 直接渲染（零模型消息——
 * "The registry itself submits nothing"）；success 的 text 可选、error 恒带 text。
 */
export interface ForgeCommandResult {
  readonly kind: "success" | "error";
  readonly text: string;
}

/** 指令调用入参（官方 CommandInvocation 消费子面）：敲指令会话 + 指令名后原文 + 取消信号 */
export interface ForgeCommandInvocation {
  /** 敲指令会话（官方 Agent 结构子面：id = ownerSessionId 锚——stop 作用域键） */
  readonly agent: unknown;
  /** 指令名后原文（<slug> 直通参数；无参 = 空白） */
  readonly rawInput: string;
  /** 派发 UI 请求的取消信号（官方 invocation.signal——问询透传；缺席 = 无取消通道） */
  readonly signal?: AbortSignal;
}

// 诊断发射面单源：ForgeDiagBase / ForgeDiagPayload / ForgeDiagEmitFace / emitForgeDiag
// 统一收敛到 host/faces.ts 单实现（本文件曾持本地化副本——双实现漂移风险清除）。
export type { ForgeDiagBase, ForgeDiagPayload, ForgeDiagEmitFace } from "../faces.js";
