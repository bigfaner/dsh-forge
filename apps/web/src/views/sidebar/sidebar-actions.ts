// 左栏导航动作绑定（定位：业务——UF-1 导航项 → 壳视图态机的桥接缝）。
// 左栏面板（client 插件槽位注册）与工作台装配（2.12，React 树持有 useShellView）分属
// 两个求值单元，唯一通信缝 = 页面全局工作台桥 __DSH_FORGE_WORKBENCH__（2.12 装配发布；
// 缺席 = 工作台未装配，fail-soft：会话照开（dsh 面），视图切换 no-op + console.warn）。
// 事件面 = shell/view-state 转移表（select-session：回会话视图 + 会话锚定，不重置右栏
// 与浏览上下文——AC5「不重置中区其它视图状态」的机制保证在转移表侧）。
import type { ShellViewEvent } from '../../shell/view-state.js'

/** 工作台桥形状（2.12 装配发布；view-state 事件面同型） */
export interface WorkbenchBridge {
  dispatch(event: ShellViewEvent): void
}

/** 桥的全局挂点（与 __DSH_FORGE_VIEWS__ 同族：装配 ↔ 插件两单元的页内缝） */
export interface DshForgeWorkbenchGlobal {
  __DSH_FORGE_WORKBENCH__?: WorkbenchBridge
}

/** 读工作台桥（缺席 = undefined——fail-soft 判据） */
export function workbenchBridge(): WorkbenchBridge | undefined {
  return (globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__
}

/** 面板导航动作（纯绑定——openSession 为 dsh 面（插件 inject face 注入），视图事件走桥） */
export interface SidebarActions {
  /** 知识库入口 → 视图整体切换知识库视图（AC3；M0 知识面板空态占位） */
  onOpenKnowledge(): void
  /** 会话行 → 打开 dsh 会话（官方面）+ select-session（回会话视图 + 锚定，AC5） */
  onSessionActivate(sessionId: string): void
}

/**
 * 绑定面板导航动作（纯函数，可测）。
 * @param openSession - dsh 会话打开（ctx.sessions.open 的窄面——插件 inject face 注入）
 * @param bridge - 工作台桥（缺省读全局；显式注入 = 测试面）
 */
export function sidebarActions(
  openSession: (sessionId: string) => void,
  bridge: WorkbenchBridge | undefined = workbenchBridge(),
): SidebarActions {
  return {
    onOpenKnowledge: () => {
      if (bridge === undefined) {
        console.warn('dsh-forge web: 工作台桥缺席（2.12 装配未就位）——知识视图切换 no-op')
        return
      }
      bridge.dispatch({ type: 'show-knowledge' })
    },
    onSessionActivate: (sessionId) => {
      openSession(sessionId)
      bridge?.dispatch({ type: 'select-session', sessionId })
    },
  }
}
