// 知识浏览派生模型（定位：业务——UF-6 浏览主体的纯派生层：过滤态机 + 网格相位推导 +
// 域树行投影 + 卡片时间标签）。交互语义集中于此（renderToStaticMarkup 面无法触发事件——
// sidebar-model/browser-actions 同形制）。
// Hard Rules 落实：
//   - 域过滤 = 目录路径前缀匹配（domainPrefix 原样透传 listEntries——前缀语义在 core 服务面
//     执行，本模块零客户端过滤语义，不引入其它过滤维度）；
//   - 关键词 = keywords 维度细分（同样服务端执行——工具栏输入原样传递）。
import { isoTimeLabelZh } from '../../components/index.js'
import type {
  DomainNode,
  EntryActionFailureCode,
  EntryActionReceipt,
  EntryStatusFilter,
  ListEntriesQuery,
} from '@dsh-forge/contracts'

/** 浏览过滤态（域 = 目录路径前缀；关键词 = 工具栏输入原样；状态片 = statusFilter 服务端执行） */
export interface BrowseFilter {
  /** 选中的域路径（undefined = 全部域——域树根行） */
  readonly domain?: string
  /** 关键词（空串 = 未过滤；空白 = 未过滤判据见 hasActiveFilter，与服务端 trim 口径一致） */
  readonly keyword: string
  /** 状态过滤片（undefined/all = 全部——工具栏状态 chips 单一来源；过滤语义归服务端） */
  readonly statusFilter?: EntryStatusFilter
}

/** 过滤零态（结构常量——引用稳定，reducer 复位原样返回） */
export const EMPTY_FILTER: BrowseFilter = { keyword: '' }

/** 过滤态事件（select-domain 的 undefined = 选「全部域」根行） */
export type BrowseFilterEvent =
  | { readonly type: 'select-domain'; readonly domain: string | undefined }
  | { readonly type: 'set-keyword'; readonly keyword: string }
  | { readonly type: 'set-status-filter'; readonly statusFilter: EntryStatusFilter }
  | { readonly type: 'clear-filters' }

/**
 * 过滤态 reducer（纯函数；同值事件原引用返回——effect 依赖过滤对象身份不重拉）。
 * - select-domain：幂等（重复选当前域不产生新引用）；
 * - set-status-filter：幂等；'all' = 清片（键剥离——查询不出键防服务端口径漂移）；
 * - clear-filters：组合过滤无结果的「清除过滤入口」——域 + 关键词 + 状态片一并复位。
 */
export function browseFilterReducer(filter: BrowseFilter, event: BrowseFilterEvent): BrowseFilter {
  switch (event.type) {
    case 'select-domain': {
      if (event.domain === filter.domain) return filter
      return event.domain === undefined
        ? { keyword: filter.keyword, statusFilter: filter.statusFilter }
        : { ...filter, domain: event.domain }
    }
    case 'set-keyword': {
      if (event.keyword === filter.keyword) return filter
      return { ...filter, keyword: event.keyword }
    }
    case 'set-status-filter': {
      if (event.statusFilter === (filter.statusFilter ?? 'all')) return filter
      return event.statusFilter === 'all' ? { domain: filter.domain, keyword: filter.keyword } : { ...filter, statusFilter: event.statusFilter }
    }
    case 'clear-filters': {
      return filter.domain === undefined && filter.keyword === '' && (filter.statusFilter ?? 'all') === 'all'
        ? filter
        : EMPTY_FILTER
    }
  }
}

/** 过滤激活判据（无结果空态 ⇄ 空库引导的分流依据；空白关键词 = 未过滤，与服务端 trim 同口径） */
export function hasActiveFilter(filter: BrowseFilter): boolean {
  return filter.domain !== undefined || filter.keyword.trim() !== '' || (filter.statusFilter ?? 'all') !== 'all'
}

/**
 * 过滤态 → listEntries 查询（域前缀 + 关键词 + 状态片原样透传——前缀/关键词细分/statusFilter
 * 语义在 core 执行；未激活的维度不出现在查询对象上，防服务端口径漂移）。
 */
export function entriesQueryOf(projectId: string, filter: BrowseFilter): ListEntriesQuery {
  const query: ListEntriesQuery = { projectId }
  if (filter.domain !== undefined) query.domainPrefix = filter.domain
  if (filter.keyword.trim() !== '') query.keyword = filter.keyword
  if (filter.statusFilter !== undefined && filter.statusFilter !== 'all') query.statusFilter = filter.statusFilter
  return query
}

// ───────────────── 多选模式态机（knowledge-review-ui SC-F——纯派生层） ─────────────────

