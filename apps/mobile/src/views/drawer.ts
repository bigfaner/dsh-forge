/**
 * drawer 抽屉会话列表（mockup 屏④，浮层 `#/drawer`）——
 * 数据源 = `__rpc` `forge:proxy/projects-grouped` 单次调用（host 分组薄方法：
 * 项目 → worktree → sessions（SessionSummary 官方原样）+ unassigned 桶）；
 * 未读游标 = 手机页 localStorage（core/read-cursor，host read-state 面不建）。
 *
 * 展示口径：项目分组折叠（同桌面规则；不展示会话数量与归档）+ 会话行
 * （updatedAt 降序、running 排前、24h top10 可配）+ `origin:'subagent'` worker
 * 会话折叠子组 + 双级未读徽标（会话级 = 会话 chip；项目级 = 成员未读求和）+
 * 未归属桶 + 置顶（localStorage 视图偏好）+ 底部连接状态弹层（断开 =
 * forge:remote/disconnect 通道）。worktree 徽标暂不渲染（响应仍携 worktrees[]）。
 * 会话变更推送 = forge-stream `api-session/*` 镜像帧（subscribeStream 注入）→
 * 防抖刷新；15s 轮询仅降级兜底。
 *
 * 纯逻辑面（单测主战场）：grouped 收敛 / 未读游标合并 / 排序与窗口截断 /
 * worker 筛选 / 检索过滤 / 徽标聚合。
 */
import type { KeyValueStore } from '../core/read-cursor.ts'
import { loadReadCursors, readCursorKey, writeReadCursor } from '../core/read-cursor.ts'
import type { RemoteRpc } from '../core/rpc.ts'
import type { DebounceTimers } from './models.ts'
import { createDebounce, defaultStore } from './models.ts'
import { el, ensureIconSprite } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 常量（可配口径）
// ---------------------------------------------------------------------------

/** 抽屉数据源通道（host 分组薄方法——1.11 交付面正名 projects-grouped）。 */
export const DRAWER_GROUPED_CHANNEL = 'forge:proxy/projects-grouped'
/** 断开连接通道（pair-disconnected 对偶缝）。 */
export const DRAWER_DISCONNECT_CHANNEL = 'forge:remote/disconnect'
/** 轮询兜底间隔（ forge-stream 帧为主路径）。 */
export const DRAWER_POLL_MS = 15_000
/** 会话可见时间窗（24h 可配）。 */
export const DRAWER_WINDOW_MS = 24 * 60 * 60 * 1000
/** 每组会话行上限（top10 可配）。 */
export const DRAWER_TOP_N = 10
/** 徽标显示上限（超出 99+）。 */
export const DRAWER_BADGE_CAP = 99
/** forge-stream 帧触发刷新的防抖。 */
export const DRAWER_STREAM_DEBOUNCE_MS = 300

// ---------------------------------------------------------------------------
// 纯函数：grouped 响应收敛（缺字段 fail-soft）
// ---------------------------------------------------------------------------

export interface DrawerSession {
  readonly sessionId: string
  readonly title: string
  readonly updatedAt: number
  readonly running: boolean
  /** 会话事件游标上界（projections.asOfSeq——未读计算基线；缺席 = 未读不可知记 0）。 */
  readonly asOfSeq: number | null
  /** `origin:'subagent'` / 带 parentSessionId 的 worker 会话（主列表筛选、折叠子组）。 */
  readonly worker: boolean
}

export interface DrawerProject {
  readonly id: string
  readonly name: string
  readonly sessions: readonly DrawerSession[]
}

export interface GroupedModel {
  readonly generatedAt: number | null
  readonly projects: readonly DrawerProject[]
  readonly unassigned: readonly DrawerSession[]
}

function coerceSessionRow(row: unknown): DrawerSession | null {
  if (typeof row !== 'object' || row === null) return null
  const record = row as {
    sessionId?: unknown
    updatedAt?: unknown
    running?: unknown
    origin?: unknown
    parentSessionId?: unknown
    projections?: unknown
  }
  const sessionId = typeof record.sessionId === 'string' && record.sessionId !== '' ? record.sessionId : ''
  if (sessionId === '') return null
  const projections =
    typeof record.projections === 'object' && record.projections !== null
      ? (record.projections as { asOfSeq?: unknown; values?: { title?: unknown } })
      : {}
  const title = typeof projections.values?.title === 'string' ? projections.values.title : ''
  return {
    sessionId,
    title,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
    running: record.running === true,
    asOfSeq: typeof projections.asOfSeq === 'number' && Number.isFinite(projections.asOfSeq) ? projections.asOfSeq : null,
    worker: record.origin === 'subagent' || typeof record.parentSessionId === 'string',
  }
}

