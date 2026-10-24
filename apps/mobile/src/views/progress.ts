/**
 * progress 进度流（loop-event-delivery 1.10——mobile 同契约消费）：
 * 数据源 = 投影键 `forge-dispatch-events`（host 侧 fold 'forge/progress' 会话事件，
 * wire view {entries, total}）——经既有 `forge:proxy/session-projections` RPC 全量键
 * 读取（传输层零改动，新键自动到达 values）；实时刷新 = forge-stream 投影变更帧镜像
 * （`session/projection` 帧 {sessionId, key, seq}——host subscribeProjectionMirror 接线，
 * 帧只当失效信号，值恒走 RPC 重拉）。
 *
 * 展示形态（prototype.html mobile 窄幅）：单列轨 + 状态点 + title——状态点色随
 * running/completed/blocked/interrupted；note（阻塞/挂起原因摘要）作次级行；时间
 * HH:MM；tail 视图（最近在末）。
 */
import type { RemoteRpc } from '../core/rpc.ts'
import { PROXY_SESSION_PROJECTIONS_CHANNEL } from '../core/rpc.ts'
import { el } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 纯函数：投影值收敛（fail-soft——键缺席/形状非法 = undefined，视图诚实降级）
// ---------------------------------------------------------------------------

/** 投影键（host dispatch-events.ts FORGE_DISPATCH_EVENTS_PROJECTION_KEY 字面量同源镜像） */
export const DISPATCH_EVENTS_PROJECTION_KEY = 'forge-dispatch-events'

/** 窗口内单条进度事件条目（host ForgeProgressEventData 载荷切片——plain JSON） */
export interface ProgressEntry {
  readonly sourceSlug: string
  readonly verb: string
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  readonly taskKey?: string
  readonly taskTitle?: string
  readonly workerSessionId?: string
  readonly scenario?: string
  readonly note?: string
  readonly at: number
}

/** 投影 wire 值（{entries 窗口, total 总数}——host ForgeDispatchEventsProjection 同形） */
export interface DispatchEventsProjection {
  readonly entries: readonly ProgressEntry[]
  readonly total: number
}

const STATUS_SET: ReadonlySet<string> = new Set(['running', 'completed', 'blocked', 'interrupted'])

/** 单条收敛（缺字段/非法行 fail-soft 丢弃——不猜不弃白） */
function coerceEntry(raw: unknown): ProgressEntry | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  if (typeof row['sourceSlug'] !== 'string' || row['sourceSlug'] === '') return undefined
  if (typeof row['verb'] !== 'string' || row['verb'] === '') return undefined
  if (typeof row['status'] !== 'string' || !STATUS_SET.has(row['status'])) return undefined
  if (typeof row['at'] !== 'number' || !Number.isFinite(row['at'])) return undefined
  return {
    sourceSlug: row['sourceSlug'],
    verb: row['verb'],
    status: row['status'] as ProgressEntry['status'],
    ...(typeof row['taskKey'] === 'string' ? { taskKey: row['taskKey'] } : {}),
    ...(typeof row['taskTitle'] === 'string' ? { taskTitle: row['taskTitle'] } : {}),
    ...(typeof row['workerSessionId'] === 'string' ? { workerSessionId: row['workerSessionId'] } : {}),
    ...(typeof row['scenario'] === 'string' ? { scenario: row['scenario'] } : {}),
    ...(typeof row['note'] === 'string' ? { note: row['note'] } : {}),
    at: row['at'],
  }
}

/** 投影值收敛（entries 逐条守卫；非法整体 = undefined） */
export function coerceDispatchEvents(raw: unknown): DispatchEventsProjection | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const view = raw as { entries?: unknown; total?: unknown }
  if (!Array.isArray(view.entries)) return undefined
  if (typeof view.total !== 'number' || !Number.isInteger(view.total) || view.total < 0) return undefined
  const entries = view.entries.map(coerceEntry).filter((entry): entry is ProgressEntry => entry !== undefined)
  return { entries, total: view.total }
}

