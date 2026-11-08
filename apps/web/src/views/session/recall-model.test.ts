// recall-model 单测 —— UF-4 召回 tab 纯投影（stage④ 1.8 轮卡改型）。断言面：
// 统计头（次数 = 分组数/覆盖 = 去重命中）；turn 分组投影（一 turn 一卡 / NULL 未锚兜底卡 /
// 卡序 turn 降序未锚殿后 / 节序 = 调用时序）；L1 触发输入降级链；L2 verb 统计 + top（首个
// read 条目名）；函数式调用头（全参实参 / text「|」拼接 / legacy keywords「｜」拼接 /
// query 缺席裸动词）；归因区 LocaleDatetime；score 元组两位小数。
import { describe, expect, it } from 'vitest'
import type { RecallGroup, RecallGroupHit } from '@dsh-forge/contracts'
import {
  recallCallHead,
  recallDatetimeLabel,
  recallHitIdentity,
  recallScoreLabel,
  recallSearchTextJoin,
  recallStatsOf,
  recallTopOf,
  recallTriggerOf,
  recallTurnsOf,
  recallVerbCountsOf,
} from './recall-model.js'

const hit = (over: Partial<RecallGroupHit>): RecallGroupHit => ({
  rowId: 1,
  entryId: 1,
  frontmatterId: 'k1',
  title: '部署规范',
  domainPath: '前端',
  heat: 0,
  score: null,
  scope: 'project',
  ...over,
})

const call = (over: Partial<RecallGroup>): RecallGroup => ({
  callId: 'c',
  verb: 'search',
  query: null,
  hitCount: 1,
  durationMs: 1,
  createdAt: '2026-10-02T08:00:00.000Z',
  turnSeq: 1,
  triggerSnap: null,
  contentSnap: null,
  hits: [hit({})],
  ...over,
})

describe('recallStatsOf 统计头', () => {
  it('次数 = 分组数（零命中调用计次）；覆盖 = 去重命中条目（身份键去重）', () => {
    const groups = [
      call({ callId: 'c1', hitCount: 2, hits: [hit({}), hit({ entryId: 2, frontmatterId: 'k2', title: '回滚手册', domainPath: '后端' })] }),
      call({ callId: 'c2', verb: 'read-abstract', query: { entryId: 1 }, createdAt: '2026-10-02T08:05:00.000Z' }),
      call({ callId: 'c3', hitCount: 0, hits: [] }),
    ]
    expect(recallStatsOf(groups)).toEqual({ calls: 3, covered: 2 })
  })
  it('重建清引用后清除行按 frontmatterId 归并（不重复计覆盖）', () => {
    const clearedTwice = [
      call({ callId: 'a', hits: [hit({ entryId: null, frontmatterId: 'k1' })] }),
      call({ callId: 'b', hits: [hit({ entryId: null, frontmatterId: 'k1' })] }),
    ]
    expect(recallStatsOf(clearedTwice)).toEqual({ calls: 2, covered: 1 })
  })
  it('空事件 = 正零', () => {
    expect(recallStatsOf([])).toEqual({ calls: 0, covered: 0 })
  })
})

describe('recallHitIdentity 身份键兜底链（entryId → frontmatterId → 标题快照）', () => {
  it('三级兜底全径：e:/f:/t: 前缀区分', () => {
    expect(recallHitIdentity(hit({ entryId: 7 }))).toBe('e:7')
    expect(recallHitIdentity(hit({ entryId: null }))).toBe('f:k1')
    expect(recallHitIdentity(hit({ entryId: null, frontmatterId: null, title: 'A' }))).toBe('t:A')
    expect(recallHitIdentity(hit({ entryId: null, frontmatterId: null, title: null }))).toBe('t:')
  })
})

