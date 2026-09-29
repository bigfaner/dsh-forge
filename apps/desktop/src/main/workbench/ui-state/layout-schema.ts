// workbench/ui-state/layout-schema — ProjectLayout v1 blob 的 schema 白名单
// 校验(任务 4.1;tech-design §Interfaces·Interface 4 + §Security
// Considerations·T5)。布局记忆载体 = project_ui_state.layout_json(项目域,
// T4 裁决);本模块是 blob 形态的唯一内核权威 —— TabKind 枚举的 canonical
// 声明在此,client 半身 2.2 的 views/rightbar/tab-kinds.ts 为结构孪生
// (插件不可依赖 app,M2 4.1 先例),lockstep 由 apps/desktop/tests/
// workbench-ui-state.spec.ts 的 drift 断言锁定。
//
// 校验口径(白名单 = 属性集 + 词表 + 值域,Interface 4 注记逐条):
//   - version 必须为字面量 1(前向版本 = 违规,不猜迁移);
//   - sidebar.width 值域 [264, 420](Interface 4「264–420」:越界 = 违规);
//   - rightbar.widthPct 钳制(clamp)进 [30, 70](Interface 4 注记「钳制」:
//     修复型而非违规 —— 百分比语义天然可夹紧,layout 仍合法);
//   - panes[].tabs[].kind ∈ TabKind 枚举(guide/overview/board/doc/depgraph);
//   - tabs[].topic 界长(在场的非空串,≤ TOPIC_MAX_LENGTH);
//   - 任意层级未知属性 = 违规(白名单语义;含 Hard Rule 边界 —— 分组×排序
//     视图选项属 localStorage 用户级(C3 口径),永不入项目域 blob);
//   - detached[].view ∈ board|conversation;target = SessionId |
//     SubagentAddress(§Data Models;恰一形态);rect 四元有限数。
//
// 失败语义(ERR_LAYOUT_INVALID):sanitizeProjectLayout 永不抛错 —— 违规 →
// 重置默认布局 + reason;log 由动词装配层落地(ipc/services.ts),不弹错、
// 不拒写面(tech-design §Error Types & Codes 该行口径)。

/** Interface 4 TabKind(canonical;client 孪生 = 2.2 tab-kinds.ts,drift 锁定)。 */
export type TabKind = 'guide' | 'overview' | 'board' | 'doc' | 'depgraph'

/** TabKind 白名单(runtime;与 client RIGHTBAR_TAB_KINDS 同序 lockstep)。 */
export const TAB_KINDS: readonly TabKind[] = ['guide', 'overview', 'board', 'doc', 'depgraph']

/** detached 窗口视图词表(Interface 4 detached[].view;4.2 windowOpenDetached 同源)。 */
export type DetachedView = 'board' | 'conversation'

/** topic 界长(tech-design「topic 界长」;内核择值 —— 2.4 文档标识形态充分覆盖)。 */
export const TOPIC_MAX_LENGTH = 512

/** sidebar.width 值域(Interface 4「264–420」;越界 = 违规)。 */
export const SIDEBAR_WIDTH_MIN = 264
export const SIDEBAR_WIDTH_MAX = 420

/** rightbar.widthPct 钳制域(Interface 4「钳制 30–70」;越界 = 夹紧,非违规)。 */
export const RIGHTBAR_WIDTH_PCT_MIN = 30
export const RIGHTBAR_WIDTH_PCT_MAX = 70

/**
 * detached 窗口的会话定位(§Data Models:SessionId | SubagentAddress)。
 * 顶层会话 = sessionId;subagent 会话 = (parent, child, mode) 三元组
 * (Interface 3 SubagentAddress 同构)—— 恰一形态。
 */
export type SessionTarget =
  | { readonly sessionId: string }
  | { readonly parentSessionId: string; readonly childSessionId: string; readonly mode: 'one-shot' | 'continuable' }

