// 左栏导航动作绑定（定位：业务——UF-1 行动作 → 官方面/RPC 的绑定缝）。
// fix-25 收缩：知识入口迁官方 sidebar.panellist 行（PanelRow → layout.selectPanel——
// 官方面板行语言自承载，产品桥视图事件退役）；会话行 = 官方 uiWorkspace.openSession
// 单径（内部 retain + selection + selectPanel(null) 回会话面板一体——「回会话视图 +
// 锚定」UF-5 语义由官方导航动作面收口，产品视图态机退役）。
// fix-42 增面（母本 ownRow 行尾动作）：新会话钮 = 官方 startSession(workspaceId)
// （reuse-or-create blank + 呈现一体）；改名/归档切换 = forge:projects/update patch 面
// （name patch 联动 workspace 标题对齐 = core fix-33 ⑪ 收口的 fix-24 同径——web 侧零
// 额外编排）。变更后经 onProjectsMutated 静默重拉项目列表（应用侧行改写不触发 workspace
// 快照锚——use-forge-projects 刷新锚口径）。
// D45 增面（会话行动作——官方 ui-workspace session-actions 同径）：置顶/取消置顶、
// 归档/取消归档、分叉 = uiWorkspace 官方面（fire-and-forget fail-soft——失败仅控制台
// 告警，P1 无行内错误面）；归档运行中会话被宿主拒（workspace/session-active）→ 拒绝
// 上抛给面板（停止并归档确认模态消费——官方 SessionArchiveConfirmDialog 同型）；
// 会话改名 = sessions.using → binding.session.rename 官方径（拒绝上抛给面板改名模态）。

/** 动作绑定输入（官方面 + RPC 窄面——纯注入，可测） */
export interface SidebarActionDeps {
  /** 会话行 → 打开 dsh 会话（官方 uiWorkspace.openSession 窄面） */
  readonly openSession: (sessionId: string) => void
  /** 项目行「新会话」→ 官方新会话流（uiWorkspace.startSession(workspaceId) 窄面） */
  readonly startSession: (workspaceId: string) => void
  /** forge:projects/update RPC 窄面（patch 仅 name/archived） */
  readonly updateProject: (id: string, patch: { name?: string; archived?: boolean }) => Promise<unknown>
  /** 变更落地后重拉项目列表（静默——相位不闪，use-forge-projects silentRefresh 面） */
  readonly onProjectsMutated: () => void
  /** 置顶会话（官方 uiWorkspace.pinSession——D45；缺席 = 置顶钮/菜单项不呈现） */
  readonly pinSession?: (sessionId: string) => Promise<void>
  /** 取消置顶（官方 uiWorkspace.unpinSession——D45；缺席 = 对应面不呈现） */
  readonly unpinSession?: (sessionId: string) => Promise<void>
  /**
   * 归档会话（官方 uiWorkspace.archiveSession——D45；缺席 = 归档钮/菜单项不呈现）。
   * 运行中会话被宿主拒 → 拒绝上抛（面板停止并归档确认流消费——sessionArchiveActiveRefusal）。
   */
  readonly archiveSession?: (
    sessionId: string,
    options?: { readonly stopActivity?: boolean },
  ) => Promise<void>
  /** 取消归档（官方 uiWorkspace.unarchiveSession——D45；缺席 = 对应面不呈现） */
  readonly unarchiveSession?: (sessionId: string) => Promise<void>
  /** 分叉会话（官方 uiWorkspace.forkSession——D45；缺席 = 分叉菜单项不呈现） */
  readonly forkSession?: (sessionId: string) => Promise<unknown>
  /** 会话改名（sessions.using → binding.session.rename——D45；缺席 = 改名菜单项不呈现） */
  readonly renameSession?: (sessionId: string, title: string) => Promise<void>
}

