// loop · 第三层人工裁决挂钩（S1c——LoopEscalationHook 实装，userQuestions 面接线）。
// 处置重试超限 / 同任务处置计数封顶 / fix 链深到顶 / worker 异常终止超限 / 死锁 / halted →
// userQuestions.ask 直达用户裁决（proposal §1.4 第三层）——不经主会话（decisions #16：主会话
// 仅感知，裁决一律问询 UI）。裁决收束后回执经 notifyReceipt 送达主会话（闭环断环修复
// 2026-10-13：用户定罪「人已答、主会话无回复」——裁决绕主会话，回执不绕）。
//
// 问询载荷纪律（AC）：reason 原文 + 处置历史全文进问询 detail（叙述面仅摘要——decisions #24
// 分级呈现第三档 = 裁决问询全文）。问询 fail-soft：ask 面缺席/拒绝 = console.warn 降级，
// 绝不拖垮循环终态收口（SC7「注入失败循环照常结束」同源纪律）。
//
// 上游缝（结构化最小面）：@deepseek-ai/dsh-user-questions UserQuestionService.ask(request) —
// questions: AskUserQuestionItem[]（id/question/detail/header/options），agent 可选（活根
// 校验）。本面零 @deepseek-ai import（boundaries 白名单单点在 spawn driver）——ask 面由装配
// 方以结构化最小面注入（reflect.get('userQuestions') 防御读取配方，R3）。
import type { LoopEscalation, LoopEscalationHook } from './driver.js'

/** 问询选项（AskUserQuestionOption 结构化最小面） */
export interface EscalationAskOption {
  readonly label: string
  readonly description?: string
}

/** 问询条目（AskUserQuestionItem 结构化最小面） */
export interface EscalationAskQuestion {
  readonly id: string
  readonly question: string
  /** 支撑材料（reason 原文 + 处置历史——裁决全文档） */
  readonly detail?: string
  readonly header?: string
  readonly options?: readonly EscalationAskOption[]
}

/** ask 面结构化最小face（装配方适配 UserQuestionService.ask——缺席 = 静默降级；
 *  signal 可选透传（官方 ask 支持取消信号——S2 指令面问询随 invocation.signal 挂接）） */
export interface EscalationAskFace {
  ask(request: { readonly questions: readonly EscalationAskQuestion[]; readonly agent?: unknown; readonly signal?: AbortSignal }): Promise<unknown>
}

/**
 * 单选问询三路收束（userQuestions.ask）：选中 label / 用户取消（关闭面板、ASK_ABORTED、
 * 空应答）/ 问询通道故障（NO_PROVIDER、异常、非活根 assertLiveRoot 拒绝）——故障与取消
 * 分值回传，调用方分别收口（1.12 三路收敛文案拆分）。signal 透传官方取消语义。
 * agent 活根定向（1.12 定罪修复，2026-10-11）：无 agent 的 ask 走无主 waterfall，客户端
 * 应答器 scopeOf(owner) 取不到会话即拒接 → NO_PROVIDER「面板从不弹出」。上游契约：携带
 * agent 时须为注册表精确活根；非活根异常归故障路明确回执，不静默。
 */
export type AskOutcome =
  | { readonly kind: 'selected'; readonly label: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: string }

/** 用户取消判别（上游 ASK_ABORTED 错误码 / AbortError 名；子串匹配——结构化最小面无类型缝） */
function isAskAborted(cause: unknown): boolean {
  const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause)
  return /ASK_ABORTED|AbortError/i.test(text)
}

/** 单选问询收束（指令面枚举/操作问询与第三层裁决问询共用协议单源） */
export async function askOption(
  ask: EscalationAskFace,
  question: { readonly id: string; readonly header: string; readonly question: string; readonly detail?: string; readonly options: readonly EscalationAskOption[] },
  signal?: AbortSignal,
  agent?: unknown,
): Promise<AskOutcome> {
  let answer: unknown
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
    })
  } catch (cause) {
    if (isAskAborted(cause)) return { kind: 'cancelled' }
    const reason = cause instanceof Error ? cause.message : String(cause)
    return { kind: 'failed', reason: reason === '' ? '问询通道异常' : reason }
  }
  const item = (answer as { answers?: readonly { id?: unknown; selected?: unknown }[] } | undefined)?.answers?.find(
    (entry) => entry?.id === question.id,
  )
  const selected = Array.isArray(item?.selected) ? item.selected.filter((s): s is string => typeof s === 'string') : []
  return selected.length > 0 ? { kind: 'selected', label: selected[0] as string } : { kind: 'cancelled' }
}

