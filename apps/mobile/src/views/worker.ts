/**
 * worker 会话双形态（官方面派生——评估收敛 2026-10-17 + R12 通道化，零专用通道）：
 *
 * 列表形态：官方 session.list 视图过滤（`forge:proxy/session-list` 直调透传，
 * parentSessionId === 当前会话 且 origin:'subagent'）+ 父会话日志
 * `subagent/catalog` 持久事件投影取 mode/label（wire-samples 实证形状）+
 * activity 取 SessionSummary.running。
 *
 * 子会话流形态：forge-stream 镜像帧（session 变更 + assistant 流式 sessionQuery
 * 镜像——经 getEvents/subscribe 装配缝注入，无官方 SSE/$events）。mode='continuable'
 * 出 composer（发送 = session.prompt steer 注入下一轮）；mode='one-shot' 只读
 * 无发送入口。模式/worktree 只读继承；← 图标退出。路由 `#/worker/:sessionId`。
 */
import type { OfficialApi } from '../core/api.ts'
import type { RemoteRpc } from '../core/rpc.ts'
import { sendComposerInput } from '../core/rpc.ts'
import {
  createAttemptSettler,
  mergeBySeq,
  projectHistory,
  type WireEvent,
} from '../core/wire.ts'
import { createComposer, type ComposerHandle } from '../widgets/composer.ts'
import {
  el,
  ensureIconSprite,
  isReasoningOnly,
  pairToolActivity,
  renderCard,
  renderThinkCard,
  renderToolCard,
} from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 通道
// ---------------------------------------------------------------------------

export const PROXY_SESSION_LIST_CHANNEL = 'forge:proxy/session-list'

// ---------------------------------------------------------------------------
// 纯函数：catalog 投影 + 视图过滤
// ---------------------------------------------------------------------------

export interface WorkerCatalogEntry {
  readonly mode: string
  readonly label: string
}

/**
 * 父会话日志 `subagent/catalog` 持久事件投影：childId → {mode, label}，
 * 同 childId 以最新 seq 为准；缺 childId 行 fail-soft 丢弃。
 */
export function catalogProjection(events: readonly WireEvent[]): ReadonlyMap<string, WorkerCatalogEntry> {
  const latest = new Map<string, { mode: string; label: string }>()
  for (const event of events) {
    if (event.type !== 'subagent/catalog') continue
    const data = event.data as { childId?: unknown; mode?: unknown; label?: unknown }
    if (typeof data.childId !== 'string' || data.childId === '') continue
    latest.set(data.childId, {
      mode: typeof data.mode === 'string' ? data.mode : 'one-shot',
      label: typeof data.label === 'string' ? data.label : '',
    })
  }
  return latest
}

/** 官方 list 响应收敛：数组 / {items} / {sessions} 三形；异常 → []。 */
export function coerceSessionRows(raw: unknown): readonly Record<string, unknown>[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown } | null)?.items)
      ? (raw as { items: unknown[] }).items
      : Array.isArray((raw as { sessions?: unknown } | null)?.sessions)
        ? (raw as { sessions: unknown[] }).sessions
        : []
  return rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
}

export interface WorkerRow {
  readonly sessionId: string
  readonly label: string
  /** 官方 catalog mode（one-shot/continuable）；未知 mode 归 one-shot（只读安全侧）。 */
  readonly mode: 'one-shot' | 'continuable'
  /** activity = SessionSummary.running。 */
  readonly running: boolean
}

/**
 * 官方 session.list 视图过滤（零专用通道）：parentSessionId === 当前会话 且
 * origin:'subagent'；mode/label 取 catalog 投影；running 置前、updatedAt 降序。
 */
export function deriveWorkers(
  rows: readonly Record<string, unknown>[],
  parentSessionId: string,
  catalog: ReadonlyMap<string, WorkerCatalogEntry>,
): readonly WorkerRow[] {
  const workers: WorkerRow[] = []
  for (const row of rows) {
    if (row['parentSessionId'] !== parentSessionId) continue
    if (row['origin'] !== 'subagent') continue
    if (typeof row['sessionId'] !== 'string' || row['sessionId'] === '') continue
    const entry = catalog.get(row['sessionId'])
    const rawMode = entry?.mode ?? 'one-shot'
    workers.push({
      sessionId: row['sessionId'],
      label: entry?.label ?? '',
      mode: rawMode === 'continuable' ? 'continuable' : 'one-shot',
      running: row['running'] === true,
    })
  }
  const orderIndex = new Map(workers.map((worker, index) => [worker.sessionId, index]))
  return workers
    .slice()
    .sort((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1
      return (orderIndex.get(a.sessionId) ?? 0) - (orderIndex.get(b.sessionId) ?? 0)
    })
}

