/**
 * tasks 任务浮层（悬浮球入口，浮层不走路由）——
 * 数据源 = 会话日志 + wire 投影：任务循环叙述/任务卡写入 dispatch 会话日志
 * （source.kind:'forge-loop'），经 forge-stream 等价帧订阅投影（host 侧 =
 * sessionQuery.observeSession 镜像）——不调 forge/progress。
 *
 * 任务卡：编号·title + 状态徽标（对齐桌面状态集 running/paused/blocked/done）；
 * 运行中显暂停、底部统一派发；运行中置顶 / 已完成折叠。
 * 多 run chips = progress tasks 按 source_slug 分组派生（R10-F2）。
 *
 * 派发/暂停指令发**用户当前浏览会话**（裁决 F5-甲：零映射；同源独占守卫防重复），
 * 经 composer `/` 仲裁执行 = `forge:proxy/commands-list` / `forge:proxy/commands-execute`
 * 通道（host in-process 直调 ctx.commands；wire 形状取 1.1 录制）。
 * 回执以会话内指令回执文本呈现（command/run+done 成对投影）；stale 置灰数据驱动；
 * 无审批、无进度百分比。
 */
import type { WireEvent } from '../core/wire.ts'
import { projectHistory, type Projection } from '../core/wire.ts'
import type { RemoteRpc } from '../core/rpc.ts'
import { arbitrate } from '../core/rpc.ts'
import { el, ensureIconSprite } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 通道与可配口径
// ---------------------------------------------------------------------------

export const TASKS_COMMANDS_LIST_CHANNEL = 'forge:proxy/commands-list'
export const TASKS_COMMANDS_EXECUTE_CHANNEL = 'forge:proxy/commands-execute'

/** 回执行显示上限（最新 N 条）。 */
export const TASKS_RECEIPT_CAP = 5

// ---------------------------------------------------------------------------
// 纯函数：任务卡投影（会话日志 forge/progress → TaskRun）
// ---------------------------------------------------------------------------

export type TaskStatus = 'running' | 'paused' | 'blocked' | 'done'

export interface TaskRun {
  readonly sourceSlug: string
  readonly taskKey: string
  /** 组内编号（首次出现序，1 起）。 */
  readonly number: number
  /** taskKey 剥离 slug 前缀（无前缀原样）。 */
  readonly title: string
  readonly status: TaskStatus
  readonly counts: Readonly<Record<string, number>>
}

/** 状态归一（桌面状态集）：done/complete→done、pause→paused、block/fail→blocked、其余→running。 */
export function normalizeStatus(status: string): TaskStatus {
  const s = status.toLowerCase()
  if (s.includes('done') || s.includes('complete')) return 'done'
  if (s.includes('paus')) return 'paused'
  if (s.includes('block') || s.includes('fail') || s.includes('error')) return 'blocked'
  return 'running'
}

/**
 * 会话日志投影：forge/progress 事件 → 任务卡。同 (sourceSlug, taskKey)
 * 以最新 seq 状态为准；编号 = 组内首次出现序；缺字段行 fail-soft 丢弃。
 */
export function deriveTaskRuns(events: readonly WireEvent[]): readonly TaskRun[] {
  const latest = new Map<string, { sourceSlug: string; taskKey: string; status: string; counts: Record<string, number> }>()
  const order: string[] = []
  for (const event of events) {
    if (event.type !== 'forge/progress') continue
    const data = event.data as { sourceSlug?: unknown; taskKey?: unknown; status?: unknown; counts?: unknown }
    if (typeof data.sourceSlug !== 'string' || data.sourceSlug === '') continue
    if (typeof data.taskKey !== 'string' || data.taskKey === '') continue
    const key = `${data.sourceSlug}\u0000${data.taskKey}`
    if (!latest.has(key)) order.push(key)
    latest.set(key, {
      sourceSlug: data.sourceSlug,
      taskKey: data.taskKey,
      status: typeof data.status === 'string' ? data.status : 'running',
      counts: typeof data.counts === 'object' && data.counts !== null ? (data.counts as Record<string, number>) : {},
    })
  }
  const numbers = new Map<string, number>()
  return order.map((key) => {
    const row = latest.get(key)!
    const next = (numbers.get(row.sourceSlug) ?? 0) + 1
    numbers.set(row.sourceSlug, next)
    const prefix = `${row.sourceSlug}/`
    return {
      sourceSlug: row.sourceSlug,
      taskKey: row.taskKey,
      number: next,
      title: row.taskKey.startsWith(prefix) ? row.taskKey.slice(prefix.length) : row.taskKey,
      status: normalizeStatus(row.status),
      counts: row.counts,
    }
  })
}

// ---------------------------------------------------------------------------
// 纯函数：多 run chips（R10-F2 = 按 source_slug 分组派生）
// ---------------------------------------------------------------------------

