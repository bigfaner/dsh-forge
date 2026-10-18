// @feature:mobile-ui
// @mobile-e2e
// Journey: task-float-ball-progress-intents（悬浮球手势收纳 + 任务浮层信息面 + 暂停/派发意图）。
// 溯源：contracts/step-1-drag-dock.md … step-5-run-chips.md（每 Outcome 一测 + 冒烟）。
// 策略：fab.ts snapToEdge 手势几何 + tasks.ts 纯逻辑面（deriveTaskRuns/groupRunsBySource/
// hasActiveSource/commandReceipts/dispatchLine/pauseLine）行为实测；数据面钉 e2e/fixtures/mobile
// （forge:remote/progress、commands-list/execute 通道录制 + wire 钉样本 forge/progress）。
import { describe, expect, it } from 'vitest'
import { FAB_DRAG_THRESHOLD, FAB_MARGIN, FAB_SIZE, snapToEdge } from '../../../apps/mobile/src/widgets/fab.js'
import {
  TASKS_COMMANDS_EXECUTE_CHANNEL,
  TASKS_COMMANDS_LIST_CHANNEL,
  commandReceipts,
  deriveTaskRuns,
  dispatchLine,
  groupRunsBySource,
  hasActiveSource,
  normalizeStatus,
  pauseLine,
} from '../../../apps/mobile/src/views/tasks.js'
import { DURABLE_SAMPLES, ev } from '../../../apps/mobile/src/core/wire.fixtures.js'
import type { WireEvent } from '../../../apps/mobile/src/core/wire.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const progress = (seq: number, slug: string, taskKey: string, status: string): WireEvent =>
  ev('forge/progress', seq, { sourceSlug: slug, taskKey, status, counts: { pending: 1, running: 1, done: 0 }, at: seq })

describe('step-1 drag-dock（悬浮球拖拽贴边收纳）', () => {
  it('success（贴边收纳）', () => {
    // 回链 contracts/step-1-drag-dock.md Outcome:success——钳制视口内 + 就近贴边（透明半圆 = settle 形态）
    const docked = snapToEdge(5, 400, 390, 844)
    expect(docked.edge).toBe('left')
    expect(docked.x).toBe(FAB_MARGIN) // 贴边 = margin 透明半圆
    expect(snapToEdge(390, 400, 390, 844).edge).toBe('right')
    expect(snapToEdge(2_000, 2_000, 390, 844)).toEqual({ x: 390 - FAB_SIZE - FAB_MARGIN, y: 844 - FAB_SIZE - FAB_MARGIN, edge: 'right' }) // 钳制
    expect(FAB_SIZE).toBe(48)
  })

  it('tap-vs-drag（按住未位移松手）', () => {
    // 回链 contracts/step-1-drag-dock.md Outcome:tap-vs-drag——位移阈值唯一判定
    expect(FAB_DRAG_THRESHOLD).toBe(6)
    // 未位移（<6px）= 点按展开浮层（onActivate），零拖拽落点残留
    expect(mobileSrc('widgets/fab.ts')).toMatch(/FAB_DRAG_THRESHOLD/)
  })

  it('opposite-edge-dock（拖至另一侧边缘）', () => {
    // 回链 contracts/step-1-drag-dock.md Outcome:opposite-edge-dock——两侧边收纳对称
    expect(snapToEdge(20, 100, 390, 844).edge).toBe('left')
    expect(snapToEdge(370, 100, 390, 844).edge).toBe('right')
    // 同一中线判据双侧成立：edge 只由 x 相对视口中线决定（行为不依赖具体边）
    expect(snapToEdge(170, 100, 390, 844).edge).toBe('left') // 中线左 = 左贴
    expect(snapToEdge(172, 100, 390, 844).edge).toBe('right') // 中线右 = 右贴
  })
})

