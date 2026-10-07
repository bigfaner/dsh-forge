// 产品自建进程内事件总线（任务 3.3；tech-design Interface 3 + 图 5 节点 B/C）。
// 两层抽象 = 信封（ForgePluginEventEnvelope）× 事件内型（ForgePluginEventVariant）——
// contracts 1.1 定稿的 ForgePluginEvent 判别联合；信封 {ts,sessionId,slug,type,payload}
// 恒全（emit 入口守卫 fail-loud——装配 bug 零静默）。
// 形制参考 dsh/Cordis 事件机制（订阅面 + 退订器 + 发射方异常隔离），零上游复用零
// import（结构化最小面纪律——deps 恒 contracts + path-key，boundaries pin）。
// 工具执行零日志代码（AC4）：tool 面只 emit 事件（emit 点随 3.4/3.5 工具路径接入），
// 落盘归监听器（log-listener.ts——唯一写者）。
import { FORGE_PLUGIN_EVENT_TYPES, type ForgePluginEvent } from '@dsh-forge/contracts'

/** 订阅面（信封级——两层抽象的外层入口；handler 抛错被总线隔离） */
export type ForgeEventHandler = (event: ForgePluginEvent) => void

/** 进程内事件总线（emit/subscribe；装配单例——监听器与后续分析面共用） */
export interface ForgeEventBus {
  /** 发射（同步按订阅序送达）；信封不完整 = TypeError（先守卫后分发——零送达） */
  emit(event: ForgePluginEvent): void
  /** 订阅；返回退订器（effect disposer 同形制；同 handler 重复订阅 Set 去重） */
  on(handler: ForgeEventHandler): () => void
}

/** 信封恒全守卫（AC1）：五字段齐备且值域合法——ts 有限数（epoch 毫秒）、
 *  sessionId/slug 非空串、type ∈ 七事件全集、payload 为对象。emit 入口调用；
 *  导出 = 监听器/测试面共用防线（直接 handle 调用方可自证）。 */
export function assertForgeEventEnvelope(event: ForgePluginEvent): void {
  const problems: string[] = []
  if (typeof event.ts !== 'number' || !Number.isFinite(event.ts)) problems.push('ts 必须为有限数字（epoch 毫秒）')
  if (typeof event.sessionId !== 'string' || event.sessionId === '') problems.push('sessionId 必须为非空字符串')
  if (typeof event.slug !== 'string' || event.slug === '') problems.push('slug 必须为非空字符串')
  if (!FORGE_PLUGIN_EVENT_TYPES.includes(event.type)) {
    problems.push(`type 必须为七事件全集之一（收到 ${String(event.type)}）`)
  }
  if (typeof event.payload !== 'object' || event.payload === null) problems.push('payload 必须为对象')
  if (problems.length > 0) throw new TypeError(`ForgePluginEvent 信封不完整：${problems.join('；')}`)
}

/** 建总线（实例私有订阅表——装配单例；两实例订阅表隔离） */
export function createForgeEventBus(): ForgeEventBus {
  const handlers = new Set<ForgeEventHandler>()
  return {
    emit(event: ForgePluginEvent): void {
      assertForgeEventEnvelope(event)
      for (const handler of handlers) {
        try {
          handler(event)
        } catch {
          // 订阅方异常隔离（core events.ts 桥推送同纪律）——发射永不拖垮其余订阅与工具执行闭包
        }
      }
    },
    on(handler: ForgeEventHandler): () => void {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
  }
}
