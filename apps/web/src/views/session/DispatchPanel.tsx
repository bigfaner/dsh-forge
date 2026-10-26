// worker 执行会话解析面（定位：业务装配辅助——loop-event-delivery 1.8 后派发任务悬浮面板
// 已由 DispatchEventsPanel（进度流面板）接替退役；本模块仅保留概览任务 tab 仍在消费的
// worker 解析纯函数：taskDetail 挂接双源卡 → 执行会话 + 库侧权威父）。
// 数据纪律（4.2 Integration #2 承袭）：唯一通道 = forge:tasks/detail；错误 fail-soft。
import type { SessionTaskLinkCard, TaskDetailQuery } from '@dsh-forge/contracts'
import type { ForgeRpcClient } from '../../rpc/index.js'

/**
 * worker 执行会话解析（纯函数——D6 ⟞ 判读口径）：任务挂接双源卡中 record 源且不在 link 派发集的
 * 会话（claim 审计行 session = 派发会话本身 → 排除；spawn/submit 审计行 = 执行会话）。
 * 取**最后**命中（卡片按 createdAt 序——claim 重入再派发时旧行保留，最新行 = 当前执行
 * 会话；spawn 行诞生即落库，进行中任务库侧即精确）。无执行会话（未派发执行/纯派发）=
 * null。
 */
export function workerSessionOf(sessions: readonly SessionTaskLinkCard[]): string | null {
  const dispatchSessions = new Set(
    sessions.filter((session) => session.source === 'link').map((session) => session.sessionId),
  )
  let worker: string | null = null
  for (const session of sessions) {
    if (session.source === 'record' && !dispatchSessions.has(session.sessionId)) worker = session.sessionId
  }
  return worker
}

/**
 * worker 的 durable 父会话解析（纯函数——D6 修复面）：link 派发源 = 派发会话 = worker 的
 * 父（dispatchTask 自本会话 spawn——parent = 派发 agent）。库侧权威：进行中 worker 的
 * 账本行/盘上日志均未落的场景也恒可得（打开链显式父优先径的输入）。无 link 源 =
 * undefined（调用面走账本判读径）。
 */
export function parentSessionOf(sessions: readonly SessionTaskLinkCard[]): string | undefined {
  return sessions.find((session) => session.source === 'link')?.sessionId
}

/** worker 会话解析结果（打开链输入——worker id + 库侧权威父） */
export interface WorkerSessionRef {
  readonly worker: string | null
  readonly parent: string | undefined
}

/** worker 会话解析（纯异步面）：taskDetail 挂接面 → workerSessionOf + parentSessionOf；
 * 错误 fail-soft（worker=null/parent=undefined） */
export async function fetchWorkerSession(
  client: ForgeRpcClient,
  q: TaskDetailQuery,
): Promise<WorkerSessionRef> {
  try {
    const detail = await client.tasks.detail(q)
    return { worker: workerSessionOf(detail.sessions), parent: parentSessionOf(detail.sessions) }
  } catch {
    return { worker: null, parent: undefined }
  }
}
