// installStartSessionWrap——绑定推导制·入口锚定 workspaceId 直通（binding-derivation §2.3）：
// 装配期对官方 uiWorkspace.startSession 做属性替换（dispose 恢复）。
//
// 背景：官方壳「新建会话」无参 startSession 的锚点 = currentWorkspaceId ?? recent，可落
// 在一个树工作区——新会话/草稿绕过 hero chip 的显示选中，绑到「上一个活跃的树」。预铸
// 采纳单门退役后（桌面创建 = 客户端直呼官方网关命令 session.create({workspaceId})，零
// forge 改道），本 wrap 只做一件事：把入口锚定到 chip 显示树的 workspaceId，直通官方
// startSession(workspaceId)——官方内部 session.create({workspaceId}) 原生 blank 复用即路由。
//
// 三条纪律：
//   ① workspaceId 直通——显式 workspaceId 调用原样透传；无参径解析出 workspaceId 后亦
//      原样直通，全程零 forge 建会话 RPC（预铸改道退役）；
//   ② 显示源路由保留——显示真源（displayedTree：与 chip 本地投影同源的客户端态）权威于
//      官方内部锚点；workspaceId 解析 = chip 双发数据源（WorktreeEntryDto.workspaceId，
//      forge:worktree/list）优先，官方 workspaces.list path 匹配回退；
//      bug 05c712a4 根治：显示真源 = 客户端本地态（selected-tree-display），不再读 host
//      选中记忆（内存态易与显示分叉：push 丢失/重启清空/多窗覆写即绑错树）；
//   ③ fail-open——判定链异常/解析缺席 = 官方原流（warn 一行）。
//
// bundle 自含纪律：本文件零运行时 import——官方面以结构同型镜像窄接口承载。

/** 官方 uiWorkspace.startSession 窄面（属性替换对象属性——调用期属性查找全命中）。
 *  官方 startSession 返回 void；替换体返回路由 promise（调用方火忘不受影响，测试面 await 判序）。 */
export interface StartSessionFace {
  startSession?: (workspaceId?: string) => void | Promise<void>
}

/** 官方 sessions.list 快照窄面（recentWorkspace 复刻的 updatedAt 源） */
export interface SessionsListSlice {
  getSnapshot?: () => unknown
}

/** 官方 workspaces.list 快照窄面（items {workspaceId, path, sessionIds, createdAt}） */
export interface WorkspacesListSlice {
  getSnapshot?: () => unknown
}

/** wrap 依赖（注入面——生产 = 页内服务/RPC 镜像，测试 = spy） */
export interface StartSessionWrapDeps {
  readonly uiWorkspace: StartSessionFace
  /** 官方 sessions.list（recentWorkspace 复刻源） */
  readonly sessionsList: SessionsListSlice
  /** 官方 workspaces.list（锚点计算 + workspaceId 回退解析源） */
  readonly workspacesList: WorkspacesListSlice
  /** 树归属门（forge:worktree/resolve 窄面——path → 注册项目根；null = 未注册） */
  readonly resolveRoot: (path: string) => Promise<string | null>
  /** 显示真源（selected-tree-display——与 chip 本地投影同源；undefined = 未选中，
   *  调用方回落项目根。bug 05c712a4 根治：替代 host 选中记忆读） */
  readonly displayedTree: () => string | undefined
  /** chip 双发数据源（WorktreeEntryDto.workspaceId——forge:worktree/list 窄面；
   *  worktreePath → workspaceId；undefined = 行缺席/形状漂移） */
  readonly worktreeWorkspaceId: (worktreePath: string, projectRoot: string) => Promise<string | undefined>
  /** fail-open 诊断行（缺省 console.warn） */
  readonly warn?: (message: string) => void
}

/** 路径归一（跨源比较键：反斜杠→斜杠 + 小写 + 去尾斜杠） */
function normPath(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const trimmed = slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  return trimmed.toLowerCase()
}

interface WsItemSlice {
  readonly workspaceId?: unknown
  readonly path?: unknown
  readonly sessionIds?: unknown
  readonly createdAt?: unknown
}

