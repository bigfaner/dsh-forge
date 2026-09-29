// client/projection/snapshot-report — 原生 workspace 快照 follow 流的上报
// 腿(任务 3.3;tech-design §Interface 2 对账输入面)。
//
// 数据源 = 上游 client 侧 `workspaces` 服务的 `list` 快照源(vendored
// workspace-controller/client:RemoteSnapshotStream follow 流的物化,items
// 数组序 = 宿主注册表序;project-seat toWorkspacesSource 同款守卫窄化,无
// api-* 依赖)。上报面 = Interface 1 v3 `submitWorkspaceSnapshot`(3.2 已
// 落地:handler 形状校验 + 主进程 log + 250ms debounce 对账;快照不落库,
// T2 零写放大)。
//
// 行为契约:
//   - 启动即上报一次(存量 pending 收数):源就位且 phase='ready'(首个
//     baseline 已到)立即上报;phase='pending' 不上报 —— 空上报会被内核
//     读作「注册表为空」的事实(≠ 实况未知),驱动伪 deleted 偏差;
//   - 后续通知 debounce 合并(follow 增量成簇到达;与内核侧 250ms 对账
//     窗口同量级);内容未变不上报(state/archived 等不消费位的无效化
//     通知被等值门吸收);
//   - 源缺席(app-tier 服务晚注册/降级世界)= 有界可用性轮询等待
//     (dispatch-relay 先例:250ms 节拍 ~60s 上限),缺席 = 不上报,内核
//     保持实况未知(null),后续任何到达即恢复。

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { WorkspaceSnapshotEntry } from '../ipc-types'

/** The upstream workspace snapshot source (follow 流物化;duck-typed 子集)。 */
export interface WorkspaceSnapshotSource {
  /** items 数组序 = 宿主注册表序(baseline 序 + order 帧重排)。 */
  getSnapshot(): {
    readonly items: ReadonlyArray<{ readonly workspaceId: string; readonly path: string; readonly title: string }>
    /** 'ready' = 首个 baseline 已到;‘pending’ = 收数未建立,不可上报。 */
    readonly phase: 'pending' | 'ready'
  }
  /** 订阅快照无效化通知;返回退订。 */
  subscribe(listener: () => void): () => void
}

/** The upstream `workspaces` service key (client-side WorkspaceController). */
export const WORKSPACES_SERVICE_KEY = 'workspaces'

const isObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === 'object' && candidate !== null

const isFunction = (candidate: unknown): candidate is (...args: never[]) => unknown =>
  typeof candidate === 'function'

/**
 * Narrow the `ctx.workspaces` service onto the read-only snapshot source
 * (per-call guarded; the 2.9 bridging discipline — the service nests its
 * store under `.list`, absent/malformed = undefined, never a throw).
 */
export function workspacesSourceOf(ctx: ClientContext): WorkspaceSnapshotSource | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get(WORKSPACES_SERVICE_KEY, false)
  } catch {
    return undefined
  }
  if (!isObject(candidate) || !isObject(candidate.list)) return undefined
  const list = candidate.list
  if (!isFunction(list.getSnapshot) || !isFunction(list.subscribe)) return undefined
  const nested = list as unknown as {
    getSnapshot(): ReturnType<WorkspaceSnapshotSource['getSnapshot']>
    subscribe(listener: () => void): () => void
  }
  return {
    getSnapshot: () => nested.getSnapshot(),
    subscribe: listener => nested.subscribe(listener),
  }
}

/** items → submitWorkspaceSnapshot 入参条目(orderIdx = 数组序)。 */
export function snapshotEntriesOf(
  items: ReadonlyArray<{ readonly workspaceId: string; readonly path: string; readonly title: string }>,
): WorkspaceSnapshotEntry[] {
  return items.map((item, index) => ({
    workspaceId: item.workspaceId,
    path: item.path,
    title: item.title,
    orderIdx: index,
  }))
}

/** 上报 debounce 窗口 ms(缺省;与内核对账 250ms 同量级)。 */
export const SNAPSHOT_REPORT_DEBOUNCE_MS = 300
/** 源可用性轮询节拍/上限(dispatch-relay 先例:250ms × 240 ≈ 60s)。 */
export const SNAPSHOT_SOURCE_POLL_MS = 250
export const SNAPSHOT_SOURCE_POLL_MAX_TRIES = 240