describe('recallTurnsOf turn 分组投影（一 turn 一卡）', () => {
  const groups: readonly RecallGroup[] = [
    call({
      callId: 'c1',
      verb: 'search',
      query: { text: 'worktree 分支命名规范', domainPrefix: '工程规范/' },
      hitCount: 2,
      createdAt: '2026-11-20T14:32:05.000Z',
      turnSeq: 3,
      triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
      hits: [
        hit({ entryId: 1, score: 0.91 }),
        hit({ entryId: 6, frontmatterId: 'k6', title: '新手指引', domainPath: '', score: 0.72, scope: 'global' }),
      ],
    }),
    call({
      callId: 'c2',
      verb: 'read',
      query: { frontmatterId: 'kb-be-001' },
      createdAt: '2026-11-20T14:32:07.000Z',
      turnSeq: 3,
      triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
      contentSnap: '# API 规范 (kb-be-001, draft, …)',
      hits: [hit({ entryId: 3, frontmatterId: 'kb-be-001', title: 'API 规范', domainPath: '后端' })],
    }),
    call({
      callId: 'c3',
      verb: 'browse',
      query: { domain: '工程规范', offset: 0, limit: 20, order: 'status' },
      hitCount: 2,
      createdAt: '2026-11-20T14:32:09.000Z',
      turnSeq: 3,
      triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
      hits: [
        hit({ entryId: 4, frontmatterId: 'kb-be-002', title: '网关', domainPath: '后端' }),
        hit({ entryId: 5, frontmatterId: 'kb-java-001', title: '并发手册', domainPath: '编程/java', scope: 'global' }),
      ],
    }),
    call({ callId: 'c4', verb: 'search', query: { text: '不存在的主题' }, hitCount: 0, hits: [], createdAt: '2026-11-20T15:00:00.000Z', turnSeq: 4, triggerSnap: '第二轮输入' }),
    call({ callId: 'c9', verb: 'search', query: { keywords: ['不存在'] }, hitCount: 0, hits: [], createdAt: '2026-11-19T09:00:00.000Z', turnSeq: null, triggerSnap: null }),
  ]

  it('卡数 = 去重 turn_seq 数（NULL 归单张未锚卡）；卡序 = turn 降序、未锚殿后', () => {
    const cards = recallTurnsOf(groups)
    expect(cards.map((card) => card.key)).toEqual(['turn:4', 'turn:3', 'turn:null'])
    expect(cards[1]!.turnSeq).toBe(3)
    expect(cards[2]!.turnSeq).toBeNull()
  })
  it('轮内节序 = 调用时序升序；命中总数 = Σ hit_count；scope 徽 = 去重集', () => {
    const card = recallTurnsOf(groups)[1]!
    expect(card.calls.map((group) => group.callId)).toEqual(['c1', 'c2', 'c3'])
    expect(card.hitTotal).toBe(5)
    expect(card.scopes).toEqual(['project', 'global'])
    expect(card.lastAt).toBe('2026-11-20T14:32:09.000Z')
  })
  it('L2 工具统计 = 四动词 canonical 序 ×N', () => {
    expect(recallTurnsOf(groups)[1]!.verbs).toEqual([
      { verb: 'search', count: 1 },
      { verb: 'read', count: 1 },
      { verb: 'browse', count: 1 },
    ])
    expect(recallVerbCountsOf([call({}), call({ callId: 'x', verb: 'read-abstract', query: { entryId: 1 } })])).toEqual([
      { verb: 'search', count: 1 },
      { verb: 'read-abstract', count: 1 },
    ])
  })
  it('top = 轮内首个 verb=read 调用条目名；无 read 调用 = null（不退化 search 命中）', () => {
    expect(recallTurnsOf(groups)[1]!.top).toBe('API 规范')
    expect(recallTurnsOf(groups)[0]!.top).toBeNull()
    expect(recallTopOf([call({ callId: 'a', verb: 'read', query: { frontmatterId: 'x' }, hits: [] })])).toBeNull()
  })
  it('L1 触发输入降级链：trigger_snap → 首个 query text（legacy）→ null', () => {
    expect(recallTurnsOf(groups)[1]!.trigger).toBe('帮我把 worktree 合回 main 的约定整理成知识条目')
    expect(recallTurnsOf(groups)[2]!.trigger).toBeNull()
    const legacy = [call({ callId: 'l', turnSeq: null, query: { text: '旧文本' }, triggerSnap: null })]
    expect(recallTriggerOf(legacy)).toBe('旧文本')
    expect(recallTriggerOf([call({ callId: 'l', turnSeq: null, triggerSnap: null, query: null })])).toBeNull()
  })
  it('零命中轮卡：hitTotal 0、verbs/chips 照常、scopes 空', () => {
    const zero = recallTurnsOf(groups)[0]!
    expect(zero.hitTotal).toBe(0)
    expect(zero.scopes).toEqual([])
    expect(zero.verbs).toEqual([{ verb: 'search', count: 1 }])
  })
  it('空事件 → 空列表', () => {
    expect(recallTurnsOf([])).toEqual([])
  })
})

