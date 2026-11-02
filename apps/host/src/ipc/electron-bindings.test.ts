// Electron 实面绑定单测（Electron 依赖隔离出的装配层——shell 动作以注入 fake 断言语义；
// 真机取证归 walkthrough）。核心面：showDiagLogs 单窗口语义（bug a8d147e7——一次触发
// 仅消费一次，快速重复触发（双击/事件双发）不得双开 Explorer 窗口）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { electronHarnessActions } from './electron-bindings.js'

afterEach(() => {
  vi.useRealTimers()
})

let cleanupRoots: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanupRoots) fn()
  cleanupRoots = []
})

function makeActions() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-harness-actions-'))
  cleanupRoots.push(() => rmSync(root, { recursive: true, force: true }))
  const logPath = join(root, 'logs', 'harness.log')
  const openPath = vi.fn(async () => '')
  const actions = electronHarnessActions(
    { relaunch: () => {}, exit: () => {}, getPath: () => root },
    logPath,
    undefined,
    { openPath: openPath as (path: string) => Promise<string> },
  )
  return { actions, openPath }
}

describe('electronHarnessActions.showDiagLogs（单窗口语义——bug a8d147e7）', () => {
  it('一次触发 = 一次 openPath（目录缺席即建；返回 true）', () => {
    vi.useFakeTimers()
    const { actions, openPath } = makeActions()
    vi.setSystemTime(0)
    expect(actions.showDiagLogs()).toBe(true)
    expect(openPath).toHaveBeenCalledTimes(1)
  })

  it('快速重复触发（去重窗内）只消费一次——双击/事件双发不双开', () => {
    vi.useFakeTimers()
    const { actions, openPath } = makeActions()
    vi.setSystemTime(0)
    actions.showDiagLogs()
    vi.setSystemTime(50)
    expect(actions.showDiagLogs()).toBe(true)
    vi.setSystemTime(120)
    expect(actions.showDiagLogs()).toBe(true)
    expect(openPath).toHaveBeenCalledTimes(1) // 消费一次 = 单窗口
  })

  it('mkdir 失败径返回 false 且不占去重窗——窗内重试会再次尝试 openPath（bug 087c85db）', () => {
    vi.useFakeTimers()
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-harness-actions-'))
    cleanupRoots.push(() => rmSync(root, { recursive: true, force: true }))
    // userData 指向一个普通文件 → diagDir（{userData}/logs）mkdirSync 必败（ENOTDIR）
    const blocker = join(root, 'blocker')
    writeFileSync(blocker, 'x')
    const openPath = vi.fn(async () => '')
    const actions = electronHarnessActions(
      { relaunch: () => {}, exit: () => {}, getPath: () => blocker },
      join(root, 'logs', 'harness.log'),
      undefined,
      { openPath: openPath as (path: string) => Promise<string> },
    )
    vi.setSystemTime(0)
    expect(actions.showDiagLogs()).toBe(false) // 失败径：不谎报已触发
    vi.setSystemTime(50) // 去重窗内重试：失败不置位 → 未被去重吞掉（吞掉会谎报 true），再次走 mkdir 失败径
    expect(actions.showDiagLogs()).toBe(false)
    expect(openPath).not.toHaveBeenCalled() // mkdir 先于 openPath 抛出——两次均未达开窗面
  })

  it('去重窗外再次触发照常打开（用户稍后主动点仍可用）', () => {
    vi.useFakeTimers()
    const { actions, openPath } = makeActions()
    vi.setSystemTime(0)
    actions.showDiagLogs()
    vi.setSystemTime(2_000)
    expect(actions.showDiagLogs()).toBe(true)
    expect(openPath).toHaveBeenCalledTimes(2)
  })
})
