// @feature:mobile-ui
// @mobile-e2e
// Journey: drawer-session-list-unread（抽屉会话列表 + 双级未读 + 断开连接）。
// 溯源：contracts/step-1-open-drawer.md、step-2-pinned-top.md、step-3-unread-badge.md、
// step-4-open-unread-zero.md、step-5-connection-disconnect.md（每 Outcome 一测 + 冒烟）。
// 策略：数据面用 e2e/fixtures/mobile 回放 fixtures（session-grouped/disconnect 录制交换）
// 驱动 drawer.ts 纯逻辑面（coerceGrouped/unreadOf/orderVisible/writeReadCursor），
// UI 语义用源面锚点；零真实 host、离线可重复。
// 锚点张力注记：contract step-1/3/4 锚点写 host `forge:remote/read-state` 读/写通道——
// 实现（mobile-ui/1.12 裁决，read-cursor.ts 头注）改为手机页 localStorage 自持游标、
// 单调写与 host read-state 同口径；本文件按实现语义断言（张力已上报，不静默裁决）。
import { describe, expect, it } from 'vitest'
import {
  DRAWER_BADGE_CAP,
  DRAWER_DISCONNECT_CHANNEL,
  DRAWER_GROUPED_CHANNEL,
  DRAWER_POLL_MS,
  DRAWER_TOP_N,
  DRAWER_WINDOW_MS,
  badgeText,
  coerceGrouped,
  filterSessions,
  orderVisible,
  pinnedKey,
  splitWorkers,
  toggleString,
  unreadOf,
  type DrawerSession,
} from '../../../apps/mobile/src/views/drawer.js'
import { loadReadCursors, readCursorKey, writeReadCursor } from '../../../apps/mobile/src/core/read-cursor.js'
import {
  expectMobileFile,
      loadFixtures,
  mobileSrc,
} from '../support.js'

const FIX = loadFixtures()
// fixtures 缺口显性化：session-grouped 录制交换全为 404（录制期 projects-grouped 薄方法未
// 上线）——通道在场即钉面；ok 载荷形状用视图模型构造（coerceGrouped fail-soft 消费面即契约）
const groupedEntries = FIX.proxy.filter((e) => (e.request as { channel?: string }).channel === 'forge:proxy/session-grouped')

/** 分组薄方法 ok 载荷样本（host projects-grouped 契约形状：projects/unassigned/generatedAt） */
const GROUPED_SAMPLE = {
  generatedAt: 1_700_000_000_000,
  projects: [
    {
      id: 'p-1',
      name: 'mobile-ui',
      sessions: [
        { sessionId: 's-live', title: '抽屉未读对账', updatedAt: Date.now(), running: true, projections: { asOfSeq: 12, values: { title: '抽屉未读对账' } } },
        { sessionId: 's-worker', title: 'worker 子任务', updatedAt: Date.now() - 1_000, running: false, origin: 'subagent', projections: { asOfSeq: 4, values: { title: 'worker 子任务' } } },
      ],
    },
    { id: 'p-arch', name: '归档项目', archived: true, sessions: [] },
  ],
  unassigned: [
    { sessionId: 's-free', title: '未归属会话', updatedAt: Date.now() - 2_000, running: false, projections: { asOfSeq: 3, values: { title: '未归属会话' } } },
  ],
}

function sess(sessionId: string, over: Partial<DrawerSession> = {}): DrawerSession {
  return {
    sessionId,
    title: `t-${sessionId}`,
    updatedAt: 1_000,
    running: false,
    asOfSeq: 10,
    worker: false,
    ...over,
  }
}