/** 第三层挂钩依赖 */
export interface UserQuestionsEscalationDeps {
  /** userQuestions.ask 结构化最小面（装配方 reflect.get 防御读取产物） */
  readonly ask: EscalationAskFace
  /** 主会话 id → 活根 Agent（可选——在场则随问询携带 agent；缺席/未命中 = 无 agent 问询） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown
  /** 裁决回执面（可选——用户裁决/取消/投递失败回执送达主会话；缺席/故障 = warn 降级不拖垮终态） */
  readonly notifyReceipt?: (sessionId: string, text: string, headline?: string) => Promise<void>
}

/** 问询材料（renderEscalationAsk 产物——纯文本面，单测锚） */
export interface EscalationAskMaterial {
  readonly header: string
  readonly question: string
  readonly detail: string
  readonly options: readonly EscalationAskOption[]
}

/** 裁决选项（封闭两值——信息性：循环已终态，选项记录用户意向；实际动作走 GUI/指令） */
const ESCALATION_OPTIONS: readonly EscalationAskOption[] = [
  { label: '保持现状', description: '循环已停止，任务保持当前状态，稍后自行处理' },
  { label: '重新派发', description: '阻塞或环境解除后，在发起会话执行 /run-dag-tasks（带任务源 slug）' },
]

/** 裁决问询 id（answers 回读键——回执收束同键） */
const ESCALATION_QUESTION_ID = 'forge-dispatch-adjudication'

/** 重新派发选项回执动作行（封闭选项族的唯一带动作指引项——与 ESCALATION_OPTIONS 对应） */
const REDISPATCH_LABEL = '重新派发'

/** 升级事件的呈现任务键（task 形 = slug/localId + 标题；taskKey 形 = 原键；其余 = 源 slug） */
function escalationTaskLines(escalation: LoopEscalation): readonly string[] {
  if ('task' in escalation) return [`任务: ${escalation.task.slug}/${escalation.task.localId} ${escalation.task.title}`]
  if ('taskKey' in escalation) return [`任务: ${escalation.taskKey}`]
  return []
}

/**
 * 裁决回执材料（纯函数——用户裁决/取消/投递失败 → 主会话回执文本；选项信息性、回执同
 * 信息性：不自动重启循环，重新派发带指令指引）。闭环断环修复（2026-10-13 用户定罪「人已
 * 答、主会话无回复」）：裁决不经主会话（decisions #16 保持），但回执必须到达。
 */
export function renderEscalationReceipt(
  escalation: LoopEscalation,
  outcome: AskOutcome,
): { readonly text: string; readonly headline: string } {
  const head = `[forge·裁决] 任务源: ${escalation.source.slug}`
  const taskLines = escalationTaskLines(escalation)
  if (outcome.kind === 'selected') {
    if (outcome.label === REDISPATCH_LABEL) {
      return {
        text: [head, ...taskLines, `裁决: 已收到「${outcome.label}」——循环已终态不自动重启；需要时在会话执行 /run-dag-tasks ${escalation.source.slug}`].join('\n'),
        headline: '裁决已收到——重新派发',
      }
    }
    return {
      text: [head, ...taskLines, `裁决: 已收到「${outcome.label}」——循环已收口，任务保持当前状态`].join('\n'),
      headline: `裁决已收到——${outcome.label}`,
    }
  }
  if (outcome.kind === 'cancelled') {
    return {
      text: [head, ...taskLines, '裁决: 问询已关闭（未选择）——循环已收口，任务保持当前状态'].join('\n'),
      headline: '问询已关闭（未选择）',
    }
  }
  return {
    text: [head, ...taskLines, `裁决: 问询投递失败（${outcome.reason}）——任务保持当前状态，可直接在会话处理`].join('\n'),
    headline: '问询投递失败',
  }
}

/** 处置历史块（问询 detail 段——逐行原文，空历史 = 无历史行） */
function historyBlock(history: readonly string[]): readonly string[] {
  return history.length > 0 ? ['', '处理历史：', ...history.map((line) => `- ${line}`)] : []
}

/**
 * 升级事件 → 问询材料（纯函数——每类升级事件的 question/detail 组装；detail 恒含 reason
 * 原文与处置历史（在场者），裁决问询 = 分级呈现第三档全文档）。
 */
