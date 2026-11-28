// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 概览过滤/折叠态模型（定位：业务——UF-1 概览 tab 框架的视图本地态单一来源）。
// 纯函数面（零 RPC / 零 effect）：三子 tab（spec | 任务 | Bug）+ 搜索 + 排序 +
// 七态 chips 过滤 + 父行/ov-head 展开态。Hard Rule「搜索过滤服务端承载」：本模型只持有
// 关键词原文与过滤集合，转查询参（searchQueryOf / statusFilterParam）交数据层透传——
// 前端禁全量拉取本地过滤。排序同为服务端参（sort: 'active'|'created'——活跃优先权重
// 归 core，见 small-domains list-utils sortByActiveThenCreated）。
// 切换语义（AC3）：子 tab 切换 = 清空搜索 + 清空 chips + 收起全部展开态
// （ov-head 展开态跨子 tab 保持——路径详情与内容区正交）。
import { BUG_STATUSES, TASK_STATUSES, type BugStatus, type TaskStatus } from '@dsh-forge/lib-api/labels'
import { type BugCard } from '@dsh-forge/lib-api/dto/bugs'
import { type FeatureCard } from '@dsh-forge/lib-api/dto/forge'

/** 三子 tab（对齐 apps/web：spec | 任务 | Bug 有序三枚；feature 子 tab 已退役，
 *  spec 子 tab 本体由 G3 任务交付） */
export const OVERVIEW_SUBTABS = [
  { value: 'spec', label: 'Spec' },
  { value: 'tasks', label: '任务' },
  { value: 'bugs', label: 'Bug' },
] as const

export type OverviewSubtab = (typeof OVERVIEW_SUBTABS)[number]['value']

/** 排序模式（contracts ListTasksQuery/ListBugsQuery 同构参） */
export type OverviewSort = 'active' | 'created'

/** 排序 pill 标签（ui-design §排序：⇅ 活跃优先 / ⇅ 最新创建） */
export const OVERVIEW_SORT_LABELS: Readonly<Record<OverviewSort, string>> = {
  active: '活跃优先',
  created: '最新创建',
}

/** 概览视图本地态（hook 单一来源——组件均为受控件） */
export interface OverviewFilterState {
  readonly subtab: OverviewSubtab
  /** 搜索关键词原文（受控输入值；服务端过滤参经 searchQueryOf 归一） */
  readonly search: string
  readonly sort: OverviewSort
  /** 七态 chips 激活集（空 = 全部；statusFilterParam 转白名单参——任务子 tab） */
  readonly activeStatuses: ReadonlySet<TaskStatus>
  /** Bug 三态 chips 激活集（空 = 全部；bugStatusFilterParam 转白名单参——Bug 子 tab，fix-bug） */
  readonly activeBugStatuses: ReadonlySet<BugStatus>
  /** 父行展开键集（prop:{id} / feat:{slug}——多开并存） */
  readonly openRows: ReadonlySet<string>
  /** ov-head 展开（默认 false——AC1 折叠） */
  readonly headOpen: boolean
}

/** 初始态（默认子 tab = 任务；排序默认活跃优先；ov-head 默认折叠） */
export function initialOverviewFilter(): OverviewFilterState {
  return {
    subtab: 'tasks',
    search: '',
    sort: 'active',
    activeStatuses: new Set<TaskStatus>(),
    activeBugStatuses: new Set<BugStatus>(),
    openRows: new Set<string>(),
    headOpen: false,
  }
}

/** 子 tab 切换（AC3）：清空搜索 + 清空 chips 三族 + 收起全部展开态；同值原样返回（零重渲） */
export function switchSubtab(state: OverviewFilterState, subtab: OverviewSubtab): OverviewFilterState {
  if (state.subtab === subtab) return state
  return {
    ...state,
    subtab,
    search: '',
    activeStatuses: new Set(),
    activeBugStatuses: new Set(),
    openRows: new Set(),
  }
}

/** 排序 pill 切换：活跃优先 ↔ 最新创建 */
export function nextSort(sort: OverviewSort): OverviewSort {
  return sort === 'active' ? 'created' : 'active'
}

