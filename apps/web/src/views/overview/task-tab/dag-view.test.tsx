// DAG 视图单测 —— AC2：SVG 贝塞尔连线 + 箭头 marker（完成边绿）+ 节点（状态点 + 键 +
// 标题 + ⏱实际耗时[completed]）+ 节点点击 → 抽屉回调锚。几何/分层归 dag-layout.test
// （纯函数独立可测）；本面断言渲染组装：defs 双 marker、is-done 边类位、节点内容与
// 双载体、画布尺寸透传、图例。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TaskGraph } from '@dsh-forge/contracts'
import { cardFixture } from './task-tab-model.test.js'
import { DagView } from './dag-view.js'

const NOOP = (): void => {}

function graphOf(edges: readonly { taskId: string; prerequisiteId: string }[], cards: readonly ReturnType<typeof cardFixture>[]): TaskGraph {
  return {
    tasks: [...cards],
    edges: edges.map((e) => ({ ...e, origin: 'manual' as const })),
  }
}

describe('DagView（AC2 SVG 自绘——零第三方库）', () => {
  const done = cardFixture({ taskId: 'a', localId: '2.3', taskStatus: 'completed' })
  const waiting = cardFixture({
    taskId: 'b',
    localId: '2.4',
    taskStatus: 'in_progress',
    actualDurationMs: undefined,
    prerequisites: [{ slug: 'm2-pipeline', localId: '2.3', taskStatus: 'completed' }],
    sourceTask: { slug: 'm2-pipeline', localId: '2.2' },
  })

  it('SVG defs 双箭头 marker（普通 + 完成绿）+ 贝塞尔边 is-done 类位', () => {
    const html = renderToStaticMarkup(
      <DagView cards={[done, waiting]} graph={graphOf([{ taskId: 'b', prerequisiteId: 'a' }], [done, waiting])} onOpenTask={NOOP} />,
    )
    expect(html).toContain('data-dswf-tt-dag=""')
    expect(html).toContain('data-dswf-tt-dagsvg')
    expect(html).toContain('id="dswf-dag-arrow"')
    expect(html).toContain('id="dswf-dag-arrow-done"')
    expect(html).toContain('marker-end="url(#dswf-dag-arrow-done)"')
    expect(html).toContain('dswf-tt-edge is-done')
    expect(html).toContain('d="M') // 贝塞尔路径在场
  })

  it('节点 = 状态点 + localId 键 + 标题 + fix chip + ⏱实际耗时（completed）', () => {
    const html = renderToStaticMarkup(
      <DagView cards={[done, waiting]} graph={graphOf([{ taskId: 'b', prerequisiteId: 'a' }], [done, waiting])} onOpenTask={NOOP} />,
    )
    expect(html).toContain('data-dswf-tt-node="a"')
    expect(html).toContain('data-dswf-tt-node="b"')
    expect(html).toContain('>2.3</span>')
    expect(html).toContain('>2.4</span>')
    expect(html).toContain('tool 半身对接')
    expect(html).toContain('⏱ 2h31m') // completed 节点底行
    expect(html).toContain('data-dswf-tt-node-time')
    expect(html).not.toContain('data-dswf-tt-node-time="b"') // 非 completed 不显
    expect(html).toContain('fix') // fix chip 标
  })

  it('节点双载体：onOpenTask 在场 = 可点 role=button；缺席 = 静态', () => {
    const interactive = renderToStaticMarkup(<DagView cards={[done]} graph={graphOf([], [done])} onOpenTask={NOOP} />)
    expect(interactive).toContain('role="button"')
    const calm = renderToStaticMarkup(<DagView cards={[done]} graph={graphOf([], [done])} />)
    expect(calm).not.toContain('role="button"')
  })

  it('画布尺寸透传（布局宽高内联——可滚动画布）+ 完成节点淡化类位', () => {
    const html = renderToStaticMarkup(
      <DagView cards={[done, waiting]} graph={graphOf([{ taskId: 'b', prerequisiteId: 'a' }], [done, waiting])} onOpenTask={NOOP} />,
    )
    expect(html).toMatch(/data-dswf-tt-dagcanvas=""[^>]*style="[^"]*width:\d+px/)
    expect(html).toContain('dswf-tt-node is-completed')
  })

  it('普通边（前置非 completed）用普通 marker + 无 is-done 类位', () => {
    const a = cardFixture({ taskId: 'a', localId: '1', taskStatus: 'pending' })
    const b = cardFixture({ taskId: 'b', localId: '2', taskStatus: 'pending' })
    const html = renderToStaticMarkup(<DagView cards={[a, b]} graph={graphOf([{ taskId: 'b', prerequisiteId: 'a' }], [a, b])} onOpenTask={NOOP} />)
    expect(html).toContain('marker-end="url(#dswf-dag-arrow)"')
    expect(html).not.toContain('dswf-tt-edge is-done')
  })

  it('图例（前置在上 · 箭头指向后续 + 状态点语义）', () => {
    const html = renderToStaticMarkup(<DagView cards={[done]} graph={graphOf([], [done])} onOpenTask={NOOP} />)
    expect(html).toContain('data-dswf-tt-daglegend')
    expect(html).toContain('前置在上')
  })
})
