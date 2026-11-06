// browse-model 单测 —— UF-6 浏览主体交互语义（AC1/AC2/AC4/AC5 的纯函数面）。
// 断言锚点 = 任务 3.6 AC：
//   AC1 域选择 → domainPrefix 前缀过滤透传（零客户端过滤语义）；
//   AC2 关键词细分 + 组合过滤 / 清除过滤；
//   AC4 空库引导 ⇄ 过滤无结果分流；AC5 缓存先行相位序（cards > skeleton）。
import { describe, expect, it } from 'vitest'
import type { DomainNode, EntryActionReceipt } from '@dsh-forge/contracts'
import {
  EMPTY_FILTER,
  EMPTY_MULTI_SELECT,
  browseFaceState,
  browseFilterReducer,
  cardCreatedLabel,
  cardStatusDotState,
  cardStatusLabel,
  cardTimeLabel,
  confirmReceiptText,
  domainDepthOf,
  domainLabelOf,
  domainRows,
  entriesQueryOf,
  entryActionFailureText,
  entryActionNotice,
  findCard,
  hasActiveFilter,
  isDomainDepthLegal,
  joinDomainPath,
  moveReceiptText,
  multiSelectReducer,
  parentDomainPaths,
  toggleDomainCollapsed,
  visibleDomainRows,
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
    { domainPath: '前端', label: '前端', depth: 1, entryCount: 3, unconfirmedCount: 2 },
    { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1, unconfirmedCount: 2 },
    { domainPath: '后端', label: '后端', depth: 1, entryCount: 2, unconfirmedCount: 0 },
  ]

  it('「全部域」根行居首（entryCount = 全量含根域文件），节点原序跟随（父先于子）', () => {
    const rows = domainRows(nodes, 5)
    expect(rows[0]).toEqual({ domainPath: '', label: '全部域', depth: 0, entryCount: 5, unconfirmedCount: 2 })
    expect(rows.slice(1)).toEqual([
      { domainPath: '前端', label: '前端', depth: 1, entryCount: 3, unconfirmedCount: 2 },
      { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1, unconfirmedCount: 2 },
      { domainPath: '后端', label: '后端', depth: 1, entryCount: 2, unconfirmedCount: 0 },
    ])
  })

  it('空域树仅根行（空库引导期域轨不空轨——根行常在）', () => {
    expect(domainRows([], 0)).toEqual([{ domainPath: '', label: '全部域', depth: 0, entryCount: 0, unconfirmedCount: 0 }])
  })

  it('H4 徽记口径：unconfirmedCount 随行原样携带（未过滤独立查询面供数）；根行 = 一级域求和（树派生一致）', () => {
    const rows = domainRows(nodes, 5)
    expect(rows[0]?.unconfirmedCount).toBe(2 + 0) // 前端(2) + 后端(0)——一级域求和，不重复计子域
    expect(rows.find((row) => row.domainPath === '前端')?.unconfirmedCount).toBe(2)
  })
})