/** 多选态（active = 模式在场；selected = 勾选集——保序数组，退出即清零零残留） */
export interface MultiSelectState {
  readonly active: boolean
  readonly selected: readonly number[]
}

/** 多选零态（结构常量——退出多选 = 回此形态，勾选零残留） */
export const EMPTY_MULTI_SELECT: MultiSelectState = { active: false, selected: [] }

/** 多选态事件（select-all = 当前过滤结果集全量替换——SC-F4 全选口径） */
export type MultiSelectEvent =
  | { readonly type: 'enter' }
  | { readonly type: 'exit' }
  | { readonly type: 'toggle'; readonly entryId: number }
  | { readonly type: 'select-all'; readonly entryIds: readonly number[] }
  | { readonly type: 'prune'; readonly aliveIds: readonly number[] }

/**
 * 多选态 reducer（纯函数；同态事件原引用返回）。
 * - enter：进入多选模式（幂等）；exit：退出并清零勾选（零残留）；
 * - toggle / select-all / prune：仅多选模式在场生效（非多选模式零效果原引用返回）；
 * - prune：重拉落点后剪除已不在结果集的勾选残影（动作后删除的条目不残留）。
 */
export function multiSelectReducer(state: MultiSelectState, event: MultiSelectEvent): MultiSelectState {
  switch (event.type) {
    case 'enter': {
      return state.active ? state : { ...state, active: true }
    }
    case 'exit': {
      return state.active || state.selected.length > 0 ? EMPTY_MULTI_SELECT : state
    }
    case 'toggle': {
      if (!state.active) return state
      const selected = state.selected.includes(event.entryId)
        ? state.selected.filter((id) => id !== event.entryId)
        : [...state.selected, event.entryId]
      return { ...state, selected }
    }
    case 'select-all': {
      if (!state.active) return state
      if (sameIdSet(state.selected, event.entryIds)) return state
      return { ...state, selected: [...event.entryIds] }
    }
    case 'prune': {
      const selected = state.selected.filter((id) => event.aliveIds.includes(id))
      if (selected.length === state.selected.length) return state
      return { ...state, selected }
  }
  }
}

/** 同集判据（同长度 + 逐位相等——保序数组的集合等价） */
function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

// ───────────────── entryAction 回执 code→错误文案分派（code 枚举 = UI 文案分派键） ─────────────────

/** 逐条失败码 → 中文文案（封闭码集逐成员分派——新增契约码成员必须同点补文案） */
export function entryActionFailureText(code: EntryActionFailureCode): string {
  switch (code) {
    case 'rejected-confirmed':
      return '已确认条目不可驳回'
    case 'stale':
      return '条目已被他人更新，请刷新后重试'
    case 'cas-failed':
      return '条目状态已变化，已跳过'
    case 'not-found':
      return '条目不存在，可能已被删除'
    case 'domain-depth':
      return '域层级超过 3 层上限'
    case 'yaml-invalid':
      return '内容含非法 YAML 结构字符，已拒收'
    case 'precheck-failed':
      return '条目文件不可删除（预检失败）'
  }
}

/**
 * entryAction 回执 → 用户提示文案（纯函数）：
 * - 全成功 = undefined（静默成功——视图重拉即反馈）；
 * - 部分失败 = 成功/失败计数 + 逐条 `#id 失败文案`（部分失败不回滚已成功条目——如实呈现）。
 */
export function entryActionNotice(receipt: EntryActionReceipt): string | undefined {
  // 树级 outcome（createDomain——无逐条回执维度）视同全成功静默；逐条回执面照常分派
  const results = receipt.results ?? []
  const failures = results.filter((result) => result.outcome === 'failure')
  if (failures.length === 0) return undefined
  const successCount = results.length - failures.length
  const detail = failures
    .map((result) => (result.outcome === 'failure' ? `#${String(result.entryId)} ${entryActionFailureText(result.code)}` : ''))
    .filter((text) => text !== '')
    .join('；')
  return `成功 ${String(successCount)} 条，失败 ${String(failures.length)} 条：${detail}`
}

/** 浏览主体网格相位（UF-6 States 四态 + 错误态；推导见 browseFaceState） */
export type BrowseFaceState = 'skeleton' | 'cards' | 'no-results' | 'empty-library' | 'error'

/**
 * 网格相位推导（纯函数——UF-6 States 表的可执行化）：
 * - error > cards > skeleton > (no-results | empty-library) 的优先序；
 * - cards > 0 即呈现（加载在途且已有数据 = 缓存先行：旧内容保持可见不闪骨架——AC5）；
 * - loading 且无数据 = 骨架（首装/索引重建中）；
 * - ready 且零结果：有过滤 = 无结果提示（清除过滤入口），无过滤 = 空库引导（目录位置说明）。
 */
