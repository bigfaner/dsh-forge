// 手机受限视图单测（mobile-remote-approval 1.3）——静态渲染面（renderToStaticMarkup 同
// 1.2 组件测法）：配对引导页 / 列表渲染（待审批高亮置顶 + 进行中带）/ 空态 / 暴露面边界
// 断言（无会话对话、知识库、文档入口——提案验收 6 的组件层承载）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RemoteProgressSnapshot, TaskCard } from '@dsh-forge/contracts'
import { ForgeRemoteView, RemotePairingGuide, RemoteProgressList } from './ForgeRemoteView.js'
import { remoteListRowsOf } from './remote-view-model.js'

function taskOf(partial: Partial<TaskCard> & Pick<TaskCard, 'taskId' | 'taskStatus' | 'title'>): TaskCard {
  return {
    slug: 'mobile-remote-approval',
    localId: '1',
    taskType: 'coding-feature',
    priority: 'P1',
    prerequisites: [],
    sessionCount: 0,
    ...partial,
  } as TaskCard
}

const SNAPSHOT = (tasks: TaskCard[]): RemoteProgressSnapshot => ({
  tasks,
  stats: { total: tasks.length, byStatus: {} as never, unmetPending: 0 },
})

describe('RemotePairingGuide 配对引导页', () => {
  it('呈现官方配对引导语 + 地址行，不渲染任何进度内容', () => {
    const html = renderToStaticMarkup(<RemotePairingGuide lanAddress="http://192.168.1.7:19668" />)
    expect(html).toMatch(/配对/)
    expect(html).toContain('http://192.168.1.7:19668')
    expect(html).not.toMatch(/dswf-rview-list/)
  })

  it('地址缺席 = 通用引导（不渲染地址行）', () => {
    const html = renderToStaticMarkup(<RemotePairingGuide />)
    expect(html).toMatch(/配对/)
    expect(html).not.toMatch(/dswf-rview-address/)
  })
})

describe('RemoteProgressList 列表渲染', () => {
  it('待审批（blocked）行高亮置顶且带高亮类，进行中行随其后', () => {
    const rows = remoteListRowsOf(
      SNAPSHOT([
        taskOf({ taskId: 'a', title: '已完成任务', taskStatus: 'completed' }),
        taskOf({ taskId: 'b', title: '跑批中任务', taskStatus: 'in_progress' }),
        taskOf({ taskId: 'c', title: '等审批任务', taskStatus: 'blocked' }),
      ]),
    )
    const html = renderToStaticMarkup(<RemoteProgressList rows={rows} stats={SNAPSHOT(rows.map((r) => r.task)).stats} />)
    const approvalAt = html.indexOf('等审批任务')
    const activeAt = html.indexOf('跑批中任务')
    const restAt = html.indexOf('已完成任务')
    expect(approvalAt).toBeGreaterThanOrEqual(0)
    expect(approvalAt).toBeLessThan(activeAt)
    expect(activeAt).toBeLessThan(restAt)
    expect(html).toMatch(/dswf-rview-row--approval/)
    expect(html).toMatch(/待审批/)
  })

  it('状态 chip 呈现中文状态词（进行中）', () => {
    const rows = remoteListRowsOf(SNAPSHOT([taskOf({ taskId: 'b', title: '跑批中', taskStatus: 'in_progress' })]))
    const html = renderToStaticMarkup(<RemoteProgressList rows={rows} stats={SNAPSHOT(rows.map((r) => r.task)).stats} />)
    expect(html).toMatch(/进行中/)
  })
})

describe('RemoteProgressList 空态', () => {
  it('零行 = 空态呈现，不渲染列表骨架', () => {
    const html = renderToStaticMarkup(<RemoteProgressList rows={[]} stats={SNAPSHOT([]).stats} />)
    expect(html).toMatch(/暂无任务/)
    expect(html).not.toMatch(/dswf-rview-row /)
  })
})

describe('暴露面边界（提案验收 6——组件层断言）', () => {
  it('受限视图全量渲染面零工作台入口（会话/对话/知识库/文档/设置）', () => {
    const rows = remoteListRowsOf(SNAPSHOT([taskOf({ taskId: 'c', title: 'X', taskStatus: 'blocked' })]))
    const html = renderToStaticMarkup(
      <ForgeRemoteView
        transport={() => Promise.reject(new Error('unpaired'))}
        lanAddress="http://192.168.1.7:19668"
      />,
    )
    const listHtml = renderToStaticMarkup(
      <RemoteProgressList rows={rows} stats={SNAPSHOT(rows.map((r) => r.task)).stats} />,
    )
    for (const surface of [html, listHtml]) {
      expect(surface).not.toMatch(/知识库|知识召回|文档|新会话|会话列表|设置/)
    }
  })

  it('数据面不可达（transport 拒绝/缺席）= 配对引导页（官方配对流承载）', () => {
    const html = renderToStaticMarkup(
      <ForgeRemoteView transport={() => Promise.reject(new Error('unpaired'))} />,
    )
    expect(html).toMatch(/配对/)
  })
})
