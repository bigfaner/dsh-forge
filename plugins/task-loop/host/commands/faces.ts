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

/** 诊断发射基础载荷（host emitDiag DiagEventPayload 结构子面——process 进程位由发射缝补齐） */
export interface ForgeDiagBase {
  readonly level: "info" | "warn" | "error";
  /** 诊断事件类别（功能域前缀命名） */
  readonly event: string;
  readonly message: string;
  readonly projectId?: string;
  readonly sessionId?: string;
}

/** 诊断发射载荷（基础面 + 就地可得扩展字段——index signature 透传） */
export interface ForgeDiagPayload extends ForgeDiagBase {
  readonly [key: string]: unknown;
}

/** 注入式诊断发射缝（装配期注入——ctx.emit 类型化闭包） */
export type ForgeDiagEmitFace = (payload: ForgeDiagPayload) => void;

/**
 * 注入式诊断缝发射（本地化 emitForgeDiag——缝在场 → 透传；缝缺席或发射失败 → 按级分流
 * console 兜底（error→console.error、其余→console.warn——诊断不静默）。fire-and-forget：
 * 兜底自身永不抛（诊断面零反压业务）。
 */
export function emitForgeDiag(diag: ForgeDiagEmitFace | undefined, payload: ForgeDiagPayload): void {
  if (diag !== undefined) {
    try {
      diag(payload);
      return;
    } catch {
      // 发射失败 → 兜底（诊断不静默）
    }
  }
  const line = `[${payload.event}] ${payload.message}`;
  if (payload.level === "error") console.error(line);
  else console.warn(line);
}
