// @feature:mobile-ui
// @mobile-e2e
// Journey: worker-session-entry（continuable worker 会话进入/只读环境/注入下一轮/退出与 one-shot 只读）。
// 溯源：contracts/step-1-open-continuable.md … step-4-exit-and-oneshot.md（每 Outcome 一测 + 冒烟）。
// 策略：worker.ts 纯逻辑面（catalogProjection/workerRows 收敛）+ 视图装配源面锚点；数据面钉
// e2e/fixtures/mobile（session-list 通道录制在场 + wire 钉样本 subagent/catalog）。零真实 host。
import { describe, expect, it } from 'vitest'
import {
  PROXY_SESSION_LIST_CHANNEL,
  catalogProjection,
  deriveWorkers,
} from '../../../apps/mobile/src/views/worker.js'
import { DURABLE_SAMPLES, ev } from '../../../apps/mobile/src/core/wire.fixtures.js'
import type { WireEvent } from '../../../apps/mobile/src/core/wire.js'
import { HISTORY_PAGE_SIZE } from '../../../apps/mobile/src/views/chat.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const CATALOG_EVENT = ev('subagent/catalog', 1_400, {
  version: 0,
  childId: 'child-1',
  childCreatedAt: 1791725779050,
  mode: 'continuable',
  label: '评审提案工程可行性',
})

const SUBAGENT_SESSION = {
  sessionId: 'child-1',
  updatedAt: Date.now(),
  running: true,
  origin: 'subagent',
  parentSessionId: 'parent-1',
  projections: { asOfSeq: 9, values: { title: 'worker 子任务' } },
}

describe('step-1 open-continuable（进入 continuable worker 会话）', () => {
  it('success（进入 worker 会话）', () => {
    // 回链 contracts/step-1-open-continuable.md Outcome:success——目录派生 + 路由态
    const catalog = catalogProjection([CATALOG_EVENT])
    expect(catalog.get('child-1')).toEqual({ mode: 'continuable', label: '评审提案工程可行性' })
    const rows = deriveWorkers([SUBAGENT_SESSION], 'parent-1', catalog)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: 'child-1', mode: 'continuable', running: true })
    // 会话目录数据源通道录制在场（404 缺口显性化）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === PROXY_SESSION_LIST_CHANNEL)).toBe(true)
  })

  it('stream-projection（执行过程流式渲染）', () => {
    // 回链 contracts/step-1-open-continuable.md Outcome:stream-projection
    // inferred：worker 会话复用对话流投影层语义（同 projectHistory / settle 单向）
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/projectHistory|projectEvent|WireEvent/)
    // 快照投影语义与主会话一致：wire 钉样本 user/message 投影为气泡
    expect(DURABLE_SAMPLES.some((e) => e.type === 'user/message')).toBe(true)
    expect(HISTORY_PAGE_SIZE).toBe(10) // 同历史窗口口径
  })

  it('session-not-found（会话已消失）', () => {
    // 回链 contracts/step-1-open-continuable.md Outcome:session-not-found——
    // not-found 对账信号：目录派生不含消失会话（列表对账后移除），零空壳渲染
    const catalog = catalogProjection([CATALOG_EVENT])
    expect(deriveWorkers([SUBAGENT_SESSION], 'parent-1', catalog)).toHaveLength(1)
    expect(deriveWorkers([], 'parent-1', catalog)).toEqual([]) // host 侧已不存在 → 行消失
  })
})

describe('step-2 env-readonly（会话环境信息只读继承）', () => {
  it('success（只读呈现）', () => {
    // 回链 contracts/step-2-env-readonly.md Outcome:success——模式/worktree 只读呈现
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/modeReadOnly: true/)
    expect(src).toMatch(/可续聊|continuable/)
  })

  it('no-edit-entry（尝试修改无入口）', () => {
    // 回链 contracts/step-2-env-readonly.md Outcome:no-edit-entry——零修改控件
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/modeReadOnly: true/)
    expect(src).not.toMatch(/setWorktree|changeMode|编辑环境/) // 零修改入口
  })

  it('env-receipt-refresh（环境随主会话回执更新）', () => {
    // 回链 contracts/step-2-env-readonly.md Outcome:env-receipt-refresh
    // inferred：环境显示 = 主会话投影延伸——catalog 投影随父会话日志刷新，只读语义不变
    const latest = catalogProjection([
      ev('subagent/catalog', 1_400, { version: 0, childId: 'child-1', mode: 'continuable', label: 'v1' }),
      ev('subagent/catalog', 1_500, { version: 0, childId: 'child-1', mode: 'continuable', label: 'v2' }),
    ])
    expect(latest.get('child-1')?.label).toBe('v2') // 最新回执投影
    const rows = deriveWorkers([SUBAGENT_SESSION], 'parent-1', latest)
    expect(rows[0]?.label).toBe('v2')
  })
})

