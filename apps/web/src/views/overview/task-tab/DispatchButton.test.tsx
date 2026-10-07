// 派发按钮单测 —— AC3/AC4：nonTerminalOf 终态判定驱动的亮起/置灰（v24：亮起与其它按钮
// 同款式·置灰 = 深灰实底 + tooltip）+ dispatchCommandOf 单行指令模板（4.1 前缀消费）+
// latestDispatchSessionOf（link 源末位 = 最新派发挂接）+ dispatchRouteOf 双路由分支
// （执行中在场+有挂接 → jump 不新建不重发；否则 new + 容器对应模式 + 指令单行）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionTaskLinkCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import {
  DISPATCH_ACTIVE_TITLE,
  DISPATCH_DISABLED_TITLE,
  DISPATCH_PENDING_TITLE,
  DispatchButton,
  dispatchCommandOf,
  dispatchRouteOf,
  latestDispatchSessionOf,
} from './DispatchButton.js'

const NOOP = (): void => {}

function statsOf(byStatus: Partial<Record<TaskStatus, number>>): TaskStats {
  const full = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<
    TaskStatus,
    number
  >
  for (const status of Object.keys(full) as TaskStatus[]) full[status] = byStatus[status] ?? 0
  const total = (Object.values(full) as number[]).reduce((a, b) => a + b, 0)
  return { total, byStatus: full, unmetPending: 0 }
}

function link(taskId: string, sessionId: string, source: 'link' | 'record'): SessionTaskLinkCard {
  return {
    taskId,
    slug: 'm2-pipeline',
    localId: taskId.replace('t-', ''),
    title: `任务 ${taskId}`,
    taskStatus: 'in_progress',
    sessionId,
    source,
  }
}

describe('DispatchButton 渲染面（AC3——stats 单源判定 + v24 视觉）', () => {
  it('未终态在场（pending/in_progress/blocked/suspended 任一）→ 亮起可点（同款式 is-on + 无 disabled）', () => {
    for (const status of ['pending', 'in_progress', 'blocked', 'suspended'] as const) {
      const markup = renderToStaticMarkup(<DispatchButton stats={statsOf({ [status]: 1 })} onDispatch={NOOP} />)
      expect(markup).toContain('data-dswf-tt-dispatch="on"')
      expect(markup).toContain('>派发</button>')
      expect(markup).not.toContain('disabled')
      expect(markup).toContain(DISPATCH_ACTIVE_TITLE)
    }
  })

  it('全终态（completed/skipped/rejected）→ 置灰不可点（深灰实底 is-off + spec tooltip）', () => {
    const markup = renderToStaticMarkup(
      <DispatchButton stats={statsOf({ completed: 2, skipped: 1, rejected: 1 })} onDispatch={NOOP} />,
    )
    expect(markup).toContain('data-dswf-tt-dispatch="off"')
    expect(markup).toContain('disabled')
    expect(markup).toContain(DISPATCH_DISABLED_TITLE)
    expect(markup).toContain('is-off')
  })

  it('终态混合未终态 → 亮起（判据 = 存在未终态，非全未终态）', () => {
    const markup = renderToStaticMarkup(
      <DispatchButton stats={statsOf({ completed: 3, pending: 1 })} onDispatch={NOOP} />,
    )
    expect(markup).toContain('data-dswf-tt-dispatch="on"')
  })

  it('stats 缺席（装载在途）→ 置灰 + 装载中 tooltip（不以全终态口径误导）', () => {
    const markup = renderToStaticMarkup(<DispatchButton stats={undefined} onDispatch={NOOP} />)
    expect(markup).toContain('data-dswf-tt-dispatch="off"')
    expect(markup).toContain('disabled')
    expect(markup).toContain(DISPATCH_PENDING_TITLE)
  })

  it('零任务容器 → 置灰（无可派发）', () => {
    const markup = renderToStaticMarkup(<DispatchButton stats={statsOf({})} onDispatch={NOOP} />)
    expect(markup).toContain('data-dswf-tt-dispatch="off"')
  })
})

describe('dispatchCommandOf（AC4——v23 单行最小消息·4.1 前缀消费）', () => {
  it('「/run-tasks <容器标识>」单行（feature/突击提案容器同构）', () => {
    expect(dispatchCommandOf('dsh-forge-m2-pipeline')).toBe('/run-tasks dsh-forge-m2-pipeline')
    expect(dispatchCommandOf('legacy-eval-retire')).toBe('/run-tasks legacy-eval-retire')
  })
})

describe('latestDispatchSessionOf（AC4——最新派发挂接：link 源末位）', () => {
  it('link ∪ record 双源分型中取 link 源末位（最新 claim upsert）；零 link = undefined', () => {
    const sessions = [
      link('t-2.4', 's-exec-1', 'record'),
      link('t-2.4', 's-dispatch-1', 'link'),
      link('t-2.4', 's-exec-2', 'record'),
      link('t-2.4', 's-dispatch-2', 'link'),
    ]
    expect(latestDispatchSessionOf(sessions)?.sessionId).toBe('s-dispatch-2')
    expect(latestDispatchSessionOf([link('t-2.4', 's-exec-1', 'record')])).toBeUndefined()
    expect(latestDispatchSessionOf([])).toBeUndefined()
  })
})

describe('dispatchRouteOf（AC4 双路由分支）', () => {
  it('执行中在场 + 最新派发挂接在场 → jump（sessionId + 任务自然键；不新建不重发不切模式）', () => {
    const route = dispatchRouteOf({
      runningTask: { taskId: 't-2.4', slug: 'm2-pipeline', localId: '2.4' },
      latestDispatchSession: { sessionId: 's-dispatch-2' },
      containerMode: 'expedition',
      containerSlug: 'm2-pipeline',
    })
    expect(route).toEqual({ kind: 'jump', sessionId: 's-dispatch-2', taskKey: 'm2-pipeline/2.4' })
  })

  it('无执行中任务 → new：容器对应模式 + 指令单行（feature → 远征）', () => {
    const route = dispatchRouteOf({
      containerMode: 'expedition',
      containerSlug: 'm2-pipeline',
    })
    expect(route).toEqual({ kind: 'new', mode: 'expedition', command: '/run-tasks m2-pipeline' })
  })

  it('无执行中任务 → new：突击提案容器 → 突击模式', () => {
    const route = dispatchRouteOf({
      containerMode: 'blitz',
      containerSlug: 'legacy-eval-retire',
    })
    expect(route).toEqual({ kind: 'new', mode: 'blitz', command: '/run-tasks legacy-eval-retire' })
  })

  it('执行中在场但零派发挂接（人工置 in_progress 等）→ new（无在场派发循环——不空跳）', () => {
    const route = dispatchRouteOf({
      runningTask: { taskId: 't-2.4', slug: 'm2-pipeline', localId: '2.4' },
      containerMode: 'expedition',
      containerSlug: 'm2-pipeline',
    })
    expect(route).toEqual({ kind: 'new', mode: 'expedition', command: '/run-tasks m2-pipeline' })
  })
})
