/**
 * ask 分页面板（根 `#/ask`）——pending 交互一屏一题分页：
 * `forge:proxy/session-projections` 投影发现（userQuestions{active,settled}）+
 * forge-stream `user-questions/request` 到达腿 + `forge:proxy/user-questions-answer` 提交
 * （R12 口径——本组合无 interaction 服务，旧 interaction.* 通道证伪）。
 *
 * 三题型语义（判别字段 = multiSelect；载荷契约正本 = tech-research R9#2 官方页
 * renderQuestionComposer 实证）：单选点击即选中可改选；多选 checkbox 任意组合；
 * other = 每题附带的 customAnswer 自由文本域（非选项成员，载荷字段 `custom`）——
 * 单选输入即选中 other（占位互斥：清空已选项、点选项清空文本）；多选输入为额外选中。
 * recommended 徽标 + previous/skip/continue 按钮族；selected 空且 custom 空才拒绝。
 *
 * 纯逻辑面（单测主战场）：pending 载荷收敛 / 选项语义状态机 / 提交载荷构造。
 */
import type { RemoteRpc } from '../core/rpc.ts'
import { DisconnectedError } from '../core/rpc.ts'
import { PROXY_SESSION_PROJECTIONS_CHANNEL, PROXY_USER_QUESTIONS_ANSWER_CHANNEL, proxyCall } from '../core/rpc.ts'
import { el, renderMarkdown } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 载荷契约（R9#2）
// ---------------------------------------------------------------------------

export interface AskOption {
  readonly label: string
  readonly description?: string
  readonly recommended?: boolean
}

export interface AskQuestion {
  readonly id: string
  readonly header?: string
  readonly question: string
  readonly detail?: string
  readonly options?: readonly AskOption[]
  readonly multiSelect?: boolean
}

export interface PendingInteraction {
  readonly rpcId: string
  readonly questions: readonly AskQuestion[]
}

/** userQuestions 投影视图（UserQuestionProjectionView 官方形状，缺字段 fail-soft）。 */
export interface UserQuestionsView {
  readonly active: readonly { callId?: unknown; state?: unknown; questions?: unknown }[]
  readonly settled: readonly unknown[]
}

/** 投影视图提取：projections 帧 {values:{userQuestions}} / {userQuestions} / 裸视图三层级兼容。 */
function userQuestionsViewOf(raw: unknown): UserQuestionsView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const frame = raw as { values?: unknown; userQuestions?: unknown }
  for (const candidate of [frame.values, frame.userQuestions, raw]) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const view = candidate as { userQuestions?: unknown; active?: unknown; settled?: unknown }
    const inner = typeof view.userQuestions === 'object' && view.userQuestions !== null
      ? (view.userQuestions as { active?: unknown; settled?: unknown })
      : view
    if (Array.isArray(inner.active)) {
      return { active: inner.active as UserQuestionsView['active'], settled: Array.isArray(inner.settled) ? (inner.settled as unknown[]) : [] }
    }
  }
  return null
}

/**
 * session-projections 响应收敛：取首个 state='open' 在途题（state 缺省 fail-soft 视为 open），
 * rpcId = 官方 callId；settled 投影不进面板。
 */
export function coercePending(raw: unknown): PendingInteraction | null {
  const view = userQuestionsViewOf(raw)
  if (view === null) return null
  for (const entry of view.active) {
    if (typeof entry !== 'object' || entry === null) continue
    if (typeof entry.callId !== 'string' || !Array.isArray(entry.questions)) continue
    if (entry.state !== undefined && entry.state !== 'open') continue
    const questions = (entry.questions as unknown[]).map((question) => {
      const q = (typeof question === 'object' && question !== null ? question : {}) as AskQuestion
      // 题型判别字段归一：multiSelect 缺省 = 单选（false）
      return { ...q, multiSelect: q.multiSelect === true }
    })
    return { rpcId: entry.callId, questions }
  }
  return null
}

// ---------------------------------------------------------------------------
// 纯函数：选项语义状态机
// ---------------------------------------------------------------------------

export interface QuestionDraft {
  readonly selected: readonly string[]
  readonly custom: string
}

export function emptyDraft(): QuestionDraft {
  return { selected: [], custom: '' }
}

const isMulti = (question: AskQuestion): boolean => question.multiSelect === true

/** 点击选项：单选替换（占位互斥——清空 custom）；多选 toggle。 */
export function pickOption(question: AskQuestion, draft: QuestionDraft, label: string): QuestionDraft {
  if (isMulti(question)) {
    const selected = draft.selected.includes(label)
      ? draft.selected.filter((item) => item !== label)
      : [...draft.selected, label]
    return { ...draft, selected }
  }
  return { selected: [label], custom: '' }
}

