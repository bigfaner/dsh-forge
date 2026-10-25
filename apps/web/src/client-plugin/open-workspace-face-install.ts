// openWorkspace 官方面安装器（client-plugin 入口专用——plugin.ts uiWorkspace 到手处调用）。
//
// KEY 契约 `__dshForgeOpenWorkspace` 双注：读取器 = src/state/open-workspace-face.ts
// （WorktreeFaces 点选链）。入口与共享组件禁共 import 模块（classic 形状 pin，判例
// 20be1ba7），故安装器独立成文件、仅入口引用。
//
// 用途（bug 05c712a4 composer 腿收口 + bug 267dcac1 竞速收口）：
// ① worktree chip 点选 = 显式传参官方 openWorkspace(workspaceId, beforeOpen)——官方唯一
//    创建前决策缝（ui-conversation client.js:18190 selectWorkspace 同径）；
// ② 面返回 promise——装配层切换闸（worktree-switch-gate）据此敛棋，pending 窗口 composer
//    禁输（点选后 ~1s openWorkspace 生效前发送落旧树的 WYSIWYG 分叉窗口归零）；
// ③ beforeOpen 草稿迁移（官方 selectWorkspace 同语义，client.js:18190-18205）：新 blank
//    写入旧 blank 草稿、旧 blank 清空——beforeOpen 时点新旧两态皆在 retain（replaceMain
//    client.js:971-992：新引用先 retain、旧 main 后 release），迁移窗成立。

const KEY = '__dshForgeOpenWorkspace'

/** 官方 openWorkspace 窄面承诺（beforeOpen：草稿迁移窗钩子——官方 replaceMain 换主前回调） */
type OfficialOpenWorkspace = (
  workspaceId: string,
  beforeOpen?: (nextSessionId: string) => void,
) => Promise<void>

/** 会话输入 shell 窄面（conversation.input.for 产物——草读写） */
export interface DraftShellFace {
  readonly snapshot: { readonly draft: string; readonly attachmentIds?: readonly unknown[] }
  setDraft(text: string): void
}

export interface OpenWorkspaceInstallOptions {
  /** 官方 uiWorkspace（装配期 clientCtx.get('uiWorkspace')） */
  readonly uiWorkspace: unknown
  /** 会话 shell 解析器（plugin.ts 组装：sessions.binding(id).ctx → conversation.input.for——
   * 官方 queue dock 同径，bugReferenceServicesOf 先例；缺席/未 retain = undefined fail-soft） */
  readonly resolveShell?: (sessionId: string) => DraftShellFace | undefined
  /** fail-soft 诊断行（缺省 console.warn） */
  readonly warn?: (message: string) => void
}

export function installOpenWorkspaceFace(options: OpenWorkspaceInstallOptions): void {
  const warn = options.warn ?? ((message: string): void => console.warn(message))
  const svc = options.uiWorkspace as {
    openWorkspace?: OfficialOpenWorkspace
    mainReference?: { sessionId?: unknown }
  }
  if (svc.openWorkspace === undefined) {
    warn('[dswf-client] uiWorkspace.openWorkspace 缺席（上游面漂移）——worktree 点选仅显示态')
    return
  }
  const open = svc.openWorkspace.bind(svc)
  ;(globalThis as unknown as Record<string, unknown>)[KEY] = (workspaceId: string): Promise<void> => {
    // 官方 selectWorkspace 同语义的草稿迁移钩子（文本径；附件迁移依赖官方内部面
    // rebindDraftFiles——附件在场整体跳过 fail-soft）。shell 面缺席 = 零迁移不阻切换。
    const from =
      typeof svc.mainReference?.sessionId === 'string' ? (svc.mainReference.sessionId as string) : undefined
    const beforeOpen =
      options.resolveShell === undefined || from === undefined
        ? undefined
        : (nextSessionId: string): void => {
            if (from === nextSessionId) return
            try {
              const fromShell = options.resolveShell!(from)
              const nextShell = options.resolveShell!(nextSessionId)
              if (fromShell === undefined || nextShell === undefined) return
              const attachments = fromShell.snapshot.attachmentIds
              if (attachments !== undefined && attachments.length > 0) return
              const draft = fromShell.snapshot.draft
              if (draft === '') return
              nextShell.setDraft(draft)
              fromShell.setDraft('')
            } catch (cause: unknown) {
              warn(`[dswf-client] worktree 切换草稿迁移失败（fail-soft——不阻切换）：${String(cause)}`)
            }
          }
    return open(workspaceId, beforeOpen).catch((cause: unknown): void => {
      warn(`[dswf-client] openWorkspace 失败（fail-soft）：${String(cause)}`)
    })
  }
}
