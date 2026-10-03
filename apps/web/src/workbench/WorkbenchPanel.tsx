// 工作台装配面板（定位：装配——Page Composition「工作台（单页三区）」的壳入口，2.12 + 3.8）。
// main.conversation 洞位占用者（client-plugin 影子注册 -100；组件源经 product-views 发布）：
// 持有壳视图态机（useShellView——三区容器唯一状态源）+ zones 槽位装配
// （SessionPanel → 会话视图槽 / KnowledgeView → 知识视图槽 UF-6 浏览面（3.8 自 M0 占位
// 填入）/ HeroEmpty → 项目数 0 时中区替换呈现 / dock 占位页签 → 右栏 UF-7 机制）+ UF-4
// 召回 tab 数据接线（RecallTab——sessionRecall 单通道；跨视图跳转缝：召回行点击 →
// 抽屉打开态（本装配持有）+ show-knowledge 视图切换——Hard Rule 经视图态/槽位不直引组件）
// + UF-4 轨迹 tab 数据接线（fix-11：TranscriptAnchor 订阅官方 ConversationSnapshot
// （useConversation 标准钩子）→ ChatSnapshot.legacy 兼容切片 → TranscriptEntry[]——wire
// 判别值 → 语义类映射表 = transcriptOfChatSnapshot 纯函数，锚定本装配层（views/session
// README 表的实跑收口，原 2.13 残留））+ 承载 UF-3 流程宿主（AddProjectFlow 模态 +
// __DSH_FORGE_ADD_PROJECT_FLOW__ 打开缝发布——hero CTA / 项目树「＋」两入口）+ 工作台桥
// 发布（__DSH_FORGE_WORKBENCH__——左栏导航视图切换缝）。
// 左栏 rail = 官方 ui-sidebar 壳（槽位路线 A，2.7——折叠/导航/快捷键白拿），zones rail 槽
// 保持空轨；官方会话锚跟随：会话激活（官方新会话/品牌行）→ select-session 回会话视图
// （UF-5「再次点新会话/会话行/品牌行 → 切回会话视图」的装配侧接缝）。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProjectSummary } from '@dsh-forge/contracts'
import { useShellView } from '../shell/use-shell-view.js'
import type { ShellViewState } from '../shell/view-state.js'
import { AddProjectFlow } from '../flows/add-project/AddProjectFlow.js'
import { openAddProjectFlow } from '../flows/add-project/flow-open.js'
import { RecallTab } from '../views/session/RecallTab.js'
import { SessionPanel } from '../views/session/SessionPanel.js'
import type { SessionTabId } from '../views/session/SessionPanel.js'
import { SessionToolbar } from '../views/session/SessionToolbar.js'
import type { TranscriptEntry } from '../views/session/transcript.js'
import type { LedgerWorkspacesSnapshot } from '../views/sidebar/sidebar-model.js'
import { useForgeProjects, type ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
import { KnowledgeView } from '../views/knowledge/KnowledgeView.js'
import { WorkbenchZones } from '../zones/WorkbenchZones.js'
import { globalDockTab, type DockTabSet } from '../zones/dock.js'
import {
  ChatSurface,
  ChatSurfaceAbsent,
  chatHeroOf,
  type ChatSurfaceKit,
  type KitFactorySlotRenderer,
  type KitSelectorHook,
  type SessionStateMirror,
  type SessionsStateMirror,
} from './ChatSurface.js'
import { HeroEmpty } from './HeroEmpty.js'
import { publishWorkbenchBridge } from './workbench-bridge.js'
import './workbench.css'

/** main.conversation 占用者 kit 窄面（官方 PropsRuntime 消费切片；全部可选——缺席 = 降级，单测/非壳载体） */
export interface ForgeWorkbenchPanelProps {
  /** 当前会话锚（session-maybe：undefined = 无选中会话） */
  readonly sessionId?: string
  /** 会话面观察钩子（ChatSurface 相位推导） */
  readonly useSession?: KitSelectorHook
  readonly useSessions?: KitSelectorHook
  /** 会话装配观察钩子（ConversationSnapshot——轨迹 tab 转录数据源，fix-11；缺席 = 轨迹台账空态） */
  readonly useConversation?: KitSelectorHook
  /** workspace 归属观察钩子（hero 刷新锚——外部注册 dsh create 后快照身份变化即重拉项目数） */
  readonly useWorkspaces?: KitSelectorHook
  /** 工厂槽渲染器（conversation.content 嵌入配方） */
  readonly renderFactorySlot?: KitFactorySlotRenderer
}

/** 中区会话槽相位（hero 相位 = UF-2；settling = 项目数未就绪校平；session = 会话视图） */
export type SessionZonePhase = 'settling' | 'hero' | 'session'

/**
 * 相位推导（纯函数）。Hard Rule：hero 仅由项目数驱动——**正零**才 hero（在途/失败 = 计数
 * 未知 ≠ 0，fail-soft 落默认会话视图）；就绪后在途/失败保持上一已知相位（注册成功重拉期
 * 不闪跳、不残留）。settling 仅出现在「从未就绪且在途」（防会话面/hero 首启闪现跳变）。
 */
export function sessionZonePhase(input: {
  /** 最近一次就绪的项目数（null = 尚未就绪过） */
  readonly lastReadyCount: number | null
  /** 项目数源失败（仅未就绪期参与推导——就绪后为真也不改相位） */
  readonly failed?: boolean
}): SessionZonePhase {
  if (input.lastReadyCount === 0) return 'hero'
  if (input.lastReadyCount === null && input.failed !== true) return 'settling'
  return 'session'
}

/** M0 dock 页签集（机制占位：全局「开始」页签；域页签——知识文档/审核台/文档——后续里程碑经登记表接入） */
export const M0_DOCK_TABS: DockTabSet = [globalDockTab('start', '开始')]

/**
 * 官方会话锚跟随推导（纯函数）：锚出现/变更（next 有值且 ≠ prev）= select-session 事件
 * （回会话视图 + 锚定——UF-5「再次点新会话/会话行/品牌行 → 切回会话视图」）；无变化/清空 = null。
 */
export function sessionAnchorEvent(
  prev: string | undefined,
  next: string | undefined,
): { readonly type: 'select-session'; readonly sessionId: string } | null {
  if (next === undefined || next === prev) return null
  return { type: 'select-session', sessionId: next }
}

/**
 * 项目数相位计数推导（纯函数）：ready 相位取计数（含 archived——P1 无删除，计数不回落 0 =
 * 注册成功永久让位的机制面）；在途/失败保持上一已知计数（防闪跳/不残留）。
 */
export function nextLastReadyCount(prev: number | null, projects: ProjectsPhase): number | null {
  if (projects.phase !== 'ready') return prev
  return projects.projects.length
}

/**
 * 当前项目锚推导（纯函数，3.8）：会话锚在场 → 会话归属 workspace（sessionIds 成员）→
 * 该 workspace 名下的项目；未匹配/无会话锚 → 唯一项目兜底（单人工作台 P1 最常见的无歧义
 * 相位）；多项目无锚 = null（浏览/召回面按「无项目锚」降级，不猜首个）。
 * 快照缺席（useWorkspaces hook 不在场）= 单项目兜底同径（非壳载体降级）。
 */
export function projectAnchorOf(input: {
  readonly sessionId: string | null
  readonly workspaces: LedgerWorkspacesSnapshot | null
  readonly projects: readonly ProjectSummary[]
}): string | null {
  if (input.sessionId !== null && input.workspaces !== null) {
    const home = input.workspaces.items.find((ws) => ws.sessionIds.includes(input.sessionId as string))
    if (home !== undefined) {
      const byWorkspace = input.projects.find((p) => p.workspaceId === home.workspaceId)
      if (byWorkspace !== undefined) return byWorkspace.id
    }
  }
  if (input.projects.length === 1) return input.projects[0]!.id
  return null
}

/**
 * ChatSurface kit 组装（纯函数）：kit 三成员（useSession/useSessions/renderFactorySlot）齐备
 * 才产出嵌入面；任一缺席 = undefined（降级占位——非壳载体/单测）。
 */
export function chatKitOf(props: ForgeWorkbenchPanelProps): ChatSurfaceKit | undefined {
  if (props.renderFactorySlot === undefined || props.useSession === undefined || props.useSessions === undefined) {
    return undefined
  }
  return {
    sessionId: props.sessionId,
    useSession: props.useSession,
    useSessions: props.useSessions,
    renderFactorySlot: props.renderFactorySlot,
  }
}

// ── UF-4 轨迹 tab 转录接线（fix-11：官方 ChatSnapshot → TranscriptEntry，装配层映射锚） ──

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
 * 转录锚子件（fix-11）：订阅官方会话装配快照（useConversation 标准钩子——main.conversation
 * 占用者 props 面直递），投影 ChatSnapshot → TranscriptEntry[] 上抛（快照对象身份稳定——
 * uSES 选择器零派生对象；转录行副本经装配态注入 SessionPanel，对话面本体仍官方面自持）。
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

/**
 * 会话 toolbar 官方账本绑定子件（fix-9——kit 观察钩子于本件内无条件调用）：标题直读官方
 * sessions 账本（byId[sessionId].displayTitle——sidebar-model 会话头同源字段，SC2 零缓存
 * 零副本：窄选择器投影，不落地行副本）；hero 相位 = chatHeroOf（与 ChatSurface 嵌入配方
 * 同源推导——toolbar 让位与官方 hero 空会话引导同相位）。导出面 = 单测（SSR 直驱伪 kit）。
 */
export function SessionToolbarLive({
  kit,
  dockOpen,
  onToggleDock,
}: {
  readonly kit: ChatSurfaceKit
  readonly dockOpen: boolean
  readonly onToggleDock: () => void
}): ReactNode {
  const openState = kit.useSession((s) => (s as SessionStateMirror | undefined)?.openState) as string | undefined
  const row =
    kit.sessionId === undefined
      ? undefined
      : (kit.useSessions((s) => (s as SessionsStateMirror | undefined)?.byId?.[kit.sessionId as string]) as
          | { readonly blank?: boolean; readonly displayTitle?: string }
          | undefined)
  const hero = chatHeroOf({ sessionId: kit.sessionId, openState, blank: row?.blank })
  return <SessionToolbar title={row?.displayTitle} hero={hero} dockOpen={dockOpen} onToggleDock={onToggleDock} />
}

export interface WorkbenchAssemblyProps {
  /** 壳视图态（zones 容器渲染依据） */
  readonly view: ShellViewState
  /** 中区会话槽相位（sessionZonePhase 推导注入） */
  readonly phase: SessionZonePhase
  /** 对话 tab 内容（官方会话面嵌入 / 降级占位） */
  readonly chatSurface: ReactNode
  /** 转录条目切片（轨迹 tab 台账数据源——fix-11 TranscriptAnchor 装配产物；缺省空台账） */
  readonly transcript?: readonly TranscriptEntry[]
  /** 会话面板顶部 toolbar（fix-9：SessionToolbar 装配产物——账本绑定/降级两径经
   * ForgeWorkbenchPanel 组装；session 相位恒在场） */
  readonly sessionToolbar: ReactNode
  /** 知识视图槽内容（KnowledgeView 装配产物——UF-6 浏览面 + 抽屉，3.8） */
  readonly knowledge: ReactNode
  /** 召回 tab 内容（RecallTab 装配产物——sessionRecall 接线，3.8；缺省占位空态） */
  readonly recall?: ReactNode
  /** 会话面板 tab 切换（activeTab 态上抛——召回 tab visible 翻转重拉锚，AC4） */
  readonly onSessionTab?: (tab: SessionTabId) => void
  /** dock 页签集（M0 = 占位集） */
  readonly dockTabs: DockTabSet
  /** dock 收展（dispatch('toggle-right-dock') 装配绑定） */
  readonly onToggleDock: () => void
  /** hero CTA（openAddProjectFlow 装配绑定） */
  readonly onAddProject: () => void
}

/**
 * 三区槽位装配（纯渲染——相位注入，SSR 可直测）：session 槽按相位三分（hero / 校平位 /
 * SessionPanel（toolbar 注入 + recall 注入 + onTabChange 上抛）——fix-9 起面板钮随 toolbar
 * 迁入 SessionPanel corner 座（原角位绝对定位孤钮形态退役）），knowledge 槽 = KnowledgeView
 * 注入（常挂载——keep-alive 互换零卸载），rail 槽不注入（左栏 = 官方 sidebar 壳，路线 A）。
 */
export function WorkbenchAssembly({
  view,
  phase,
  chatSurface,
  transcript,
  sessionToolbar,
  knowledge,
  recall,
  onSessionTab,
  dockTabs,
  onToggleDock,
  onAddProject,
}: WorkbenchAssemblyProps): ReactNode {
  const sessionSlot =
    phase === 'hero' ? (
      <HeroEmpty onAddProject={onAddProject} />
    ) : phase === 'settling' ? (
      <div className="dswf-workbench-settling" data-dswf-settling="" aria-busy="true" />
    ) : (
      <div className="dswf-workbench-session" data-dswf-session-zone="">
        <SessionPanel
          chatSurface={chatSurface}
          toolbar={sessionToolbar}
          transcript={transcript}
          recall={recall}
          onTabChange={onSessionTab}
        />
      </div>
    )
  return (
    <WorkbenchZones
      view={view}
      dockTabs={dockTabs}
      onToggleDock={onToggleDock}
      slots={{ session: sessionSlot, knowledge }}
    />
  )
}

/**
 * 工作台装配面板（main.conversation 占用者本体）。效应面：桥发布（mount/unmount）、
 * 官方会话锚跟随（sessionId 变更 → select-session）、项目数源（mount + workspace 归属
 * 快照身份 + 注册成功回调三锚重拉）、知识视图/召回 tab 数据接线（3.8：projectAnchorOf
 * 推导 + 抽屉打开态 + tab 激活锚）。data-dswf-phase = e2e/走查相位锚。
 */
export function ForgeWorkbenchPanel(props: ForgeWorkbenchPanelProps): ReactNode {
  const [view, dispatch] = useShellView()

  // 工作台桥发布（左栏导航视图切换缝——sidebar-actions 读取消费）
  useEffect(() => {
    publishWorkbenchBridge({ dispatch })
    return () => {
      publishWorkbenchBridge(undefined)
    }
  }, [dispatch])

  // 官方会话锚跟随：会话激活（官方新会话/品牌行/会话打开）→ select-session 回会话视图
  // （推导 = sessionAnchorEvent 纯函数——重渲染不重放；无会话 → 有会话 / 会话间切换均回会话视图）
  const sessionId = props.sessionId ?? null
  const lastSessionRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const event = sessionAnchorEvent(lastSessionRef.current, props.sessionId)
    lastSessionRef.current = props.sessionId
    if (event !== null) dispatch(event)
  }, [props.sessionId, dispatch])

  // hero 项目数源（三刷新锚）：mount 首拉 + workspace 归属快照身份变化（外部注册后 dsh
  // create 即触发——与左栏面板同锚口径）+ 注册成功回调（UI 流程即时重拉）。
  // 快照本体留存（workspacesSnap）兼作 projectAnchorOf 推导输入（3.8）。
  const [workspacesSnap, setWorkspacesSnap] = useState<LedgerWorkspacesSnapshot | null>(null)
  const [projectsState, retryProjects] = useForgeProjects(workspacesSnap)
  const [lastReadyCount, setLastReadyCount] = useState<number | null>(null)
  useEffect(() => {
    setLastReadyCount((prev) => nextLastReadyCount(prev, projectsState))
  }, [projectsState])
  const phase = sessionZonePhase({
    lastReadyCount,
    failed: projectsState.phase === 'error',
  })

  // 当前项目锚（3.8）：会话归属 → 项目；无锚兜底唯一项目（推导 = projectAnchorOf 纯函数）
  const projectId = projectAnchorOf({
    sessionId,
    workspaces: workspacesSnap,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  // workspace 快照上抛窄化（形状漂移/非壳载体 → null 降级）
  const handleWorkspacesSnap = useCallback((snap: unknown) => {
    setWorkspacesSnap(isWorkspacesSnapshot(snap) ? snap : null)
  }, [])

  // 知识详情抽屉打开态（装配持有——两入口共用：知识卡片点击 / 召回 tab 分组行跳转）
  const [drawerEntryId, setDrawerEntryId] = useState<number | null>(null)
  // 召回 tab 激活锚（AC4 即时累积：visible 翻转 → RecallTab 重拉）
  const [activeSessionTab, setActiveSessionTab] = useState<SessionTabId>('chat')
  // 轨迹 tab 转录切片（fix-11：TranscriptAnchor 订阅官方 ChatSnapshot 投影上抛——快照身份
  // 驱动重投影，非受控装载；会话切换/无会话 = 空台账回落）
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>([])
  const handleTranscript = useCallback((entries: readonly TranscriptEntry[]): void => {
    setTranscript(entries)
  }, [])
  // 召回行跳转（Hard Rule 跨视图解耦）：抽屉打开 + 整体切知识视图（UF-5 同径转移面）
  const openKnowledgeEntry = useCallback(
    (entryId: number) => {
      setDrawerEntryId(entryId)
      dispatch({ type: 'show-knowledge' })
    },
    [dispatch],
  )

  // 对话 tab 官方会话面（kit 组装 = chatKitOf 纯函数——任一成员缺席 = 降级占位）
  const chatKit = chatKitOf(props)

  // 会话面板顶部 toolbar（fix-9）：kit 在场 = 账本绑定径（标题直读 + hero 相位同源推导）；
  // 缺席 = 降级径（无标题空位 + 面板钮实功能保持——非壳载体/单测面）。面板钮收展语义
  // 不变（dispatch('toggle-right-dock') 同径——原角位钮迁移，e2e .dswf-workbench-docktoggle 锚保持）
  const toggleDock = useCallback(() => {
    dispatch({ type: 'toggle-right-dock' })
  }, [dispatch])
  const sessionToolbar =
    chatKit !== undefined ? (
      <SessionToolbarLive kit={chatKit} dockOpen={view.rightDock} onToggleDock={toggleDock} />
    ) : (
      <SessionToolbar dockOpen={view.rightDock} onToggleDock={toggleDock} />
    )

  return (
    <div className="dswf-workbench" data-dswf-workbench="" data-dswf-phase={phase}>
      <WorkbenchAssembly
        view={view}
        phase={phase}
        chatSurface={chatKit !== undefined ? <ChatSurface kit={chatKit} /> : <ChatSurfaceAbsent />}
        transcript={transcript}
        sessionToolbar={sessionToolbar}
        knowledge={
          <KnowledgeView
            projectId={projectId}
            active={view.center === 'knowledge'}
            openEntryId={drawerEntryId}
            onOpenEntryChange={setDrawerEntryId}
          />
        }
        recall={
          <RecallTab
            projectId={projectId}
            sessionId={sessionId}
            visible={activeSessionTab === 'recall'}
            onOpenEntry={openKnowledgeEntry}
          />
        }
        onSessionTab={setActiveSessionTab}
        dockTabs={M0_DOCK_TABS}
        onToggleDock={toggleDock}
        onAddProject={() => {
          openAddProjectFlow()
        }}
      />
      {/* UF-3 流程宿主（模态覆盖中区；mount 期发布打开缝——hero CTA / 项目树「＋」直达） */}
      <AddProjectFlow
        onRegistered={() => {
          retryProjects()
        }}
      />
      {/* workspace 归属锚（kit hook 在场才挂载——钩子于子件内无条件调用；快照上抛：
          身份变化 = 项目数重拉锚，快照本体 = 项目锚推导输入——不落地 dsh 账本行副本） */}
      {props.useWorkspaces !== undefined ? (
        <WorkspacesAnchor hook={props.useWorkspaces} onChange={handleWorkspacesSnap} />
      ) : null}
      {/* 轨迹转录锚（fix-11：kit hook 在场才挂载——钩子于子件内无条件调用；ChatSnapshot
          投影上抛 → SessionPanel 轨迹台账；官方对话面本体不经手——零再排序零缓存） */}
      {props.useConversation !== undefined ? (
        <TranscriptAnchor hook={props.useConversation} onChange={handleTranscript} />
      ) : null}
    </div>
  )
}

/**
 * workspace 归属快照窄判定（纯函数）：dsh 归属快照最小形状（items 数组）——非壳载体/
 * 形状漂移期按 null 降级（不炸壳；SC2：只读快照身份与归属查询，不落地行内容副本）。
 */
export function isWorkspacesSnapshot(value: unknown): value is LedgerWorkspacesSnapshot {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
}

/**
 * workspace 归属锚子件（快照只读上抛——SC2 零缓存零副本：装配侧仅持快照对象身份供
 * 重拉锚与 projectAnchorOf 推导（会话→workspace 归属查询），不落地行内容派生副本；导出面 = 单测）。
 */
export function WorkspacesAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (snap: unknown) => void
}): ReactNode {
  const snap = hook((s) => s)
  useEffect(() => {
    onChange(snap)
  }, [snap, onChange])
  return null
}