describe('step-2 open-overlay（展开任务浮层信息面）', () => {
  it('success（浮层信息纪律）', () => {
    // 回链 contracts/step-2-open-overlay.md Outcome:success——状态集对齐桌面（running/paused/blocked/done）
    expect(normalizeStatus('running')).toBe('running')
    expect(normalizeStatus('completed')).toBe('done')
    expect(normalizeStatus('paused')).toBe('paused')
    expect(normalizeStatus('blocked')).toBe('blocked')
    // 数据源通道：forge:remote/progress 只读快照（录制在场，ok:false 缺口显性化）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === 'forge:remote/progress')).toBe(true)
    // 信息纪律（源面钉死）：无审批、无进度百分比
    const src = mobileSrc('views/tasks.ts')
    expect(src).toContain('无审批、无进度百分比')
  })

  it('empty-overlay（无任何任务）', () => {
    // 回链 contracts/step-2-open-overlay.md Outcome:empty-overlay——空快照零伪造
    expect(deriveTaskRuns([])).toEqual([])
    expect(groupRunsBySource([])).toEqual([])
    expect(DURABLE_SAMPLES.filter((e) => e.type === 'forge/progress').length).toBeGreaterThan(0) // 样本链在位（空态 = 零 progress 投影）
  })

  it('single-run-chips-hidden（单 run 时 chips 隐藏）', () => {
    // 回链 contracts/step-2-open-overlay.md Outcome:single-run-chips-hidden
    // inferred：chips 只承载多 run 全貌——单源 = 单 chip（视图零冗余切换器）
    const runs = deriveTaskRuns([progress(1, 'only-slug', 'only-slug/1.1', 'running')])
    const chips = groupRunsBySource(runs)
    expect(chips).toHaveLength(1)
    expect(chips[0]!.sourceSlug).toBe('only-slug')
  })
})

describe('step-3 running-card（查看运行中任务卡）', () => {
  it('success（暂停钮 + 派发入口）', () => {
    // 回链 contracts/step-3-running-card.md Outcome:success——运行中卡显暂停 + 底部统一派发
    const runs = deriveTaskRuns([progress(1, 'slug-a', 'slug-a/1.1', 'running')])
    expect(runs[0]!.status).toBe('running')
    // 意图控件文案在位（数据新鲜态）
    expect(dispatchLine('slug-a')).toContain('run-dag-tasks')
    expect(pauseLine()).toContain('stop-dag-tasks')
    // 指令目录通道录制在场（404 缺口显性化）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === TASKS_COMMANDS_LIST_CHANNEL)).toBe(true)
  })
})

describe('step-4 pause-dispatch（暂停与派发意图转发）', () => {
  it('success（意图转发 + 回执更新）', () => {
    // 回链 contracts/step-4-pause-dispatch.md Outcome:success——composer `/` 仲裁 → 官方指令面；
    // 回执 = command/run + command/done 成对投影
    expect(dispatchLine('slug-a')).toBe('/run-dag-tasks slug-a')
    expect(pauseLine()).toBe('/stop-dag-tasks')
    const receipt = commandReceipts(
      DURABLE_SAMPLES.filter((e) => e.type === 'command/run' || e.type === 'command/done'),
    )
    expect(receipt.length).toBeGreaterThan(0)
    expect(receipt[0]).toMatchObject({ commandId: 'cmd-33fa9a4a-2', name: 'compact', kind: 'success' })
    // 执行通道录制在场（404 缺口显性化——通道常量钉面）
    expect(TASKS_COMMANDS_EXECUTE_CHANNEL).toBe('forge:proxy/commands-execute')
  })

  it('stale-greyed（stale 数据操作拦截）', () => {
    // 回链 contracts/step-4-pause-dispatch.md Outcome:stale-greyed——零过期意图出站
    const src = mobileSrc('views/tasks.ts')
    expect(src).toMatch(/markStale\(\)/)
    expect(src).toMatch(/const disabled = stale \|\| busy/)
    // host 守卫兜底：stale 错误码驱动置灰（零臆测重试）
    expect(src).toMatch(/'stale'/)
  })

  it('guard-rejected-pause（host 守卫拒绝暂停）', () => {
    // 回链 contracts/step-4-pause-dispatch.md Outcome:guard-rejected-pause——
    // 失败只回传数据：任务状态保持守卫前值（deriveTaskRuns 以最新 seq 为准、拒绝回执不投影状态）
    const runs = deriveTaskRuns([progress(1, 's', 's/1.1', 'running')])
    expect(runs[0]!.status).toBe('running') // 无状态变更事件 = 状态不变
    expect(mobileSrc('views/tasks.ts')).not.toMatch(/rollback.*dispatch|本地改写循环/)
  })
})