export interface RunChip {
  readonly sourceSlug: string
  readonly total: number
  readonly doneCount: number
  /** 存在非 done run = 该源循环活跃。 */
  readonly active: boolean
}

/** 分组派生：活跃（有非 done）源排前，其余保持首现序。 */
export function groupRunsBySource(runs: readonly TaskRun[]): readonly RunChip[] {
  const chips = new Map<string, { total: number; doneCount: number; active: boolean }>()
  for (const run of runs) {
    const chip = chips.get(run.sourceSlug) ?? { total: 0, doneCount: 0, active: false }
    chip.total += 1
    if (run.status === 'done') chip.doneCount += 1
    else chip.active = true
    chips.set(run.sourceSlug, chip)
  }
  return [...chips.entries()]
    .map(([sourceSlug, chip]) => ({ sourceSlug, ...chip }))
    .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
}

/** 同源独占守卫（F5-甲）：该 source 存在非 done run = 派发独占中，禁重复派发。 */
export function hasActiveSource(runs: readonly TaskRun[], sourceSlug: string): boolean {
  return runs.some((run) => run.sourceSlug === sourceSlug && run.status !== 'done')
}

// ---------------------------------------------------------------------------
// 纯函数：回执（会话内指令回执文本 = command/run + command/done 成对投影）
// ---------------------------------------------------------------------------

export interface CommandReceipt {
  readonly commandId: string
  readonly name: string
  readonly kind: string
  readonly text: string
}

/** 成对纪律：仅 done 到达的指令出回执（开始态无终态不作回执）；text 缺席回退 kind。 */
export function commandReceipts(events: readonly WireEvent[]): readonly CommandReceipt[] {
  const runs = new Map<string, { name: string }>()
  const receipts: CommandReceipt[] = []
  for (const projection of projectHistory(events)) {
    if (projection.kind === 'command-chip') {
      runs.set(projection.commandId, { name: projection.name })
      if (projection.done !== undefined)
        receipts.push({
          commandId: projection.commandId,
          name: projection.name,
          kind: projection.done.kind,
          text: projection.done.text ?? projection.done.kind,
        })
    }
  }
  return receipts
}

// ---------------------------------------------------------------------------
// 纯函数：指令仲裁（composer `/` 仲裁语义 + forge:proxy/commands 通道形状）
// ---------------------------------------------------------------------------

/** 派发行（发当前浏览会话）。 */
export function dispatchLine(sourceSlug: string): string {
  return `/run-dag-tasks ${sourceSlug}`
}

/** 暂停行（停本会话启动的派发循环）。 */
export function pauseLine(): string {
  return '/stop-dag-tasks'
}