export function renderEscalationAsk(escalation: LoopEscalation): EscalationAskMaterial {
  switch (escalation.kind) {
    case 'blocked-ask-user':
    case 'disposition-over-limit': {
      const capped = escalation.kind === 'disposition-over-limit'
      return {
        header: '派发循环裁决',
        question: capped
          ? `任务 ${escalation.task.slug}/${escalation.task.localId} 无法自动处理（自动分析 ${escalation.attempts} 次未成功），需要你决定下一步`
          : `任务 ${escalation.task.slug}/${escalation.task.localId} 无法自动处理，需要你决定下一步`,
        detail: [
          `任务源: ${escalation.source.slug}（${escalation.source.kind}）`,
          `任务: ${escalation.task.localId} ${escalation.task.title}`,
          '',
          '阻塞原因（全文）：',
          escalation.reason,
          ...historyBlock(escalation.history),
        ].join('\n'),
        options: ESCALATION_OPTIONS,
      }
    }
    case 'fix-chain-over-limit':
      return {
        header: '派发循环裁决',
        question: `任务 ${escalation.task.slug}/${escalation.task.localId} 的修复链已达上限（${escalation.limit ?? '?'} 级），需要你决定下一步`,
        detail: [
          `任务源: ${escalation.source.slug}（${escalation.source.kind}）`,
          `任务: ${escalation.task.localId} ${escalation.task.title}`,
          ...(escalation.depth !== undefined ? [`修复链深度: ${escalation.depth}（上限 ${escalation.limit ?? '?'}）`] : []),
          '',
          '阻塞原因（全文）：',
          escalation.reason,
          ...historyBlock(escalation.history),
        ].join('\n'),
        options: ESCALATION_OPTIONS,
      }
    case 'worker-abort-over-limit':
      return {
        header: '派发循环裁决',
        question: `任务 ${escalation.taskKey} 的执行子代理反复异常退出（${escalation.attempts} 次），需要你决定下一步`,
        detail: [
          `任务源: ${escalation.source.slug}（${escalation.source.kind}）`,
          `任务: ${escalation.taskKey}`,
          `异常退出次数: ${escalation.attempts}（已超出自动重试上限）`,
        ].join('\n'),
        options: ESCALATION_OPTIONS,
      }
    case 'halted':
      return {
        header: '派发循环裁决',
        question: `任务源 ${escalation.source.slug} 的执行环境连续 ${escalation.attempts} 次启动失败，循环已停止`,
        detail: ['任务源: ' + escalation.source.slug, '', '失败原因（全文）：', escalation.reason].join('\n'),
        options: ESCALATION_OPTIONS,
      }
    case 'settle-landing-rejected':
      return {
        header: '派发循环裁决',
        question: `任务 ${escalation.taskKey} 的提交落点核验失败（提交落错分支或核验故障），任务已转移为可恢复态，需要你决定下一步`,
        detail: [
          `任务源: ${escalation.source.slug}（${escalation.source.kind}）`,
          `任务: ${escalation.taskKey}`,
          '',
          '核验结论（全文）：',
          escalation.reason,
        ].join('\n'),
        options: ESCALATION_OPTIONS,
      }
    case 'deadlock':
      return {
        header: '派发循环裁决',
        question: `任务源 ${escalation.source.slug} 没有可执行的任务且有任务阻塞中，需要你决定下一步`,
        detail: [
          `任务源: ${escalation.source.slug}（${escalation.source.kind}）`,
          '阻塞清单:',
          ...escalation.blockedItems.map((item) => `- ${item.taskKey} ${item.note}`),
        ].join('\n'),
        options: ESCALATION_OPTIONS,
      }
  }
}

/**
 * 建 userQuestions 第三层挂钩（装配单例——循环驱动器 deps.escalation 注入）：
 * escalate = 问询材料渲染 → ask 面投递（agent 经 resolveAgent 随载）→ 三路收束 → 裁决
 * 回执送达主会话（notifyReceipt——闭环断环修复：人已答必须有回响）。
 * fail-soft：ask 面故障只告警（裁决问询缺席 = 静默终局——循环正确性不依赖问询通道，R4
 * 同源）；回执面故障同径只告警。
 */
export function createUserQuestionsEscalation(deps: UserQuestionsEscalationDeps): LoopEscalationHook {
  return {
    async escalate(escalation: LoopEscalation): Promise<void> {
      const material = renderEscalationAsk(escalation)
      let agent: unknown
      try {
        agent = deps.resolveAgent?.(escalation.ownerSessionId)
      } catch {
        agent = undefined // 解析失败 = 无 agent 问询（fail-soft 同径）
      }
      const outcome = await askOption(
        deps.ask,
        {
          id: ESCALATION_QUESTION_ID,
          header: material.header,
          question: material.question,
          detail: material.detail,
          options: material.options,
        },
        undefined,
        agent,
      )
      if (outcome.kind === 'failed') {
        console.warn(`forge loop adjudication ask failed (${escalation.kind}): ${outcome.reason}`)
      }
      if (deps.notifyReceipt === undefined) return
      const receipt = renderEscalationReceipt(escalation, outcome)
      try {
        await deps.notifyReceipt(escalation.ownerSessionId, receipt.text, receipt.headline)
      } catch (cause) {
        console.warn(
          `forge loop adjudication receipt failed (${escalation.kind}): ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    },
  }
}
