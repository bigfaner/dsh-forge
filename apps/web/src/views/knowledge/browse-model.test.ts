// browse-model 单测 —— UF-6 浏览主体交互语义（AC1/AC2/AC4/AC5 的纯函数面）。
// 断言锚点 = 任务 3.6 AC：
//   AC1 域选择 → domainPrefix 前缀过滤透传（零客户端过滤语义）；
//   AC2 关键词细分 + 组合过滤 / 清除过滤；
//   AC4 空库引导 ⇄ 过滤无结果分流；AC5 缓存先行相位序（cards > skeleton）。
import { describe, expect, it } from 'vitest'
import type { DomainNode } from '@dsh-forge/contracts'
import {
  EMPTY_FILTER,
  browseFaceState,
  browseFilterReducer,
  cardTimeLabel,
  domainRows,
  entriesQueryOf,
  hasActiveFilter,
} from './browse-model.js'

describe('browseFilterReducer（过滤态机）', () => {
  it('AC1 select-domain 置域；重复选当前域幂等（原引用返回）', () => {
    const first = browseFilterReducer(EMPTY_FILTER, { type: 'select-domain', domain: '前端' })
    expect(first).toEqual({ domain: '前端', keyword: '' })
    expect(browseFilterReducer(first, { type: 'select-domain', domain: '前端' })).toBe(first)
  })

  it('AC1 选「全部域」（undefined）清除域过滤（关键词保留）', () => {
    const withBoth = { domain: '前端', keyword: 'css' } as const
    expect(browseFilterReducer(withBoth, { type: 'select-domain', domain: undefined })).toEqual({ keyword: 'css' })
  })

  it('AC2 set-keyword 更新；同值幂等（原引用返回——effect 不重拉）', () => {
    const first = browseFilterReducer(EMPTY_FILTER, { type: 'set-keyword', keyword: '安全' })
    expect(first).toEqual({ keyword: '安全' })
    expect(browseFilterReducer(first, { type: 'set-keyword', keyword: '安全' })).toBe(first)
  })

  it('AC2 clear-filters 域 + 关键词一并复位；已空态原引用返回', () => {
    expect(browseFilterReducer({ domain: '前端', keyword: 'css' }, { type: 'clear-filters' })).toBe(EMPTY_FILTER)
    expect(browseFilterReducer(EMPTY_FILTER, { type: 'clear-filters' })).toBe(EMPTY_FILTER)
  })

  it('AC1+AC2 域与关键词组合（域树选择后关键词进一步细分）', () => {
    const withDomain = browseFilterReducer(EMPTY_FILTER, { type: 'select-domain', domain: '编程/java' })
    const combined = browseFilterReducer(withDomain, { type: 'set-keyword', keyword: 'jvm' })
    expect(combined).toEqual({ domain: '编程/java', keyword: 'jvm' })
  })
})

describe('hasActiveFilter / entriesQueryOf（过滤判据与查询透传）', () => {
  it('零态与空白关键词 = 未过滤（与服务端 trim 口径一致）', () => {
    expect(hasActiveFilter(EMPTY_FILTER)).toBe(false)
    expect(hasActiveFilter({ keyword: '   ' })).toBe(false)
  })

  it('域或关键词任一激活', () => {
    expect(hasActiveFilter({ domain: '前端', keyword: '' })).toBe(true)
    expect(hasActiveFilter({ keyword: 'css' })).toBe(true)
  })

  it('AC1 未过滤查询不含过滤键（projectId 独占）', () => {
    expect(entriesQueryOf('p-1', EMPTY_FILTER)).toEqual({ projectId: 'p-1' })
  })

  it('AC1/AC2 组合过滤查询 = domainPrefix + keyword 原样透传（前缀/细分语义归 core）', () => {
    expect(entriesQueryOf('p-1', { domain: '前端', keyword: 'css' })).toEqual({
      projectId: 'p-1',
      domainPrefix: '前端',
      keyword: 'css',
    })
    expect(entriesQueryOf('p-1', { domain: '编程/java', keyword: '' })).toEqual({
      projectId: 'p-1',
      domainPrefix: '编程/java',
    })
    // 空白关键词不出键（未过滤判据一致）
    expect(entriesQueryOf('p-1', { keyword: '  ' })).toEqual({ projectId: 'p-1' })
  })
})

describe('browseFaceState（网格相位推导——UF-6 States 表）', () => {
  it('error 相位最优先（typed error / 传输失败 → 错误态）', () => {
    expect(browseFaceState({ phase: 'error', cardCount: 5, filterActive: false })).toBe('error')
  })

  it('AC5 缓存先行：有卡片即呈现（加载在途不闪骨架——旧内容保持可见）', () => {
    expect(browseFaceState({ phase: 'loading', cardCount: 3, filterActive: false })).toBe('cards')
  })

  it('AC4 加载中且无数据 = 骨架（首装/索引重建中）', () => {
    expect(browseFaceState({ phase: 'loading', cardCount: 0, filterActive: false })).toBe('skeleton')
  })

  it('AC4 就绪零结果：有过滤 = 无结果提示；无过滤 = 空库引导', () => {
    expect(browseFaceState({ phase: 'ready', cardCount: 0, filterActive: true })).toBe('no-results')
    expect(browseFaceState({ phase: 'ready', cardCount: 0, filterActive: false })).toBe('empty-library')
    expect(browseFaceState({ phase: 'ready', cardCount: 2, filterActive: true })).toBe('cards')
  })
})

describe('domainRows（域树行投影）', () => {
  const nodes: readonly DomainNode[] = [
    { domainPath: '前端', label: '前端', depth: 1, entryCount: 3 },
    { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1 },
    { domainPath: '后端', label: '后端', depth: 1, entryCount: 2 },
  ]

  it('「全部域」根行居首（计数 = 全量，含根域文件），节点原序跟随（父先于子）', () => {
    const rows = domainRows(nodes, 5)
    expect(rows[0]).toEqual({ domainPath: '', label: '全部域', depth: 0, entryCount: 5 })
    expect(rows.slice(1)).toEqual([
      { domainPath: '前端', label: '前端', depth: 1, entryCount: 3 },
      { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1 },
      { domainPath: '后端', label: '后端', depth: 1, entryCount: 2 },
    ])
  })

  it('空域树仅根行（空库引导期域轨不空轨——根行常在）', () => {
    expect(domainRows([], 0)).toEqual([{ domainPath: '', label: '全部域', depth: 0, entryCount: 0 }])
  })
})

describe('cardTimeLabel（卡片时间标签）', () => {
  it('ISO 串 → 官方 relativeTime 桶化中文文案', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    expect(cardTimeLabel('2026-10-02T11:59:40Z', now)).toBe('刚刚')
    expect(cardTimeLabel('2026-10-02T11:30:00Z', now)).toBe('30 分钟前')
    expect(cardTimeLabel('2026-10-02T08:00:00Z', now)).toBe('4 小时前')
    expect(cardTimeLabel('2026-09-28T12:00:00Z', now)).toBe('4 天前')
    expect(cardTimeLabel('2026-08-01T12:00:00Z', now)).toBe('2 个月前')
    expect(cardTimeLabel('2024-10-02T12:00:00Z', now)).toBe('2 年前')
  })

  it('非法字面量原样展示（fail-soft）', () => {
    expect(cardTimeLabel('not-a-date', 0)).toBe('not-a-date')
  })
})