export function browseFaceState(input: {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly cardCount: number
  readonly filterActive: boolean
}): BrowseFaceState {
  if (input.phase === 'error') return 'error'
  if (input.cardCount > 0) return 'cards'
  if (input.phase === 'loading') return 'skeleton'
  return input.filterActive ? 'no-results' : 'empty-library'
}

/** 域树视图行（domainPath = '' 即「全部域」根行） */
export interface DomainRow {
  /** '' = 全部域根行（无域过滤） */
  readonly domainPath: string
  readonly label: string
  /** 0 = 根行；1..3 = 域层级（目录深度） */
  readonly depth: number
  /** 该域条目计数（含子域——与域前缀过滤同口径；根行 = 全量） */
  readonly entryCount: number
  /** 该域待审核计数（含子域——未过滤口径独立查询面供数；根行 = 一级域求和派生） */
  readonly unconfirmedCount: number
}

/**
 * 域树行投影（纯函数）：「全部域」根行（entryCount = 全量卡片数，含根域文件——
 * aggregateDomainTree 不为根域文件生成节点，全量计数只能取自无过滤底表；
 * unconfirmedCount = 一级域求和——徽记口径「哪里有待审核」，与节点计数同底表聚合）
 * + 聚合节点原序（core 契约：depth 升序再路径升序，父先于子）。
 */
export function domainRows(nodes: readonly DomainNode[], total: number): readonly DomainRow[] {
  const rootUnconfirmed = nodes
    .filter((node) => node.depth === 1)
    .reduce((sum, node) => sum + node.unconfirmedCount, 0)
  return [
    { domainPath: '', label: '全部域', depth: 0, entryCount: total, unconfirmedCount: rootUnconfirmed },
    ...nodes.map((node) => ({
      domainPath: node.domainPath,
      label: node.label,
      depth: node.depth,
      entryCount: node.entryCount,
      unconfirmedCount: node.unconfirmedCount,
    })),
  ]
}

// ───────────────── 域树交互模型（knowledge-review-ui SC-H——纯派生层） ─────────────────

/** 域层级上限（≤3 层硬门槛——与 createDomain/move 服务端同判据；客户端预检仅提示不替代） */
export const DOMAIN_MAX_DEPTH = 3

/** 域路径深度（段计数；'' = 根行 0 层） */
export function domainDepthOf(domainPath: string): number {
  return domainPath === '' ? 0 : domainPath.split('/').length
}

/** 拼接子域路径（parent 缺席/根 = 顶层新目录——单段路径） */
export function joinDomainPath(parent: string | undefined, name: string): string {
  return parent === undefined || parent === '' ? name : `${parent}/${name}`
}

/** 域深度合法判据（≤DOMAIN_MAX_DEPTH——树头「＋」超层拒收提示的预检同函数） */
export function isDomainDepthLegal(domainPath: string): boolean {
  return domainDepthOf(domainPath) <= DOMAIN_MAX_DEPTH
}

/** 收合态（collapsed = 已收合域路径集合——缺省空集即全展开，「缺省常展开 ≤3 层」口径） */
export function toggleDomainCollapsed(collapsed: readonly string[], domainPath: string): readonly string[] {
  return collapsed.includes(domainPath) ? collapsed.filter((path) => path !== domainPath) : [...collapsed, domainPath]
}

/**
 * 收合可见行投影（纯函数）：某祖先域已收合 → 其子孙行隐去，收合行本身保留
 * （collapsed 行仍在场——caret 反向即展开入口）。
 */
export function visibleDomainRows(rows: readonly DomainRow[], collapsed: readonly string[]): readonly DomainRow[] {
  return rows.filter((row) => !collapsed.some((path) => row.domainPath.startsWith(`${path}/`)))
}

/** 有子域的域路径集合（纯函数——caret 渲染判据：仅父行出 caret，叶行空占位对齐） */
export function parentDomainPaths(rows: readonly DomainRow[]): ReadonlySet<string> {
  const parents = new Set<string>()
  for (const row of rows) {
    if (row.domainPath === '') continue
    const cut = row.domainPath.lastIndexOf('/')
    parents.add(cut === -1 ? '' : row.domainPath.slice(0, cut))
  }
  return parents
}

/**
 * 卡片时间标签（纯函数）：frontmatter.updated（缺省 mtime 的 ISO 串）→ 官方 relativeTime
 * 桶化中文文案（zh 切换 = components/time-label 共享源，fix-36 收敛——sidebar/recall 行语言
 * 同口径）；非法字面量原样展示（fail-soft，不炸卡片）。
 */
export function cardTimeLabel(updated: string, now: number): string {
  return isoTimeLabelZh(updated, now)
}
