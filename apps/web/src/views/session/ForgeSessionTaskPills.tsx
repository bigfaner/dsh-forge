// 会话头挂接 pill 装配体（定位：业务装配——4.2 Integration #2，`conversation.session.
// header.actions` 槽占用者的壳侧本体；槽注册在 client-plugin/plugin.ts，本件经
// product-views 发布面递达）。ForgeRecallView 同形制三层：
//   1) 单库解析（AC2 Hard Rule）：sessionId → 会话归属 workspace（workspaces 账本
//      sessionIds 成员）→ 该 workspace 名下项目（projects 台账 workspaceId）→ 唯一
//      projectId——projectAnchorOf 纯函数（knowledge-anchor 裁决复用：主视图会话锚定
//      优先，唯一项目兜底）；pill 查询天然单库（链接只可能诞生于会话所在库——禁全库
//      扫描，本件零跨库聚合假设，一次 RPC 恒单 projectId）。
//   2) 数据装载（AC3）：唯一通道 = forge:tasks/sessionLinks（SessionTaskLinkCard[]——
//      links ∪ records.session_id 双源分型卡）；写推送事件（onForgeTasksChanged →
//      subscribeTasksChanged 50ms 合并层）同项目 → 静默重取（写后单次重取见新值，
//      ≤500ms 归订阅层契约）；键变更（会话/项目锚）即重拉——sessionId props 驱动即时
//      反映（3.10 组件 props 契约）。错误 fail-soft：会话头装饰面不炸壳——首错空呈现、
//      重取失败保旧（缓存先行）。
//   3) 富化（featureSlug = card.slug 字段映射）：tech-design 身份双轨不变量「slug 列 ≡
//      feature slug」→ 导航载荷富化零额外 RPC（比 feature 账本 enrich 更严的单库纪律——
//      3.10 注记的装配侧富化落点）。
// 点击导航（AC4）：onOpenTask props 透传（插件 inject face 闭包 = dock 开概览 tab +
// 桥 openTaskFocus——全链路另半段归右栏 OverviewDockBody 消费）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionLinksQuery, SessionTaskLinkCard } from '@dsh-forge/contracts'
import {
  preloadRpcClientFactory,
  subscribeTasksChanged,
  type ForgeRpcClient,
  type RpcClientFactory,
} from '../../rpc/index.js'
import { useAnchoredProjects } from '../../workbench/anchored-projects.js'
import { projectAnchorOf } from '../../workbench/panel-model.js'
import { SessionTaskPills, type SessionTaskPillItem, type SessionTaskPillNav } from './SessionTaskPills.js'
import type { KitSelectorHook } from './ConversationViews.js'

/**
 * 挂接双源卡 → pill 项富化（纯函数）：featureSlug = card.slug（slug ≡ feature slug
 * 不变量——tech-design Interface 1 身份解析约定 + Cross-Layer Data Map；零额外 RPC）。
 */
export function sessionPillItems(cards: readonly SessionTaskLinkCard[]): readonly SessionTaskPillItem[] {
  return cards.map((card) => ({ ...card, featureSlug: card.slug }))
}

/** 拉取结果（ok/error 归一——永不 reject；错误 = 装饰面静默降级不炸会话头） */
export type SessionPillsFetch =
  | { readonly ok: true; readonly cards: readonly SessionTaskLinkCard[] }
  | { readonly ok: false; readonly error: string }

