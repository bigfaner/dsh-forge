// worktree 切换闸状态单测（bug 267dcac1）：begin 置位 + 订阅通知；settle 幂等解除；
// 并发 begin 计数语义（后一次切换未敛棋前不清闸）；超时自动解除（fail-open 不永锁 composer）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginWorktreeSwitch, isWorktreeSwitchPending, subscribeWorktreeSwitch } from './worktree-switch-gate.js'

describe('worktree 切换闸（bug 267dcac1）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    // 清闸至基态（防跨用例泄漏）
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('begin 置位 + 订阅者收一次通知；settle 解除再通知', () => {
    const events: boolean[] = []
    const dispose = subscribeWorktreeSwitch(() => events.push(isWorktreeSwitchPending()))
    expect(isWorktreeSwitchPending()).toBe(false)
    const settle = beginWorktreeSwitch()
    expect(isWorktreeSwitchPending()).toBe(true)
    settle()
    expect(isWorktreeSwitchPending()).toBe(false)
    dispose()
    expect(events).toEqual([true, false])
  })

  it('settle 幂等——重复敛棋不清他人之闸（计数不为负）', () => {
    const settle = beginWorktreeSwitch()
    settle()
    settle()
    expect(isWorktreeSwitchPending()).toBe(false)
    const settle2 = beginWorktreeSwitch()
    expect(isWorktreeSwitchPending()).toBe(true)
    settle2()
    expect(isWorktreeSwitchPending()).toBe(false)
  })

  it('并发切换计数——前一次敛棋后一次未敛 = 闸仍 pending', () => {
    const settleA = beginWorktreeSwitch()
    const settleB = beginWorktreeSwitch()
    settleA()
    expect(isWorktreeSwitchPending()).toBe(true)
    settleB()
    expect(isWorktreeSwitchPending()).toBe(false)
  })

  it('超时自动解除（3s）——openWorkspace 永不敛棋亦不永锁 composer', () => {
    beginWorktreeSwitch()
    vi.advanceTimersByTime(2999)
    expect(isWorktreeSwitchPending()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isWorktreeSwitchPending()).toBe(false)
  })
})
