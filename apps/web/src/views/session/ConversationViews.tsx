// 会话视图槽占用者族（定位：业务装配——官方 conversation.view roster 的产品页签，fix-25）。
// 官方缝（ui-trajectory 同型先例）：`conversation.view` list/session 槽登记项——官方
// ConversationSessionHeader 页签行（chat + trajectory + 产品登记项）与 DefaultConversationViews
// 视图区（renderSlot only:id——激活即挂载）消费。fix-25 登记：
//   - 'dswf-trajectory'（轨迹，order 10）→ 产品轨迹台账（TrajectoryLedger + 官方
//     ChatSnapshot 转录投影——fix-11 接线原样迁移）。官方 'trajectory' 登记项在
//     developerTools 关闭时被官方 viewTabs 门隐藏（ui-conversation 源码口径），产品
//     UF-4 终裁形态 (a) 三页签恒在场故自登记；developerTools 开启期两项并陈 = 已知
//     边界（官方门控不改写）。
//   - 'dswf-recall'（知识召回，order 20）→ RecallTab（UF-4 召回数据面；激活即挂载 =
//     每次选中重拉——AC4 即时累积语义由官方 only:id 挂载机制承载）。
// 对话 tab = 官方 'chat' 登记项直用（产品零登记——官方内容面白拿）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { RecallTab } from './RecallTab.js'
import { TrajectoryLedger } from './TrajectoryLedger.js'
import type { TranscriptEntry } from './transcript.js'
import { projectAnchorOf } from '../../workbench/panel-model.js'
import { WorkspacesAnchor, isWorkspacesSnapshot } from '../../workbench/ShellHost.js'
import type { LedgerWorkspacesSnapshot } from '../sidebar/sidebar-model.js'
import { useForgeProjects } from '../sidebar/use-forge-projects.js'
import './session.css'

/** 官方 kit 观察钩子窄面（上游 SnapshotSelectorHook 消费切片——结构同型镜像，禁 import 上游运行期包） */
export type KitSelectorHook = (selector: (state: never) => unknown) => unknown

// ── 官方 ConversationSnapshot → TranscriptEntry 投影（fix-11 接线，fix-25 自 WorkbenchPanel 迁入） ──

/** 官方 ConversationSnapshot 窄形状（上游 useConversation 消费切片——views.get('chat') 通道） */
export interface ConversationSnapshotMirror {
  readonly views?: { get?(target: string): unknown }
}

/** ChatSnapshot.legacy 兼容切片窄形状（上游 ConversationNode[]/runningCalls/partial——轨迹映射数据源） */
export interface ChatSnapshotMirror {
  readonly legacy?: {
    readonly nodes?: readonly ConversationNodeMirror[]
    readonly runningCalls?: readonly RunningToolCallMirror[]
    readonly partial?: PartialAssistantMirror | null
  }
}

/** 官方 ConversationNode 窄形状（wire 判别 = kind 字段族——records.d.ts 结构兼容面） */
export interface ConversationNodeMirror {
  readonly kind?: string
  readonly seq?: number
  readonly turn?: number
  readonly text?: string
  readonly message?: string
  readonly summary?: string | null
  readonly type?: string
  readonly name?: string | null
  readonly args?: string | null
  readonly callId?: string
  readonly call?: { readonly name?: string } | null
  readonly content?: readonly ContentTextBlockMirror[]
  readonly blocks?: readonly ContentTextBlockMirror[]
}

/** 官方 RunningToolCall 窄形状（preparing|start——在途调用，无结果态） */
export interface RunningToolCallMirror {
  readonly phase?: string
  readonly name?: string
  readonly callId?: string
}

/** 官方 PartialAssistant 窄形状（流式在途回答——无 seq，台账尾行呈现） */
export interface PartialAssistantMirror {
  readonly turn?: number
  readonly blocks?: readonly ContentTextBlockMirror[]
}

/** ContentBlock/AssistantBlock 文本块子面 */
interface ContentTextBlockMirror {
  readonly type?: string
  readonly kind?: string
  readonly text?: string
}