// ---------------------------------------------------------------------------
// 列表形态
// ---------------------------------------------------------------------------

export interface WorkerListDeps {
  readonly rpc: RemoteRpc
  /** 当前会话（worker 归属父会话）。 */
  readonly parentSessionId: string
  /** 父会话日志只读视图（catalog 投影数据源）。 */
  readonly getEvents: () => readonly WireEvent[]
  /** forge-stream 等价帧订阅（帧到达 → 列表刷新；缺席 = 打开时静态）。 */
  readonly subscribe?: (onFrame: () => void) => () => void
  readonly onOpen?: (sessionId: string) => void
  readonly onClose?: () => void
}

export interface WorkerListHandle {
  readonly root: HTMLElement
  refresh(): Promise<void>
}

export function createWorkerListView(deps: WorkerListDeps): WorkerListHandle {
  const root = el('div', 'phone-root worker-list-face')
  ensureIconSprite(root)
  const topbar = el('div', 'topbar')
  if (deps.onClose !== undefined) {
    const closeButton = el('button', 'iconbtn')
    closeButton.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
    closeButton.addEventListener('click', () => deps.onClose?.())
    topbar.appendChild(closeButton)
  }
  topbar.appendChild(el('div', 'title', 'Worker 会话'))
  const view = el('div', 'view worker-list')
  root.append(topbar, view)

  function renderRow(worker: WorkerRow): HTMLElement {
    const row = el('button', `worker-row${worker.running ? ' running' : ''}`)
    row.type = 'button'
    row.appendChild(el('span', 'wk-label', worker.label === '' ? worker.sessionId.slice(0, 8) : worker.label))
    row.appendChild(el('span', `wk-mode ${worker.mode}`, worker.mode === 'continuable' ? '可续聊' : '一次性'))
    row.appendChild(el('span', 'wk-act', worker.running ? '运行中' : '已结束'))
    row.addEventListener('click', () => deps.onOpen?.(worker.sessionId))
    return row
  }

  async function refresh(): Promise<void> {
    const result = await deps.rpc.call<unknown>(PROXY_SESSION_LIST_CHANNEL, {})
    if (!result.ok) {
      view.textContent = ''
      view.appendChild(el('div', 'worker-hint', 'Worker 列表不可用'))
      return
    }
    const catalog = catalogProjection(deps.getEvents())
    const workers = deriveWorkers(coerceSessionRows(result.data), deps.parentSessionId, catalog)
    view.textContent = ''
    for (const worker of workers) view.appendChild(renderRow(worker))
    if (workers.length === 0) view.appendChild(el('div', 'worker-hint', '暂无 Worker 会话'))
  }

  const unsubscribe = deps.subscribe?.(() => void refresh())

  ;(root as HTMLElement & { dispose?: () => void }).dispose = (): void => {
    unsubscribe?.()
  }

  void refresh()
  return { root, refresh }
}

// ---------------------------------------------------------------------------
// 子会话流形态
// ---------------------------------------------------------------------------

export interface WorkerSessionDeps {
  readonly sessionId: string
  /** catalog mode（one-shot/continuable——只读/可发送分界）。 */
  readonly mode: 'one-shot' | 'continuable'
  readonly label: string
  readonly api: OfficialApi
  /** 子会话日志只读视图（镜像帧投影数据源）。 */
  readonly getEvents: () => readonly WireEvent[]
  /** forge-stream 镜像帧订阅（session 变更 + assistant 流式；缺席 = 静态）。 */
  readonly subscribe?: (onEvent: (event: WireEvent) => void) => () => void
  readonly onExit?: () => void
}

export interface WorkerSessionHandle {
  readonly root: HTMLElement
  dispose(): void
}

