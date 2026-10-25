// openWorkspace 官方面安装器（client-plugin 入口专用——plugin.ts uiWorkspace 到手处调用）。
//
// KEY 契约 `__dshForgeOpenWorkspace` 双注：读取器 = src/state/open-workspace-face.ts
// （WorktreeFaces 点选链）。入口与共享组件禁共 import 模块（classic 形状 pin，判例
// 20be1ba7），故安装器独立成文件、仅入口引用。
//
// 用途（bug 05c712a4 composer 腿收口）：worktree chip 点选 = 显式传参官方
// openWorkspace(workspaceId)——官方唯一创建前决策缝（ui-conversation client.js:18190
// selectWorkspace 同径）。

const KEY = '__dshForgeOpenWorkspace'

export interface OpenWorkspaceInstallOptions {
  /** 官方 uiWorkspace（装配期 clientCtx.get('uiWorkspace')） */
  readonly uiWorkspace: unknown
  /** fail-soft 诊断行（缺省 console.warn） */
  readonly warn?: (message: string) => void
}

export function installOpenWorkspaceFace(options: OpenWorkspaceInstallOptions): void {
  const warn = options.warn ?? ((message: string): void => console.warn(message))
  const svc = options.uiWorkspace as { openWorkspace?: (workspaceId: string) => Promise<void> }
  if (svc.openWorkspace === undefined) {
    warn('[dswf-client] uiWorkspace.openWorkspace 缺席（上游面漂移）——worktree 点选仅显示态')
    return
  }
  ;(globalThis as unknown as Record<string, unknown>)[KEY] = (workspaceId: string): void => {
    void svc.openWorkspace!(workspaceId).catch((cause: unknown) => {
      warn(`[dswf-client] openWorkspace 失败（fail-soft）：${String(cause)}`)
    })
  }
}