describe('recallCallHead 函数式调用头（全参实参 · 展示层拼接）', () => {
  it('search：text 空格分词「|」拼接 + domain_prefix + limit（省略的参数不显示）', () => {
    expect(recallCallHead(call({ query: { text: 'worktree 分支命名规范', domainPrefix: '工程规范/', limit: 3 } })))
      .toBe('search("worktree|分支命名规范", domain_prefix="工程规范/", limit=3)')
  })
  it('search：legacy keywords「｜」拼接', () => {
    expect(recallCallHead(call({ query: { keywords: ['部署', '回滚'] } })))
      .toBe('search(keywords="部署｜回滚")')
  })
  it('search：hint 键不入函数头（出参事实归 hint note 行）', () => {
    expect(recallCallHead(call({ query: { text: '词', hint: 'domain "x" was dropped' } })))
      .toBe('search("词")')
  })
  it('read：frontmatterId 锚；缺席降级 entryId；双缺裸动词', () => {
    expect(recallCallHead(call({ verb: 'read', query: { frontmatterId: 'kb-be-001' } }))).toBe('read("kb-be-001")')
    expect(recallCallHead(call({ verb: 'read', query: { entryId: 7 } }))).toBe('read("7")')
    expect(recallCallHead(call({ verb: 'read', query: null }))).toBe('read')
  })
  it('read-abstract：entryId 锚', () => {
    expect(recallCallHead(call({ verb: 'read-abstract', query: { entryId: 2 } }))).toBe('read_abstract("2")')
  })
  it('browse：domain + offset/limit/order 全参（省略不显示）', () => {
    expect(recallCallHead(call({ verb: 'browse', query: { domain: '工程规范', offset: 0, limit: 20, order: 'status' } })))
      .toBe('browse("工程规范", offset=0, limit=20, order="status")')
    expect(recallCallHead(call({ verb: 'browse', query: { domain: '工程规范' } }))).toBe('browse("工程规范")')
  })
  it('recallSearchTextJoin：多空白分词安全（空 token 滤除）', () => {
    expect(recallSearchTextJoin('  a  b   c ')).toBe('a|b|c')
  })
})

describe('recallDatetimeLabel 归因区 LocaleDatetime', () => {
  it('ISO → 本地 YYYY/MM/DD HH:mm:ss；不可解析原文返回', () => {
    const iso = '2026-11-20T14:32:05.000Z'
    const date = new Date(iso)
    const pad = (n: number): string => String(n).padStart(2, '0')
    const expected = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    expect(recallDatetimeLabel(iso)).toBe(expected)
    expect(recallDatetimeLabel('not-a-time')).toBe('not-a-time')
  })
})

describe('recallScoreLabel score 元组', () => {
  it('两位小数；null = 无元组', () => {
    expect(recallScoreLabel(0.91)).toBe('(score 0.91)')
    expect(recallScoreLabel(1)).toBe('(score 1.00)')
    expect(recallScoreLabel(null)).toBeNull()
  })
})
