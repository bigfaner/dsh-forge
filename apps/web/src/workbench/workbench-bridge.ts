// 工作台桥发布面（定位：装配——页面全局 __DSH_FORGE_WORKBENCH__ 的发布侧）。
// 动机：左栏面板（client 插件槽位注册，经 sidebar-actions 读桥）与工作台装配（壳 bundle，
// React 树持有 useShellView）分属两个求值单元，唯一通信缝 = 页内全局工作台桥——与
// __DSH_FORGE_VIEWS__（组件源发布）/ __DSH_FORGE_ADD_PROJECT_FLOW__（流程打开缝）同族。
// 类型唯一源 = sidebar-actions（WorkbenchBridge——type-only import，无运行期环）；
// 发布 = 工作台装配 mount 期，撤销 = unmount 期；缺席期左栏视图切换 fail-soft no-op
// （sidebar-actions 口径）。事件面 = shell/view-state 转移表（透传不解释）。
import type { WorkbenchBridge } from '../views/sidebar/sidebar-actions.js'

/** 桥的全局挂点形状（结构同型镜像 sidebar-actions.DshForgeWorkbenchGlobal——bundle 内两单元同键） */
export interface DshForgeWorkbenchGlobal {
  __DSH_FORGE_WORKBENCH__?: WorkbenchBridge
}

/** 发布/撤销工作台桥（undefined = 撤销；幂等） */
export function publishWorkbenchBridge(bridge: WorkbenchBridge | undefined): void {
  ;(globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__ = bridge
}
