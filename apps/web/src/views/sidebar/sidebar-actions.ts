// 左栏导航动作绑定（定位：业务——UF-1 会话行 → 官方会话打开动作的绑定缝）。
// fix-25 收缩：知识入口迁官方 sidebar.panellist 行（PanelRow → layout.selectPanel——
// 官方面板行语言自承载，产品桥视图事件退役）；会话行 = 官方 uiWorkspace.openSession
// 单径（内部 retain + selection + selectPanel(null) 回会话面板一体——「回会话视图 +
// 锚定」UF-5 语义由官方导航动作面收口，产品视图态机退役）。

/** 面板导航动作（纯绑定——openSession 为 dsh 面（插件 inject face 注入）） */
export interface SidebarActions {
  /** 会话行 → 打开 dsh 会话（官方面：选择+呈现+回会话面板一体） */
  onSessionActivate(sessionId: string): void
}

/**
 * 绑定面板导航动作（纯函数，可测）。
 * @param openSession - dsh 会话打开（官方 uiWorkspace.openSession 的窄面——fix-11 修正接线，插件 inject face 注入）
 */
export function sidebarActions(openSession: (sessionId: string) => void): SidebarActions {
  return {
    onSessionActivate: (sessionId) => {
      openSession(sessionId)
    },
  }
}
