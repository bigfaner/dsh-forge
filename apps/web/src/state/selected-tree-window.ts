// 显示选中真源写面（应用侧——WorktreeFaces chip 本地投影的镜像落点）。
//
// 状态挂 window 全局锚（`__dshForgeSelectedTree`）：client-plugin（forge-client.js，
// classic script）与主应用是两个脚本域、模块实例不共享，显示真源必须走 window 才能被
// 创建路由（start-session-wrap，client-plugin 侧 selectedTreeDisplay.get）读到。
// 单脚本域单实例 = 恰匹配「显示真源按窗口」语义（bug 05c712a4 根治；先例 __dshMobileAskBridge）。
//
// KEY 契约单源 = 本文件；client-plugin/selected-tree-display.ts 持只读镜像访问器。

const KEY = '__dshForgeSelectedTree'

export function setSelectedTreeDisplay(path: string | undefined): void {
  ;(globalThis as unknown as Record<string, unknown>)[KEY] = path
}
