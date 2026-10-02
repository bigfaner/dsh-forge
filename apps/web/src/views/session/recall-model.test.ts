// recall-model 单测 —— UF-4 召回 tab 纯投影（3.8）。断言面：
// AC-2（三方一致的 UI 侧 pin）：统计头（次数 = 分组数/覆盖 = 去重命中）+ 分组行（事件折叠
// 计数 = 热度徽章值——事件表 ↔ tab 行 ↔ 卡片热度同源不漂移）；AC-3（索引未命中行级失效）；
// 行序确定性（最近在前）；零命中调用计次不计覆盖；时间标签桶化。
import { describe, expect, it } from 'vitest'
import type { RecallGroup } from '@dsh-forge/contracts'
import {
  isRecallRowStale,
  recallHitIdentity,
  recallRowsOf,
  recallStatsOf,
  recallTimeLabel,
} from './recall-model.js'

/** 事件表镜像夹具（knowledge_recall_logs 行语义 → core sessionRecall 分组产物）：
 *  c1 search 命中 e1/e2（T1）→ c2 read-abstract 命中 e1（T2）→ c3 search 零命中哨兵（T3）
 *  → c4 search 命中已重建清除条目（entryId null，frontmatterId 兜底，T4）。
 *  热度口径 = 按条目使用事件计数（项目级单表）：e1 = 2（c1+c2，与行折叠数一致），
 *  e2 = 1，fm-gone = 3（frontmatter 兜底——含其它会话事件，≠ 本会话折叠数）。 */
const T1 = '2026-10-02T08:00:00.000Z'
const T2 = '2026-10-02T08:05:00.000Z'
const T3 = '2026-10-02T08:10:00.000Z'
const T4 = '2026-10-02T08:20:00.000Z'

const groups: readonly RecallGroup[] = [
  {
    callId: 'c1',
    verb: 'search',
    query: { keywords: ['部署'] },
    hitCount: 2,
    durationMs: 4,
    createdAt: T1,
    hits: [
      { entryId: 1, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 2 },
      { entryId: 2, frontmatterId: 'k2', title: '回滚手册', domainPath: '后端', heat: 1 },
    ],
  },
  {
    callId: 'c2',
    verb: 'read-abstract',
    query: { entryId: 1 },
    hitCount: 1,
    durationMs: 2,
    createdAt: T2,
    hits: [{ entryId: 1, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 2 }],
  },
  {
    callId: 'c3',
    verb: 'search',
    query: { text: '不存在的主题' },
    hitCount: 0,
    durationMs: 3,
    createdAt: T3,
    hits: [],
  },
  {
    callId: 'c4',
    verb: 'search',
    query: { domainPrefix: '后端' },
    hitCount: 1,
    durationMs: 5,
    createdAt: T4,
    hits: [{ entryId: null, frontmatterId: 'fm-gone', title: '已删文档', domainPath: '后端', heat: 3 }],
  },
]

describe('recallStatsOf 统计头（AC-2：与事件表口径一致）', () => {
  it('次数 = 分组数（零命中调用计次）；覆盖 = 去重命中条目（身份键去重）', () => {
    expect(recallStatsOf(groups)).toEqual({ calls: 4, covered: 3 })
  })
  it('空事件（无召回会话）= 正零', () => {
    expect(recallStatsOf([])).toEqual({ calls: 0, covered: 0 })
  })
  it('重建清引用后清除行按 frontmatterId 归并（不重复计覆盖）；清除行与重建新 id 行各计（保守口径同 core hitIdentity）', () => {
    const clearedTwice: readonly RecallGroup[] = [
      {
        ...groups[3]!,
        hits: [{ entryId: null, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 3 }],
      },
      {
        ...groups[3]!,
        hits: [{ entryId: null, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 3 }],
      },
    ]
    expect(recallStatsOf(clearedTwice)).toEqual({ calls: 2, covered: 1 })
    const mixed: readonly RecallGroup[] = [
      ...clearedTwice,
      {
        ...groups[0]!,
        hits: [{ entryId: 9, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 3 }],
      },
    ]
    expect(recallStatsOf(mixed)).toEqual({ calls: 3, covered: 2 }) // e:9 与 f:k1 各一（entryId 优先键）
  })
})

