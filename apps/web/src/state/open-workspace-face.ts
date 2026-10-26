// openWorkspace 官方面读取器（消费面 = WorktreeFaces 点选链——共享组件，禁与 client
// 入口共 import 模块：跨入口共享模块被 rolldown 拆 ESM 共享块破坏 forge-client classic
// 形状 pin，判例 20be1ba7/binding-derivation 评审）。
//
// 状态挂 window 全局锚 `__dshForgeOpenWorkspace`：装配期由 client-plugin 入口
// （open-workspace-face-install.ts，KEY 双注）写入官方 openWorkspace 窄面。
// 用途（bug 05c712a4 composer 腿收口）：worktree chip 点选 = 显式传参官方
// openWorkspace(workspaceId)——官方语义「选工作区 = 立即 connectWorkspace 建/复用该树
// blank」（AGENTS 3.4：显示 = 实际生效状态）。

const KEY = '__dshForgeOpenWorkspace'

/** 官方 openWorkspace 窄面（workspaceId 显式传参——官方内部 session.create 原生 blank 复用） */
export type OpenWorkspaceFace = (workspaceId: string) => void | Promise<void>

export function openWorkspaceFace(): OpenWorkspaceFace | undefined {
  const face = (globalThis as unknown as Record<string, unknown>)[KEY]
  return typeof face === 'function' ? (face as OpenWorkspaceFace) : undefined
}