/** other 输入：单选非空文本即选中 other（清空已选项，占位互斥）；多选为额外选中。 */
export function setCustom(question: AskQuestion, draft: QuestionDraft, text: string): QuestionDraft {
  if (isMulti(question)) return { ...draft, custom: text }
  return { selected: [], custom: text }
}

/** 官方校验口径：selected 空且 custom 空才拒绝。 */
export function canSubmit(question: AskQuestion, draft: QuestionDraft): boolean {
  return draft.selected.length > 0 || draft.custom.trim() !== ''
}

export interface AnswerEntry {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom: string
  readonly skipped?: boolean
}

/** 提交载荷 {id, selected, custom}（无 skipped 字段）。 */
export function buildAnswer(question: AskQuestion, draft: QuestionDraft): AnswerEntry {
  return { id: question.id, selected: [...draft.selected], custom: draft.custom }
}

/** skip 载荷：空选中 + skipped 标记。 */
export function buildSkipped(question: AskQuestion): AnswerEntry {
  return { id: question.id, selected: [], custom: '', skipped: true }
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface AskDeps {
  readonly rpc: RemoteRpc
  readonly sessionId: string
  /** 全部题目提交成功后的回调（路由侧收口，如 navigate 回 chat）。 */
  readonly onDone?: () => void
  /** forge-stream `user-questions/request` 到达腿（帧到达 → 重拉投影；缺席 = 打开时静态投影）。 */
  readonly subscribeStream?: (onFrame: () => void) => () => void
}

export function createAskView(deps: AskDeps): HTMLElement {
  const root = el('div', 'phone-root ask-root')
  const topbar = el('div', 'topbar')
  const back = el('button', 'iconbtn')
  back.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
  back.style.transform = 'rotate(90deg)'
  const title = el('div', 'title', '待回答')
  const skipAll = el('button', 'iconbtn')
  skipAll.innerHTML = '<svg class="ic"><use href="#i-down"/></svg>'
  skipAll.title = '关闭面板（本地收起——R12 通道族无交互取消面）'
  topbar.append(back, title, skipAll)

  const view = el('div', 'view ask-view')
  root.append(topbar, view)

  let pending: PendingInteraction | null = null
  let page = 0
  const drafts = new Map<string, QuestionDraft>()
  const skipped = new Set<string>()
  let sending = false

  // R12 通道族无 interaction.cancel 对偶缝：返回/收起 = 本地面板收起（宿主 pending 不动）
  const dismiss = (): void => {
    pending = null
    drafts.clear()
    skipped.clear()
    render()
  }
  back.addEventListener('click', dismiss)
  skipAll.addEventListener('click', dismiss)

  async function load(): Promise<void> {
    try {
      const raw = await proxyCall(deps.rpc, PROXY_SESSION_PROJECTIONS_CHANNEL, { sessionId: deps.sessionId })
      pending = coercePending(raw)
      page = 0
      drafts.clear()
      skipped.clear()
    } catch (error) {
      if (error instanceof DisconnectedError) view.appendChild(el('div', 'sys-line err', '连接已断开'))
      else view.appendChild(el('div', 'sys-line', '加载失败'))
      return
    }
    render()
  }

  function draftOf(question: AskQuestion): QuestionDraft {
    let draft = drafts.get(question.id)
    if (draft === undefined) {
      draft = emptyDraft()
      drafts.set(question.id, draft)
    }
    return draft
  }

  function setDraft(question: AskQuestion, draft: QuestionDraft): void {
    drafts.set(question.id, draft)
    skipped.delete(question.id)
    render()
  }

  /** 收集 [from, to) 内已答题目（未动过的题按 skip 口径补齐）。 */
  function collectAnswered(from: number, to: number): readonly AnswerEntry[] {
    if (pending === null) return []
    const entries: AnswerEntry[] = []
    for (let index = from; index < to; index++) {
      const question = pending.questions[index]
      if (question === undefined) continue
      const draft = drafts.get(question.id)
      if (draft !== undefined && canSubmit(question, draft)) entries.push(buildAnswer(question, draft))
      else entries.push(buildSkipped(question))
    }
    return entries
  }

  /** 官方 AskUserQuestionAnswerItem 形状收敛 {id, selected, custom}（skipped 为面板本地语义不进载荷）。 */
  function answerPayload(entries: readonly AnswerEntry[]): readonly { id: string; selected: readonly string[]; custom: string }[] {
    return entries.map((entry) => ({ id: entry.id, selected: [...entry.selected], custom: entry.custom }))
  }

  async function finish(entries: readonly AnswerEntry[]): Promise<void> {
    if (pending === null) return
    sending = true
    render()
    try {
      await proxyCall(deps.rpc, PROXY_USER_QUESTIONS_ANSWER_CHANNEL, {
        sessionId: deps.sessionId,
        callId: pending.rpcId,
        answer: { answers: answerPayload(entries) },
      })
      pending = null
      deps.onDone?.()
    } catch (error) {
      view.appendChild(
        el('div', 'sys-line err', error instanceof DisconnectedError ? '连接已断开' : '提交失败，请重试'),
      )
    } finally {
      sending = false
      render()
    }
  }

  function render(): void {
    view.textContent = ''
    if (sending) {
      view.appendChild(el('div', 'sys-line', '提交中…'))
      return
    }
    const questions = pending?.questions ?? []
    if (questions.length === 0) {
      view.appendChild(el('div', 'sys-line', '暂无待回答问题'))
      return
    }
    const index = Math.min(page, questions.length - 1)
    const question = questions[index] as AskQuestion
    view.appendChild(renderQuestion(question, draftOf(question), index, questions.length))
  }

  function renderQuestion(
    question: AskQuestion,
    draft: QuestionDraft,
    index: number,
    total: number,
  ): HTMLElement {
    const multi = isMulti(question)
    const card = el('div', 'ask-card')

    // 序号/总数（左上角）
    const counter = el('div', 'ask-counter', `${index + 1}/${total}`)
    card.appendChild(counter)

    if (question.header !== undefined) card.appendChild(el('div', 'ask-header', question.header))
    card.appendChild(el('div', 'ask-question', question.question))
    if (question.detail !== undefined && question.detail !== '') card.appendChild(renderMarkdown(question.detail))

    const options = question.options ?? []
    if (options.length > 0) {
      const list = el('div', `ask-options ${multi ? 'multi' : 'single'}`)
      for (const option of options) {
        const selected = draft.selected.includes(option.label)
        const button = el('button', `ask-option${selected ? ' picked' : ''}`)
        const mark = el('span', `mark ${multi ? 'box' : 'radio'}`)
        if (selected) mark.innerHTML = multi ? '✓' : '●'
        const body = el('div', 'opt-body')
        const labelRow = el('div', 'opt-label')
        labelRow.appendChild(document.createTextNode(option.label))
        if (option.recommended === true) labelRow.appendChild(el('span', 'ask-badge', '推荐'))
        body.appendChild(labelRow)
        if (option.description !== undefined)
          body.appendChild(el('div', 'opt-desc', option.description))
        button.append(mark, body)
        button.addEventListener('click', () => setDraft(question, pickOption(question, draft, option.label)))
        list.appendChild(button)
      }
      card.appendChild(list)
    }

    // other = customAnswer 自由文本域（每题附带，非选项成员）
    const custom = document.createElement('textarea')
    custom.className = 'ask-custom'
    custom.placeholder = '其他…（自定义回答）'
    custom.rows = 2
    custom.value = draft.custom
    custom.addEventListener('input', () => setDraft(question, setCustom(question, draft, custom.value)))
    card.appendChild(custom)

    // previous/skip/continue 按钮族
    const nav = el('div', 'ask-nav')
    const previous = el('button', 'ask-btn ghost', '上一个')
    previous.disabled = index === 0
    previous.addEventListener('click', () => {
      page = Math.max(0, index - 1)
      render()
    })
    const skip = el('button', 'ask-btn ghost', '跳过')
    skip.addEventListener('click', () => {
      skipped.add(question.id)
      advance(index, total, [...collectAnswered(0, index), buildSkipped(question)])
    })
    const isLast = index === total - 1
    const continueButton = el('button', 'ask-btn primary', isLast ? '提交' : '下一个')
    continueButton.disabled = !canSubmit(question, draft)
    continueButton.addEventListener('click', () => {
      advance(
        index,
        total,
        isLast
          ? [...collectAnswered(0, index), buildAnswer(question, draft)]
          : [],
      )
      if (!isLast) {
        page = index + 1
        render()
      }
    })
    nav.append(previous, skip, continueButton)
    card.appendChild(nav)
    return card
  }

  /** 末题 continue → user-questions-answer 提交全部条目。 */
  function advance(index: number, total: number, entries: readonly AnswerEntry[]): void {
    if (index === total - 1 && pending !== null && entries.length > 0) void finish(entries)
  }

  void load()
  deps.subscribeStream?.(() => {
    if (!sending) void load()
  })
  return root
}