/** RPC 全量键读取（session-projections 既有通道——零传输改动）：键缺席/失败 = undefined。 */
export async function loadDispatchEvents(
  rpc: { call<T = unknown>(channel: string, payload: unknown): Promise<{ ok: boolean; data?: T }> },
  sessionId: string,
): Promise<DispatchEventsProjection | undefined> {
  if (sessionId === '') return undefined
  const result = await rpc.call<Record<string, unknown>>(PROXY_SESSION_PROJECTIONS_CHANNEL, { sessionId })
  if (!result.ok) return undefined
  const values = (result.data as { values?: unknown } | null)?.values
  if (typeof values !== 'object' || values === null) return undefined
  return coerceDispatchEvents((values as Record<string, unknown>)[DISPATCH_EVENTS_PROJECTION_KEY])
}

// ---------------------------------------------------------------------------
// 纯函数：行模型（状态点色 + title + note + 时间）
// ---------------------------------------------------------------------------

export type ProgressTone = 'run' | 'done' | 'blk' | 'stop'

/** 状态点色映射（prototype 同款四态）：running=accent / completed=success / blocked=warn / interrupted=caption。 */
export function progressTone(status: ProgressEntry['status']): ProgressTone {
  switch (status) {
    case 'running':
      return 'run'
    case 'completed':
      return 'done'
    case 'blocked':
      return 'blk'
    case 'interrupted':
      return 'stop'
  }
}

const STATUS_LABEL: Record<ProgressEntry['status'], string> = {
  running: '执行中',
  completed: '完成',
  blocked: '阻塞',
  interrupted: '已中断',
}

/** HH:MM（本机时区——mobile 既有时间口径）。 */
export function progressWhen(at: number): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 行模型：title = taskTitle ?? taskKey ?? sourceSlug；note = 状态词（+ 叙述注记）。 */
export function progressRow(entry: ProgressEntry): { tone: ProgressTone; title: string; note: string; when: string } {
  const title = entry.taskTitle ?? entry.taskKey ?? entry.sourceSlug
  const note = entry.note !== undefined && entry.note !== '' ? `${STATUS_LABEL[entry.status]} · ${entry.note}` : STATUS_LABEL[entry.status]
  return { tone: progressTone(entry.status), title, note, when: progressWhen(entry.at) }
}

// ---------------------------------------------------------------------------
// 视图装配（窄幅进度流——tasks 浮层进度段）
// ---------------------------------------------------------------------------

export interface ProgressStreamDeps {
  readonly rpc: RemoteRpc
  readonly sessionId: string
  /** 投影变更帧订阅（session/projection 帧到达本会话本键 → refresh；缺席 = 打开时静态投影）。 */
  readonly subscribe?: (onRefresh: () => void) => () => void
}

export interface ProgressStreamHandle {
  readonly root: HTMLElement
  refresh(): void
  dispose(): void
}

export const PROGRESS_STREAM_WINDOW = 20

/** 窄幅进度流：bar（点 + 任务进度 + total）+ 单列轨行（tail 最近 N 条）。 */
export function createProgressStream(deps: ProgressStreamDeps): ProgressStreamHandle {
  const root = el('div', 'pstream')
  const bar = el('div', 'pstream-bar')
  bar.appendChild(el('span', 'dot'))
  bar.appendChild(el('span', 'label', '任务进度'))
  const totalEl = el('span', 'total', '')
  bar.appendChild(totalEl)
  const flow = el('div', 'pstream-flow')
  root.append(bar, flow)

  function render(projection: DispatchEventsProjection | undefined): void {
    flow.textContent = ''
    if (projection === undefined || projection.entries.length === 0) {
      totalEl.textContent = ''
      flow.appendChild(el('div', 'pstream-hint', '暂无进度事件'))
      return
    }
    totalEl.textContent = String(projection.total)
    const tail = projection.entries.slice(-PROGRESS_STREAM_WINDOW)
    for (const entry of tail) {
      const row = progressRow(entry)
      const line = el('div', `prow ${row.tone}`)
      const rail = el('span', 'rail')
      rail.appendChild(el('i', undefined))
      const t = el('span', 't')
      t.appendChild(el('span', 'ttl', row.title))
      t.appendChild(el('span', 'note', row.note))
      line.append(rail, t)
      flow.appendChild(line)
    }
  }

  async function refresh(): Promise<void> {
    try {
      render(await loadDispatchEvents(deps.rpc, deps.sessionId))
    } catch {
      render(undefined) // 断连/键缺席 = 诚实空态（轮询/重连后自愈）
    }
  }

  const unsubscribe = deps.subscribe?.(() => void refresh())
  void refresh()
  return {
    root,
    refresh,
    dispose: () => unsubscribe?.(),
  }
}
