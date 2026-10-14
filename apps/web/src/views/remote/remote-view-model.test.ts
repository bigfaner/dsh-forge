// 受限视图模型单测（mobile-remote-approval 1.3）——置顶排序（待审批高亮组 > 进行中 > 其余）、
// 受限入口判定、进度信封 → 视图快照派生（零本地副本——信封原样读数）。
import { describe, expect, it } from 'vitest'
import type { RemoteProgressSnapshot, TaskCard } from '@dsh-forge/contracts'
import { isRestrictedRemoteViewLocation, remoteListRowsOf } from './remote-view-model.js'

function taskOf(partial: Partial<TaskCard> & Pick<TaskCard, 'taskId' | 'taskStatus'>): TaskCard {
  return {
    slug: 'feat-x',
    localId: '1',
    title: '任务',
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

describe('remoteListRowsOf 排序', () => {
  it('待审批（blocked）高亮置顶，其后进行中，其余殿后', () => {
    const rows = remoteListRowsOf(
      SNAPSHOT([
        taskOf({ taskId: 'a', taskStatus: 'completed' }),
        taskOf({ taskId: 'b', taskStatus: 'in_progress' }),
        taskOf({ taskId: 'c', taskStatus: 'blocked' }),
      ]),
    )
    expect(rows.map((row) => row.task.taskId)).toEqual(['c', 'b', 'a'])
    expect(rows[0]!.band).toBe('approval')
    expect(rows[1]!.band).toBe('active')
    expect(rows[2]!.band).toBe('rest')
  })

  it('待审批组内按 updatedAt 新者在前；非阻塞终态不进活跃带', () => {
    const rows = remoteListRowsOf(
      SNAPSHOT([
        taskOf({ taskId: 'old', taskStatus: 'blocked', slug: 'feat-x', localId: '3' }),
        taskOf({ taskId: 'new', taskStatus: 'blocked', slug: 'feat-x', localId: '5' }),
        taskOf({ taskId: 'pending', taskStatus: 'pending' }),
      ]),
    )
    expect(rows.map((row) => row.task.taskId)).toEqual(['new', 'old', 'pending'])
  })

  it('空列表 = 空行集（空态渲染面）', () => {
    expect(remoteListRowsOf(SNAPSHOT([]))).toEqual([])
  })
})

describe('isRestrictedRemoteViewLocation 受限入口判定', () => {
  it('forgeRemote=1 查询参数命中', () => {
    expect(isRestrictedRemoteViewLocation({ search: '?forgeRemote=1', hash: '' } as Location)).toBe(true)
  })
  it('普通工作台地址不命中（零参数）', () => {
    expect(isRestrictedRemoteViewLocation({ search: '', hash: '' } as Location)).toBe(false)
  })
  it('其他查询参数不命中', () => {
    expect(isRestrictedRemoteViewLocation({ search: '?tab=overview', hash: '' } as Location)).toBe(false)
  })
})