function coerceSessionRows(raw: unknown): readonly DrawerSession[] {
  return (Array.isArray(raw) ? raw : []).map(coerceSessionRow).filter((s): s is DrawerSession => s !== null)
}

/** grouped 响应收敛：归档项目不展示（手机端不展示归档）；worktrees[] 原样忽略。 */
export function coerceGrouped(raw: unknown): GroupedModel {
  if (typeof raw !== 'object' || raw === null) return { generatedAt: null, projects: [], unassigned: [] }
  const frame = raw as { generatedAt?: unknown; projects?: unknown; unassigned?: unknown }
  const projects = (Array.isArray(frame.projects) ? frame.projects : [])
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null
      const record = entry as { id?: unknown; name?: unknown; archived?: unknown; sessions?: unknown }
      const id = typeof record.id === 'string' && record.id !== '' ? record.id : ''
      if (id === '' || record.archived === true) return null
      const project: DrawerProject = {
        id,
        name: typeof record.name === 'string' && record.name !== '' ? record.name : id,
        sessions: coerceSessionRows(record.sessions),
      }
      return project
    })
    .filter((p): p is DrawerProject => p !== null)
  return {
    generatedAt: typeof frame.generatedAt === 'number' ? frame.generatedAt : null,
    projects,
    unassigned: coerceSessionRows(frame.unassigned),
  }
}

// ---------------------------------------------------------------------------
// 纯函数：未读 + 排序 + 过滤
// ---------------------------------------------------------------------------

/** 会话未读 = asOfSeq − lastReadSeq（localStorage 游标；游标缺席 = 全量未读）。 */
export function unreadOf(session: DrawerSession, lastReadSeq: number | undefined): number {
  if (session.asOfSeq === null) return 0
  return Math.max(0, session.asOfSeq - (lastReadSeq ?? 0))
}

/** 徽标文案：0 = 空；≤99 = 数字；超出 99+。 */
export function badgeText(unread: number): string {
  if (unread <= 0) return ''
  return unread > DRAWER_BADGE_CAP ? `${DRAWER_BADGE_CAP}+` : String(unread)
}

/**
 * 可见会话序：置顶（pin 序）→ running → updatedAt 降序；
 * 非置顶成员限 24h 窗（DRAWER_WINDOW_MS）+ top N（DRAWER_TOP_N）；置顶/running 豁免。
 */
export function orderVisible(
  rows: readonly DrawerSession[],
  pinned: readonly string[],
  now: number,
  windowMs = DRAWER_WINDOW_MS,
  topN = DRAWER_TOP_N,
): readonly DrawerSession[] {
  const byRecency = (a: DrawerSession, b: DrawerSession): number => b.updatedAt - a.updatedAt
  const pinnedRows = pinned
    .map((id) => rows.find((row) => row.sessionId === id))
    .filter((row): row is DrawerSession => row !== undefined)
  const rest = rows
    .filter((row) => !pinned.includes(row.sessionId))
    .sort((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1
      return byRecency(a, b)
    })
  const fresh = rest.filter(
    (row) => row.running || now - row.updatedAt <= windowMs,
  )
  return [...pinnedRows, ...fresh.slice(0, topN)]
}

/** 主列表 / worker 子组拆分。 */
export function splitWorkers(rows: readonly DrawerSession[]): { main: readonly DrawerSession[]; workers: readonly DrawerSession[] } {
  return {
    main: rows.filter((row) => !row.worker),
    workers: rows.filter((row) => row.worker),
  }
}

/** 检索过滤：title/sessionId 大小写不敏感子串；空白 = 全量。 */
export function filterSessions(rows: readonly DrawerSession[], query: string): readonly DrawerSession[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows
  return rows.filter(
    (row) => row.title.toLowerCase().includes(needle) || row.sessionId.toLowerCase().includes(needle),
  )
}

