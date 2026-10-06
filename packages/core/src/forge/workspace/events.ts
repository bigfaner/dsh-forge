// forge 域事件发射器底座（任务 1.2；tech-design §交互二：写动词事务提交后 →
// emitTasksChanged → process.send（缺席静默）→ run.ts event 分支 → webContents.send →
// renderer 订阅重取 ≤500ms）。信封形状 = contracts BridgeEventMessage（1.1 定稿）——
// 扩消息变体 = 契约面变更，禁私改。channel 常量唯一源 = FORGE_EVENT_CHANNELS。
import { FORGE_EVENT_CHANNELS, type BridgeEventMessage, type TasksChangedEvent } from '@dsh-forge/contracts'

/** 事件发射器底座（四域写动词闭包尾部挂点——emitTasksChanged 同通道同载荷） */
export interface ForgeTaskEvents {
  /** 任务面变更发射（写动词事务提交后调用；进程内订阅 + 桥推送两路送达） */
  emitTasksChanged(projectId: string): void
  /** 进程内订阅（返回退订器；订阅方抛错不阻断其余订阅与桥推送） */
  onTasksChanged(listener: (payload: TasksChangedEvent) => void): () => void
}

/** 桥推送（child → main 单向）：direct 形态 IPC 缺席 = process.send undefined → 静默降级
 *  （交互重取兜底）；通道关闭返回 false / 抛错同静默——发射永不拖垮写动词闭包。 */
function sendBridgeEvent(message: BridgeEventMessage): void {
  if (typeof process === 'undefined' || typeof process.send !== 'function') return
  try {
    process.send(message)
  } catch {
    // 静默降级（交互重取兜底）
  }
}

/** 建发射器（实例私有订阅表——装配单例，四域共享） */
export function createForgeTaskEvents(): ForgeTaskEvents {
  const listeners = new Set<(payload: TasksChangedEvent) => void>()
  return {
    emitTasksChanged(projectId: string): void {
      const payload: TasksChangedEvent = { projectId }
      for (const listener of listeners) {
        try {
          listener(payload)
        } catch {
          // 订阅方异常隔离——其余订阅与桥推送照常
        }
      }
      sendBridgeEvent({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload })
    },
    onTasksChanged(listener: (payload: TasksChangedEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
