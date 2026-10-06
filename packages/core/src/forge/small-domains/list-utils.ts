// 三小域列表面共用纯助手（任务 2.7）——search 匹配与 active/created 排序的域内单源。
// 定位：业务（三小域合并目录内部共用——不外溢 forge/ 其他域）。
import type { FeatureStatus, ProposalStatus } from '@dsh-forge/contracts'
import { FEATURE_STATUS_LABELS, PROPOSAL_STATUS_LABELS } from '@dsh-forge/contracts'

/**
 * search 匹配（服务端 core 过滤——Interface 1 listTasks「中英双语，标签常量匹配」同口径
 * 下沉三小域）：大小写不敏感子串；空/纯空白 = 全量放行。
 */
export function matchesSearch(search: string | undefined, haystacks: readonly string[]): boolean {
  const q = (search ?? '').trim().toLowerCase()
  if (q === '') return true
  return haystacks.some((h) => h.toLowerCase().includes(q))
}

/** feature 卡 search 键集（slug + title + 状态中英标签） */
export function featureSearchKeys(slug: string, title: string, status: FeatureStatus): readonly string[] {
  return [slug, title, FEATURE_STATUS_LABELS[status].zh, FEATURE_STATUS_LABELS[status].en]
}

/** proposal 卡 search 键集（slug + title + 状态中英标签——与 feature 卡同口径） */
export function proposalSearchKeys(slug: string, title: string, status: ProposalStatus): readonly string[] {
  return [slug, title, PROPOSAL_STATUS_LABELS[status].zh, PROPOSAL_STATUS_LABELS[status].en]
}

/** 排序键提取（泛型卡面——三小域列表共用） */
export interface SortKeys<T> {
  /** 排序模式：active = 活跃优先（非终态在前）/ created = 最新创建在前；缺省 active */
  readonly active: 'active' | 'created'
  /** 终态判定（features = completed|archived；proposals = accepted|rejected|superseded） */
  readonly isTerminal: (card: T) => boolean
  readonly createdAt: (card: T) => string
  /** 平局决胜（恒稳定——创建时间同毫秒时按 id 定序） */
  readonly id: (card: T) => string
}

/**
 * active/created 排序（纯函数，返回新数组）：
 * - created：created_at 降序（最新创建在前），id 升序决胜；
 * - active：非终态在前、终态在后（活跃优先——概览默认视图），两组内各按 created 降序 + id 决胜。
 */
export function sortByActiveThenCreated<T>(cards: readonly T[], keys: SortKeys<T>): T[] {
  const byCreatedDesc = (a: T, b: T): number => {
    const ca = keys.createdAt(a)
    const cb = keys.createdAt(b)
    if (ca !== cb) return ca < cb ? 1 : -1 // 降序（字符串 ISO 比较）
    const ia = keys.id(a)
    const ib = keys.id(b)
    return ia < ib ? -1 : ia > ib ? 1 : 0
  }
  const copy = [...cards]
  if (keys.active === 'created') return copy.sort(byCreatedDesc)
  return copy.sort((a, b) => {
    const ta = keys.isTerminal(a) ? 1 : 0
    const tb = keys.isTerminal(b) ? 1 : 0
    if (ta !== tb) return ta - tb // 非终态（0）在前
    return byCreatedDesc(a, b)
  })
}
