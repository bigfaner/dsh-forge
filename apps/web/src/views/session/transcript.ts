// 转录视图模型与轨迹台账投影（定位：业务——UF-4 轨迹 tab 数据面，纯函数零 React）。
// 数据源权威 = S2 清单 §2.1/§2.2：转录面 ChatSnapshot（order/nodes/timeline）与 ConversationNode
// 族（UserMessage/SteeringMessage/AssistantMessage/PartialAssistant/Command/CompactionSummary/
// ContextMessage/ModelRetry/ToolResult/StartedToolCall/PreparingToolCall/RunningToolCall/TurnError/
// TurnMaxTokens/UnknownSurface/TodoItem）。本模块定义装配（2.12）可映射的最小消费切片
// TranscriptEntry（语义类——wire 判别值 → 语义类映射表归装配层锚定，S2 残留 §4-5 随装配实跑
// 入 G1 pin 池）与投影 buildTrajectoryLedger（AC-3 一致性 = 投影单测 pin：seq 升序 + 交错次序）。
// 本模块零依赖纯函数（无 React/无 RPC——数据进出全经参数）。

/** 转录条目语义类（ConversationNode 族的台账消费归类；映射表见模块 README） */
export type TranscriptEntryKind =
  | 'user-message' // UserMessage / SteeringMessage —— 用户侧输入（含转向）
  | 'assistant-message' // AssistantMessage / PartialAssistant —— 回答面
  | 'command' // Command —— 斜杠命令输入
  | 'tool-started' // StartedToolCall / PreparingToolCall —— 工具调用发起
  | 'tool-running' // RunningToolCall —— 工具调用执行中
  | 'tool-result' // ToolResult —— 工具调用返回
  | 'turn-error' // TurnError / TurnMaxTokens —— 回合失败
  | 'system' // CompactionSummary / ContextMessage / ModelRetry / TodoItem 等系统事件

/** 转录条目（ChatSnapshot 节点的最小消费切片；装配自官方快照逐节点映射） */
export interface TranscriptEntry {
  /** 稳定键（= ChatSnapshot.order 成员锚键；台账行 key 与 React 复用锚） */
  readonly key: string
  /** 时序序号（SessionSeq 升序——台账排序唯一依据） */
  readonly seq: number
  /** 语义类（映射自 ConversationNode 判别） */
  readonly kind: TranscriptEntryKind
  /** 所属回合（TurnLocation.turn；系统事件可缺席） */
  readonly turn?: number
  /** 消息/事件/错误文本（台账呈现摘要；可缺席） */
  readonly text?: string
  /** 工具名（tool-* 类条目；可缺席=未知工具） */
  readonly toolName?: string
}

/** 台账行公共字段（行键 = 转录锚键；seq/turn 透传——时序与回合归组依据） */
export interface TrajectoryRowBase {
  readonly key: string
  readonly seq: number
  readonly turn?: number
}

/** 消息行（用户/助手侧） */
export interface TrajectoryMessageRow extends TrajectoryRowBase {
  readonly kind: 'message'
  readonly side: 'user' | 'assistant'
  readonly text: string
}

/** 工具调用行（相位 = 发起/执行中/返回，随转录时序各自成行——最简台账不合并生命周期） */
export interface TrajectoryToolRow extends TrajectoryRowBase {
  readonly kind: 'tool'
  readonly phase: 'started' | 'running' | 'result'
  readonly toolName: string
}

/** 系统事件行（压缩/上下文/重试等） */
export interface TrajectoryEventRow extends TrajectoryRowBase {
  readonly kind: 'event'
  readonly text: string
}

/** 错误行（回合失败/上限截断） */
export interface TrajectoryErrorRow extends TrajectoryRowBase {
  readonly kind: 'error'
  readonly text: string
}

/** 轨迹台账行（四类；渲染面 = TrajectoryLedger.tsx） */
export type TrajectoryLedgerRow =
  | TrajectoryMessageRow
  | TrajectoryToolRow
  | TrajectoryEventRow
  | TrajectoryErrorRow

/** 语义类 → 台账行投影（全表闭合；default 分支 never 收口） */
function projectEntry(entry: TranscriptEntry): TrajectoryLedgerRow {
  const base = { key: entry.key, seq: entry.seq, turn: entry.turn }
  switch (entry.kind) {
    case 'user-message':
    case 'command':
      return { ...base, kind: 'message', side: 'user', text: entry.text ?? '' }
    case 'assistant-message':
      return { ...base, kind: 'message', side: 'assistant', text: entry.text ?? '' }
    case 'tool-started':
      return { ...base, kind: 'tool', phase: 'started', toolName: entry.toolName ?? '' }
    case 'tool-running':
      return { ...base, kind: 'tool', phase: 'running', toolName: entry.toolName ?? '' }
    case 'tool-result':
      return { ...base, kind: 'tool', phase: 'result', toolName: entry.toolName ?? '' }
    case 'turn-error':
      return { ...base, kind: 'error', text: entry.text ?? '' }
    case 'system':
      return { ...base, kind: 'event', text: entry.text ?? '' }
    default: {
      // 穷尽收口锚在判别属性上（TranscriptEntry 非联合类型——对象级不收窄，kind 属性收窄）
      const exhaustiveKind: never = entry.kind
      throw new Error(`dsh-forge web: 未知转录条目语义类：${String(exhaustiveKind)}`)
    }
  }
}

/**
 * 轨迹台账投影（纯函数）：转录条目 → 时序台账行。
 * 排序唯一依据 = seq 升序（同 seq 稳定：输入序即输出序）；输入不被变异。
 * AC-3「台账与转录数据一致」由本投影机械保证（同数据源单投影——渲染面零再排序）。
 */
export function buildTrajectoryLedger(entries: readonly TranscriptEntry[]): TrajectoryLedgerRow[] {
  return [...entries].sort((a, b) => a.seq - b.seq).map(projectEntry)
}
