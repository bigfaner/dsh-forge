// 会话日志进度回放录取面（1.41 自 apps/web client-plugin/plugin.ts FORGE_PROGRESS_LOG_TAP
// 块随事件折叠组三段注册迁入本包——loop-message-consolidation 1.3 消费侧兜底数据通道）：
// 'forge/progress' 事件经 stream 状态机 match 缝旁路录取（fold 主链零改动，match 纯观察）；
// 官方 reader 对打开会话的日志全量重放即天然回放源。会话切换以 seq 回退判读重置（新会话
// 日志 seq 从头）。壳侧 ShellHost（C 类常驻树）经本包窄子路径出口 client-ui/event-tap
// 值面直供消费（bug-model 先例——bundle 自含纪律下的合法跨单元值面）。

/** 进度事件条目（壳 DispatchEventsPanel DispatchEventEntry 同型镜像——bundle 自含纪律） */
export interface DispatchEventEntry {
  readonly sourceSlug: string
  readonly verb: string
  readonly status: "running" | "completed" | "blocked" | "interrupted"
  readonly taskKey?: string
  readonly taskTitle?: string
  readonly workerSessionId?: string
  readonly scenario?: string
  readonly note?: string
  readonly at: number
}

/** 回放快照（ShellHost 消费面——壳 DispatchProgressLogSnapshot 同型镜像） */
export interface DispatchProgressLogSnapshot {
  readonly entries: readonly DispatchEventEntry[]
}

/**
 * 进度回放录取态（模块单例——录取与消费共址本包；壳消费经 forgeProgressLogSource 只读）。
 */
const FORGE_PROGRESS_LOG_TAP: {
  entries: DispatchEventEntry[]
  lastSeq: number
  snapshot: DispatchProgressLogSnapshot
  listeners: Set<() => void>
} = { entries: [], lastSeq: -1, snapshot: { entries: [] }, listeners: new Set() };

/** 快照源消费切片（useSyncExternalStore 直连契约） */
export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** 回放源快照（ShellHost inject 递达面板——SnapshotSource 窄面） */
export const forgeProgressLogSource: SnapshotSource<DispatchProgressLogSnapshot> = {
  getSnapshot: () => FORGE_PROGRESS_LOG_TAP.snapshot,
  subscribe: (fn: () => void): (() => void) => {
    FORGE_PROGRESS_LOG_TAP.listeners.add(fn)
    return () => {
      FORGE_PROGRESS_LOG_TAP.listeners.delete(fn)
    }
  },
};

/** 状态四值守卫（DispatchEventEntry 必填面收紧——畸形弃事件不猜） */
function progressLogStatusOf(value: unknown): DispatchEventEntry["status"] | undefined {
  return value === "running" || value === "completed" || value === "blocked" || value === "interrupted" ? value : undefined
}

/** 可选字符串位窄收（非空串才收——载荷缺位/畸形 = undefined 不猜） */
function progressLogOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

/** 单枚进度事件录取（逐条守卫 → 追加快照 + 通知订阅面；畸形 = 静默跳过） */
export function tapForgeProgressEvent(event: { readonly type?: unknown; readonly seq?: unknown; readonly data?: unknown }): void {
  if (event?.type !== "forge/progress" || typeof event.seq !== "number" || !Number.isFinite(event.seq)) return
  const raw = event.data
  if (typeof raw !== "object" || raw === null) return
  const shape = raw as Record<string, unknown>
  const status = progressLogStatusOf(shape["status"])
  if (
    typeof shape["sourceSlug"] !== "string" ||
    shape["sourceSlug"] === "" ||
    typeof shape["verb"] !== "string" ||
    shape["verb"] === "" ||
    status === undefined ||
    typeof shape["at"] !== "number" ||
    !Number.isFinite(shape["at"])
  ) {
    return
  }
  if (event.seq <= FORGE_PROGRESS_LOG_TAP.lastSeq) {
    // 会话切换/日志重放判读（新会话 seq 从头）——录取面重置为当次会话日志
    FORGE_PROGRESS_LOG_TAP.entries = []
  }
  FORGE_PROGRESS_LOG_TAP.lastSeq = event.seq
  const entry: DispatchEventEntry = {
    sourceSlug: shape["sourceSlug"],
    verb: shape["verb"],
    status,
    taskKey: progressLogOptionalString(shape["taskKey"]),
    taskTitle: progressLogOptionalString(shape["taskTitle"]),
    workerSessionId: progressLogOptionalString(shape["workerSessionId"]),
    scenario: progressLogOptionalString(shape["scenario"]),
    note: progressLogOptionalString(shape["note"]),
    at: shape["at"],
  }
  FORGE_PROGRESS_LOG_TAP.entries = [...FORGE_PROGRESS_LOG_TAP.entries, entry]
  FORGE_PROGRESS_LOG_TAP.snapshot = { entries: FORGE_PROGRESS_LOG_TAP.entries }
  for (const listener of FORGE_PROGRESS_LOG_TAP.listeners) listener()
}
