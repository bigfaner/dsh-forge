// workbench/watcher/events — WorkbenchEvent 批推缓冲(任务 2.6)。
//
// tech-design §Interface 1:事件推送通道 `dsh-forge:workbench-events`
// (主→渲染,批量节流 ≤500ms)。本模块是批推的缓冲半身:scanForgeFiles
// 产出的 ScanOutcome.events 逐轮入列,首个事件开窗、窗口到点整批发送;
// 同批窗口内同键事件以最后形态为准 —— 批内事件的终点恒等于快照最终态
// 投影,不产生「先旧后新」的回退闪烁。2.7 IPC 面把 sink 接到
// webContents.send;此处不感知 Electron。
//
// 合并键:task_updated → (type, projectId, taskKey);feature_updated →
// (type, projectId, featureSlug);sync → (type, projectId);migration_progress
// → (type, projectId, phase, result)(M3 v2 事件,任务 1.4);deviation_detected
// → (type, projectId)(M3 v2 事件,任务 1.5);prefs_updated → (type, scope,
// scopeId)(M3 v2 事件,任务 3.1)。批内顺序 = 首现位次(新键插到
// 批尾),载荷 = 最后形态。

import type { WorkbenchEvent } from '../indexer/diff.ts'

/** 批推送端(2.7 接 IPC;测试观测)。 */
export type WorkbenchEventSink = (events: readonly WorkbenchEvent[]) => void

export interface EventBatcherOptions {
  /** 批窗口(默认 500ms;首事件入列起算,到点整批发送)。 */
  readonly batchWindowMs?: number
}

export interface EventBatcher {
  /** 入列一轮扫描的事件(按扫描产出顺序);开窗。 */
  push(events: readonly WorkbenchEvent[]): void
  /** 立即发送待发事件(无待发即 no-op)—— stop/收尾通道,不丢事件。 */
  flush(): void
  /** 终结:取消未到点发送并丢弃待发事件。 */
  dispose(): void
  /** 当前待发事件数(诊断/测试观测面)。 */
  readonly pendingCount: number
}

const DEFAULT_BATCH_WINDOW_MS = 500

function coalesceKey(event: WorkbenchEvent): string {
  switch (event.type) {
    case 'task_updated':
      return `task_updated|${event.projectId}|${event.taskKey}`
    case 'feature_updated':
      return `feature_updated|${event.projectId}|${event.featureSlug}`
    case 'sync':
      return `sync|${event.projectId}`
    case 'migration_progress':
      return `migration_progress|${event.projectId}|${event.phase}|${event.result}`
    case 'deviation_detected':
      return `deviation_detected|${event.projectId}`
    case 'prefs_updated':
      return `prefs_updated|${event.scope}|${event.scopeId}`
  }
}

export function createEventBatcher(sink: WorkbenchEventSink, options: EventBatcherOptions = {}): EventBatcher {
  const windowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS
  const pending = new Map<string, WorkbenchEvent>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function deliver(): void {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (pending.size === 0) return
    const batch = [...pending.values()]
    pending.clear()
    sink(batch)
  }

  return {
    push(events) {
      if (events.length === 0) return
      for (const event of events) pending.set(coalesceKey(event), event)
      if (flushTimer === null) flushTimer = setTimeout(deliver, windowMs)
    },
    flush: deliver,
    dispose() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      pending.clear()
    },
    get pendingCount() {
      return pending.size
    },
  }
}