/** 面板导航/变更动作（纯绑定——回调出，态机与 RPC 失败面归持有者） */
export interface SidebarActions {
  /** 会话行 → 打开 dsh 会话（官方面：选择+呈现+回会话面板一体） */
  onSessionActivate(sessionId: string): void
  /** 项目行尾「新会话」钮 → 官方新会话流（stopPropagation 语义归渲染层） */
  onStartSession(workspaceId: string): void
  /**
   * 项目改名（改名模态确认面）：RPC 失败原样上抛（模态内呈现——官方 rename 错误面
   * 同型）；成功后静默重拉。
   */
  onRenameProject(projectId: string, name: string): Promise<void>
  /**
   * 归档切换（ellipsis 菜单直发动作）：fire-and-forget fail-soft——失败仅控制台告警
   * （P1 无行内错误面，边界记任务文件）；成功后静默重拉。
   */
  onArchiveToggle(projectId: string, archived: boolean): void
  /** 置顶切换（D45——hover 钮/菜单项直发）：fail-soft 控制台告警（官方 pinFailed 通知位 P1 无面） */
  onSessionPinToggle(sessionId: string, pinned: boolean): void
  /**
   * 归档会话（D45）：Promise 原样返回——运行中会话拒绝（sessionArchiveActiveRefusal）
   * 由面板接住开「停止并归档」确认模态；其余失败面板 fail-soft 告警。
   */
  onSessionArchive(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  /** 取消归档（D45）：fail-soft 控制台告警 */
  onSessionUnarchive(sessionId: string): void
  /** 会话改名（D45——改名模态确认面）：拒绝原样上抛（模态内呈现，官方对话框同型） */
  onSessionRename(sessionId: string, title: string): Promise<void>
  /** 分叉会话（D45——菜单项直发）：fail-soft（官方 fork 失败静默同判；子会话经宿主列表到达） */
  onSessionFork(sessionId: string): void
}

/**
 * 归档拒绝 = 运行中会话判读（D45——官方 activeSessionRefusal 同判）：类身份按 name
 * 比较（client 插件 bundle 不共享错误类身份——官方注记同款）；rpcError.code =
 * 'workspace/session-active' = 宿主拒绝因运行中工作（停止并归档确认流触发判据）。
 */
export function sessionArchiveActiveRefusal(cause: unknown): boolean {
  if (!(cause instanceof Error) || cause.name !== 'WorkspaceArchiveError') return false
  const code = (cause as { rpcError?: { code?: unknown } }).rpcError?.code
  return code === 'workspace/session-active'
}

const warnFace = (verb: string, sessionId: string, cause: unknown): void => {
  console.warn(
    `${verb}失败（P1 fail-soft：行数据未变，可重试）——session ${sessionId}：${cause instanceof Error ? cause.message : String(cause)}`,
  )
}

/**
 * 绑定面板动作（纯函数，可测）。
 * @param deps - 官方面 + RPC 窄面（槽位接线层注入）
 */
export function sidebarActions(deps: SidebarActionDeps): SidebarActions {
  return {
    onSessionActivate: (sessionId) => {
      deps.openSession(sessionId)
    },
    onStartSession: (workspaceId) => {
      deps.startSession(workspaceId)
    },
    onRenameProject: async (projectId, name) => {
      await deps.updateProject(projectId, { name })
      deps.onProjectsMutated()
    },
    onArchiveToggle: (projectId, archived) => {
      deps
        .updateProject(projectId, { archived })
        .then(() => {
          deps.onProjectsMutated()
        })
        .catch((cause: unknown) => {
          warnFace('归档切换', projectId, cause)
        })
    },
    onSessionPinToggle: (sessionId, pinned) => {
      const face = pinned ? deps.pinSession : deps.unpinSession
      if (face === undefined) return
      face(sessionId).catch((cause: unknown) => {
        warnFace(pinned ? '置顶会话' : '取消置顶', sessionId, cause)
      })
    },
    onSessionArchive: (sessionId, options) => {
      if (deps.archiveSession === undefined) return Promise.resolve()
      return deps.archiveSession(sessionId, options)
    },
    onSessionUnarchive: (sessionId) => {
      if (deps.unarchiveSession === undefined) return
      deps.unarchiveSession(sessionId).catch((cause: unknown) => {
        warnFace('取消归档', sessionId, cause)
      })
    },
    onSessionRename: (sessionId, title) => {
      if (deps.renameSession === undefined) return Promise.resolve()
      return deps.renameSession(sessionId, title)
    },
    onSessionFork: (sessionId) => {
      if (deps.forkSession === undefined) return
      deps.forkSession(sessionId).catch((cause: unknown) => {
        warnFace('分叉会话', sessionId, cause)
      })
    },
  }
}