describe('recallRowsOf 分组行投影（按知识折叠）', () => {
  const rows = recallRowsOf(groups)

  it('行数 = 去重命中条目数；跨调用归并一行（e1 = c1+c2 两事件一行）', () => {
    expect(rows).toHaveLength(3)
    const e1 = rows.find((r) => r.entryId === 1)
    expect(e1?.eventCount).toBe(2)
    expect(e1?.title).toBe('部署规范')
    expect(e1?.domainPath).toBe('前端')
  })
  it('动词明细 = verb × 次数折叠且字典序（e1：read-abstract ×1 + search ×1）', () => {
    const e1 = rows.find((r) => r.entryId === 1)
    expect(e1?.verbs).toEqual([
      { verb: 'read-abstract', count: 1 },
      { verb: 'search', count: 1 },
    ])
  })
  it('最近时间 = 该条目最近事件（e1 = T2 非最早）；行序 = 最近在前（fm-gone 行 T4 首位）', () => {
    const e1 = rows.find((r) => r.entryId === 1)
    expect(e1?.lastAt).toBe(T2)
    expect(rows.map((r) => r.key)).toEqual([recallHitIdentity({ entryId: null, frontmatterId: 'fm-gone', title: '已删文档', domainPath: '后端', heat: 0 }), 'e:1', 'e:2'])
  })
  it('AC-2 三方一致 pin：行事件折叠计数 = 热度徽章值（同源不漂移——e1 双事件热 2 / e2 单事件热 1）', () => {
    const e1 = rows.find((r) => r.entryId === 1)
    expect(e1?.eventCount).toBe(2)
    expect(e1?.heat).toBe(2)
    const e2 = rows.find((r) => r.entryId === 2)
    expect(e2?.eventCount).toBe(1)
    expect(e2?.heat).toBe(1)
    const gone = rows.find((r) => r.entryId === null)
    expect(gone?.eventCount).toBe(1)
    expect(gone?.heat).toBe(3) // frontmatter 兜底计数 ≠ 本会话折叠数——热度 = 项目级事件计数（口径注释）
  })
  it('AC-3 行级失效：entryId null 行保留在场（不阻塞列表）且 is-stale 判据成立', () => {
    const gone = rows.find((r) => r.title === '已删文档')
    expect(gone).toBeDefined()
    expect(isRecallRowStale(gone!)).toBe(true)
    expect(rows.filter((r) => r.entryId !== null).every((r) => !isRecallRowStale(r))).toBe(true)
  })
  it('零命中调用不入行（哨兵组 hits 空）', () => {
    expect(rows.some((r) => r.lastAt === T3)).toBe(false)
  })
  it('空事件 → 空行集', () => {
    expect(recallRowsOf([])).toEqual([])
  })
})

describe('recallHitIdentity 身份键兜底链（entryId → frontmatterId → 标题快照）', () => {
  it('三级兜底全径：e:/f:/t: 前缀区分', () => {
    expect(recallHitIdentity({ entryId: 7, frontmatterId: 'k1', title: 'A', domainPath: 'd', heat: 1 })).toBe('e:7')
    expect(recallHitIdentity({ entryId: null, frontmatterId: 'k1', title: 'A', domainPath: 'd', heat: 1 })).toBe('f:k1')
    expect(recallHitIdentity({ entryId: null, frontmatterId: null, title: 'A', domainPath: 'd', heat: 1 })).toBe('t:A')
    expect(recallHitIdentity({ entryId: null, frontmatterId: null, title: null, domainPath: null, heat: 0 })).toBe('t:')
  })
  it('标题快照兜底去重（双 null 同标题 = 同条目）', () => {
    const titleOnly: readonly RecallGroup[] = [
      {
        ...groups[3]!,
        hits: [{ entryId: null, frontmatterId: null, title: '裸文档', domainPath: '', heat: 1 }],
      },
      {
        ...groups[3]!,
        hits: [{ entryId: null, frontmatterId: null, title: '裸文档', domainPath: '', heat: 1 }],
      },
    ]
    expect(recallStatsOf(titleOnly)).toEqual({ calls: 2, covered: 1 })
    expect(recallRowsOf(titleOnly)).toHaveLength(1)
  })
})

describe('recallTimeLabel 时间标签（相对时间桶化）', () => {
  const now = Date.parse('2026-10-02T08:20:30.000Z')
  it('当下桶 = 刚刚；不可解析原文返回', () => {
    expect(recallTimeLabel('2026-10-02T08:20:20.000Z', now)).toBe('刚刚')
    expect(recallTimeLabel('not-a-time', now)).toBe('not-a-time')
  })
  it('分钟/小时/天/月/年桶全径', () => {
    expect(recallTimeLabel('2026-10-02T08:15:00.000Z', now)).toBe('5 分钟前')
    expect(recallTimeLabel('2026-10-02T06:20:00.000Z', now)).toBe('2 小时前')
    expect(recallTimeLabel('2026-09-28T08:20:00.000Z', now)).toBe('4 天前')
    expect(recallTimeLabel('2026-06-02T08:20:00.000Z', now)).toBe('4 个月前')
    expect(recallTimeLabel('2023-10-02T08:20:00.000Z', now)).toBe('3 年前')
  })
})