/** The reporter's diagnostics sink(absent = silent;非致命面从不弹错)。 */
export type ProjectionRelayLog = (message: string, detail?: unknown) => void

export const PROJECTION_LOG_PREFIX = '[forge-workbench: projection]'

/** The console-warn default(BIZ-resilience-001:结构化 log,非 UI 错误)。 */
export const defaultProjectionRelayLog: ProjectionRelayLog = (message, detail) => {
  console.warn(`${PROJECTION_LOG_PREFIX} ${message}`, detail)
}

/** createSnapshotReporter 装配入参(全依赖注入,测试确定性)。 */
export interface SnapshotReporterDeps {
  /** 每次尝试时解析快照源(懒解析;缺席 → undefined → 有界轮询等待)。 */
  readonly resolveSource: () => WorkspaceSnapshotSource | undefined
  /** 上报面(submitWorkspaceSnapshot 腿;拒绝由 reporter 吸收 + log)。 */
  readonly submit: (workspaces: readonly WorkspaceSnapshotEntry[]) => Promise<void>
  /** debounce 窗口 ms(缺省 300)。 */
  readonly debounceMs?: number
  /** 源轮询节拍 ms(缺省 250)。 */
  readonly pollMs?: number
  /** 源轮询上限次数(缺省 240 ≈ 60s)。 */
  readonly pollMaxTries?: number
  /** 诊断 sink(缺省 console.warn)。 */
  readonly log?: ProjectionRelayLog
}

export interface SnapshotReporter {
  /** 退订 + 清理计时器(幂等)。 */
  dispose(): void
}

/**
 * The follow-flow snapshot reporter: bounded availability wait for the
 * source, one immediate boot report once a ready baseline exists, and
 * debounced + equality-gated reports on subsequent invalidation notices.
 * Fresh entries are read AT FLUSH TIME (bursty notices never submit a stale
 * capture). A rejected submit re-arms the equality gate so the next notice
 * retries the same content.
 */
export function createSnapshotReporter(deps: SnapshotReporterDeps): SnapshotReporter {
  const debounceMs = deps.debounceMs ?? SNAPSHOT_REPORT_DEBOUNCE_MS
  const pollMs = deps.pollMs ?? SNAPSHOT_SOURCE_POLL_MS
  const pollMaxTries = deps.pollMaxTries ?? SNAPSHOT_SOURCE_POLL_MAX_TRIES
  const log = deps.log ?? defaultProjectionRelayLog

  let disposed = false
  let unsubscribed: (() => void) | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let lastKey: string | null = null
  let tries = 0

  const entryKey = (entries: readonly WorkspaceSnapshotEntry[]): string =>
    JSON.stringify(entries)

  const submitNow = (entries: readonly WorkspaceSnapshotEntry[]): void => {
    lastKey = entryKey(entries)
    deps.submit(entries).catch((error: unknown) => {
      // 上报失败 = 非致命:重置等值门(下次通知同内容重试)+ 结构化 log。
      lastKey = null
      log('snapshot submit rejected (will retry on next notice)', { reason: String(error) })
    })
  }

  /** 读当前快照;ready + 内容变化才上报。immediate = 启动腿不等 debounce。 */
  const reportFromSnapshot = (immediate: boolean): void => {
    const source = deps.resolveSource()
    if (source === undefined) return
    const snapshot = source.getSnapshot()
    if (snapshot.phase !== 'ready') return
    const entries = snapshotEntriesOf(snapshot.items)
    if (entryKey(entries) === lastKey) return
    if (immediate) {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }
      submitNow(entries)
      return
    }
    if (debounceTimer !== undefined) return
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      // 冲刷时重读(freshest);等值门吸收窗口期内的无变化腿。
      reportFromSnapshot(true)
    }, debounceMs)
  }

  const arm = (): boolean => {
    const source = deps.resolveSource()
    if (source === undefined) return false
    unsubscribed = source.subscribe(() => { reportFromSnapshot(false) })
    reportFromSnapshot(true) // 启动即上报一次(存量 pending 收数)
    return true
  }

  function teardown(): void {
    if (disposed) return
    disposed = true
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
    unsubscribed?.()
    unsubscribed = undefined
  }

  if (arm()) return { dispose: teardown }
  pollTimer = setInterval(() => {
    if (disposed) return
    tries += 1
    if (arm() || tries >= pollMaxTries) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }, pollMs)
  return { dispose: teardown }
}