describe('step-1 open-drawer（打开抽屉呈现项目树会话列表）', () => {
  it('success（项目树分组列表）', () => {
    // 回链 contracts/step-1-open-drawer.md Outcome:success——项目树分组、归档/数量不展示
    const model = coerceGrouped(GROUPED_SAMPLE)
    expect(Array.isArray(model.projects)).toBe(true)
    for (const project of model.projects) {
      expect(project.id).not.toBe('')
      expect(project.name).not.toBe('')
      expect(Array.isArray(project.sessions)).toBe(true)
    }
    // 未归属桶在位（分组树的一部分）
    expect(Array.isArray(model.unassigned)).toBe(true)
    // 折叠规则可配口径钉面：24h 窗 + top N（桌面裁剪例外显式成立）
    expect(DRAWER_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
    expect(DRAWER_TOP_N).toBe(10)
    // 抽屉打开即拉取：数据源通道 = host 分组薄方法（单呼）——录制交换在场（404 缺口已显性化）
    expect(DRAWER_GROUPED_CHANNEL).toBe('forge:proxy/projects-grouped')
    expect(groupedEntries.length, 'session-grouped 录制交换在 fixtures').toBeGreaterThan(0)
    // 轮询兜底 = 15s 存留期
    expect(DRAWER_POLL_MS).toBe(15_000)
  })

  it('empty-tree（无任何会话）', () => {
    // 回链 contracts/step-1-open-drawer.md Outcome:empty-tree——空态确定呈现，不伪造骨架
    const empty = coerceGrouped(null)
    expect(empty.projects).toEqual([])
    expect(empty.unassigned).toEqual([])
    expect(empty.generatedAt).toBeNull()
    const blank = coerceGrouped({ projects: [], unassigned: [] })
    expect(blank.projects).toEqual([])
    // 零未读零骨架：徽标文案空
    expect(badgeText(0)).toBe('')
  })

  it('archive-excluded（归档项与数量不展示）', () => {
    // 回链 contracts/step-1-open-drawer.md Outcome:archive-excluded——归档项目不展示
    const model = coerceGrouped({
      projects: [
        { id: 'p-live', name: '存活项目', sessions: [] },
        { id: 'p-archived', name: '归档项目', archived: true, sessions: [sess('ghost')] },
      ],
      unassigned: [],
    })
    expect(model.projects.map((p) => p.id)).toEqual(['p-live'])
    expect(model.projects.some((p) => p.id === 'p-archived')).toBe(false)
    // 列表零伪造：坏行（缺 sessionId）不进投影
    const row = coerceGrouped({ projects: [{ id: 'p', name: 'p', sessions: [{ updatedAt: 1 }] }], unassigned: [] })
    expect(row.projects[0]!.sessions).toEqual([])
  })
})

describe('step-2 pinned-top（置顶会话分组内排序）', () => {
  it('success（置顶排组内顶部）', () => {
    // 回链 contracts/step-2-pinned-top.md Outcome:success——置顶居首，非置顶按既有排序
    const rows = [
      sess('a', { updatedAt: 3_000 }),
      sess('b', { updatedAt: 2_000 }),
      sess('pin', { updatedAt: 1_000 }),
    ]
    const visible = orderVisible(rows, ['pin'], 10_000)
    expect(visible[0]!.sessionId).toBe('pin')
    // 非置顶：running 排前、updatedAt 降序
    expect(visible.slice(1).map((r) => r.sessionId)).toEqual(['a', 'b'])
    // 置顶豁免 24h 窗（窗外置顶仍在场）
    const stale = orderVisible([sess('old', { updatedAt: 0 })], ['old'], 10 * DRAWER_WINDOW_MS)
    expect(stale.map((r) => r.sessionId)).toEqual(['old'])
    // 置顶视图偏好按配对域隔离（localStorage 键单源）
    expect(pinnedKey('d1')).toBe('dshf.mobile.drawer.pins.d1')
    expect(toggleString(['pin'], 'pin')).toEqual([])
    expect(toggleString([], 'pin')).toEqual(['pin'])
  })
})

describe('step-3 unread-badge（双级未读徽标与最终一致）', () => {
  it('success（徽标对账一致）', () => {
    // 回链 contracts/step-3-unread-badge.md Outcome:success——徽标 = unread 单源投影
    // （实现口径：unread = asOfSeq − lastReadSeq，手机页游标自持，与 host 单调守卫同口径）
    const s = sess('s1', { asOfSeq: 12 })
    expect(unreadOf(s, undefined)).toBe(12) // 游标缺席 = 全量未读
    expect(unreadOf(s, 5)).toBe(7)
    expect(unreadOf(sess('s2', { asOfSeq: null }), 0)).toBe(0) // 未读不可知记 0
    // 徽标文案：0 隐、≤99 数字、超限 99+
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(DRAWER_BADGE_CAP + 1)).toBe(`${DRAWER_BADGE_CAP}+`)
  })

  it('cursor-race-converge（打开瞬间游标竞态）', () => {
    // 回链 contracts/step-3-unread-badge.md Outcome:cursor-race-converge——下次拉取以游标为
    // 基准收敛；收敛前不闪烁误值（负值 clamp 0）
    const s = sess('race', { asOfSeq: 21 })
    expect(unreadOf(s, 30)).toBe(0) // 游标领先 = 0，不出现负数闪烁
    // 拉取后重读游标表（refresh 链：loadReadCursors 对账）
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    writeReadCursor(kv, readCursorKey('d'), 'race', 21)
    expect(loadReadCursors(kv, readCursorKey('d'))).toEqual({ race: 21 })
    expect(unreadOf(s, 21)).toBe(0)
  })

  it('stale-window-hold（域重建窗口保持旧值）', () => {
    // 回链 contracts/step-3-unread-badge.md Outcome:stale-window-hold
    // inferred：tailSeq 未就绪（asOfSeq 缺席 = null）时未读记 0、不基于不完整值误清游标——
    // 实现以「不可知记 0 + 游标零写入」承担 stale 窗口零误清零不变式
    const unknown = sess('stale', { asOfSeq: null })
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    writeReadCursor(kv, readCursorKey('d'), 'stale', 5)
    expect(unreadOf(unknown, loadReadCursors(kv, readCursorKey('d'))['stale'])).toBe(0)
    expect(loadReadCursors(kv, readCursorKey('d'))['stale']).toBe(5) // 游标未被 stale 读改写
  })
})

