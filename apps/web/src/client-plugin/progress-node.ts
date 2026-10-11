// 1.17 循环进度流内交错——'forge/progress' 会话事件的 Chat 节点定义（纯模块零 import
// ——classic script bundle 自含纪律）。形态 = 上游 dsh-client-ui-workflow-run 同型：
// `uiConversation.events.register(definition)`（goal-command-input 先例）+ `slots.inject
// ("conversation.chat.node", register key <nodeKind>)`（workflow-run 先例——keyed node
// body，dispatch 键 = buildViewNode.kind）。每枚事件独立成节点（id = 事件 seq——零折叠，
// seq 时序天然交错）；折叠 = 单行摘要 / 展开 = 事件详情（DisclosureRow 同族——组件本体
// 经壳 bundle 发布面 __DSH_FORGE_VIEWS__ 递达，注册归 client 插件）。
// 数据面：buildViewNode 数据透传 unknown（消费侧窄读守卫 = 壳树
// views/session/forge-progress-data.ts——2026-10-11 报障收口：守卫归唯一 runtime 消费者
// 壳树，client 树零引用，双入口零运行时共享）。

/** 会话事件类型键（plugin-forge FORGE_PROGRESS_EVENT_TYPE 字面量镜像——bundle 零跨包 import） */
export const FORGE_PROGRESS_EVENT_TYPE = 'forge/progress'
/** Chat 节点 kind（= conversation.chat.node keyed 槽 dispatch 键 = 发布组件名语义） */
export const FORGE_PROGRESS_NODE_KIND = 'forge-progress'
/** 官方 Chat 节点 keyed 槽（ui-conversation 消费面——workflow-run 同名洞） */
export const FORGE_PROGRESS_NODE_SLOT = 'conversation.chat.node'

/**
 * dsh uiConversation 服务窄面（上游 UiConversation events 注册表消费切片——goal/workflow-run
 * 同型：events.register(definition) 声明 Chat 节点折叠单位）。bundle 零外部 import——
 * 结构同型镜像。
 */
export interface ForgeUiConversationService {
  readonly events: {
    /** 注册一个节点 Definition；重复 kind 抛错（官方注册表语义——单次注册不触） */
    register(definition: unknown): void
  }
}

/** 会话事件消费切片（官方 SessionEvent 结构镜像：type/data/seq） */
export interface ForgeProgressEventLike {
  readonly type: string
  readonly seq: number
  readonly data?: unknown
}

/**
 * 'forge/progress' Chat 节点定义（uiConversation.events.register 消费形状——workflow-run
 * 同型：match/start/update/buildViewNode 四件）。零折叠：每枚事件 role 'start' 独立
 * 成节点（id = `forge-progress-<seq>`），事件重放/会话 fork 天然保留（fold 为日志纯函数）。
 */
export const forgeProgressDefinition = {
  kind: FORGE_PROGRESS_NODE_KIND,
  target: 'chat',
  match: (event: ForgeProgressEventLike): { id: string; role: 'start' } | null =>
    event !== undefined && event.type === FORGE_PROGRESS_EVENT_TYPE
      ? { id: `${FORGE_PROGRESS_NODE_KIND}-${String(event.seq)}`, role: 'start' }
      : null,
  start: (_context: unknown, match: { event: ForgeProgressEventLike }): { seq: number; data: unknown } => ({
    seq: match.event.seq,
    data: match.event.data,
  }),
  update: (context: { state: { seq: number; data: unknown } }): { seq: number; data: unknown } => context.state,
  buildViewNode: (context: {
    key: string
    id: string
    state: { seq: number; data: unknown } | undefined
  }): {
    key: string
    kind: typeof FORGE_PROGRESS_NODE_KIND
    id: string
    target: 'chat'
    anchorSeq: number
    visibility: 'visible'
    data: unknown
  } | null => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: FORGE_PROGRESS_NODE_KIND,
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      visibility: 'visible',
      data: context.state.data,
    }
  },
}
