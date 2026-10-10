// 任务 2.6 测试 —— sessionLinks（tech-design §Interface 1 sessionLinks + §交互一 S8 注记：
// links ∪ records.session_id 双源分型——SC6③ 数据源，卡片含 taskId；link = 派发会话挂接
// （claim upsert-ignore 写）/ record = 执行会话挂接（submit 记录），同任务同会话双侧参与
// 则两卡并存——分型呈现不做合并解释，§6-24④ 诚实审计）。挂接 pill 查询天然单库（UI 侧
// sessionId → 单工作区解析归 3.x web 面，core 面恒显式 projectId）。
import { afterEach, describe, expect, it } from 'vitest'
import { sessionLinks } from './session-links.js'
import {
  createTasksHarness,
  seedFeature,
  seedLink,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function setup() {
  h ??= createTasksHarness()
  seedFeature(h.db, { slug: 'f1' })
  const a = seedTask(h.db, 'f1', '1.1', { status: 'completed' })
  const b = seedTask(h.db, 'f1', '1.2', { status: 'in_progress' })
  return { a, b }
}

describe('AC5 sessionLinks：links ∪ records 双源分型（卡片含 taskId——SC6③ 数据源）', () => {
  it("link 源（task_session_links）：卡片含 taskId/自然键/标题/状态 + source='link'", async () => {
    const { a } = setup()
    seedLink(h!.db, a, 'dispatch-session')
    const cards = await sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'dispatch-session' })
    expect(cards).toEqual([
      {
        taskId: a,
        slug: 'f1',
        localId: '1.1',
        title: '任务 1.1',
        taskStatus: 'completed',
        sessionId: 'dispatch-session',
        source: 'link',
        claimedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('link 卡携带 claimedAt（D34 ③ 读面加列——l.created_at 受控初值在场；claim 唯一写源同列）', async () => {
    const { a } = setup()
    seedLink(h!.db, a, 'dispatch-session', { createdAt: '2026-02-02T10:00:00.000Z' })
    const cards = await sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'dispatch-session' })
    expect(cards).toHaveLength(1)
    expect(cards[0]!.claimedAt).toBe('2026-02-02T10:00:00.000Z')
  })

  it("record 源卡 claimedAt 缺省（读面加列仅 LINKS_BY_SESSION_SQL——record SQL/既有字段零变化）", async () => {
    const { a } = setup()
    seedRecord(h!.db, a, { verb: 'submit', sessionId: 'exec-session' })
    const cards = await sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'exec-session' })
    expect(cards).toHaveLength(1)
    expect(cards[0]!.source).toBe('record')
    expect(cards[0]!.claimedAt).toBeUndefined()
  })

  it("record 源（task_records.session_id）：执行会话挂接 → source='record'（多任务多记录去重）", async () => {
    const { a, b } = setup()
    seedRecord(h!.db, a, { verb: 'claim', sessionId: 'exec-session' })
    seedRecord(h!.db, a, { verb: 'submit', sessionId: 'exec-session' }) // 同任务同会话多记录 → 单卡
    seedRecord(h!.db, b, { verb: 'claim', sessionId: 'exec-session' })
    const cards = await sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'exec-session' })
    expect(cards.map((c) => [c.taskId, c.source])).toEqual([
      [a, 'record'],
      [b, 'record'],
    ])
  })

  it('同任务同会话双侧参与 → 两卡并存（link + record 分型不合并——SC6③ 双源相异断言面）', async () => {
    const { a } = setup()
    seedLink(h!.db, a, 'both')
    seedRecord(h!.db, a, { verb: 'submit', sessionId: 'both' })
    const cards = await sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'both' })
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.source).sort()).toEqual(['link', 'record'])
    expect(cards.every((c) => c.taskId === a && c.sessionId === 'both')).toBe(true)
  })

  it('无关会话零命中 → 空数组；无挂接库 → 空数组', async () => {
    setup()
    seedLink(h!.db, 't-f1-1.1', 'other')
    await expect(
      sessionLinks({ store: h!.store }, { projectId: h!.projectId, sessionId: 'nobody' }),
    ).resolves.toEqual([])
  })
})