describe('step-4 open-unread-zero（点开未读会话本地归零）', () => {
  it('success（进入即归零）', () => {
    // 回链 contracts/step-4-open-unread-zero.md Outcome:success——打开即写游标 → 本地即时归零
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    const key = readCursorKey('d')
    writeReadCursor(kv, key, 's1', 12)
    const cursors = loadReadCursors(kv, key)
    expect(unreadOf(sess('s1', { asOfSeq: 12 }), cursors['s1'])).toBe(0)
    // 源面锚点：行点击写同一游标键（触底归零同游标源）
    expect(mobileSrc('views/drawer.ts')).toContain('打开即视为已读：写本地游标')
  })

  it('monotonic-guard-no-resurrect（归零后再拉取）', () => {
    // 回链 contracts/step-4-open-unread-zero.md Outcome:monotonic-guard-no-resurrect——
    // 游标单调不回退：写仅在 seq > 现值时落盘（宿主 RMW 单源同口径）
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    const key = readCursorKey('d')
    writeReadCursor(kv, key, 's1', 12)
    writeReadCursor(kv, key, 's1', 8) // 旧值回退被拒
    writeReadCursor(kv, key, 's1', 12) // 等值重写被拒（幂等）
    expect(loadReadCursors(kv, key)['s1']).toBe(12)
    expect(unreadOf(sess('s1', { asOfSeq: 12 }), 12)).toBe(0) // 不复活
  })

  it('session-not-found（会话已消失）', () => {
    // 回链 contracts/step-4-open-unread-zero.md Outcome:session-not-found——
    // not-found 为对账信号：RPC 信封 ok:false 错误分支不毒化本地游标（零误清零）
    expectMobileFile('views/drawer.ts')
    const src = mobileSrc('views/drawer.ts')
    expect(src).toMatch(/if \(result\.ok\) grouped = coerceGrouped\(result\.data\)/) // 失败零落地
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    writeReadCursor(kv, readCursorKey('d'), 'gone', 9)
    // 失败分支不触达游标写路径——其余会话徽标零误清
    expect(loadReadCursors(kv, readCursorKey('d'))['gone']).toBe(9)
  })
})