/** 搜索参归一（Hard Rule 服务端承载）：trim 后非空 = 原样透传，空 = undefined（不带参） */
export function searchQueryOf(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

/** 搜索框占位文案（原型 ov-q placeholder 逐子 tab 口径；spec 位 = G3 交付时细化） */
export function searchPlaceholderOf(subtab: OverviewSubtab): string {
  if (subtab === 'tasks') return '搜索标题/slug/类型/状态(中英)…'
  if (subtab === 'spec') return '搜索 spec…'
  return '搜索 Bug 摘要/错误类型…'
}

/** chip 禁用判据（AC5）：0 计数 disabled（不可点出空态） */
export function isChipDisabled(count: number): boolean {
  return count <= 0
}

/** chips toggle（纯集合翻转；0 计数禁用归组件按钮层——模型不携带计数） */
export function toggleStatusFilter(state: OverviewFilterState, status: TaskStatus): OverviewFilterState {
  const next = new Set(state.activeStatuses)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  return { ...state, activeStatuses: next }
}

/** chips 全清（st-clear 交互） */
export function clearStatusFilter(state: OverviewFilterState): OverviewFilterState {
  return { ...state, activeStatuses: new Set() }
}

/** chips → 服务端 statusFilter 参（白名单序 = contracts TASK_STATUSES 行序；空集 = 全部） */
export function statusFilterParam(active: ReadonlySet<TaskStatus>): TaskStatus[] {
  return TASK_STATUSES.filter((status) => active.has(status))
}

/** chips 过滤在场判据（清过滤入口显隐——任务/Bug chips 族共用） */
export function hasActiveStatusFilter(active: ReadonlySet<unknown>): boolean {
  return active.size > 0
}

/** Bug 三态 chips toggle（纯集合翻转——白名单参服务端过滤，fix-bug） */
export function toggleBugStatusFilter(state: OverviewFilterState, status: BugStatus): OverviewFilterState {
  const next = new Set(state.activeBugStatuses)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  return { ...state, activeBugStatuses: next }
}

/** Bug 三态 chips 全清 */
export function clearBugStatusFilter(state: OverviewFilterState): OverviewFilterState {
  return { ...state, activeBugStatuses: new Set() }
}

/** Bug chips → 服务端 status 参（白名单序 = contracts BUG_STATUSES 行序；空集 = 空参 = 全部） */
export function bugStatusFilterParam(active: ReadonlySet<BugStatus>): BugStatus[] {
  return BUG_STATUSES.filter((status) => active.has(status))
}

/** Bug 三态计数（无参全量行投影——chips 计数单源；行集来自头路/列路无参调用） */
export function bugStatusCounts(bugs: readonly BugCard[]): Record<BugStatus, number> {
  const counts: Record<BugStatus, number> = { open: 0, fixed: 0, unresolved: 0 }
  for (const bug of bugs) counts[bug.bugStatus] += 1
  return counts
}

// ─────────────────────────── 概览 tab 宽度模型（已退役） ───────────────────────────
// M3.1 D12（用户裁决 #1）：概览内容弹性填满整个 tab——旧定宽管线（OVERVIEW_WIDTH_*
// / clampOverviewWidth / overviewWidthFromDrag + 左缘拖拽手柄）整体退役；dock 宽度
// 归右栏官方拖柄（用户调宽），本模型零宽度态。

/** 父行展开键（多开并存——行键由消费面自行拼装） */
export function toggleOpenRow(state: OverviewFilterState, key: string): OverviewFilterState {
  const next = new Set(state.openRows)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return { ...state, openRows: next }
}

/** ov-head 折叠 toggle */
export function toggleHead(state: OverviewFilterState): OverviewFilterState {
  return { ...state, headOpen: !state.headOpen }
}

/** 活跃 feature 判据（非终态优先，否则首行；空集 = undefined）——task-tab feature pill 单源 */
export function activeFeatureSlug(features: readonly FeatureCard[]): string | undefined {
  const active = features.find((f) => f.featureStatus !== 'completed' && f.featureStatus !== 'archived')
  if (active !== undefined) return active.slug
  return features[0]?.slug
}

// 头摘要（overviewHeadSummary——「feature · N 会话 · N 完成」合成）已随 T1-head 裁决退役
//（用户裁决 2026-11-23：头内容 = 项目名称 + forgeDirs 5 行目录信息，无会话统计；
// status-chips/tasks 子 tab 的 stats 数据源保留不受影响）。

// ── spec 文档区目录列举（overview-dockkit-alignment 1.2——格式分流纯投影）──
// spec 展开文档区除 spec.md 外逐行呈现目录其余文件（文件名 + 格式 tag + 查看入口）；
// 查看入口不分流：全部文件走官方 documentpreview（按后缀自动选渲染器——markdown/html/
// 图片/PDF/Office，无专属渲染器落纯文本兜底）；格式 tag 仅呈现。

/** spec 目录文件格式（纯呈现值域——查看通道不依赖它） */
export type SpecFileFormat = 'markdown' | 'html' | 'text' | 'image' | 'pdf' | 'other'

/** 文本格式扩展名白名单（小写、无点；白名单外含扩展名 = other） */
const SPEC_TEXT_EXTS = new Set([
  'txt', 'json', 'yaml', 'yml', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'sh', 'py', 'toml', 'xml', 'csv', 'log', 'ini', 'conf',
])

/** 图片扩展名（官方 documentpreview 内置图片渲染器 IMAGE_EXTENSIONS 同集） */
const SPEC_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])

