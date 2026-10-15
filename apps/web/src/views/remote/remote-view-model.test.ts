// 受限视图模型单测（mobile-remote-approval 1.3）——置顶排序（待审批高亮组 > 进行中 > 其余）、
// 受限入口判定、进度信封 → 视图快照派生（零本地副本——信封原样读数）。
import { describe, expect, it } from 'vitest'
import type { RemoteProgressSnapshot, TaskCard } from '@dsh-forge/contracts'
import { isRestrictedRemoteViewCookie, isRestrictedRemoteViewLocation, remoteListRowsOf } from './remote-view-model.js'

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

// fix-18 ⑤：手机扫互联网码落受限视图——官方 BrowserAuth 对携 token 的 GET / 铸 cookie 后
// 303 重定向到 "./"，查询串（forgeRemote=1）被结构性剥除；/pair 成功面改设第一方 cookie
// 跨重定向存活，受限视图判定补 cookie 读数缝（main.ts 分支消费）。
describe('isRestrictedRemoteViewCookie 受限入口 cookie 读数缝（fix-18 ⑤）', () => {
  it('dswf_forge_remote=1 在场（单值/多值串）= 命中', () => {
    expect(isRestrictedRemoteViewCookie('dswf_forge_remote=1')).toBe(true)
    expect(isRestrictedRemoteViewCookie('other=2; dswf_forge_remote=1')).toBe(true)
    expect(isRestrictedRemoteViewCookie('dswf_forge_remote=1; session=abc')).toBe(true)
  })
  it('cookie 缺席 / 他值 = 不命中', () => {
    expect(isRestrictedRemoteViewCookie('')).toBe(false)
    expect(isRestrictedRemoteViewCookie('other=2')).toBe(false)
    expect(isRestrictedRemoteViewCookie('dswf_forge_remote=0')).toBe(false)
    expect(isRestrictedRemoteViewCookie('fake_dswf_forge_remote=1')).toBe(false)
  })
})
