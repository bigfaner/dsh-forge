// 写推送事件订阅层（3.1；交互二事件链 renderer 段——tech-design §交互二「web/rpc
// 共享订阅层 50ms 合并重取」裁决落点）。链路：core 写动词闭包尾部 emitTasksChanged →
// process.send（child 形态）→ main webContents.send('forge:events/tasks-changed') →
// preload onForgeTasksChanged（本模块唯一消费面）→ 共享订阅层 → 各视图重取活跃查询
//（概览/文档 tab/会话头 pill），延迟上限 500ms。
// 合并语义：50ms 窗内多事件合并为一次通知（载荷 latest-wins——重取方只关心「有变化」，
// 单写闭包单事件、多事件 = 多闭包连发，合并后一次重取即见最终值）。
// 形状权威 = apps/host/src/ipc/preload-api.ts 的 window.dshForge.onForgeTasksChanged
//（结构同型镜像，运行期边界禁互引源码）；preload 面缺席（非 Electron 载体）= 静默降级
// no-op 订阅（交互重取兜底——与 core 侧 direct 形态缺席静默同口径）。
import type { TasksChangedEvent } from '@dsh-forge/contracts'

/** 事件订阅回调（载荷只读 { projectId }——Hard Rule） */
export type TasksChangedListener = (payload: TasksChangedEvent) => void

/** preload 暴露面的事件切片（window.dshForge.onForgeTasksChanged） */
export type TasksChangedSubscribe = (cb: TasksChangedListener) => () => void

interface DshForgeEventGlobal {
  onForgeTasksChanged?: TasksChangedSubscribe
}

/** 合并窗（ms）——重取合并与表单防抖均归 web/rpc 模块（tech-design §交互二裁决） */
export const TASKS_CHANGED_COALESCE_MS = 50

/** 取 preload 订阅真身；缺席 = undefined（非 Electron 载体 / preload 未接事件面） */
export function preloadTasksChangedSubscribe(): TasksChangedSubscribe | undefined {
  const bridge = (globalThis as { dshForge?: DshForgeEventGlobal }).dshForge
  return typeof bridge?.onForgeTasksChanged === 'function' ? bridge.onForgeTasksChanged : undefined
}

/** 订阅中枢面（subscribe = 入层退订器；flush = 测试面——立即结算合并窗） */
export interface TasksChangedHub {
  subscribe(listener: TasksChangedListener): () => void
  flush(): void
}

/**
 * 建订阅中枢（单底层订阅 + 本地监听扇出 + 50ms 尾沿合并）。首监听挂底层订阅、
 * 末退订拆订阅（无监听零占用）；监听方异常隔离（不阻断其余监听与底层）。
 * @param underlying - preload 订阅真身（或测试替身）
 */
export function createTasksChangedHub(underlying: TasksChangedSubscribe): TasksChangedHub {
  const listeners = new Set<TasksChangedListener>()
  let pending: TasksChangedEvent | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending === undefined) return
    const payload = pending
    pending = undefined
    for (const listener of listeners) {
      try {
        listener(payload)
      } catch {
        // 监听方异常隔离——其余监听与底层订阅照常
      }
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (unsubscribe === undefined) {
        unsubscribe = underlying((payload) => {
          pending = payload
          if (timer !== undefined) return // 窗内连发——合并不重置计时
          timer = setTimeout(flush, TASKS_CHANGED_COALESCE_MS)
        })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && unsubscribe !== undefined) {
          unsubscribe()
          unsubscribe = undefined
          if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
          }
          pending = undefined // 末监听已退——待发载荷不再结算
        }
      }
    },
    flush, // 测试面：合并窗立即结算（不改语义——与计时到期同径）
  }
}

/** 共享单例（进程内唯一底层订阅——多视图共用） */
let sharedHub: TasksChangedHub | undefined

/**
 * 订阅入口（视图消费面）：概览/文档 tab/会话头 pill 重取活跃查询。
 * preload 面缺席 = 静默降级 no-op 退订器（交互重取兜底）。
 */
export function subscribeTasksChanged(listener: TasksChangedListener): () => void {
  const underlying = preloadTasksChangedSubscribe()
  if (underlying === undefined) return () => {}
  sharedHub ??= createTasksChangedHub(underlying)
  return sharedHub.subscribe(listener)
}