/** 官方 recentWorkspace 同判复刻（稳定平局随 Host Workspace 序——源码核销 2026-10-24） */
function recentWorkspaceId(items: readonly WsItemSlice[], byId: Record<string, unknown>): string | undefined {
  let selected: string | undefined
  let selectedTime = Number.NEGATIVE_INFINITY
  for (const workspace of items) {
    const workspaceId = workspace.workspaceId
    const sessionIds = workspace.sessionIds
    if (typeof workspaceId !== 'string' || workspaceId === '' || !Array.isArray(sessionIds)) continue
    let latest = Number.NEGATIVE_INFINITY
    for (const sessionId of sessionIds) {
      if (typeof sessionId !== 'string') continue
      const session = byId[sessionId]
      if (typeof session !== 'object' || session === null) continue
      const updatedAt = (session as { updatedAt?: unknown }).updatedAt
      if (typeof updatedAt === 'number') latest = Math.max(latest, updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) {
      const createdAt = workspace.createdAt
      if (typeof createdAt === 'string') {
        const parsed = Date.parse(createdAt)
        if (!Number.isNaN(parsed)) latest = parsed
      }
    }
    if (selected === undefined || latest > selectedTime) {
      selected = workspaceId
      selectedTime = latest
    }
  }
  return selected
}

/** 官方锚点复刻：currentWorkspaceId ?? recent（官方 startSession 同判的快照窄镜像） */
function officialAnchor(
  deps: StartSessionWrapDeps,
  items: readonly WsItemSlice[],
): { targetPath: string | undefined } {
  const getSessions = deps.sessionsList.getSnapshot
  const snapshot = typeof getSessions === 'function' ? (getSessions.call(deps.sessionsList) as { byId?: unknown } | null) : null
  const byId: Record<string, unknown> =
    typeof snapshot?.byId === 'object' && snapshot.byId !== null ? (snapshot.byId as Record<string, unknown>) : {}
  let current: string | undefined
  for (const row of Object.values(byId)) {
    if (typeof row !== 'object' || row === null) continue
    const retained = (row as { retainedBy?: unknown }).retainedBy
    if (typeof retained !== 'object' || retained === null) continue
    if (Number((retained as { mainView?: unknown }).mainView ?? 0) > 0) {
      const id = (row as { id?: unknown }).id
      if (typeof id === 'string' && id !== '') current = id
    }
  }
  let targetId: string | undefined
  if (current !== undefined) {
    targetId = items.find(
      (item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(current),
    )?.workspaceId as string | undefined
  }
  if (targetId === undefined || targetId === '') targetId = recentWorkspaceId(items, byId)
  if (targetId === undefined || targetId === '') return { targetPath: undefined }
  const targetPath = items.find((item) => item.workspaceId === targetId)?.path
  return { targetPath: typeof targetPath === 'string' && targetPath !== '' ? targetPath : undefined }
}

/**
 * 装配期安装（apply() 内 uiWorkspace 到手后恰一次）：留底官方原方法 → 影子替换 →
 * 返回 dispose（恢复原方法；幂等）。startSession 面缺席（上游面漂移）= 零安装零抛。
 */
export function installStartSessionWrap(deps: StartSessionWrapDeps): () => void {
  const face = deps.uiWorkspace as unknown as Record<string, unknown>
  const original = face['startSession']
  if (typeof original !== 'function') return () => {}
  const bound = (original as (workspaceId?: string) => void).bind(deps.uiWorkspace)
  const warn = deps.warn ?? ((message: string): void => console.warn(message))

  const wrapped = (workspaceId?: string): void | Promise<void> => {
    // ① 显式 workspaceId = 官方直通零介入（chip 双发径——创建请求显式传参）
    if (workspaceId !== undefined && workspaceId !== '') {
      bound(workspaceId)
      return
    }
    return (async (): Promise<'official' | { workspaceId: string }> => {
      const getWorkspaces = deps.workspacesList.getSnapshot
      const wsSnapshot = typeof getWorkspaces === 'function' ? (getWorkspaces.call(deps.workspacesList) as { items?: unknown } | null) : null
      const items: readonly WsItemSlice[] = Array.isArray(wsSnapshot?.items)
        ? (wsSnapshot.items as readonly WsItemSlice[])
        : []
      const { targetPath } = officialAnchor(deps, items)
      if (targetPath === undefined) return 'official'
      const projectRoot = await deps.resolveRoot(targetPath).catch(() => null)
      if (projectRoot === null || projectRoot === '') return 'official'
      // ② 显示源路由（所见即所得）：显示真源 = 客户端本地态（与 chip 同源，同步读零
      //    竞态）；缺席回落项目根（chip 缺省显示主行同判）
      const displayed = deps.displayedTree() ?? projectRoot
      // ① workspaceId 直通：chip 双发数据源（WorktreeEntryDto.workspaceId）优先，
      //    官方 workspaces.list path 匹配回退——解析即直通官方 startSession(workspaceId)，
      //    官方 session.create({workspaceId}) 原生 blank 复用，零 forge 改道
      const fromDto = await deps.worktreeWorkspaceId(displayed, projectRoot).catch(() => undefined)
      if (typeof fromDto === 'string' && fromDto !== '') return { workspaceId: fromDto }
      const row = items.find(
        (item) =>
          typeof item.workspaceId === 'string' &&
          item.workspaceId !== '' &&
          typeof item.path === 'string' &&
          normPath(item.path) === normPath(displayed),
      )
      if (row !== undefined) return { workspaceId: row.workspaceId as string }
      return 'official'
    })()
      .then((route) => {
        bound(route === 'official' ? undefined : route.workspaceId)
      })
      .catch((cause: unknown) => {
        warn(`[dswf-client] startSession workspaceId 直通路由失败（fail-open 官方原流）：${String(cause)}`)
        bound(undefined)
      })
  }
  face['startSession'] = wrapped
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    face['startSession'] = original
  }
}
