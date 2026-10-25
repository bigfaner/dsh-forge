// 显示选中真源（单窗口客户端态，模块单例）。
//
// Root cause（bug 05c712a4，同族 2f944fe0/AGENTS 3.4 判例 2026-10-24）：创建路由此前
// 消费 host 选中记忆（lastSelection 内存 Map——fire-and-forget 写、失败仅 warn、进程级
// 共享、重启即空），记忆与 chip 本地显示任何分叉（push 丢失/重启/多窗覆写）即「所见 a
// 落 b」。根治 = 创建路由改读本存储（与 chip 本地投影同一状态，所见即所传）；
// host select/selected 通道退役为 chip 回填等显示恢复面，不再参与创建路由。
export interface SelectedTreeDisplay {
  /** chip 选中态唯一写入口（本地投影 setLocalSelectedPath 的镜像） */
  set(path: string | undefined): void
  /** 创建路由读面：当前窗口用户所见选中树；undefined = 未选中（调用方回落主根） */
  get(): string | undefined
}

let current: string | undefined

export const selectedTreeDisplay: SelectedTreeDisplay = {
  set: (path: string | undefined): void => {
    current = path
  },
  get: (): string | undefined => current,
}
