// loop · 问询收束协议切片（plugin-forge src/loop/escalation.ts 直迁——proposal
// plugin-task-loop 任务 1.11 只迁 askOption + EscalationAskFace + AskOutcome 单选收束协议
// 切片；裁决问询材料渲染与回执面随循环驱动器迁移落位）。
//
// 上游缝（结构化最小面）：@deepseek-ai/dsh-user-questions UserQuestionService.ask(request) —
// questions: AskUserQuestionItem[]（id/question/detail/header/options），agent 可选（活根
// 校验）。本面零上游 import——ask 面由装配方以结构化最小面注入。

/** 问询选项（AskUserQuestionOption 结构化最小面） */
export interface EscalationAskOption {
  readonly label: string;
  readonly description?: string;
}

/** 问询条目（AskUserQuestionItem 结构化最小面） */
export interface EscalationAskQuestion {
  readonly id: string;
  readonly question: string;
  /** 支撑材料（reason 原文 + 处置历史——裁决全文档） */
  readonly detail?: string;
  readonly header?: string;
  readonly options?: readonly EscalationAskOption[];
}

/** ask 面结构化最小面（装配方适配 UserQuestionService.ask——缺席 = 静默降级；
 *  signal 可选透传（官方 ask 支持取消信号——指令面问询随 invocation.signal 挂接）） */
export interface EscalationAskFace {
  ask(request: { readonly questions: readonly EscalationAskQuestion[]; readonly agent?: unknown; readonly signal?: AbortSignal }): Promise<unknown>;
}

/**
 * 单选问询三路收束（userQuestions.ask）：选中 label / 用户取消（关闭面板、ASK_ABORTED、
 * 空应答）/ 问询通道故障（NO_PROVIDER、异常、非活根 assertLiveRoot 拒绝）——故障与取消
 * 分值回传，调用方分别收口。signal 透传官方取消语义。
 * agent 活根定向：无 agent 的 ask 走无主 waterfall，客户端应答器 scopeOf(owner) 取不到
 * 会话即拒接 → NO_PROVIDER「面板从不弹出」。上游契约：携带 agent 时须为注册表精确活根；
 * 非活根异常归故障路明确回执，不静默。
 */
export type AskOutcome =
  | { readonly kind: "selected"; readonly label: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

/** 用户取消判别（上游 ASK_ABORTED 错误码 / AbortError 名；子串匹配——结构化最小面无类型缝） */
function isAskAborted(cause: unknown): boolean {
  const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
  return /ASK_ABORTED|AbortError/i.test(text);
}

/** 单选问询收束（指令面枚举/操作问询与第三层裁决问询共用协议单源） */
export async function askOption(
  ask: EscalationAskFace,
  question: { readonly id: string; readonly header: string; readonly question: string; readonly detail?: string; readonly options: readonly EscalationAskOption[] },
  signal?: AbortSignal,
  agent?: unknown,
): Promise<AskOutcome> {
  let answer: unknown;
  try {
    answer = await ask.ask({
      questions: [
        {
          id: question.id,
          header: question.header,
          question: question.question,
          ...(question.detail !== undefined ? { detail: question.detail } : {}),
          options: question.options,
        },
      ],
      ...(agent !== undefined ? { agent } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (cause) {
    if (isAskAborted(cause)) return { kind: "cancelled" };
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { kind: "failed", reason: reason === "" ? "问询通道异常" : reason };
  }
  const item = (answer as { answers?: readonly { id?: unknown; selected?: unknown }[] } | undefined)?.answers?.find(
    (entry) => entry?.id === question.id,
  );
  const selected = Array.isArray(item?.selected) ? item.selected.filter((s): s is string => typeof s === "string") : [];
  return selected.length > 0 ? { kind: "selected", label: selected[0] as string } : { kind: "cancelled" };
}
