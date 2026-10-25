// 显示选中真源读取面（client-plugin 侧——forge-client.js classic script）。
//
// Root cause（bug 05c712a4，同族 2f944fe0/AGENTS 3.4 判例）：创建路由此前消费 host
// 选中记忆（内存 Map——fire-and-forget 写、失败仅 warn、进程级共享、重启即空），记忆
// 与 chip 本地显示分叉即「所见 a 落 b」。根治 = 创建路由改读显示真源：状态挂 window
// 全局锚（单脚本域单实例——恰匹配「显示真源按窗口」语义；classic script 友好，先例
// __dshMobileAskBridge），应用侧 WorktreeFaces 经 state/selected-tree-window.ts 写入
// （两侧各自持薄访问器，KEY 契约单源 = src/state/selected-tree-window.ts）。
//
// 注意：本模块只读；写面在应用侧（client-plugin 与 app 是两个脚本域，模块实例不共享，
// 禁止从 client-plugin 直接 import 应用模块——会拆 ESM 共享块破坏 classic 形状 pin）。

/** window 全局锚 KEY 契约（写面正本 = apps/web/src/state/selected-tree-window.ts） */
const KEY = '__dshForgeSelectedTree'

export interface SelectedTreeDisplay {
  /** 创建路由读面：当前窗口用户所见选中树；undefined = 未选中（调用方回落项目根） */
  get(): string | undefined
}

export const selectedTreeDisplay: SelectedTreeDisplay = {
  get: (): string | undefined => {
    const value = (globalThis as unknown as Record<string, unknown>)[KEY]
    return typeof value === 'string' && value !== '' ? value : undefined
  },
}
