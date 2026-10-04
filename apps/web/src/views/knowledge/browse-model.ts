// 知识浏览派生模型（定位：业务——UF-6 浏览主体的纯派生层：过滤态机 + 网格相位推导 +
// 域树行投影 + 卡片时间标签）。交互语义集中于此（renderToStaticMarkup 面无法触发事件——
// sidebar-model/browser-actions 同形制）。
// Hard Rules 落实：
//   - 域过滤 = 目录路径前缀匹配（domainPrefix 原样透传 listEntries——前缀语义在 core 服务面
//     执行，本模块零客户端过滤语义，不引入其它过滤维度）；
//   - 关键词 = keywords 维度细分（同样服务端执行——工具栏输入原样传递）。
import { isoTimeLabelZh } from '../../components/index.js'
import type { DomainNode, ListEntriesQuery } from '@dsh-forge/contracts'

/** 浏览过滤态（域 = 目录路径前缀；关键词 = 工具栏输入原样） */
export interface BrowseFilter {
  /** 选中的域路径（undefined = 全部域——域树根行） */
  readonly domain?: string
  /** 关键词（空串 = 未过滤；空白 = 未过滤判据见 hasActiveFilter，与服务端 trim 口径一致） */
  readonly keyword: string
}

/** 过滤零态（结构常量——引用稳定，reducer 复位原样返回） */
export const EMPTY_FILTER: BrowseFilter = { keyword: '' }

/** 过滤态事件（select-domain 的 undefined = 选「全部域」根行） */
export type BrowseFilterEvent =
  | { readonly type: 'select-domain'; readonly domain: string | undefined }
  | { readonly type: 'set-keyword'; readonly keyword: string }
  | { readonly type: 'clear-filters' }

/**
 * 过滤态 reducer（纯函数；同值事件原引用返回——effect 依赖过滤对象身份不重拉）。
 * - select-domain：幂等（重复选当前域不产生新引用）；
 * - clear-filters：组合过滤无结果的「清除过滤入口」——域 + 关键词一并复位。
 */
export function browseFilterReducer(filter: BrowseFilter, event: BrowseFilterEvent): BrowseFilter {
  switch (event.type) {
    case 'select-domain': {
      if (event.domain === filter.domain) return filter
      return event.domain === undefined ? { keyword: filter.keyword } : { ...filter, domain: event.domain }
    }
    case 'set-keyword': {
      if (event.keyword === filter.keyword) return filter
      return { ...filter, keyword: event.keyword }
    }
    case 'clear-filters': {
      return filter.domain === undefined && filter.keyword === '' ? filter : EMPTY_FILTER
    }
  }
}

/** 过滤激活判据（无结果空态 ⇄ 空库引导的分流依据；空白关键词 = 未过滤，与服务端 trim 同口径） */
export function hasActiveFilter(filter: BrowseFilter): boolean {
  return filter.domain !== undefined || filter.keyword.trim() !== ''
}

/**
 * 过滤态 → listEntries 查询（域前缀 + 关键词原样透传——前缀/关键词细分语义在 core 执行；
 * 未激活的维度不出现在查询对象上，防服务端口径漂移）。
 */
export function entriesQueryOf(projectId: string, filter: BrowseFilter): ListEntriesQuery {
  const query: ListEntriesQuery = { projectId }
  if (filter.domain !== undefined) query.domainPrefix = filter.domain
  if (filter.keyword.trim() !== '') query.keyword = filter.keyword
  return query
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
}

/**
 * 域树行投影（纯函数）：「全部域」根行（计数 = 全量卡片数，含根域文件——aggregateDomainTree
 * 不为根域文件生成节点，全量计数只能取自无过滤底表）+ 聚合节点原序（core 契约：depth 升序
 * 再路径升序，父先于子）。
 */
export function domainRows(nodes: readonly DomainNode[], total: number): readonly DomainRow[] {
  return [
    { domainPath: '', label: '全部域', depth: 0, entryCount: total },
    ...nodes.map((node) => ({
      domainPath: node.domainPath,
      label: node.label,
      depth: node.depth,
      entryCount: node.entryCount,
    })),
  ]
}

/**
 * 卡片时间标签（纯函数）：frontmatter.updated（缺省 mtime 的 ISO 串）→ 官方 relativeTime
 * 桶化中文文案（zh 切换 = components/time-label 共享源，fix-36 收敛——sidebar/recall 行语言
 * 同口径）；非法字面量原样展示（fail-soft，不炸卡片）。
 */
export function cardTimeLabel(updated: string, now: number): string {
  return isoTimeLabelZh(updated, now)
}