/** commands-list 响应收敛（1.1 录制 wire 形状：[{name, description, input?}]；缺字段行丢弃）。 */
export function coerceCommandCatalog(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .map((row) => (typeof row === 'object' && row !== null ? (row as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string' && name !== '')
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface TasksDeps {
  readonly rpc: RemoteRpc
  /** 当前浏览会话（派发/暂停指令目标——零映射）。 */
  readonly sessionId: string
  /** 会话日志只读视图（投影数据源）。 */
  readonly getEvents: () => readonly WireEvent[]
  /** forge-stream 等价帧订阅（帧到达 → 重投影；缺席 = 打开时静态投影）。 */
  readonly subscribe?: (onFrame: () => void) => () => void
  /** stale 数据源（true = 数据陈旧 → 按钮置灰）。 */
  readonly isStale?: () => boolean
  readonly onClose?: () => void
}

export interface TasksHandle {
  readonly root: HTMLElement
  refresh(): void
}

export function createTasksView(deps: TasksDeps): TasksHandle {
  const root = el('div', 'tasks-sheet')
  ensureIconSprite(root)
  const header = el('div', 'tasks-hd')
  header.appendChild(el('span', 'title', '任务'))
  const closeButton = el('button', 'iconbtn')
  closeButton.type = 'button'
  closeButton.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
  closeButton.addEventListener('click', () => deps.onClose?.())
  header.appendChild(closeButton)

  const chipsRow = el('div', 'run-chips')
  const list = el('div', 'task-list')
  const receiptsRow = el('div', 'task-receipts')
  const dispatchBar = el('button', 'dispatch-bar')
  dispatchBar.type = 'button'
  dispatchBar.textContent = '派发任务'
  root.append(header, chipsRow, list, receiptsRow, dispatchBar)

  let stale = deps.isStale?.() ?? false
  let selectedSource: string | null = null
  let busy = false

  function runs(): readonly TaskRun[] {
    const all = deriveTaskRuns(deps.getEvents())
    return selectedSource === null ? all : all.filter((run) => run.sourceSlug === selectedSource)
  }

  function syncButtons(): void {
    const disabled = stale || busy
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))
      button.disabled = disabled
    dispatchBar.disabled = disabled
  }

  function markStale(): void {
    stale = true
    syncButtons()
  }

  /**
   * 指令执行 = composer `/` 仲裁语义经 forge:proxy/commands 通道：
   * 目录（commands-list）命中 → commands-execute（发当前浏览会话）；
   * 未命中目录 → 不执行（守卫：固定指令行必经目录）。
   */
  async function execute(line: string): Promise<void> {
    if (stale || busy) return
    busy = true
    syncButtons()
    try {
      const catalogResult = await deps.rpc.call<unknown>(TASKS_COMMANDS_LIST_CHANNEL, { sessionId: deps.sessionId })
      if (!catalogResult.ok) {
        if (catalogResult.error.code === 'stale') markStale()
        return
      }
      const verdict = arbitrate(line, coerceCommandCatalog(catalogResult.data))
      if (verdict.kind !== 'command') return
      const result = await deps.rpc.call<unknown>(TASKS_COMMANDS_EXECUTE_CHANNEL, {
        sessionId: deps.sessionId,
        line: verdict.parsed.line,
        submittedAttachments: [],
      })
      if (!result.ok && result.error.code === 'stale') markStale()
      // 回执以会话内指令回执文本呈现——execute 返回不合成回执，等 wire 帧驱动 refresh
    } finally {
      busy = false
      syncButtons()
    }
  }

  function renderReceipts(): void {
    receiptsRow.textContent = ''
    const receipts = commandReceipts(deps.getEvents()).slice(-TASKS_RECEIPT_CAP)
    for (const receipt of receipts) {
      const row = el('div', 'receipt-line')
      row.appendChild(el('span', 'name', `/${receipt.name}`))
      row.appendChild(el('span', 'text', receipt.text))
      receiptsRow.appendChild(row)
    }
    receiptsRow.hidden = receipts.length === 0
  }

  function renderCard(run: TaskRun): HTMLElement {
    const card = el('div', `task-card ${run.status}`)
    card.appendChild(el('span', 'task-num', `${run.number}·`))
    card.appendChild(el('span', 'task-title', run.title))
    card.appendChild(el('span', `st ${run.status}`, statusLabel(run.status)))
    if (run.status === 'running' && run.sourceSlug === selectedSource) {
      const pause = el('button', 'task-act')
      pause.type = 'button'
      pause.dataset.cmd = 'pause'
      pause.textContent = '暂停'
      pause.addEventListener('click', () => void execute(pauseLine()))
      card.appendChild(pause)
    }
    return card
  }

  function render(): void {
    // run chips（按 source_slug 分组派生；点按切换该源视角）
    chipsRow.textContent = ''
    for (const chip of groupRunsBySource(deriveTaskRuns(deps.getEvents()))) {
      const chipEl = el(
        'button',
        `run-chip${chip.active ? ' active' : ''}${selectedSource === chip.sourceSlug ? ' selected' : ''}`,
      )
      chipEl.type = 'button'
      chipEl.textContent = `${chip.sourceSlug} ${chip.doneCount}/${chip.total}`
      chipEl.addEventListener('click', () => {
        selectedSource = selectedSource === chip.sourceSlug ? null : chip.sourceSlug
        render()
      })
      chipsRow.appendChild(chipEl)
    }
    // 任务卡：运行中置顶 / 已完成折叠
    list.textContent = ''
    const visible = runs()
    const active = visible.filter((run) => run.status !== 'done')
    const done = visible.filter((run) => run.status === 'done')
    for (const run of active) list.appendChild(renderCard(run))
    if (done.length > 0) {
      const group = el('details', 'done-group')
      group.appendChild(el('summary', undefined, `已完成 (${done.length})`))
      for (const run of done) group.appendChild(renderCard(run))
      list.appendChild(group)
    }
    if (visible.length === 0) list.appendChild(el('div', 'tasks-hint', '暂无任务'))
    // 底部统一派发（同源独占守卫：选中源活跃中 → 禁重复派发）
    const guardActive = selectedSource !== null && hasActiveSource(deriveTaskRuns(deps.getEvents()), selectedSource)
    dispatchBar.disabled = stale || busy || selectedSource === null || guardActive
    dispatchBar.textContent =
      selectedSource === null ? '派发任务（先选 run）' : guardActive ? '该源派发循环进行中' : `派发 ${selectedSource}`
    renderReceipts()
    syncButtons()
  }

  dispatchBar.addEventListener('click', () => {
    if (selectedSource === null) return
    void execute(dispatchLine(selectedSource))
  })

  const unsubscribe = deps.subscribe?.(() => refresh())

  function refresh(): void {
    stale = deps.isStale?.() ?? stale
    render()
  }
  ;(root as HTMLElement & { dispose?: () => void }).dispose = (): void => {
    unsubscribe?.()
  }

  refresh()
  return { root, refresh }
}

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'paused':
      return '已暂停'
    case 'blocked':
      return '受阻'
    case 'done':
      return '完成'
  }
}

export type { Projection }