// ---------------------------------------------------------------------------
// 纯函数：视图偏好（置顶 / 折叠，localStorage 按配对域隔离）
// ---------------------------------------------------------------------------

export function pinnedKey(pairDomain: string): string {
  return `dshf.mobile.drawer.pins.${pairDomain}`
}

export function collapsedKey(pairDomain: string): string {
  return `dshf.mobile.drawer.collapsed.${pairDomain}`
}

function loadStringList(storage: KeyValueStore | null, key: string): readonly string[] {
  if (storage === null) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function saveStringList(storage: KeyValueStore | null, key: string, ids: readonly string[]): void {
  if (storage === null) return
  try {
    storage.setItem(key, JSON.stringify([...ids]))
  } catch {
    /* 静默降级 */
  }
}

/** toggle 成员（折叠/置顶共用）。 */
export function toggleString(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface DrawerStatus {
  readonly ok: boolean
  /** 隧道有效期（在场 = PSK 隧道域；缺席 = LAN 直连）。 */
  readonly tunnelExpiresAt: number | null
}

export interface DrawerDeps {
  readonly rpc: RemoteRpc
  /** 心跳/状态读法（连接弹层 + foot 状态点）。 */
  readonly fetchStatus: () => Promise<DrawerStatus>
  readonly onOpenSession: (sessionId: string) => void
  /** 断开成功后的上层处置（粘性位收回 → 回等待配对覆盖层）。 */
  readonly onDisconnected?: () => void
  readonly currentSessionId?: string
  readonly pairDomain: string
  readonly store?: KeyValueStore | null
  readonly timers?: DebounceTimers
  readonly now?: () => number
  readonly pollMs?: number
  /** forge-stream `api-session/*` 镜像帧订阅（帧到达 → 防抖刷新；缺席 = 纯轮询兜底）。 */
  readonly subscribeStream?: (onFrame: () => void) => () => void
}

/** 默认状态读法：GET /api/status（401/异常 = 断开）。 */
export function defaultFetchStatus(): Promise<DrawerStatus> {
  return fetch('/api/status', { cache: 'no-store' }).then((response) => {
    if (response.status === 401) return { ok: false, tunnelExpiresAt: null }
    return response
      .json()
      .catch(() => ({}))
      .then((json: unknown) => {
        const frame = (json ?? {}) as { tunnelExpiresAt?: unknown }
        return {
          ok: response.status >= 200 && response.status < 300,
          tunnelExpiresAt: typeof frame.tunnelExpiresAt === 'number' ? frame.tunnelExpiresAt : null,
        }
      })
  })
}

export function createDrawerView(deps: DrawerDeps): HTMLElement {
  const root = el('div', 'drawer-mask')
  ensureIconSprite(root)
  const drawer = el('div', 'drawer')
  root.appendChild(drawer)
  root.appendChild(el('div', 'drawer-spacer'))

  const storage = deps.store === undefined ? defaultStore() : deps.store
  const timers: DebounceTimers =
    deps.timers ??
    {
      setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    }
  const now = deps.now ?? (() => Date.now())
  const cursorKey = readCursorKey(deps.pairDomain)
  const pinsStorageKey = pinnedKey(deps.pairDomain)
  const collapsedStorageKey = collapsedKey(deps.pairDomain)

  // ---- 状态 ----
  let grouped: GroupedModel = { generatedAt: null, projects: [], unassigned: [] }
  let cursors: Record<string, number> = loadReadCursors(storage, cursorKey)
  let pinned = loadStringList(storage, pinsStorageKey)
  let collapsed = loadStringList(storage, collapsedStorageKey)
  const workerExpanded = new Set<string>()
  let query = ''
  let status: DrawerStatus = { ok: true, tunnelExpiresAt: null }
  let showConnPop = false
  let disconnected = false

  // ---- 头部：搜索框 ----
  const search = el('div', 'search')
  search.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>'
  const input = document.createElement('input')
  input.placeholder = '搜索对话内容…'
  input.className = 'drawer-search-input'
  search.appendChild(input)
  const applyQuery = createDebounce(() => {
    query = input.value
    render()
  }, DRAWER_STREAM_DEBOUNCE_MS, timers)
  input.addEventListener('input', () => applyQuery.push())

  // ---- 列表 ----
  const list = el('div', 'list')

  // ---- 连接弹层 + foot ----
  const connPop = el('div', 'conn-pop')
  connPop.hidden = true
  const foot = el('div', 'foot')
  foot.appendChild(el('span', 'conn-dot'))
  const footText = el('span', undefined, '已连接 · 点按查看连接详情')
  foot.appendChild(footText)
  foot.addEventListener('click', () => {
    showConnPop = !showConnPop
    renderConn()
  })

  drawer.append(search, list, connPop, foot)

  // ---- 渲染 ----
  function sessionUnread(session: DrawerSession): number {
    return unreadOf(session, cursors[session.sessionId])
  }

  function unreadChip(unread: number): HTMLElement | null {
    const text = badgeText(unread)
    if (text === '') return null
    return el('span', 'unread-chip', text)
  }

  function groupUnread(sessions: readonly DrawerSession[]): number {
    return sessions.reduce((sum, session) => sum + sessionUnread(session), 0)
  }

  function renderSessionRow(session: DrawerSession): HTMLElement {
    const row = el('button', `sess${session.sessionId === deps.currentSessionId ? ' cur' : ''}`)
    if (pinned.includes(session.sessionId)) {
      const pin = el('span', 'pin')
      pin.innerHTML = '<svg class="ic"><use href="#i-pin"/></svg>'
      row.appendChild(pin)
    }
    row.appendChild(document.createTextNode(session.title === '' ? '未命名会话' : session.title))
    if (session.running) row.appendChild(el('span', 'running-dot'))
    const ops = el('span', 'ops')
    const chip = unreadChip(sessionUnread(session))
    if (chip !== null) ops.appendChild(chip)
    const pinToggle = el('button', 'pin-toggle')
    pinToggle.title = pinned.includes(session.sessionId) ? '取消置顶' : '置顶'
    pinToggle.innerHTML = '<svg class="ic"><use href="#i-pin"/></svg>'
    pinToggle.addEventListener('click', (event) => {
      event.stopPropagation()
      pinned = toggleString(pinned, session.sessionId)
      saveStringList(storage, pinsStorageKey, pinned)
      render()
    })
    ops.appendChild(pinToggle)
    row.appendChild(ops)
    row.addEventListener('click', () => {
      // 打开即视为已读：写本地游标（触底归零同游标源——下次拉取对账）
      if (session.asOfSeq !== null) {
        writeReadCursor(storage, cursorKey, session.sessionId, session.asOfSeq)
        cursors = loadReadCursors(storage, cursorKey)
      }
      deps.onOpenSession(session.sessionId)
    })
    return row
  }

  function renderGroupHeader(groupKey: string, label: string, sessions: readonly DrawerSession[]): HTMLElement {
    const header = el('div', `grp${collapsed.includes(groupKey) ? ' closed' : ''}`)
    const caret = el('span', 'caret')
    caret.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
    header.appendChild(caret)
    const folder = el('span', 'folder')
    folder.innerHTML = '<svg class="ic"><use href="#i-folder"/></svg>'
    header.appendChild(folder)
    header.appendChild(document.createTextNode(label))
    const cnt = el('span', 'cnt')
    const chip = unreadChip(groupUnread(sessions))
    if (chip !== null) cnt.appendChild(chip)
    header.appendChild(cnt)
    header.addEventListener('click', () => {
      collapsed = toggleString(collapsed, groupKey)
      saveStringList(storage, collapsedStorageKey, collapsed)
      render()
    })
    return header
  }

  function renderSessionGroup(
    wrap: HTMLElement,
    groupKey: string,
    label: string,
    sessions: readonly DrawerSession[],
  ): void {
    const pinnedIds = pinned.filter((id) => sessions.some((session) => session.sessionId === id))
    const visible = orderVisible(sessions, pinnedIds, now())
    const { main, workers } = splitWorkers(visible)
    wrap.appendChild(renderGroupHeader(groupKey, label, sessions))
    if (!collapsed.includes(groupKey)) {
      for (const session of main) wrap.appendChild(renderSessionRow(session))
      if (workers.length > 0) {
        // worker 子组默认折叠（内存态——主列表 worker 筛选口径，不持久化）
        const workerKey = `worker:${groupKey}`
        const workerHeader = el('div', `grp sub${workerExpanded.has(workerKey) ? '' : ' closed'}`)
        workerHeader.appendChild(document.createTextNode(`Worker 会话`))
        workerHeader.appendChild(el('span', 'cnt', String(workers.length)))
        workerHeader.addEventListener('click', () => {
          if (workerExpanded.has(workerKey)) workerExpanded.delete(workerKey)
          else workerExpanded.add(workerKey)
          render()
        })
        wrap.appendChild(workerHeader)
        if (workerExpanded.has(workerKey)) {
          for (const session of workers) wrap.appendChild(renderSessionRow(session))
        }
      }
    }
  }

  function renderConn(): void {
    footText.textContent = disconnected
      ? '已断开 · 请重新配对'
      : `${status.ok ? '已连接' : '连接中断'} · 点按查看连接详情`
    foot.className = `foot${status.ok && !disconnected ? '' : ' down'}`
    connPop.hidden = !showConnPop
    if (!showConnPop) return
    connPop.textContent = ''
    const stateRow = el('div', 'row')
    stateRow.innerHTML = `<span class="k">状态</span>`
    stateRow.appendChild(el('b', undefined, disconnected ? '已断开' : status.ok ? '已连接' : '连接中断'))
    const tunnel = status.tunnelExpiresAt !== null
    const channelRow = el('div', 'row')
    channelRow.innerHTML = '<span class="k">通道</span>'
    channelRow.appendChild(
      el('b', undefined, tunnel ? `PSK 隧道 · 有效期至 ${new Date(status.tunnelExpiresAt!).toLocaleTimeString()}` : `LAN 直连 · ${location.host}`),
    )
    connPop.append(stateRow, channelRow)
    if (!disconnected) {
      const button = el('button', 'disconnect', '断开连接')
      button.addEventListener('click', () => void doDisconnect())
      connPop.appendChild(button)
    }
  }

  function render(): void {
    list.textContent = ''
    if (query.trim() === '') {
      for (const project of grouped.projects) {
        renderSessionGroup(list, project.id, project.name, project.sessions)
      }
      if (grouped.unassigned.length > 0) {
        renderSessionGroup(list, 'unassigned', '未归属', grouped.unassigned)
      }
    } else {
      const all = [...grouped.projects.flatMap((p) => p.sessions), ...grouped.unassigned]
      const hits = filterSessions(all, query)
      if (hits.length === 0) list.appendChild(el('div', 'drawer-hint', '无匹配会话'))
      for (const session of hits) list.appendChild(renderSessionRow(session))
    }
    renderConn()
  }

  // ---- 数据 ----
  async function refresh(): Promise<void> {
    const result = await deps.rpc.call<unknown>(DRAWER_GROUPED_CHANNEL, {})
    if (result.ok) grouped = coerceGrouped(result.data)
    cursors = loadReadCursors(storage, cursorKey)
    render()
  }

  async function refreshStatus(): Promise<void> {
    try {
      status = await deps.fetchStatus()
    } catch {
      status = { ok: false, tunnelExpiresAt: null }
    }
    renderConn()
  }

  async function doDisconnect(): Promise<void> {
    const result = await deps.rpc.call<{ revoked?: boolean }>(DRAWER_DISCONNECT_CHANNEL, {})
    disconnected = result.ok && result.data.revoked === true
    showConnPop = true
    renderConn()
    if (disconnected) deps.onDisconnected?.()
  }

  // ---- forge-stream 帧驱动刷新（主路径）+ 15s 轮询兜底（周期续排）----
  const debouncedRefresh = createDebounce(() => void refresh(), DRAWER_STREAM_DEBOUNCE_MS, timers)
  const unsubscribeStream = deps.subscribeStream?.(() => debouncedRefresh.push())
  let pollHandle: unknown = null
  const schedulePoll = (): void => {
    pollHandle = timers.setTimeout(() => {
      void refresh().finally(schedulePoll)
    }, deps.pollMs ?? DRAWER_POLL_MS)
  }
  schedulePoll()

  void refresh()
  void refreshStatus()

  // teardown 挂点（浮层关闭/路由切换由装配方调用）
  ;(root as HTMLElement & { dispose?: () => void }).dispose = (): void => {
    timers.clearTimeout(pollHandle)
    unsubscribeStream?.()
    applyQuery.cancel()
    debouncedRefresh.cancel()
  }

  return root
}