describe('域树交互模型（SC-H——收合/新建目录纯函数面）', () => {
  const nodes: readonly DomainNode[] = [
    { domainPath: '前端', label: '前端', depth: 1, entryCount: 3, unconfirmedCount: 1 },
    { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1, unconfirmedCount: 1 },
    { domainPath: '后端', label: '后端', depth: 1, entryCount: 2, unconfirmedCount: 0 },
  ]

  it('H1 toggleDomainCollapsed：收合加入 / 再收起移除（集合语义）', () => {
    expect(toggleDomainCollapsed([], '前端')).toEqual(['前端'])
    expect(toggleDomainCollapsed(['前端'], '前端')).toEqual([])
  })

  it('H1 visibleDomainRows：收合行自身保留，子孙行隐去；无关行不受影响', () => {
    const rows = domainRows(nodes, 5)
    const collapsed = visibleDomainRows(rows, ['前端'])
    expect(collapsed.map((row) => row.domainPath)).toEqual(['', '前端', '后端'])
    expect(visibleDomainRows(rows, ['后端'])).toEqual(rows) // 无子孙 = 零变化
    expect(visibleDomainRows(rows, [])).toEqual(rows)
  })

  it('H2 域深度：domainDepthOf 段计数（根行 0 层）；isDomainDepthLegal ≤3 层门槛', () => {
    expect(domainDepthOf('')).toBe(0)
    expect(domainDepthOf('前端')).toBe(1)
    expect(domainDepthOf('前端/组件')).toBe(2)
    expect(isDomainDepthLegal('前端/组件/单元')).toBe(true)
    expect(isDomainDepthLegal('前端/组件/单元/子目录')).toBe(false)
    expect(joinDomainPath('前端/组件', '单元')).toBe('前端/组件/单元')
    expect(joinDomainPath(undefined, '新域')).toBe('新域')
    expect(joinDomainPath('', '新域')).toBe('新域')
  })

  it('parentDomainPaths：有子域的域路径集合（caret 渲染判据——叶行不出 caret）', () => {
    const parents = parentDomainPaths(domainRows(nodes, 5))
    expect(parents.has('前端')).toBe(true)
    expect(parents.has('后端')).toBe(false)
    expect(parents.has('')).toBe(true) // 根行有一级子域
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

describe('statusFilter（状态过滤片——服务端执行，零客户端过滤语义）', () => {
  it('set-status-filter 置片；同值幂等（原引用返回）；all = 清片（键剥离，回零态形态）', () => {
    const unconfirmed = browseFilterReducer(EMPTY_FILTER, { type: 'set-status-filter', statusFilter: 'unconfirmed' })
    expect(unconfirmed).toEqual({ keyword: '', statusFilter: 'unconfirmed' })
    expect(browseFilterReducer(unconfirmed, { type: 'set-status-filter', statusFilter: 'unconfirmed' })).toBe(unconfirmed)
    const cleared = browseFilterReducer(unconfirmed, { type: 'set-status-filter', statusFilter: 'all' })
    expect(cleared).toEqual(EMPTY_FILTER)
  })

  it('statusFilter 计入激活判据（非 all = 过滤在场——零结果落「无结果」而非空库）', () => {
    expect(hasActiveFilter({ keyword: '', statusFilter: 'unconfirmed' })).toBe(true)
    expect(hasActiveFilter({ keyword: '', statusFilter: 'confirmed' })).toBe(true)
    expect(hasActiveFilter({ keyword: '', statusFilter: 'all' })).toBe(false)
  })

  it('statusFilter 透传查询（非 all 出键；all/缺席不出键——服务端口径不漂移）', () => {
    expect(entriesQueryOf('p-1', { keyword: '', statusFilter: 'unconfirmed' })).toEqual({
      projectId: 'p-1',
      statusFilter: 'unconfirmed',
    })
    expect(entriesQueryOf('p-1', { keyword: '', statusFilter: 'all' })).toEqual({ projectId: 'p-1' })
    expect(entriesQueryOf('p-1', { keyword: 'css', statusFilter: 'confirmed' })).toEqual({
      projectId: 'p-1',
      keyword: 'css',
      statusFilter: 'confirmed',
    })
  })
})

describe('multiSelectReducer（多选态机）', () => {
  it('enter 进入多选模式；重复 enter 幂等（原引用返回）', () => {
    const active = multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'enter' })
    expect(active).toEqual({ active: true, selected: [] })
    expect(multiSelectReducer(active, { type: 'enter' })).toBe(active)
  })

  it('exit 退出多选模式：勾选清零零残留（回 EMPTY_MULTI_SELECT 同形态）', () => {
    const active = multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'enter' })
    const selected = multiSelectReducer(active, { type: 'toggle', entryId: 7 })
    const selected2 = multiSelectReducer(selected, { type: 'toggle', entryId: 9 })
    expect(multiSelectReducer(selected2, { type: 'exit' })).toEqual({ active: false, selected: [] })
  })

  it('toggle 勾选/取消（保序去重）；仅多选模式在场生效', () => {
    const active = multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'enter' })
    const on = multiSelectReducer(active, { type: 'toggle', entryId: 7 })
    expect(on).toEqual({ active: true, selected: [7] })
    const both = multiSelectReducer(on, { type: 'toggle', entryId: 3 })
    expect(both.selected).toEqual([7, 3])
    const dup = multiSelectReducer(both, { type: 'toggle', entryId: 7 })
    expect(dup.selected).toEqual([3])
    // 非多选模式 toggle = 零效果
    expect(multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'toggle', entryId: 7 })).toBe(EMPTY_MULTI_SELECT)
  })

  it('select-all 全选当前过滤结果集（全量替换）；同集幂等（原引用返回）', () => {
    const active = multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'enter' })
    const partial = multiSelectReducer(active, { type: 'toggle', entryId: 7 })
    const all = multiSelectReducer(partial, { type: 'select-all', entryIds: [1, 2, 3] })
    expect(all).toEqual({ active: true, selected: [1, 2, 3] })
    expect(multiSelectReducer(all, { type: 'select-all', entryIds: [1, 2, 3] })).toBe(all)
    // 非多选模式 select-all = 零效果
    expect(multiSelectReducer(EMPTY_MULTI_SELECT, { type: 'select-all', entryIds: [1] })).toBe(EMPTY_MULTI_SELECT)
  })
})

