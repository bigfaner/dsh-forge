// DispatchPanel 单测（loop-event-delivery 1.8 后残面）——worker 执行会话解析纯函数
// （悬浮面板 UI 已由 DispatchEventsPanel 接替退役；概览任务 tab 仍消费本模块解析面：
// taskDetail 挂接双源卡 → 执行会话 + 库侧权威父，fail-soft）。
import { describe, expect, it, vi } from 'vitest'
import type { SessionTaskLinkCard } from '@dsh-forge/contracts'
import {
  fetchWorkerSession,
  parentSessionOf,
  workerSessionOf,
} from './DispatchPanel.js'

/** 双源分型卡工厂（SessionTaskLinkCard 消费切片——links=派发 / records=执行） */
const card = (over: Partial<SessionTaskLinkCard> = {}): SessionTaskLinkCard => ({
  taskId: 't-1',
  slug: 'feat-x',
  localId: '1.1',
  title: '任务 1.1',
  taskStatus: 'in_progress',
  sessionId: 'sess-1',
  source: 'link',
  ...over,
})

describe('workerSessionOf 执行会话解析（record 源 ∉ link 派发集）', () => {
  it('record 源（非派发会话）= 执行会话', () => {
    const sessions = [card({ sessionId: 'd-1' }), card({ source: 'record', sessionId: 'worker-9' })]
    expect(workerSessionOf(sessions)).toBe('worker-9')
  })
  it('claim 审计行（record 源 = 派发会话本身）排除；多行取最后命中', () => {
    const sessions = [
      card({ source: 'record', sessionId: 'd-1' }),
      card({ source: 'record', sessionId: 'worker-8' }),
      card({ source: 'record', sessionId: 'worker-9' }),
    ]
    expect(workerSessionOf(sessions)).toBe('worker-9')
  })
  it('重入再派发 = 最新行；纯派发/空集 = null', () => {
    const sessions = [
      card({ source: 'record', sessionId: 'd-1' }),
      card({ source: 'record', sessionId: 'worker-old' }),
      card({ sessionId: 'd-1' }),
      card({ source: 'record', sessionId: 'worker-new' }),
    ]
    expect(workerSessionOf(sessions)).toBe('worker-new')
    expect(workerSessionOf([card({ source: 'link', sessionId: 'd' }), card({ source: 'record', sessionId: 'd' })])).toBeNull()
    expect(workerSessionOf([])).toBeNull()
  })
})

describe('parentSessionOf 库侧权威父解析（D6 修复面——进行中 worker 的显式地址径输入）', () => {
  it('link 派发源 = worker 的 durable 父', () => {
    const sessions = [card({ sessionId: 'dispatch-1' }), card({ source: 'record', sessionId: 'w' })]
    expect(parentSessionOf(sessions)).toBe('dispatch-1')
  })
  it('无 link 源 = undefined', () => {
    expect(parentSessionOf([card({ source: 'record', sessionId: 'w' })])).toBeUndefined()
    expect(parentSessionOf([])).toBeUndefined()
  })
})

describe('fetchWorkerSession 纯异步面（taskDetail 挂接面 → worker + 父；fail-soft）', () => {
  it('detail 命中 → workerSessionOf/parentSessionOf 组合', async () => {
    const client = {
      tasks: {
        detail: vi.fn(async () => ({
          sessions: [card({ sessionId: 'd-1' }), card({ source: 'record', sessionId: 'w-1' })],
        })),
      },
    }
    await expect(fetchWorkerSession(client as never, { projectId: 'p-1', taskId: 't-1' })).resolves.toEqual({
      worker: 'w-1',
      parent: 'd-1',
    })
  })
  it('RPC 抛错 → fail-soft（worker=null/parent=undefined，永不 reject）', async () => {
    const client = { tasks: { detail: vi.fn(async () => {
      throw new Error('boom')
    }) } }
    await expect(fetchWorkerSession(client as never, { projectId: 'p-1', taskId: 't-x' })).resolves.toEqual({
      worker: null,
      parent: undefined,
    })
  })
})