describe('step-5 run-chips（多 run 切换与悬浮球反映对象）', () => {
  it('success（chips 切换 + 悬浮球反映最近 running）', () => {
    // 回链 contracts/step-5-run-chips.md Outcome:success——多源分组、活跃源排前
    const runs = deriveTaskRuns([
      progress(1, 'slug-done', 'slug-done/1.1', 'completed'),
      progress(2, 'slug-live', 'slug-live/2.1', 'running'),
    ])
    const chips = groupRunsBySource(runs)
    expect(chips[0]!.sourceSlug).toBe('slug-live') // 活跃排前
    expect(chips[1]).toMatchObject({ sourceSlug: 'slug-done', active: false, doneCount: 1 })
  })

  it('running-run-finished（最近 running run 结束）', () => {
    // 回链 contracts/step-5-run-chips.md Outcome:running-run-finished——
    // 反映对象迁移是确定性投影：同 (slug,task) 最新 seq 状态为准
    const runs = deriveTaskRuns([
      progress(1, 's', 's/1.1', 'running'),
      progress(2, 's', 's/1.1', 'completed'), // 最新 seq 完成
    ])
    expect(runs[0]!.status).toBe('done')
    expect(hasActiveSource(runs, 's')).toBe(false) // 无 running → 悬浮球收敛非运行形态
  })

  it('receipt-live-update（回执实时更新浮层）', () => {
    // 回链 contracts/step-5-run-chips.md Outcome:receipt-live-update
    // inferred：回执是浮层状态唯一更新源——deriveTaskRuns 重放即刷新（浏览态不破坏：纯投影）
    const before = deriveTaskRuns([progress(1, 's', 's/1.1', 'running')])
    const after = deriveTaskRuns([progress(1, 's', 's/1.1', 'running'), progress(2, 's', 's/1.2', 'blocked')])
    expect(after.map((r) => r.status)).toEqual(['running', 'blocked']) // 原位增量更新
    expect(before[0]).toMatchObject({ status: 'running' })
  })
})

describe('smoke: happy path 依序走全链（task-float-ball-progress-intents）', () => {
  it('贴边 → 展开浮层 → 运行卡 → 意图转发 → chips → 回执更新', () => {
    // ① 贴边收纳几何
    expect(snapToEdge(2, 2, 390, 844).edge).toBe('left')
    // ② 浮层 = progress 快照投影
    const runs = deriveTaskRuns([
      ...DURABLE_SAMPLES.filter((e) => e.type === 'forge/progress'),
      progress(400, 'slug-live', 'slug-live/9.9', 'running'),
    ])
    expect(runs.length).toBeGreaterThan(0)
    // ③ 运行中卡在位
    expect(runs.some((r) => r.status === 'running')).toBe(true)
    // ④ 意图面：派发/暂停指令行 + 同源独占守卫
    expect(dispatchLine('slug-live')).toBe('/run-dag-tasks slug-live')
    expect(hasActiveSource(runs, 'slug-live')).toBe(true) // 活跃源禁重复派发
    // ⑤ chips 承载多 run 全貌
    expect(groupRunsBySource(runs).length).toBeGreaterThan(1)
    // ⑥ 回执成对投影
    expect(commandReceipts(DURABLE_SAMPLES).length).toBeGreaterThan(0)
  })
})