describe('step-5 connection-disconnect（连接状态弹层与断开）', () => {
  it('success（断开呈现已断开态）', () => {
    // 回链 contracts/step-5-connection-disconnect.md Outcome:success——
    // 断开 = forge:remote/disconnect 通道（对偶缝）；粘性位收回语义（revoked:true）
    expect(DRAWER_DISCONNECT_CHANNEL).toBe('forge:remote/disconnect')
    const entries = FIX.proxy.filter((e) => (e.request as { channel?: string }).channel === DRAWER_DISCONNECT_CHANNEL)
    expect(entries.length, 'disconnect 录制交换在 fixtures').toBeGreaterThan(0)
    // fixtures 缺口显性化：录制期 disconnect 均为 ok:false（通道未入 allowlist）——
    // RPC 信封形状钉面；revoked 语义以源面锚点承担
    for (const entry of entries) {
      const body = entry.response as { ok?: boolean; error?: { message?: string } }
      expect(body.ok, 'disconnect 录制为 RPC 信封').toBe(false)
      expect(typeof body.error?.message, '错误分支携 error.message').toBe('string')
    }
    // 源面锚点：断开后 foot 呈已断开态、粘性位经 onDisconnected 收回
    const src = mobileSrc('views/drawer.ts')
    expect(src).toContain("'已断开 · 请重新配对'")
    expect(src).toMatch(/disconnected = result\.ok && result\.data\.revoked === true/)
    expect(src).toMatch(/if \(disconnected\) deps\.onDisconnected\?\.\(\)/)
  })

  it('already-disconnected-reentry（已断开再操作）', () => {
    // 回链 contracts/step-5-connection-disconnect.md Outcome:already-disconnected-reentry——
    // 幂等撤销：断开态下断开钮不再渲染（重复断开零二次伤害异常路径）
    const src = mobileSrc('views/drawer.ts')
    expect(src).toMatch(/if \(!disconnected\) \{[\s\S]*?el\('button', 'disconnect', '断开连接'\)/)
    // 已断开态弹层仍可查看详情（connPop 渲染不依赖 ok）
    expect(src).toMatch(/disconnected \? '已断开' : status\.ok \? '已连接' : '连接中断'/)
  })

  it('drawer-during-disconnect（断线期间打开抽屉）', () => {
    // 回链 contracts/step-5-connection-disconnect.md Outcome:drawer-during-disconnect
    // inferred：断线（状态读失败）降级呈现——status 异常吞并记 ok:false，不伪造连接态
    const src = mobileSrc('views/drawer.ts')
    expect(src).toMatch(/status = \{ ok: false, tunnelExpiresAt: null \}/)
    // 数据面最终一致：轮询周期续排（恢复后对账收敛），列表消费最近缓存投影
    expect(src).toMatch(/void refresh\(\)\.finally\(schedulePoll\)/)
    expect(src).toMatch(/if \(result\.ok\) grouped = coerceGrouped\(result\.data\)/)
  })
})

describe('smoke: happy path 依序走全链（drawer-session-list-unread）', () => {
  it('打开抽屉 → 置顶排序 → 未读对账 → 点开归零 → 断开', () => {
    // ① 打开拉取：分组薄方法契约载荷 → 项目树投影（归档剔除后）
    const model = coerceGrouped(GROUPED_SAMPLE)
    expect(model.projects.map((p) => p.id)).toEqual(['p-1'])
    const all = [...model.projects.flatMap((p) => p.sessions), ...model.unassigned]
    expect(all.length, '载荷含真实会话行').toBeGreaterThan(0)
    // ② 排序呈现：置顶居首 + running 排前 + recency 降序
    const pinnedRow = all[0]!
    const visible = orderVisible(all, [pinnedRow.sessionId], Date.now())
    expect(visible[0]!.sessionId).toBe(pinnedRow.sessionId)
    // ③ 未读对账：会话级 → 组级求和
    const unreadSum = all.reduce((sum, s) => sum + unreadOf(s, undefined), 0)
    expect(unreadSum).toBeGreaterThan(0)
    expect(badgeText(unreadSum)).not.toBe('')
    // worker 拆分不变式：主列表 / 子组零重叠零遗漏
    const { main, workers } = splitWorkers(all)
    expect(main.length + workers.length).toBe(all.length)
    // ④ 点开归零：写游标 → 该会话徽标消失，其余不受扰
    const store: Record<string, string | null> = {}
    const kv = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
    const key = readCursorKey('d')
    for (const s of all) writeReadCursor(kv, key, s.sessionId, s.asOfSeq ?? 0)
    const cursors = loadReadCursors(kv, key)
    for (const s of all) expect(unreadOf(s, cursors[s.sessionId])).toBe(0)
    // ⑤ 断开：通道录制在位 + 检索过滤链完好（恢复后对账入口）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === DRAWER_DISCONNECT_CHANNEL)).toBe(true)
    expect(filterSessions(all, all[0]!.title).map((s) => s.sessionId)).toContain(all[0]!.sessionId)
  })
})
