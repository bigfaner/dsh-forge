// 泳道视图单测 —— AC3：七态横向列（0 计数列折叠为窄头——不可点仅状态+计数）+ 卡片
// （key + 标题 + foot 含 ⏱实际耗时[completed]）+ 卡片点击 → 抽屉回调锚（双载体）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cardFixture } from './task-tab-model.test.js'
import { SwimlaneView } from './swimlane-view.js'

const NOOP = (): void => {}

describe('SwimlaneView（AC3 七态横向列）', () => {
  const pending = cardFixture({ taskId: 'a', localId: '2.1', taskStatus: 'pending', actualDurationMs: undefined, sessionCount: 1 })
  const done = cardFixture({ taskId: 'b', localId: '2.4', taskStatus: 'completed' })

  it('七列按 TASK_STATUSES 行序；列头 = 状态点 + 中文标签 + 计数', () => {
    const html = renderToStaticMarkup(<SwimlaneView cards={[pending, done]} onOpenTask={NOOP} />)
    expect(html).toContain('data-dswf-tt-swim=""')
    expect(html).toContain('data-dswf-tt-col="pending"')
    expect(html).toContain('data-dswf-tt-col="rejected"')
    const pendingAt = html.indexOf('data-dswf-tt-col="pending"')
    const doneAt = html.indexOf('data-dswf-tt-col="completed"')
    const blockedAt = html.indexOf('data-dswf-tt-col="blocked"')
    expect(pendingAt).toBeLessThan(doneAt)
    expect(doneAt).toBeLessThan(blockedAt)
    expect(html).toContain('待处理')
    expect(html).toContain('已完成')
  })

  it('0 计数列折叠为窄头（is-empty 类位 + 仅状态 + 0，无卡片区）', () => {
    const html = renderToStaticMarkup(<SwimlaneView cards={[pending, done]} onOpenTask={NOOP} />)
    expect(html).toContain('data-dswf-tt-col="suspended"')
    const suspendedAt = html.indexOf('data-dswf-tt-col="suspended"')
    const nextAt = html.indexOf('data-dswf-tt-col="skipped"')
    expect(html.slice(suspendedAt, nextAt)).toContain('is-empty')
    expect(html.slice(suspendedAt, nextAt)).not.toContain('data-dswf-tt-card')
  })

  it('卡片 = key + 标题 + foot（类型 + ⏱实际耗时[completed] + ⟞挂接计数）', () => {
    const html = renderToStaticMarkup(<SwimlaneView cards={[pending, done]} onOpenTask={NOOP} />)
    expect(html).toContain('data-dswf-tt-card="b"')
    expect(html).toContain('dswf-tt-card-key')
    expect(html).toContain('2.4')
    expect(html).toContain('⏱ 2h31m')
    expect(html).toContain('⟞2')
    expect(html).toContain('coding-feature')
    // 非 completed 无 ⏱
    const aAt = html.indexOf('data-dswf-tt-card="a"')
    const bAt = html.indexOf('data-dswf-tt-card="b"')
    expect(html.slice(aAt, bAt)).not.toContain('⏱')
  })

  it('卡片双载体：onOpenTask 在场 = 可点 role=button；缺席 = 静态', () => {
    const interactive = renderToStaticMarkup(<SwimlaneView cards={[done]} onOpenTask={NOOP} />)
    expect(interactive).toContain('role="button"')
    const calm = renderToStaticMarkup(<SwimlaneView cards={[done]} />)
    expect(calm).not.toContain('role="button"')
  })

  it('fix 源标 chip（fix 卡）', () => {
    const fixCard = cardFixture({ taskId: 'c', localId: 'fix-1', taskStatus: 'blocked', sourceTask: { slug: 'm2-pipeline', localId: '2.4' } })
    const html = renderToStaticMarkup(<SwimlaneView cards={[fixCard]} onOpenTask={NOOP} />)
    expect(html).toContain('data-dswf-tt-card="c"')
    expect(html).toContain('fix')
  })
})