/** detached 窗口矩形(Interface 4 detached[].rect;四元有限数)。 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Interface 4 ProjectLayout v1(布局记忆 blob;sidebar 宽/收起、tree 三集、
 * rightbar 比例/panes·tabs、detached 窗口集)。恢复 = 4.5 重放 open 操作
 * 序列;分组×排序视图选项 = localStorage 用户级,不入本形态。
 */
export interface ProjectLayout {
  readonly version: 1
  readonly sidebar: { readonly collapsed: boolean; readonly width?: number }
  readonly tree: {
    readonly expandedProjects: readonly string[]
    readonly expandedSessions: readonly string[]
    readonly overflowOpen: readonly string[]
  }
  readonly rightbar: {
    readonly widthPct?: number
    readonly panes: ReadonlyArray<{ readonly tabs: ReadonlyArray<{ readonly kind: TabKind; readonly topic?: string }> }>
  }
  readonly detached: ReadonlyArray<{
    readonly view: DetachedView
    readonly target?: SessionTarget
    readonly rect?: Rect
  }>
}

/** 默认布局(无行 / 违规 blob 的回落值:零记忆 = 原生缺省姿态)。 */
export const DEFAULT_PROJECT_LAYOUT: ProjectLayout = {
  version: 1,
  sidebar: { collapsed: false },
  tree: { expandedProjects: [], expandedSessions: [], overflowOpen: [] },
  rightbar: { panes: [] },
  detached: [],
}

/** sanitize 产物:layout 恒为可直接落库/回传的合法形态;reset = 违规已重置。 */
export interface SanitizedLayout {
  readonly layout: ProjectLayout
  readonly reset: boolean
  readonly reason: string | null
}

// ---------------------------------------------------------------------------
// 校验内核(纯函数,零依赖;违规短路 → 默认布局 + reason)
// ---------------------------------------------------------------------------

function reject(reason: string): SanitizedLayout {
  return { layout: DEFAULT_PROJECT_LAYOUT, reset: true, reason }
}

/** plain object 判定(JSON 往返产物;数组/null 非对象)。 */
function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 白名单键判定:own keys ⊆ allowed 且 required 全在场。 */
function keysWithin(source: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): string | null {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) return `unexpected key "${key}"`
  }
  for (const key of required) {
    if (!(key in source)) return `missing key "${key}"`
  }
  return null
}

/** 有限数判定(NaN/Infinity = 违规)。 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 非空字符串成员数组判定(tree 三集共用)。 */
function stringArray(value: unknown, field: string): string | null {
  if (!Array.isArray(value)) return `${field} must be an array of non-empty strings`
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') return `${field} must be an array of non-empty strings`
  }
  return null
}

/** SessionTarget 校验:恰一形态(sessionId | (parent,child,mode) 三元组)。 */
function parseSessionTarget(value: unknown): { target: SessionTarget } | { error: string } {
  const record = asPlainObject(value)
  if (record === null) return { error: 'target must be an object (SessionId | SubagentAddress)' }
  const keys = Object.keys(record)
  if (keys.length === 1 && keys[0] === 'sessionId') {
    return typeof record.sessionId === 'string' && record.sessionId !== ''
      ? { target: { sessionId: record.sessionId } }
      : { error: 'target.sessionId must be a non-empty string' }
  }
  const subagentError = keysWithin(record, ['parentSessionId', 'childSessionId', 'mode'], ['parentSessionId', 'childSessionId', 'mode'])
  if (subagentError !== null) return { error: 'target must carry exactly one form (sessionId | parent/child/mode)' }
  const { parentSessionId, childSessionId, mode } = record
  if (typeof parentSessionId !== 'string' || parentSessionId === ''
    || typeof childSessionId !== 'string' || childSessionId === '') {
    return { error: 'target.parentSessionId/childSessionId must be non-empty strings' }
  }
  if (mode !== 'one-shot' && mode !== 'continuable') return { error: 'target.mode must be one-shot | continuable' }
  return { target: { parentSessionId, childSessionId, mode } }
}

