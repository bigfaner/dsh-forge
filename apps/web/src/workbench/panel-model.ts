// 官方基座降位后的面板模型（定位：基础——纯函数面，fix-25 架构重排）。
// fix-25：main.conversation 影子退役——官方 ConversationRoot 渲染中区（官方头部链
// 「打开方式」+「⋯」+官方 corner ExpandButton 随之白拿）；产品面降位到官方缝：
//   - 知识视图 = 官方 main 面板 roster（ui-layout keyed `main`——`layout.selectPanel` 互换，
//     官方先例 ui-plugin-manager/ui-schedule 的全局面板径）；
//   - 产品页签（轨迹/知识召回）= 官方 conversation.view roster（ui-trajectory 同型先例）；
//   - UF-2 hero（零项目首用引导）= 产品全局 main 面板（boot 期零项目时由 ShellHost 驱动选中）。
// 本模块 = 上述装配的纯推导面（相位/项目锚/右栏联动计划/面板→视图镜像——单测直测）。

/** 产品知识面板的官方 main 面板 key（= sidebar.panellist 行 id；plugin.ts 字面量同源 pin） */
export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'
/** 产品零项目 hero 面板的官方 main 面板 key（plugin.ts 字面量同源 pin） */
export const HERO_PANEL_KEY = 'dswf-hero'

/** 中区面板相位（hero 相位 = UF-2；settling = 项目数未就绪校平；session = 官方会话面） */
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

/**
 * 项目数相位计数推导（纯函数）：ready 相位取计数（含 archived——P1 无删除，计数不回落 0 =
 * 注册成功永久让位的机制面）；在途/失败保持上一已知计数（防闪跳/不残留）。
 */
export function nextLastReadyCount(prev: number | null, projects: {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly projects?: readonly { readonly id: string }[]
}): number | null {
  if (projects.phase !== 'ready') return prev
  return projects.projects?.length ?? 0
}

/**
 * 当前项目锚推导（纯函数，3.8 建立）：会话锚在场 → 会话归属 workspace（sessionIds 成员）→
 * 该 workspace 名下的项目；未匹配/无会话锚 → 唯一项目兜底（单人工作台 P1 最常见的无歧义
 * 相位）；多项目无锚 = null（浏览/召回面按「无项目锚」降级，不猜首个）。
 * 快照缺席（useWorkspaces hook 不在场）= 单项目兜底同径（非壳载体降级）。
 * fix-25 注：知识面板原恒走兜底线（root 作用域「无会话锚可读」）；fix-bug 起知识面板
 * 经 root 标准props useSessions 读主视图会话（官方 retainedBy.mainView 口径——
 * DocumentTitle 同型先例）走会话锚定分支，多项目 + 活跃会话不再恒降级（多项目无会话
 * = 保持 null 不猜首个，空态文案分流见 KnowledgeView.anchorlessCopy）。
 * fix-33 ⑨：projects 行 workspaceId 收紧为必填（contracts Project/ProjectSummary 镜像
 * ——原可选放宽无消费面，属漂移面）。
 */
export function projectAnchorOf(input: {
  readonly sessionId: string | null
  readonly workspaces: { readonly items: readonly { readonly workspaceId: string; readonly sessionIds: readonly string[] }[] } | null
  readonly projects: readonly { readonly id: string; readonly workspaceId: string }[]
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
 * 概览项目上下文推导（纯函数，4.1）：projectAnchorOf 裁决复用（主视图会话优先
 * retainedBy.mainView → 会话归属 workspace 名下项目；唯一项目兜底）+ 会话计数（锚定
 * 项目归属 workspace 的账本 sessionIds 数——ov-head「N 会话」单源；快照/行缺席 =
 * undefined → ov-head 省略段）。项目未就绪（loading/error）= 无锚（不猜首个）。
 */
export function anchoredOverviewContext(input: {
  readonly mainSessionId: string | null
  readonly workspaces: { readonly items: readonly { readonly workspaceId: string; readonly sessionIds: readonly string[] }[] } | null
  readonly projects: readonly { readonly id: string; readonly workspaceId: string }[]
}): { readonly projectId: string | null; readonly workspaceId: string | null; readonly sessionCount?: number } {
  const projectId = projectAnchorOf({ sessionId: input.mainSessionId, workspaces: input.workspaces, projects: input.projects })
  if (projectId === null) return { projectId: null, workspaceId: null }
  const project = input.projects.find((row) => row.id === projectId)
  if (project === undefined || input.workspaces === null) return { projectId, workspaceId: project?.workspaceId ?? null }
  const home = input.workspaces.items.find((row) => row.workspaceId === project.workspaceId)
  if (home === undefined) return { projectId, workspaceId: project.workspaceId }
  return { projectId, workspaceId: project.workspaceId, sessionCount: home.sessionIds.length }
}

/**
 * 显式拾取锚推导（纯函数，fix-bug 知识范围项目切换控件）：拾取行仍在切换行集（archived
 * 排除——与 hero 弹层同口径）→ 拾取优先（粘性：会话/派生锚不覆盖用户显式选择）；拾取
 * 行离场（删除/归档）或未拾取 → null（回落 projectAnchorOf 派生锚）。
 */
export function pickedProjectAnchor(
  pickedId: string | null | undefined,
  scopeRows: readonly { readonly id: string }[],
): string | null {
  if (pickedId === null || pickedId === undefined) return null
  return scopeRows.some((row) => row.id === pickedId) ? pickedId : null
}

/**
 * 知识模式右栏联动计划（纯函数，fix-23 建立 / fix-25 改面板径）：UF-5/SC8 官方右栏口径——
 * 进知识面板时已展开则收起并记忆（恢复锚）；离知识面板按记忆恢复（已展开 = 官方快捷键等
 * 他径已展开，仅清记忆不重复动作）。记忆 = 联动隐藏专用锚（非用户偏好——官方收展态由
 * ui-sidebar-right per-session store 自持）。
 */
export function rightbarViewPlan(
  knowledge: boolean,
  remembered: boolean | null,
  isExpanded: boolean,
): { readonly action: 'hide' | 'restore' | 'none'; readonly remembered: boolean | null } {
  if (knowledge) {
    if (isExpanded) return { action: 'hide', remembered: true }
    return { action: 'none', remembered }
  }
  if (remembered === true) {
    return isExpanded
      ? { action: 'none', remembered: null }
      : { action: 'restore', remembered: null }
  }
  return { action: 'none', remembered }
}

/**
 * 官方面板态 → 产品视图镜像（纯函数，fix-25）：activePanelId null = 会话面板（官方
 * ConversationRoot 缺省）；产品面板 key 各自成视图；其余官方全局面板（plugins 等）按
 * 会话视图镜像（产品语义：中区互换二元——知识 ⇄ 其余）。
 */
export function centerViewOf(activePanelId: string | null): 'session' | 'knowledge' | 'hero' {
  if (activePanelId === KNOWLEDGE_PANEL_KEY) return 'knowledge'
  if (activePanelId === HERO_PANEL_KEY) return 'hero'
  return 'session'
}
