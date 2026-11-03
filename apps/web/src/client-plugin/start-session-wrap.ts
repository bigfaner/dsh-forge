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

/**
 * INV-U 统一选主谓词（bug 0c677db2 收口——与 host 侧 worktree-identity.ts 主树锚判镜像
 * 同构，禁止双轨分叉）。统一契约（判据书面化正本：docs/conventions/official-face-contract-anchors.md）：
 *   ① 主树行必胜：候选集中唯一「归一 path 是其它候选行归一 path 的祖先前缀」的行胜出。
 *      host 判据（worktree-identity resolveProject：锚 = realpath(git-common-dir) 恒坐落在
 *      主树内 ⇒ 主树路径是同仓 worktree 行的祖先前缀）的零探针镜像——语义上「主树行必胜」
 *      是产品裁决语义（fix-1 家族定谳），createdAt 只是实现近似；
 *   ② 主树判缺席（候选行互不为祖先——同径残留重复行，8c7e847f 实证形态）→ createdAt
 *      最新胜（解析失败视为最早）；host 行集无同径重复行（projects.ws_path 唯一），此层
 *      为 wrap 面官方 W 清单特有兜底，不违镜像同构（主树判优先级两侧一致）；
 *   ③ 平手保快照序首行（确定性序——INV-R 幂等）。
 * 成立域限定（M1）：① 的 host 判据（锚在行内）与 wrap 祖先前缀判等价的前提是
 * 「worktree 全在主树子树内」——worktree_dir 逐项目可配（host worktree-identity
 * getWorktreeDir），外置布局下主树路径未必是 worktree 行的祖先前缀，两半边可分叉；
 * 另设祖先非 git 注册根行劫持分叉域：host 侧有 isGenuineGitRoot 域归属核验守卫
 * （bug bc81f4b8 收口），wrap 前缀判无同锚过滤、零 git 探针不加复核，分叉面以台账
 * official-face-contract-anchors.md 为准。
 * 契约锚定测试：master-arbitration.test.ts（同锚集合两半边裁决一致性）。
 */
export function selectMasterRow(
  items: readonly WsItemSlice[],
  predicate: (item: WsItemSlice) => boolean,
): WsItemSlice | undefined {
  const candidates = items.filter(predicate)
  const pathKeyOf = (item: WsItemSlice): string | undefined => {
    const path = item.path
    return typeof path === 'string' && path !== '' ? normPath(path) : undefined
  }
  const isAncestorOfAny = (row: WsItemSlice): boolean => {
    const rowKey = pathKeyOf(row)
    if (rowKey === undefined) return false
    return candidates.some((other) => {
      if (other === row) return false
      const otherKey = pathKeyOf(other)
      return otherKey !== undefined && otherKey.startsWith(`${rowKey}/`)
    })
  }
  let master: WsItemSlice | undefined
  let masterTime = Number.NEGATIVE_INFINITY
  let masterAncestor = false
  for (const item of candidates) {
    const parsed = typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : Number.NaN
    const at = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
    const ancestor = isAncestorOfAny(item)
    if (ancestor && !masterAncestor) {
      // ① 主树行必胜（首遇即占位——后继非主树行不得凭 createdAt 翻盘）
      master = item
      masterTime = at
      masterAncestor = true
      continue
    }
    if (master === undefined) {
      master = item
      masterTime = at
      continue
    }
    if (masterAncestor) continue // ① 主树行占位即冻结选主（后继非主树行不得凭 createdAt 翻盘——bug 143328f1）
    // ②③ 同层（均非主树行）：createdAt 最新，平手保快照序首行
    if (at > masterTime) {
      master = item
      masterTime = at
    }
  }
  return master
}

/** 官方锚点复刻：currentWorkspaceId ?? recent（官方 startSession 同判的快照窄镜像）。
 *  bug 8c7e847f 三件套：INV-B cwd 绑定——mainView 会话归属 = normalizeFsPath(cwd) 同锚行，
 *  成员位 sessionIds 只作 cwd 缺席时的投影缓存退路；INV-U——命中处一律 selectMasterRow，
 *  禁裸 find 首命中（残留行/归档行前置清单劫持面）。 */
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
    // INV-B cwd 绑定：会话行 cwd 在场（官方 byId 行字段——E3 实证）= 归属判据；
    // cwd 缺席（旧面形状漂移）退成员位投影缓存（INV-U 选主谓词替代裸 find）
    const currentRow = byId[current]
    const cwd =
      typeof currentRow === 'object' && currentRow !== null
        ? (currentRow as { cwd?: unknown }).cwd
        : undefined
    if (typeof cwd !== 'string' || cwd === '') {
      // INV-B 退化径诊断留痕（bug bae86480——AGENTS §7 零静默）：cwd 是登记在案的契约锚
      // 判据源（docs/conventions/official-face-contract-anchors.md），官方包升级漂移致
      // 缺席时退成员位投影缓存径必须留痕一行。client 束 = diagnostic-emit-discipline
      // 豁免面，deps.warn（生产 console.warn）即合规诊断通道。
      deps.warn?.(
        '[dsh-forge web-client] INV-B 契约锚退化：主视图会话行 cwd 缺席（官方 sessions.list 形状漂移？）——退成员位投影缓存径（INV-U 选主仲裁）',
      )
    }
    if (typeof cwd === 'string' && cwd !== '') {
      const cwdKey = normPath(cwd)
      targetId = selectMasterRow(
        items,
        (item) =>
          typeof item.path === 'string' &&
          item.path !== '' &&
          normPath(item.path) === cwdKey,
      )?.workspaceId as string | undefined
    }
    if (targetId === undefined || targetId === '') {
      targetId = selectMasterRow(
        items,
        (item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(current),
      )?.workspaceId as string | undefined
    }
  }
  if (targetId === undefined || targetId === '') targetId = recentWorkspaceId(items, byId)
  if (targetId === undefined || targetId === '') return { targetPath: undefined }
  const targetPath = selectMasterRow(items, (item) => item.workspaceId === targetId)?.path
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
      //    竞态）；缺席回落项目根（chip 缺省显示主行同判）。
      //    归属门（bug 38d80c5b）：全局锚跨项目残留时，外来路径会经下方官方全局
      //    workspaces.list 回退径确定性命中他项目 workspace（fail-open 放大为跨项目错绑
      //    路由）——不归属当前 projectRoot = 视同未选中，回落主行语义（与 chip 缺省主行
      //    同判，同 hero-picker-model 归属判式）。
      const rawDisplayed = deps.displayedTree() ?? projectRoot
      const rootNorm = normPath(projectRoot)
      const displayedNorm = normPath(rawDisplayed)
      const displayed = displayedNorm === rootNorm || displayedNorm.startsWith(`${rootNorm}/`) ? rawDisplayed : projectRoot
      // ① workspaceId 直通：chip 双发数据源（WorktreeEntryDto.workspaceId）优先，
      //    官方 workspaces.list path 匹配回退——解析即直通官方 startSession(workspaceId)，
      //    官方 session.create({workspaceId}) 原生 blank 复用，零 forge 改道
      const fromDto = await deps.worktreeWorkspaceId(displayed, projectRoot).catch(() => undefined)
      if (typeof fromDto === 'string' && fromDto !== '') return { workspaceId: fromDto }
      // INV-U 选主：同锚多行（残留行前置）禁裸 find 首命中——createdAt 最新主行胜
      const row = selectMasterRow(
        items,
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
