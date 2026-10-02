// flow-open 单测 —— 添加项目流程打开缝（2.10 入口接线点）：
// 宿主发布/撤销 roundtrip、入口触发透传、宿主缺席 fail-soft（warn + false，不炸调用方——
// sidebar-actions 工作台桥同口径）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addProjectFlowHandle,
  openAddProjectFlow,
  publishAddProjectFlow,
} from './flow-open.js'

afterEach(() => {
  publishAddProjectFlow(undefined)
})

describe('发布与读取 roundtrip', () => {
  it('宿主 mount 发布 → 句柄可读；unmount 撤销 → undefined', () => {
    const handle = { open: () => {} }
    publishAddProjectFlow(handle)
    expect(addProjectFlowHandle()).toBe(handle)
    publishAddProjectFlow(undefined)
    expect(addProjectFlowHandle()).toBeUndefined()
  })

  it('后发布者胜（重复挂载时最新宿主持缝）', () => {
    const first = { open: () => {} }
    const second = { open: () => {} }
    publishAddProjectFlow(first)
    publishAddProjectFlow(second)
    expect(addProjectFlowHandle()).toBe(second)
  })
})

describe('入口触发（openAddProjectFlow）', () => {
  it('句柄在场 → open 调用 + 返回 true', () => {
    const open = vi.fn()
    publishAddProjectFlow({ open })
    expect(openAddProjectFlow()).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('宿主缺席（2.12 装配未就位）→ fail-soft：warn + false，不抛', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(openAddProjectFlow()).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain('添加项目')
    } finally {
      warn.mockRestore()
    }
  })

  it('显式注入句柄直达（测试面/装配面同径）', () => {
    const open = vi.fn()
    expect(openAddProjectFlow({ open })).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
