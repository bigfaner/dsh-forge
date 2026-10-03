// 视图态机骨架（定位：基础）——三区工作台的中心视图态（SC1 互换 / SC8 知识模式右栏隐藏恢复、页签跟随）。
// 纯状态机（零隐藏态）：zones/（2.5 三区骨架）消费本态渲染容器与互换机制；域内容（views/flows）
// 经 zones 槽位挂载，本模块不含任何域语义（Hard Rule：shell/ 基础定位）。
// React 绑定（对接面）= use-shell-view.ts；域事件映射到本事件面经 dispatch 驱动。

/** 中区视图（会话 ⇄ 知识互换；SC1） */
export type CenterPane = 'session' | 'knowledge'

/** 页签跟随锚（项目锚跨视图保留；SC8 页签跟随项目） */
export interface ShellFocus {
  /** 当前项目（null = 未选，左栏 rail 空态） */
  readonly projectId: string | null
  /** 当前会话（null = 未选会话；仅 session 视图消费） */
  readonly sessionId: string | null
}

/** 壳视图态（zones/ 渲染容器的唯一状态源） */
export interface ShellViewState {
  /** 中区当前视图 */
  readonly center: CenterPane
  /** 右栏 dock 显隐（SC8：知识模式隐藏，回会话恢复） */
  readonly rightDock: boolean
  /** 用户最后一次显式右栏选择（null = 从未手动切换；恢复语义的锚） */
  readonly rightDockPreference: boolean | null
  /** 页签跟随锚 */
  readonly focus: ShellFocus
}

/** 视图事件（转移表全集；zones/ 与域视图经 dispatch 驱动，不直接改态） */
export type ShellViewEvent =
  | { readonly type: 'show-session' }
  | { readonly type: 'show-knowledge' }
  | { readonly type: 'toggle-right-dock' }
  | { readonly type: 'select-project'; readonly projectId: string }
  | { readonly type: 'select-session'; readonly sessionId: string }
  | { readonly type: 'clear-session' }

/** 初始态：会话视图、右栏收起（UF-7 默认轨道归零）、无锚（首启空态——项目/会话主链路 2.x 接入后由事件驱动） */
export function createShellViewState(): ShellViewState {
  return {
    center: 'session',
    rightDock: false,
    rightDockPreference: null,
    focus: { projectId: null, sessionId: null },
  }
}

/**
 * 视图态转移（纯函数；转移表闭合，default 分支 never 收口——新增事件须同步扩本函数）。
 *   show-session      → center='session'；右栏恢复（用户显式偏好优先，否则默认收起 UF-7）
 *   show-knowledge    → center='knowledge'；右栏隐藏（SC8；偏好不改写——隐藏是视图联动非用户选择）
 *   toggle-right-dock → rightDock 取反并记为用户显式偏好（知识视图内手动开启 = 显式选择，回会话保留）
 *   select-project    → focus.projectId 更新（跨视图保留 = 页签跟随项目）；不切视图（选择 ≠ 导航）
 *   select-session    → focus.sessionId 更新并回 session 视图（会话锚定就会话视图；右栏按
 *                       偏好恢复——与 show-session 同径，fix-11：会话行切回是回会话视图的
 *                       主路径，遗漏恢复则知识视图隐藏后被钉在收起态）
 *   clear-session     → focus.sessionId 置空（会话关闭；视图留 session，空态由容器渲染）
 */
export function dispatchShellView(state: ShellViewState, event: ShellViewEvent): ShellViewState {
  switch (event.type) {
    case 'show-session':
      return { ...state, center: 'session', rightDock: state.rightDockPreference ?? false }
    case 'show-knowledge':
      return { ...state, center: 'knowledge', rightDock: false }
    case 'toggle-right-dock': {
      const rightDock = !state.rightDock
      return { ...state, rightDock, rightDockPreference: rightDock }
    }
    case 'select-project':
      return { ...state, focus: { ...state.focus, projectId: event.projectId } }
    case 'select-session':
      return {
        ...state,
        center: 'session',
        rightDock: state.rightDockPreference ?? false,
        focus: { ...state.focus, sessionId: event.sessionId },
      }
    case 'clear-session':
      return { ...state, focus: { ...state.focus, sessionId: null } }
    default: {
      const exhaustive: never = event
      throw new Error(`dsh-forge web: 未知视图事件：${String((exhaustive as { type: string }).type)}`)
    }
  }
}