/** Rect 校验:恰 {x,y,width,height} 四元有限数。 */
function parseRect(value: unknown): { rect: Rect } | { error: string } {
  const record = asPlainObject(value)
  if (record === null) return { error: 'rect must be an object' }
  const error = keysWithin(record, ['x', 'y', 'width', 'height'], ['x', 'y', 'width', 'height'])
  if (error !== null) return { error: `rect ${error}` }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!isFiniteNumber(record[key])) return { error: `rect.${key} must be a finite number` }
  }
  return { rect: { x: record.x as number, y: record.y as number, width: record.width as number, height: record.height as number } }
}

/**
 * ProjectLayout v1 白名单校验(永不抛错):合法 → 规范化产物(钳制
 * widthPct / 剥离 nothing —— 未知键即违规,不存在透传字段);违规 →
 * 默认布局 + reason(ERR_LAYOUT_INVALID 的 log 面)。version 前向不兼容:
 * 2+ = 违规重置,不做猜测迁移(前向版本落地时再扩 version 分支)。
 */
export function sanitizeProjectLayout(value: unknown): SanitizedLayout {
  const layout = asPlainObject(value)
  if (layout === null) return reject('layout blob is not an object')
  let error = keysWithin(layout, ['version', 'sidebar', 'tree', 'rightbar', 'detached'], ['version', 'sidebar', 'tree', 'rightbar', 'detached'])
  if (error !== null) return reject(error)
  if (layout.version !== 1) return reject(`version must be 1 (got ${JSON.stringify(layout.version) ?? String(layout.version)})`)

  // sidebar:collapsed 必填布尔;width 可选,值域 [264, 420](越界 = 违规)。
  const sidebar = asPlainObject(layout.sidebar)
  if (sidebar === null) return reject('sidebar must be an object')
  error = keysWithin(sidebar, ['collapsed', 'width'], ['collapsed'])
  if (error !== null) return reject(`sidebar ${error}`)
  if (typeof sidebar.collapsed !== 'boolean') return reject('sidebar.collapsed must be a boolean')
  let sidebarWidth: number | undefined
  if (sidebar.width !== undefined) {
    if (!isFiniteNumber(sidebar.width)) return reject('sidebar.width must be a finite number')
    if (sidebar.width < SIDEBAR_WIDTH_MIN || sidebar.width > SIDEBAR_WIDTH_MAX) {
      return reject(`sidebar.width must be within [${String(SIDEBAR_WIDTH_MIN)}, ${String(SIDEBAR_WIDTH_MAX)}] (got ${String(sidebar.width)})`)
    }
    sidebarWidth = sidebar.width
  }

  // tree:三集必填,成员 = 非空字符串。
  const tree = asPlainObject(layout.tree)
  if (tree === null) return reject('tree must be an object')
  error = keysWithin(tree, ['expandedProjects', 'expandedSessions', 'overflowOpen'], ['expandedProjects', 'expandedSessions', 'overflowOpen'])
  if (error !== null) return reject(`tree ${error}`)
  for (const field of ['expandedProjects', 'expandedSessions', 'overflowOpen'] as const) {
    const fieldError = stringArray(tree[field], `tree.${field}`)
    if (fieldError !== null) return reject(fieldError)
  }

  // rightbar:widthPct 可选有限数(越界钳制进 [30, 70],非违规);panes
  // 必填数组;tab.kind ∈ TabKind 枚举;tab.topic 可选非空串且界长。
  const rightbar = asPlainObject(layout.rightbar)
  if (rightbar === null) return reject('rightbar must be an object')
  error = keysWithin(rightbar, ['widthPct', 'panes'], ['panes'])
  if (error !== null) return reject(`rightbar ${error}`)
  let widthPct: number | undefined
  if (rightbar.widthPct !== undefined) {
    if (!isFiniteNumber(rightbar.widthPct)) return reject('rightbar.widthPct must be a finite number')
    widthPct = Math.min(RIGHTBAR_WIDTH_PCT_MAX, Math.max(RIGHTBAR_WIDTH_PCT_MIN, rightbar.widthPct))
  }
  if (!Array.isArray(rightbar.panes)) return reject('rightbar.panes must be an array')
  const panes: Array<{ tabs: Array<{ kind: TabKind; topic?: string }> }> = []
  for (const [paneIndex, paneValue] of rightbar.panes.entries()) {
    const pane = asPlainObject(paneValue)
    if (pane === null) return reject(`rightbar.panes[${String(paneIndex)}] must be an object`)
    error = keysWithin(pane, ['tabs'], ['tabs'])
    if (error !== null) return reject(`rightbar.panes[${String(paneIndex)}] ${error}`)
    if (!Array.isArray(pane.tabs)) return reject(`rightbar.panes[${String(paneIndex)}].tabs must be an array`)
    const tabs: Array<{ kind: TabKind; topic?: string }> = []
    for (const [tabIndex, tabValue] of pane.tabs.entries()) {
      const tab = asPlainObject(tabValue)
      if (tab === null) return reject(`rightbar.panes[${String(paneIndex)}].tabs[${String(tabIndex)}] must be an object`)
      error = keysWithin(tab, ['kind', 'topic'], ['kind'])
      if (error !== null) return reject(`rightbar.panes[${String(paneIndex)}].tabs[${String(tabIndex)}] ${error}`)
      if (typeof tab.kind !== 'string' || !(TAB_KINDS as readonly string[]).includes(tab.kind)) {
        return reject(`tabs[${String(tabIndex)}].kind must be one of guide/overview/board/doc/depgraph (got ${String(tab.kind)})`)
      }
      if (tab.topic !== undefined) {
        if (typeof tab.topic !== 'string' || tab.topic === '') {
          return reject(`tabs[${String(tabIndex)}].topic must be a non-empty string when present`)
        }
        if (tab.topic.length > TOPIC_MAX_LENGTH) {
          return reject(`tabs[${String(tabIndex)}].topic exceeds the ${String(TOPIC_MAX_LENGTH)}-char bound`)
        }
      }
      tabs.push(tab.topic === undefined ? { kind: tab.kind as TabKind } : { kind: tab.kind as TabKind, topic: tab.topic })
    }
    panes.push({ tabs })
  }

  // detached:窗口集;view 词表 + target 恰一形态 + rect 四元有限数。
  if (!Array.isArray(layout.detached)) return reject('detached must be an array')
  const detached: Array<{ view: DetachedView; target?: SessionTarget; rect?: Rect }> = []
  for (const [index, entryValue] of layout.detached.entries()) {
    const entry = asPlainObject(entryValue)
    if (entry === null) return reject(`detached[${String(index)}] must be an object`)
    error = keysWithin(entry, ['view', 'target', 'rect'], ['view'])
    if (error !== null) return reject(`detached[${String(index)}] ${error}`)
    if (entry.view !== 'board' && entry.view !== 'conversation') {
      return reject(`detached[${String(index)}].view must be board | conversation (got ${String(entry.view)})`)
    }
    const item: { view: DetachedView; target?: SessionTarget; rect?: Rect } = { view: entry.view }
    if (entry.target !== undefined) {
      const parsed = parseSessionTarget(entry.target)
      if ('error' in parsed) return reject(`detached[${String(index)}].${parsed.error}`)
      item.target = parsed.target
    }
    if (entry.rect !== undefined) {
      const parsed = parseRect(entry.rect)
      if ('error' in parsed) return reject(`detached[${String(index)}].${parsed.error}`)
      item.rect = parsed.rect
    }
    detached.push(item)
  }

  return {
    layout: {
      version: 1,
      sidebar: { collapsed: sidebar.collapsed, ...(sidebarWidth === undefined ? {} : { width: sidebarWidth }) },
      tree: {
        expandedProjects: [...tree.expandedProjects as string[]],
        expandedSessions: [...tree.expandedSessions as string[]],
        overflowOpen: [...tree.overflowOpen as string[]],
      },
      rightbar: { ...(widthPct === undefined ? {} : { widthPct }), panes },
      detached,
    },
    reset: false,
    reason: null,
  }
}
