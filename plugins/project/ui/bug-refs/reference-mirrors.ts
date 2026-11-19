// 上游服务面结构同型镜像（定位：装配——bundle 自含纪律：本文件零上游 import，
// open-session 同径镜像）。chip-restore 重建缝消费的官方面窄切片在此字面承载，
// 与 apps/web client-plugin/open-session.ts 同源同形——漂移由两侧字面 pin 测试对账。
/** composer 输入 facade 窄面（镜像上游 SessionInput——draft 缝 + 提交 + 聚焦） */
export interface ComposerInputFace {
  /** 整体替换草稿（官方 persisted-draft 种子同径） */
  setDraft(text: string): void
  /** 进入提交（adjudication / claim 事务 / 默认 sink 内聚——Enter/发送钮同径） */
  submit(): void
  /** 键盘焦点归还 composer（兜底形态：聚焦 + 引导粘贴） */
  focus(): void
  /**
   * 输入状态快照源（官方 InputState 消费切片——draft/draftRev；span-CAS 构造单源；
   * occurrences = 症状级防御复核面。subscribe 在场 = 快照店变更通知（bug 4b34e5d8
   * 重建缝订阅驱动；缺席 = 只做一次性重建）。窄面缺席 = undefined——引用插入判不可用。
   */
  readonly state?: {
    getSnapshot(): { readonly draft: string; readonly draftRev: number; readonly occurrences?: readonly unknown[] }
    subscribe?(listener: () => void): () => void
  }
}

/** 会话绑定窄面（镜像上游 SessionBinding 消费切片——会话作用域 ctx 递达物） */
export interface ReferenceBinding {
  readonly ctx: unknown
}

/** sessions 服务窄面（镜像 ISessions.binding——借用既保留会话代际的绑定） */
export interface ReferenceSessions {
  binding(sessionId: string): ReferenceBinding | undefined
}

/** conversation 服务窄面（镜像 IConversation.input——SessionInputResolver 消费切片） */
export interface ReferenceConversation {
  readonly input: { for(actx: unknown): ComposerInputFace }
}

/** TokenSpan 结构同型镜像（镜像上游 draft-editor TokenSpan——span-CAS 三元组） */
export interface TokenSpanMirror {
  readonly start: number
  readonly end: number
  readonly draftRev: number
}

/** ReferenceInsert 结构同型镜像（镜像上游 draft-editor ReferenceInsert 消费切片） */
export interface ReferenceInsertMirror {
  readonly source: string
  readonly ref: string
  readonly label: string
  readonly clipboardText: string
}

/** scoped 事件 bail 窄面（cordis ctx.bail——actx 作主语；官方 input-trigger execute 同径） */
export type ScopedEventBail = (actx: unknown, name: string, payload: unknown) => unknown

/** 引用插入依赖（会话寻址 + 输入面 + scoped 事件发射——测试注入面） */
export interface ReferenceInsertServices {
  readonly sessions: ReferenceSessions
  readonly conversation: ReferenceConversation
  readonly bail: ScopedEventBail
}

/** 官方 scoped 引用插入事件名（上游 input.d.ts Events 契约字面量——span-CAS 变更动词） */
export const INPUT_INSERT_REFERENCE_EVENT = 'slash/input-insert-reference'