export function createWorkerSessionView(deps: WorkerSessionDeps): WorkerSessionHandle {
  const root = el('div', 'phone-root worker-session-face')
  ensureIconSprite(root)

  const topbar = el('div', 'topbar')
  const backButton = el('button', 'iconbtn')
  backButton.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
  backButton.addEventListener('click', () => deps.onExit?.())
  const title = el('div', 'title', deps.label === '' ? 'Worker' : deps.label)
  title.appendChild(el('span', `wk-mode ${deps.mode}`, deps.mode === 'continuable' ? '可续聊' : '一次性'))
  topbar.append(backButton, title)

  const view = el('div', 'view')
  const settler = createAttemptSettler()
  /** 镜像帧合流：初始 = getEvents 快照，后续帧 mergeBySeq 去重升序。 */
  let entries = deps.getEvents().slice()

  let composer: ComposerHandle | null = null
  if (deps.mode === 'continuable') {
    composer = createComposer({
      mode: '可续聊',
      worktree: '',
      modeReadOnly: true,
      onSend: (text) => void send(text),
      onSettings: () => {},
    })
    root.append(topbar, view, composer.root)
  } else {
    const hint = el('div', 'worker-readonly-hint', '一次性会话 · 只读')
    root.append(topbar, view, hint)
  }

  function render(): void {
    const projections = projectHistory(entries)
    const activities = pairToolActivity(projections)
    const activityByCallId = new Map(activities.map((activity) => [activity.call.callId, activity]))
    const seenCalls = new Set<string>()
    view.textContent = ''
    for (const projection of projections) {
      if (projection.kind === 'tool-result') continue
      if (projection.kind === 'tool-call') {
        if (seenCalls.has(projection.callId)) continue
        seenCalls.add(projection.callId)
        const activity = activityByCallId.get(projection.callId)
        if (activity !== undefined) view.appendChild(renderToolCard(activity))
        continue
      }
      if (isReasoningOnly(projection)) {
        view.appendChild(renderThinkCard(projection.reasoning))
        continue
      }
      view.appendChild(renderCard(projection, {}))
    }
    let streaming = false
    for (const row of settler.rows()) {
      if (row.state === 'settled') continue
      streaming = row.state === 'streaming'
      if (row.text !== '' || row.reasoning !== '') {
        if (row.reasoning !== '' && row.text === '') view.appendChild(renderThinkCard(row.reasoning))
        else view.appendChild(el('div', `msg agent${row.state === 'abandoned' ? ' interrupted' : ''}`, row.text))
      }
      if (row.state === 'abandoned') view.lastElementChild?.appendChild(el('span', 'interrupted-line', '— 已中断 —'))
      else if (streaming) view.lastElementChild?.appendChild(el('span', 'streaming'))
    }
    view.scrollTop = view.scrollHeight
  }

  async function send(text: string): Promise<void> {
    if (composer === null) return
    composer.setSending(true)
    try {
      // 注入下一轮：session.prompt steer（目录空 = 字面消息径，无斜杠仲裁扩张；worker 注入
      // 恒 steer——一次性直发语义，composer 强制档位不适用）
      await sendComposerInput(text, { api: deps.api, sessionId: deps.sessionId, catalog: [], promptMode: 'steer' })
    } finally {
      composer?.setSending(false)
    }
  }

  function onFrameEvent(event: WireEvent): void {
    const discriminated = event as WireEvent & { kind?: string }
    if (event.type === 'assistant/live-chunk' && 'attemptId' in (event.data as object)) {
      settler.chunk(event as Parameters<typeof settler.chunk>[0])
      render()
      return
    }
    if (discriminated.kind === 'settle-assistant') {
      settler.settle((discriminated as { attemptId?: string }).attemptId ?? '')
      render()
      return
    }
    if (discriminated.kind === 'abandoned') {
      settler.abandon((discriminated as { attemptId?: string }).attemptId ?? '')
      render()
      return
    }
    entries = mergeBySeq(entries, [event])
    render()
  }

  const unsubscribe = deps.subscribe?.(onFrameEvent)
  render()

  return {
    root,
    dispose: () => {
      unsubscribe?.()
    },
  }
}