/** 文本块拼接（user/context 的 content 与 assistant 的 blocks 同一投影——非文本块跳过） */
function textOfBlocks(blocks: readonly ContentTextBlockMirror[] | undefined): string {
  if (blocks === undefined) return ''
  return blocks
    .filter((b) => (b.type ?? b.kind) === 'text' && typeof b.text === 'string')
    .map((b) => b.text ?? '')
    .join('\n')
}

/** 系统事件行文本（context → 内容文本；compaction → 摘要；unknown → 事件类型；其余缺省空串） */
function systemTextOf(node: ConversationNodeMirror): string {
  if (node.kind === 'context') return textOfBlocks(node.content)
  if (node.kind === 'compaction') return node.summary ?? ''
  if (node.kind === 'unknown') return node.type ?? ''
  return ''
}

/**
 * ChatSnapshot.legacy → TranscriptEntry[]（纯函数，装配层锚定——views/session README 映射表
 * 的 wire 判别值实跑收口）。判别 = ConversationNode.kind 字段族：
 *   user/steering → user-message；assistant → assistant-message；command → command；
 *   tool-result → tool-result（工具名 = call.name，窗口截断回落 callId——上游卡片头同径）；
 *   turn-error/turn-max-tokens → turn-error；context/model-retry/compaction/unknown → system；
 *   runningCalls（preparing|start 在途，Wire 类型 RunningToolCall = 两者并集）→ tool-running；
 *   partial（流式回答，无 seq）→ assistant-message 尾行（seq = MAX_SAFE_INTEGER——回合落定
 *   即让位于带真实 seq 的 AssistantMessage 节点）。
 * 未知 kind / 形状漂移行跳过（fail-soft 不炸壳）；输入不被变异。
 */
export function transcriptOfChatSnapshot(chat: ChatSnapshotMirror): readonly TranscriptEntry[] {
  const legacy = chat.legacy
  const nodes = legacy?.nodes ?? []
  const runningCalls = legacy?.runningCalls ?? []
  const entries: TranscriptEntry[] = []
  for (const node of nodes) {
    const base = { key: '', seq: typeof node.seq === 'number' ? node.seq : 0, turn: node.turn }
    switch (node.kind) {
      case 'user':
      case 'steering':
        entries.push({ ...base, key: `${String(node.kind)}:${String(base.seq)}`, kind: 'user-message', text: textOfBlocks(node.content) })
        break
      case 'assistant':
        entries.push({ ...base, key: `assistant:${String(base.seq)}`, kind: 'assistant-message', text: textOfBlocks(node.blocks) })
        break
      case 'command':
        entries.push({
          ...base,
          key: `command:${String(base.seq)}`,
          kind: 'command',
          // args 为官方逐字原文（自带分隔空白——records.d.ts：verbatim rawInput after the name）
          text: `${node.name ?? ''}${node.args ?? ''}`,
        })
        break
      case 'tool-result':
        entries.push({
          ...base,
          key: `tool-result:${String(base.seq)}:${node.callId ?? ''}`,
          kind: 'tool-result',
          toolName: node.call?.name ?? node.callId ?? '',
        })
        break
      case 'turn-error':
      case 'turn-max-tokens':
        entries.push({ ...base, key: `${String(node.kind)}:${String(base.seq)}`, kind: 'turn-error', text: node.message ?? '' })
        break
      case 'context':
      case 'model-retry':
      case 'compaction':
      case 'unknown':
        entries.push({ ...base, key: `${String(node.kind)}:${String(base.seq)}`, kind: 'system', text: systemTextOf(node) })
        break
      default:
        // 未知 wire 判别（上游扩展/形状漂移）跳过——fail-soft
        break
    }
  }
  for (const call of runningCalls) {
    entries.push({
      key: `tool-running:${call.callId ?? call.name ?? ''}`,
      seq: Number.MAX_SAFE_INTEGER - 1,
      kind: 'tool-running',
      toolName: call.name ?? call.callId ?? '',
    })
  }
  if (legacy?.partial !== undefined && legacy.partial !== null) {
    entries.push({
      key: `partial:${String(legacy.partial.turn ?? '')}`,
      seq: Number.MAX_SAFE_INTEGER,
      kind: 'assistant-message',
      turn: legacy.partial.turn,
      text: textOfBlocks(legacy.partial.blocks),
    })
  }
  return entries
}