/** 单次拉取（纯异步面）：唯一通道 = forge:tasks/sessionLinks（单库查询） */
export async function fetchSessionTaskPills(
  client: ForgeRpcClient,
  q: SessionLinksQuery,
): Promise<SessionPillsFetch> {
  try {
    return { ok: true, cards: await client.tasks.sessionLinks(q) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 装载相位（idle = 查询键缺席不拉取——静态空态；error 仅首错在场，重取失败保旧） */
export type SessionPillsPhase = 'idle' | 'loading' | 'ready' | 'error'

/** 装载状态（hook 输出——SessionTaskPills pills 面直喂形状） */
export interface SessionPillsLoadState {
  readonly phase: SessionPillsPhase
  readonly pills: readonly SessionTaskPillItem[]
}

/** 初始态 */
export function initialSessionPillsState(): SessionPillsLoadState {
  return { phase: 'idle', pills: [] }
}

/**
 * 装载判定（纯函数，AC2 前置）：单库解析键齐备（projectId + sessionId）→ 拉取；
 * 键缺席（无项目锚/无会话——SSR 首帧、账本快照未达）→ idle 静态空态不拉取。
 */
export function sessionPillsLoadPlan(input: {
  readonly projectId: string | null
  readonly sessionId: string | null
}): 'fetch' | 'idle' {
  if (input.projectId === null || input.sessionId === null) return 'idle'
  return 'fetch'
}

/** 装载步进产物（effect 仅落点，逻辑归纯/异步面） */
export type SessionPillsOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly pills: readonly SessionTaskPillItem[] }
  | { readonly kind: 'error'; readonly error: string }

/**
 * 落点应用（纯函数）：idle 复位；loading 保旧（重取不清场——会话头装饰面不闪烁）；
 * ready 更新；error 首错清空（空呈现）/有旧保旧（缓存先行——重取失败不掏空）。
 */
export function applySessionPillsOutcome(prev: SessionPillsLoadState, outcome: SessionPillsOutcome): SessionPillsLoadState {
  switch (outcome.kind) {
    case 'idle':
      return initialSessionPillsState()
    case 'loading':
      return { ...prev, phase: 'loading' }
    case 'ready':
      return { phase: 'ready', pills: outcome.pills }
    case 'error':
      return prev.pills.length > 0 ? { ...prev, phase: 'ready' } : { phase: 'error', pills: [] }
  }
}

/** 装载任务（纯异步面，runRecallLoad 同形制）：plan 判定 + fetch + 富化——永不 reject */
export async function runSessionPillsLoad(
  input: { readonly projectId: string | null; readonly sessionId: string | null },
  makeClient: RpcClientFactory,
): Promise<readonly SessionPillsOutcome[]> {
  const plan = sessionPillsLoadPlan(input)
  if (plan === 'idle') return [{ kind: 'idle' }]
  const out = await fetchSessionTaskPills(makeClient(), {
    projectId: input.projectId as string,
    sessionId: input.sessionId as string,
  })
  return [
    { kind: 'loading' },
    out.ok ? { kind: 'ready', pills: sessionPillItems(out.cards) } : { kind: 'error', error: out.error },
  ]
}

/**
 * 挂接 pill 数据装载 hook（AC3/AC4）：键变（会话/项目锚/重试 nonce）重拉 + 序号守卫
 * （快速会话切换不串台）；subscribeTasksChanged 同项目事件 → 静默重取（nonce 递增——
 * 写后单次重取见新值；50ms 合并/≤500ms 延迟归订阅层契约，events.ts 断言面）。
 */
export function useSessionTaskPills(
  input: { readonly projectId: string | null; readonly sessionId: string | null },
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [SessionPillsLoadState] {
  const [state, setState] = useState<SessionPillsLoadState>(initialSessionPillsState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    let alive = true
    void runSessionPillsLoad(input, makeClient).then((steps) => {
      if (!alive) return
      for (const step of steps) {
        if (seq !== seqRef.current) return // 键已变更：本批步进作废（防串台）
        setState((prev) => applySessionPillsOutcome(prev, step))
      }
    })
    return () => {
      alive = false
    }
  }, [input.projectId, input.sessionId, nonce, makeClient])

  // 写推送事件（forge:events/tasks-changed）→ 同项目静默重取（AC3 刷新锚）
  useEffect(() => {
    if (input.projectId === null) return () => {}
    const projectId = input.projectId
    return subscribeTasksChanged((payload) => {
      if (payload.projectId === projectId) setNonce((n) => n + 1)
    })
  }, [input.projectId, input.sessionId])

  return [state] as const
}

/** 挂接 pill 槽占用者 props（标准 props + 插件 inject face 消费切片） */
export interface ForgeSessionTaskPillsProps {
  /** 当前 dsh 会话锚（session 作用域标准货币——job-list/页签族同径；缺席 = 空态） */
  readonly sessionId?: string
  /** workspace 归属观察钩子（全局标准 props 自动递达——单库解析输入） */
  readonly useWorkspaces?: KitSelectorHook
  /** pill/菜单行点击导航（插件 inject face——dock 开概览 + 桥聚焦；缺席 = 非交互呈现） */
  readonly onOpenTask?: (nav: SessionTaskPillNav) => void
}

/**
 * 会话头挂接 pill 槽占用者（`conversation.session.header.actions` list 槽——plugin.ts
 * 注册 dswf-task-pills）。单库解析（projectAnchorOf——会话锚定/唯一项目兜底）→
 * useSessionTaskPills（sessionLinks + 事件刷新）→ SessionTaskPills（3.10 本体——
 * ≤2 并排 + 溢出菜单 + 双源分型呈现）。零挂接/无锚 = 组件空输出（空态不占会话头）。
 */
export function ForgeSessionTaskPills(props: ForgeSessionTaskPillsProps): ReactNode {
  const sessionId = props.sessionId ?? null
  const { projects: projectsState, workspaces, anchor: workspacesAnchor } = useAnchoredProjects(
    props.useWorkspaces,
  )
  const projectId = projectAnchorOf({
    sessionId,
    workspaces,
    projects: projectsState.phase === 'ready' ? projectsState.projects : [],
  })
  const [state] = useSessionTaskPills({ projectId, sessionId })
  return (
    <>
      <SessionTaskPills
        sessionId={sessionId ?? ''}
        pills={state.pills}
        {...(props.onOpenTask !== undefined ? { onOpenTask: props.onOpenTask } : {})}
      />
      {workspacesAnchor}
    </>
  )
}