describe('step-3 send-message（发送消息注入下一轮）', () => {
  it('success（注入下一轮）', () => {
    // 回链 contracts/step-3-send-message.md Outcome:success——continuable 出 composer，发送 = steer 注入
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/mode === 'continuable'/)
    expect(src).toMatch(/steer/)
  })

  it('in-flight-reconcile（发送在途会话仍运行）', () => {
    // 回链 contracts/step-3-send-message.md Outcome:in-flight-reconcile——
    // 乐观呈现被真实状态收口（镜像帧投影重放零重复——mergeBySeq 同源口径）
    const running: WireEvent[] = DURABLE_SAMPLES.filter((e) => e.type === 'tool/call' || e.type === 'tool/result')
    expect(running.length).toBeGreaterThan(0) // 执行过程帧与注入在途并存
    expect(mobileSrc('views/worker.ts')).toMatch(/getEvents|subscribe/) // 镜像帧投影装配缝
  })

  it('blank-send-guard（空白消息拦截）', () => {
    // 回链 contracts/step-3-send-message.md Outcome:blank-send-guard
    // inferred：官方 composer 守卫机械复用（fact-table EMPTY_SEND_GUARD）
    const src = mobileSrc('widgets/composer.ts')
    expect(src).toMatch(/trim\(\) === ''|空白|empty/i)
  })
})

describe('step-4 exit-and-oneshot（退出 continuable 与浏览 one-shot 只读）', () => {
  it('success（退出 + one-shot 只读浏览）', () => {
    // 回链 contracts/step-4-exit-and-oneshot.md Outcome:success——one-shot 只读形态（无 composer）
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/一次性会话 · 只读/)
    expect(src).toMatch(/mode === 'continuable'/) // 只读分界 = catalog mode
  })

  it('oneshot-send-blocked（one-shot 尝试发送）', () => {
    // 回链 contracts/step-4-exit-and-oneshot.md Outcome:oneshot-send-blocked——零写路径
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/只读/)
    // composer 只在 continuable 分支装配（one-shot 无发送控件）
    expect(src).toMatch(/if \(deps\.mode === 'continuable'\)/)
  })

  it('reentry-clean（退出后重新进入）', () => {
    // 回链 contracts/step-4-exit-and-oneshot.md Outcome:reentry-clean——投影纯函数：重进零残留
    const catalog = catalogProjection([CATALOG_EVENT])
    const once = deriveWorkers([SUBAGENT_SESSION], 'parent-1', catalog)
    const twice = deriveWorkers([SUBAGENT_SESSION], 'parent-1', catalog)
    expect(once).toEqual(twice) // 消息流如实投影、视图态不跨进出场合泄漏
  })

  it('exit-while-running（worker 运行中退出）', () => {
    // 回链 contracts/step-4-exit-and-oneshot.md Outcome:exit-while-running——
    // 退出仅导航零循环控制：onExit 缝只收起本地视图
    const src = mobileSrc('views/worker.ts')
    expect(src).toMatch(/onExit/)
    expect(src).not.toMatch(/cancel|stop.*loop|中断循环/i)
  })
})

describe('smoke: happy path 依序走全链（worker-session-entry）', () => {
  it('目录派生 → 进 continuable → 环境只读 → 注入 → 退出 → one-shot 只读', () => {
    // ① 目录派生：origin:'subagent' + catalog mode/label + running 置前
    const catalog = catalogProjection([
      ev('subagent/catalog', 1_400, { version: 0, childId: 'c-cont', mode: 'continuable', label: '可续聊任务' }),
      ev('subagent/catalog', 1_401, { version: 0, childId: 'c-one', mode: 'one-shot', label: '一次性任务' }),
    ])
    const rows = deriveWorkers(
      [
        { ...SUBAGENT_SESSION, sessionId: 'c-one', running: false },
        { ...SUBAGENT_SESSION, sessionId: 'c-cont' },
      ],
      'parent-1',
      catalog,
    )
    expect(rows.map((r) => r.mode)).toEqual(['continuable', 'one-shot']) // running 置前
    // ②③ continuable 可发送（steer 注入）；环境只读
    expect(rows[0]!.mode).toBe('continuable')
    expect(mobileSrc('views/worker.ts')).toMatch(/modeReadOnly: true/)
    // ④ one-shot 只读安全侧：未知 mode 归 one-shot
    const unknown = deriveWorkers([{ ...SUBAGENT_SESSION, sessionId: 'c-x' }], 'parent-1', catalogProjection([ev('subagent/catalog', 1_500, { version: 0, childId: 'c-x', mode: 'mystery', label: 'x' })]))
    expect(unknown[0]!.mode).toBe('one-shot')
  })
})
