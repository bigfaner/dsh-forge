// worktree 切换闸安装器（client-plugin 入口专用——plugin.ts apply 期调用）。
//
// KEY 契约 `__dshForgeWorktreeSwitchGate` 双注：写入器 = src/state/worktree-switch-gate.ts
// （WorktreeFaces 点选链置位）。入口与共享组件禁共 import 模块（classic 形状 pin，判例
// 20be1ba7），故安装器独立成文件、仅入口引用。
//
// 机制（bug 267dcac1）：pending 窗口 → 官方 composer block 缝（conversation.blocks——
// ui-conversation client.js:3747「the one way another plugin stops a session's input」，
// ConversationController cordis 服务「conversation」公开字段）对当前主会话 set block——
// composer 渲染为官方 inert 禁用形态（inert textarea + reason 占位，与会话无 workspace
// 同形，client.js:16289/17289）。敛棋/3s 超时对**原会话**清 block（openWorkspace 换主后
// mainReference 已易主，清退必须锚定置位时点的会话）。会话缺席/面漂移 = fail-soft 零锁。

const KEY = '__dshForgeWorktreeSwitchGate'

/** 切换 pending 窗口的 composer block 文案（官方 blocked 占位 = block.reason） */
const BLOCK_REASON = '正在切换 worktree…'

export interface WorktreeSwitchGateInstallOptions {
  /** client 根 ctx（conversation 服务经 reflect 惰性读取——bugReferenceServicesOf 同配方） */
  readonly clientCtx: unknown
  /** 官方 uiWorkspace（mainReference.sessionId = 当前主会话） */
  readonly uiWorkspace: unknown
  /** fail-soft 诊断行（缺省 console.warn） */
  readonly warn?: (message: string) => void
}

export function installWorktreeSwitchGate(options: WorktreeSwitchGateInstallOptions): void {
  const warn = options.warn ?? ((message: string): void => console.warn(message))
  const anchor = (globalThis as unknown as Record<string, unknown>)[KEY] as
    | { isPending?: () => boolean; subscribe?: (listener: () => void) => () => void }
    | undefined
  if (anchor?.subscribe === undefined || anchor.isPending === undefined) {
    warn('[dswf-client] 切换闸 window 锚缺席（共享模块未装载）——composer block 门不安装')
    return
  }
  const blocksFace = (): { set?: (sessionId: string, block: { reason: string } | undefined) => void } | undefined => {
    const conversation = (
      options.clientCtx as { reflect?: { get(name: string, strict?: boolean): unknown } }
    )?.reflect?.get('conversation', false)
    const blocks = (conversation as { blocks?: unknown } | undefined)?.blocks
    return typeof (blocks as { set?: unknown } | undefined)?.set === 'function'
      ? (blocks as { set: (sessionId: string, block: { reason: string } | undefined) => void })
      : undefined
  }
  const currentSessionId = (): string | undefined => {
    const sessionId = (options.uiWorkspace as { mainReference?: { sessionId?: unknown } } | undefined)
      ?.mainReference?.sessionId
    return typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined
  }
  let blockedSessionId: string | undefined
  const apply = (pending: boolean): void => {
    const blocks = blocksFace()
    if (blocks === undefined) return
    if (pending) {
      if (blockedSessionId !== undefined) return
      const sessionId = currentSessionId()
      if (sessionId === undefined) return
      try {
        blocks.set(sessionId, { reason: BLOCK_REASON })
        blockedSessionId = sessionId
      } catch (cause: unknown) {
        warn(`[dswf-client] composer block 置位失败（fail-soft）：${String(cause)}`)
      }
      return
    }
    if (blockedSessionId === undefined) return
    try {
      blocks.set(blockedSessionId, undefined)
    } catch (cause: unknown) {
      warn(`[dswf-client] composer block 清退失败（fail-soft）：${String(cause)}`)
    }
    blockedSessionId = undefined
  }
  apply(anchor.isPending())
  anchor.subscribe(() => {
    apply(anchor.isPending!())
  })
}