/**
 * 转录锚子件（fix-11）：订阅官方会话装配快照（useConversation 标准钩子——session 作用域
 * 占用者 props 面直递），投影 ChatSnapshot → TranscriptEntry[] 上抛（快照对象身份稳定——
 * uSES 选择器零派生对象；转录行副本经装配态注入台账，对话面本体仍官方面自持）。
 * 导出面 = 单测（SSR 直驱伪钩子——WorkspacesAnchor 同形制）。
 */
export function TranscriptAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (entries: readonly TranscriptEntry[]) => void
}): ReactNode {
  const chat = hook((s) => (s as ConversationSnapshotMirror | undefined)?.views?.get?.('chat')) as
    | ChatSnapshotMirror
    | undefined
  useEffect(() => {
    onChange(chat === undefined ? [] : transcriptOfChatSnapshot(chat))
  }, [chat, onChange])
  return null
}

/** 轨迹视图占用者 props（官方 session 作用域标准 props 消费切片；可选 = 非壳载体降级） */
export interface ForgeTrajectoryViewProps {
  /** 当前 dsh 会话锚（session 作用域标准 prop） */
  readonly sessionId?: string
  /** 会话装配观察钩子（ConversationSnapshot——转录数据源；缺席 = 台账空态） */
  readonly useConversation?: KitSelectorHook
}

/**
 * 轨迹视图（conversation.view 'dswf-trajectory' 占用者——官方视图区 only:id 激活即挂载）。
 * data-dswf-pane="trajectory" 锚保持（fix-25 前会话面板轨迹 pane 锚随视图迁移——语义不变）。
 */
export function ForgeTrajectoryView(props: ForgeTrajectoryViewProps): ReactNode {
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>([])
  const handleTranscript = useCallback((entries: readonly TranscriptEntry[]): void => {
    setTranscript(entries)
  }, [])
  return (
    <div className="dswf-session-pane dswf-view-pane" data-dswf-pane="trajectory">
      <TrajectoryLedger entries={transcript} />
      {props.useConversation !== undefined ? (
        <TranscriptAnchor hook={props.useConversation} onChange={handleTranscript} />
      ) : null}
    </div>
  )
}

/** 召回视图占用者 props（标准 props + 插件 inject face 消费切片） */
export interface ForgeRecallViewProps {
  /** 当前 dsh 会话锚（session 作用域标准 prop） */
  readonly sessionId?: string
  /** workspace 归属观察钩子（项目锚推导输入——会话归属 → 项目） */
  readonly useWorkspaces?: KitSelectorHook
  /** 召回行跳转（插件 inject face——桥 openKnowledgeEntry：知识面板 + 抽屉定位） */
  readonly openKnowledgeEntry?: (entryId: number) => void
}

/**
 * 召回视图（conversation.view 'dswf-recall' 占用者）。数据面 = RecallTab 原样
 * （visible 恒 true——官方 only:id 挂载即激活，AC4 即时累积由挂载机制承载）。
 * data-dswf-pane="recall" 锚保持。
 */
export function ForgeRecallView(props: ForgeRecallViewProps): ReactNode {
  const [workspacesSnap, setWorkspacesSnap] = useState<LedgerWorkspacesSnapshot | null>(null)
  const [projectsState] = useForgeProjects(workspacesSnap)
  const handleWorkspacesSnap = useCallback((snap: unknown) => {
    setWorkspacesSnap(isWorkspacesSnapshot(snap) ? snap : null)
  }, [])
  const projectId = projectAnchorOf({
    sessionId: props.sessionId ?? null,
    workspaces: workspacesSnap,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  return (
    <div className="dswf-session-pane dswf-view-pane" data-dswf-pane="recall">
      <RecallTab
        projectId={projectId}
        sessionId={props.sessionId ?? null}
        visible
        onOpenEntry={props.openKnowledgeEntry}
      />
      {props.useWorkspaces !== undefined ? (
        <WorkspacesAnchor hook={props.useWorkspaces} onChange={handleWorkspacesSnap} />
      ) : null}
    </div>
  )
}
