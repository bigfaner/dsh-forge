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
          console.warn(
            `归档切换失败（P1 fail-soft：行数据未变，可重试）——project ${projectId} → archived=${String(archived)}：${cause instanceof Error ? cause.message : String(cause)}`,
          )
        })
    },
  }
}
