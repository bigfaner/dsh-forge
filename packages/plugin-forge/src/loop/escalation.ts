// loop · 第三层人工裁决挂钩（S1c——LoopEscalationHook 实装，userQuestions 面接线）。
// 处置重试超限 / 同任务处置计数封顶 / fix 链深到顶 / worker 异常终止超限 / 死锁 / halted →
// userQuestions.ask 直达用户裁决（proposal §1.4 第三层）——不经主会话（decisions #16：主会话
// 仅感知，裁决一律问询 UI）。
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

/** ask 面结构化最小face（装配方适配 UserQuestionService.ask——缺席 = 静默降级） */
export interface EscalationAskFace {
  ask(request: { readonly questions: readonly EscalationAskQuestion[]; readonly agent?: unknown }): Promise<unknown>
}

/** 第三层挂钩依赖 */
export interface UserQuestionsEscalationDeps {
  /** userQuestions.ask 结构化最小面（装配方 reflect.get 防御读取产物） */
  readonly ask: EscalationAskFace
  /** 主会话 id → 活根 Agent（可选——在场则随问询携带 agent；缺席/未命中 = 无 agent 问询） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown
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
 * escalate = 问询材料渲染 → ask 面投递（agent 经 resolveAgent 随载）→ 等待用户裁决。
 * fail-soft：ask 面故障只告警（裁决问询缺席 = 静默终局——循环正确性不依赖问询通道，R4 同源）。
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
      try {
        await deps.ask.ask({
          questions: [
            {
              id: 'forge-dispatch-adjudication',
              header: material.header,
              question: material.question,
              detail: material.detail,
              options: material.options,
            },
          ],
          ...(agent !== undefined ? { agent } : {}),
        })
      } catch (cause) {
        console.warn(
          `forge loop adjudication ask failed (${escalation.kind}): ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    },
  }
}