describe('entryAction 回执 code→错误文案分派（封闭码集）', () => {
  it('逐码文案分派：封闭联合逐成员有中文文案', () => {
    const codes = [
      'rejected-confirmed',
      'stale',
      'cas-failed',
      'not-found',
      'domain-depth',
      'yaml-invalid',
      'precheck-failed',
    ] as const
    for (const code of codes) {
      const text = entryActionFailureText(code)
      expect(text.length).toBeGreaterThan(0)
    }
    expect(entryActionFailureText('rejected-confirmed')).toContain('已确认')
    expect(entryActionFailureText('cas-failed')).toContain('状态')
    expect(entryActionFailureText('not-found')).toContain('不存在')
  })

  it('entryActionNotice：全成功 = undefined（静默成功）；部分失败 = 成功/失败计数 + 逐条 code 文案', () => {
    expect(entryActionNotice({ results: [{ entryId: 1, outcome: 'success' }, { entryId: 2, outcome: 'success' }] })).toBeUndefined()
    const notice = entryActionNotice({
      results: [
        { entryId: 1, outcome: 'success' },
        { entryId: 2, outcome: 'failure', code: 'cas-failed', message: '状态漂移' },
        { entryId: 3, outcome: 'failure', code: 'not-found', message: '未命中' },
      ],
    })
    expect(notice).toContain('成功 1')
    expect(notice).toContain('失败 2')
    expect(notice).toContain('#2')
    expect(notice).toContain('#3')
  })

  it('entryActionNotice：树级 outcome（createDomain——results 缺席）= undefined 静默（不抛零长度炸点）', () => {
    expect(entryActionNotice({} as EntryActionReceipt)).toBeUndefined()
  })
})

describe('SC-J 卡片终稿布局纯函数面', () => {
  it('cardStatusLabel：confirmed→已确认 / unconfirmed→待审核（零英文）；未知状态原样回退 fail-soft', () => {
    expect(cardStatusLabel('confirmed')).toBe('已确认')
    expect(cardStatusLabel('unconfirmed')).toBe('待审核')
    expect(cardStatusLabel('draft')).toBe('draft')
  })

  it('cardStatusDotState：confirmed 绿点 / unconfirmed 琥珀点 / 未知 idle', () => {
    expect(cardStatusDotState('confirmed')).toBe('done')
    expect(cardStatusDotState('unconfirmed')).toBe('warning')
    expect(cardStatusDotState('draft')).toBe('idle')
  })

  it('cardCreatedLabel：{时长}创建短标签 + 创建于 YYYY-MM-DD HH:mm 悬浮完整时间点', () => {
    const label = cardCreatedLabel('2026-10-02T09:00:00.000Z', Date.parse('2026-10-02T12:00:00.000Z'))
    expect(label.short).toBe('3 小时前创建')
    expect(label.full).toMatch(/^创建于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    const bad = cardCreatedLabel('not-a-date', Date.parse('2026-10-02T12:00:00.000Z'))
    expect(bad.full).toBe('创建于 not-a-date')
    expect(bad.short).toBe('not-a-date创建')
  })

  it('domainLabelOf：根域回退「根」；非根原样', () => {
    expect(domainLabelOf('')).toBe('根')
    expect(domainLabelOf('lessons/windows')).toBe('lessons/windows')
  })

  it('findCard：entryId 命中返回卡片；未命中 undefined', () => {
    const cards = [
      { entryId: 1, title: 'A', domainPath: 'x' },
      { entryId: 2, title: 'B', domainPath: '' },
    ]
    expect(findCard(cards, 2)?.title).toBe('B')
    expect(findCard(cards, 9)).toBeUndefined()
  })

  it('回执文案模板（标题/域名实读——非静态提示）：J3 通过 / J4 移动', () => {
    expect(confirmReceiptText('安全编码规范')).toBe('安全编码规范 已被审核通过')
    expect(moveReceiptText('安全编码规范', 'lessons', 'conventions')).toBe('安全编码规范 从lessons 移动到 conventions')
  })
})
