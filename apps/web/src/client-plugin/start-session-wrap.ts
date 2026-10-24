// installStartSessionWrap——绑错树修复·所见即所得（bug「选中 A 创建绑到上一个选中的 B」）：
// 装配期对官方 uiWorkspace.startSession 做属性替换（create-wrap 同配方，dispose 恢复）。
//
// Root cause: 官方壳「新建会话」无参 startSession 的锚点 = currentWorkspaceId ?? recent
// （官方 ui-workspace startSession 源码核销），可落在一个树工作区——随后 blank 复用采纳
// （cwd ≡ ws.path 的既有 blank 直通采纳）或 wrap A2 显式树预铸，两条路都绕过 hero chip
// 的选中记忆（host lastSelection），新会话/草稿于是绑到「上一个活跃的树」。
//
// 修复（WYSIWYG 用户裁决 2026-10-24）：无参径按 host 选中记忆（forge:worktree/selected
// ——与 chip 回填同源）直接路由「所选树」的 workspace：复用该树既有 blank = 所选树本体；
// 树 workspace 未建 = 直接预铸该树会话并 openSession。会话一出生即属于所选树，零中间态。
//
// 三条纪律（create-wrap 同源）：
//   ① 判定逐次独立——每次调用现查快照/项目行/选中记忆，零缓存；
//   ② fail-open——判定链任何异常（快照漂移/RPC 失败/形状漂移）= 官方原流 + warn 一行；
//   ③ 零触碰——显式 workspaceId 调用原样透传；显示 ≡ 当前锚 = 官方原流（既有复用本即
//      所见即所得），零语义漂移。
//
// bundle 自含纪律：本文件零运行时 import——官方面以结构同型镜像窄接口承载。

/** 官方 uiWorkspace.startSession / openSession 窄面（属性替换对象属性——调用期属性查找全命中）。
 *  官方 startSession 返回 void；替换体返回路由 promise（调用方火忘不受影响，测试面 await 判序）。 */
export interface StartSessionFace {
  startSession?: (workspaceId?: string) => void | Promise<void>
  openSession?: (sessionId: string) => void
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
  /** 官方 workspaces.list（锚点/所选树 → workspaceId 解析源） */
  readonly workspacesList: WorkspacesListSlice
  /** 树归属门（forge:worktree/resolve 窄面——path → 注册项目根；null = 未注册） */
  readonly resolveRoot: (path: string) => Promise<string | null>
  /** host 选中记忆读镜像（forge:worktree/selected——与 chip 回填同源；undefined = 未选中） */
  readonly selectedTree: (projectRoot: string) => Promise<string | undefined>
  /** 官方 create 正门（create-wrap 改道后——cwd 径预铸/官方建，返回会话 id） */
  readonly createSession: (cwd: string) => Promise<string>
  /** fail-open 诊断行（缺省 console.warn） */
  readonly warn?: (message: string) => void
}

/** 路径归一（跨源比较键：反斜杠→斜杠 + 小写 + 去尾斜杠——create-wrap 同判） */
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
    if (workspaceId !== undefined && workspaceId !== '') {
      bound(workspaceId)
      return
    }
    return (async (): Promise<'official' | { workspaceId: string } | { precast: string }> => {
      const getWorkspaces = deps.workspacesList.getSnapshot
      const wsSnapshot = typeof getWorkspaces === 'function' ? (getWorkspaces.call(deps.workspacesList) as { items?: unknown } | null) : null
      const items: readonly WsItemSlice[] = Array.isArray(wsSnapshot?.items)
        ? (wsSnapshot.items as readonly WsItemSlice[])
        : []
      const { targetPath } = officialAnchor(deps, items)
      if (targetPath === undefined) return 'official'
      const projectRoot = await deps.resolveRoot(targetPath).catch(() => null)
      if (projectRoot === null || projectRoot === '') return 'official'
      // 所见 = host 选中记忆（与 chip 回填同源）；读失败 = 意图不可知 → fail-open 官方原流
      let selected: string | undefined
      try {
        selected = await deps.selectedTree(projectRoot)
      } catch {
        return 'official'
      }
      const displayed = selected ?? projectRoot // 缺席回落项目根（chip 缺省显示主行同判）
      if (normPath(displayed) === normPath(targetPath)) return 'official' // 显示 ≡ 当前锚：官方原流
      const displayedRow = items.find(
        (item) =>
          typeof item.workspaceId === 'string' &&
          item.workspaceId !== '' &&
          typeof item.path === 'string' &&
          normPath(item.path) === normPath(displayed),
      )
      if (displayedRow !== undefined) return { workspaceId: displayedRow.workspaceId as string }
      if (normPath(displayed) !== normPath(projectRoot)) {
        // 所选树 workspace 未建：直接预铸该树会话（显式树径——绑定事件随预铸落盘）
        const sessionId = await deps.createSession(displayed)
        return { precast: sessionId }
      }
      return 'official'
    })()
      .then((route) => {
        if (route === 'official') {
          bound(undefined)
          return
        }
        if ('workspaceId' in route) {
          bound(route.workspaceId)
          return
        }
        const open = (deps.uiWorkspace as unknown as Record<string, unknown>)['openSession']
        if (typeof open !== 'function') {
          bound(undefined)
          return
        }
        ;(open as (sessionId: string) => void).call(deps.uiWorkspace, route.precast)
      })
      .catch((cause: unknown) => {
        warn(`[dswf-client] startSession 所见即所得路由失败（fail-open 官方原流）：${String(cause)}`)
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