/** 扩展名 → 格式（纯投影；无扩展名/白名单外 = other） */
export function specFileFormatOf(name: string): SpecFileFormat {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'other'
  const ext = name.slice(dot + 1).toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'pdf') return 'pdf'
  if (SPEC_IMAGE_EXTS.has(ext)) return 'image'
  if (SPEC_TEXT_EXTS.has(ext)) return 'text'
  return 'other'
}

/** 格式中文名（格式 tag 显示单源） */
export const SPEC_FILE_FORMAT_LABELS: Readonly<Record<SpecFileFormat, string>> = {
  markdown: 'Markdown',
  html: 'HTML',
  text: '文本',
  image: '图片',
  pdf: 'PDF',
  other: '文件',
}

/** doc.relPath → 所在目录 rel（posix 归一；无目录段 = ''） */
export function specDocDirOf(relPath: string): string {
  const norm = relPath.replaceAll('\\', '/')
  const at = norm.lastIndexOf('/')
  return at === -1 ? '' : norm.slice(0, at)
}

/** 目录 rel + 文件名 → 文件 rel（onOpenDoc 同 rel 语义） */
export function joinSpecFileRel(dirRel: string, name: string): string {
  return dirRel === '' ? name : `${dirRel}/${name}`
}

/** 工作区根（host 绝对）+ 目录 rel → forgeFs.listDir 绝对入参（posix 归一） */
export function absSpecDirOf(workspaceRoot: string, dirRel: string): string {
  const root = workspaceRoot.replaceAll('\\', '/').replace(/\/+$/, '')
  return dirRel === '' ? root : `${root}/${dirRel}`
}

/**
 * spec 文档 rel（基准 = 项目根，含 `.forge/` 前缀）→ onOpenDoc 入参 rel（基准 = forgeDir，
 * dockDocOpener 与 feature 文档同口径）。
 * Root cause: 两域 relPath 基准不同（spec = 项目根 / feature = forgeDir），spec-tab 曾把
 * 项目根基准 rel 直传 forgeDir 基准开出径 → 路径多拼一层 `.forge`（bug 8196003a）。
 * 仅剥 `.forge/` 段前缀；不在 .forge 下的自定义 doc_path 原样返回（由开出径自行判存）。
 */
export function specForgeDocRelOf(relPath: string): string {
  const norm = relPath.replaceAll('\\', '/')
  return norm.startsWith('.forge/') ? norm.slice('.forge/'.length) : norm
}
