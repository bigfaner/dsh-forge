// Harness 三通道单测（fix-12 B）——注册面（三通道动作分发）+ 注销面 + 日志追加面。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HARNESS_RELAUNCH_CHANNEL,
  HARNESS_SAFE_MODE_CHANNEL,
  HARNESS_SHOW_LOG_CHANNEL,
  noteHarnessLog,
  registerHarnessChannels,
  removeHarnessChannels,
} from './harness-channel.js'

/** ipcMain 替身（handle/removeHandler 收集——forge-channels IpcMainLike 消费切片） */
function fakeIpcMain(): {
  handles: Map<string, (...args: unknown[]) => unknown>
  removed: string[]
  removeHandler(channel: string): void
} {
  const handles = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handles,
    removed: [],
    removeHandler(channel: string) {
      this.removed.push(channel)
      handles.delete(channel)
    },
    // @ts-expect-error 测试替身窄面
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      handles.set(channel, handler)
    },
  }
}

const actions = {
  relaunch: vi.fn(),
  relaunchSafeMode: vi.fn(),
  showLog: vi.fn(() => true),
}

afterEach(() => {
  for (const mock of [actions.relaunch, actions.relaunchSafeMode, actions.showLog]) mock.mockClear()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const tempDirs: string[] = []

describe('registerHarnessChannels 三通道（fix-12 B——域外直转面，不进 forge allowlist）', () => {
  it('三通道名 pin = dsh-forge:harness/{relaunch,safe-mode,show-log}', () => {
    const ipcMain = fakeIpcMain()
    registerHarnessChannels(ipcMain as never, actions)
    expect([...ipcMain.handles.keys()].sort()).toEqual(
      [HARNESS_RELAUNCH_CHANNEL, HARNESS_SAFE_MODE_CHANNEL, HARNESS_SHOW_LOG_CHANNEL].sort(),
    )
    expect(HARNESS_RELAUNCH_CHANNEL).toBe('dsh-forge:harness/relaunch')
    expect(HARNESS_SAFE_MODE_CHANNEL).toBe('dsh-forge:harness/safe-mode')
    expect(HARNESS_SHOW_LOG_CHANNEL).toBe('dsh-forge:harness/show-log')
  })

  it('三通道触发 → 对应动作各一次（零载荷直转）', () => {
    const ipcMain = fakeIpcMain()
    registerHarnessChannels(ipcMain as never, actions)
    ipcMain.handles.get(HARNESS_RELAUNCH_CHANNEL)?.()
    ipcMain.handles.get(HARNESS_SAFE_MODE_CHANNEL)?.()
    expect(ipcMain.handles.get(HARNESS_SHOW_LOG_CHANNEL)?.()).toBe(true)
    expect(actions.relaunch).toHaveBeenCalledTimes(1)
    expect(actions.relaunchSafeMode).toHaveBeenCalledTimes(1)
    expect(actions.showLog).toHaveBeenCalledTimes(1)
  })

  it('removeHarnessChannels：三通道全注销', () => {
    const ipcMain = fakeIpcMain()
    registerHarnessChannels(ipcMain as never, actions)
    removeHarnessChannels(ipcMain)
    expect([...ipcMain.removed].sort()).toEqual(
      [HARNESS_RELAUNCH_CHANNEL, HARNESS_SAFE_MODE_CHANNEL, HARNESS_SHOW_LOG_CHANNEL].sort(),
    )
    expect(ipcMain.handles.size).toBe(0)
  })
})

describe('noteHarnessLog（fail-soft 托管日志）', () => {
  it('缺席文件即建 + 逐行追加（带 ISO 时间戳前缀）；不可写路径静默不抛', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-harness-log-'))
    tempDirs.push(dir)
    const logPath = join(dir, 'logs', 'harness.log')
    noteHarnessLog(logPath, 'first')
    noteHarnessLog(logPath, 'second')
    const text = readFileSync(logPath, 'utf8')
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] first\n/)
    expect(text.endsWith('second\n')).toBe(true)
    expect(() => noteHarnessLog(join(dir, 'harness.log', 'nested', 'harness.log'), 'x')).not.toThrow()
  })
})
