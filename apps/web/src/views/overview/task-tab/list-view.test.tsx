// 列表视图单测 —— AC1 两行布局：主行（ID[localId] + 标题 + 中文状态 tag + ⋯）+ 副行
// （类型/优先级/实际耗时[completed]/前置/挂接/fix 源标）；分组标签（执行中/其余）；
// 行点击 = onOpenTask 抽屉回调（交互锚 + 双载体——回调缺席非交互呈现）；⋯ 菜单行集
// （查看详情 + 转移预设）。渲染面 = renderToStaticMarkup（点击链 = 4.1/5.2 e2e）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TASK_STATUSES } from '@dsh-forge/contracts'
import { cardFixture } from './task-tab-model.test.js'
import { ListViewBody, rowMenuItems, rowMenuSelect } from './list-view.js'

const NOOP = (): void => {}

const base = {
  menuTaskId: null,
  onMenuOpenChange: NOOP,
}

describe('ListViewBody（AC1 两行布局）', () => {
  it('主行 = localId 键 + 标题 + 中文状态 tag + ⋯；副行 = 承重字段 · 连接', () => {
    const html = renderToStaticMarkup(
      <ListViewBody
        {...base}
        cards={[
          cardFixture({
            sourceTask: { slug: 'm2-pipeline', localId: '2.2' },
          }),
        ]}
        onOpenTask={NOOP}
        onTransition={NOOP}
      />,
    )
    expect(html).toContain('data-dswf-tt-item="t-1"')
    expect(html).toContain('dswf-tt-key')
    expect(html).toContain('>2.4</span>')
    expect(html).toContain('tool 半身对接')
    expect(html).toContain('已完成')
    expect(html).toContain('data-dswf-tt-more="t-1"')
    expect(html).toContain('data-dswf-tt-sub="t-1"')
    expect(html).toContain('coding-feature · P0 · 实际耗时 2h31m · ←1 前置 · ⟞2 挂接 · fix→2.2')
  })

  it('状态 tag 中文标签 + 状态点（StateDot 语义色）；标题悬浮全键 title', () => {
    const html = renderToStaticMarkup(
      <ListViewBody {...base} cards={[cardFixture({ taskStatus: 'blocked' })]} onOpenTask={NOOP} />,
    )
    expect(html).toContain('阻塞')
  })

  it('分组标签：执行中（N）在前 + 其余（两组均在才显「其余」）', () => {
    const html = renderToStaticMarkup(
      <ListViewBody
        {...base}
        cards={[
          cardFixture({ taskId: 'a', localId: '1', taskStatus: 'pending' }),
          cardFixture({ taskId: 'b', localId: '2', taskStatus: 'in_progress' }),
        ]}
        onOpenTask={NOOP}
      />,
    )
    expect(html).toContain('执行中（1）')
    expect(html).toContain('其余')
    const aAt = html.indexOf('data-dswf-tt-item="a"')
    const bAt = html.indexOf('data-dswf-tt-item="b"')
    expect(bAt).toBeLessThan(aAt) // 执行中组前置
  })

  it('行卡双载体：onOpenTask 在场 = 可点 role=button（键盘可达）；缺席 = 静态呈现无 ⋯', () => {
    const interactive = renderToStaticMarkup(<ListViewBody {...base} cards={[cardFixture()]} onOpenTask={NOOP} />)
    expect(interactive).toContain('role="button"')
    expect(interactive).toContain('tabindex="0"')
    expect(interactive).toContain('data-dswf-tt-more')
    const calm = renderToStaticMarkup(<ListViewBody {...base} cards={[cardFixture()]} />)
    expect(calm).not.toContain('role="button"')
    expect(calm).not.toContain('data-dswf-tt-more')
  })

  it('选中行高亮类位（activeTaskId = 抽屉开着的任务）', () => {
    const html = renderToStaticMarkup(
      <ListViewBody {...base} cards={[cardFixture()]} activeTaskId="t-1" onOpenTask={NOOP} />,
    )
    expect(html).toContain('dswf-tt-item is-open')
  })

  it('全键 title（slug/localId 自然键呈现约定——身份双轨）', () => {
    const html = renderToStaticMarkup(<ListViewBody {...base} cards={[cardFixture()]} onOpenTask={NOOP} />)
    expect(html).toContain('title="m2-pipeline/2.4')
  })
})

describe('rowMenuItems（⋯ 行动作菜单行集）', () => {
  it('查看详情 + 转移预设（七态 − 当前态，from≠to 机械排除）；onTransition 缺席 = 仅查看详情', () => {
    const card = cardFixture({ taskStatus: 'in_progress' })
    const full = rowMenuItems(card, { onTransition: true })
    const ids = full.map((entry) => entry.id)
    expect(ids[0]).toBe(`open:${card.taskId}`)
    const transitions = ids.filter((id) => id.startsWith('trans:'))
    expect(transitions).toHaveLength(TASK_STATUSES.length - 1)
    expect(transitions).not.toContain(`trans:t-1:in_progress`)
    const calm = rowMenuItems(card, { onTransition: false })
    expect(calm.map((entry) => entry.id)).toEqual([`open:${card.taskId}`])
  })
})

describe('rowMenuSelect（菜单行 id → 动作派发映射）', () => {
  it('open:taskId → onOpenTask；trans:taskId:status → onTransition；未知 id = 无派发', () => {
    const opened: string[] = []
    const transitions: { taskId: string; toStatus: string }[] = []
    rowMenuSelect('open:t-9', {
      onOpenTask: (taskId) => {
        opened.push(taskId)
      },
      onTransition: undefined,
    })
    expect(opened).toEqual(['t-9'])
    rowMenuSelect('trans:t-9:skipped', {
      onOpenTask: undefined,
      onTransition: (taskId, toStatus) => {
        transitions.push({ taskId, toStatus })
      },
    })
    expect(transitions).toEqual([{ taskId: 't-9', toStatus: 'skipped' }])
    expect(rowMenuSelect('ghost', { onOpenTask: undefined, onTransition: undefined })).toBeUndefined()
  })
})
