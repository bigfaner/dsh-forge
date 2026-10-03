// fix-14 机制面 pin：__DSH_DIRECTORY_PICKER__ 桥 main 侧通道（官方契约同形零 fork）。
// pick 语义三支（选中绝对路径 / 取消 null / 系统错误 reject = 错误面）对照官方
// dsh-client-ui-directory-picker-native lib/client.js:41-48 消费面（onPicked/onCancel/onError）。
import { FORGE_CHANNEL_ALLOWLIST } from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import {
  DIRECTORY_PICKER_CHANNEL,
  pickDirectory,
  registerDirectoryPickerChannel,
  type OpenDirectoryDialog,
} from './directory-picker-channel.js'
import type { IpcMainLike } from './forge-channels.js'

function openOf(result: { canceled?: boolean; filePaths?: string[] } | 'throw'): OpenDirectoryDialog {
  return async () => {
    if (result === 'throw') throw new Error('E:\\gone 不可达')
    return { canceled: result.canceled ?? false, filePaths: result.filePaths ?? [] }
  }
}

describe('pickDirectory（官方契约 pick 语义三支）', () => {
  it('选中 → resolve 首个绝对路径', async () => {
    await expect(pickDirectory(openOf({ filePaths: ['D:\\work\\alpha'] }))).resolves.toBe('D:\\work\\alpha')
  })

  it('取消（canceled）→ resolve null', async () => {
    await expect(pickDirectory(openOf({ canceled: true, filePaths: [] }))).resolves.toBeNull()
  })

  it('零选（未取消但 filePaths 空）→ 同取消口径 null（契约单值面不造假路径）', async () => {
    await expect(pickDirectory(openOf({ filePaths: [] }))).resolves.toBeNull()
  })

  it('系统错误（不可达路径等）→ reject（官方契约错误面——渲染侧 onError 分支承载）', async () => {
    await expect(pickDirectory(openOf('throw'))).rejects.toThrow('不可达')
  })
})

describe('通道注册（dsh-forge:directory-picker）', () => {
  it('注册于 DIRECTORY_PICKER_CHANNEL 名下，invoke → pickDirectory 同径', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain: IpcMainLike = {
      handle: (channel, listener) => void handlers.set(channel, listener),
      removeHandler: (channel) => void handlers.delete(channel),
    }
    registerDirectoryPickerChannel(ipcMain, openOf({ filePaths: ['Z:\\project\\dsh'] }))
    expect(handlers.has(DIRECTORY_PICKER_CHANNEL)).toBe(true)
    await expect(handlers.get(DIRECTORY_PICKER_CHANNEL)!(undefined)).resolves.toBe('Z:\\project\\dsh')
  })

  it('分面自证：非 forge:* 域通道（不进域 allowlist——boot-channel 同制装配胶）', () => {
    expect(DIRECTORY_PICKER_CHANNEL).toBe('dsh-forge:directory-picker')
    expect(DIRECTORY_PICKER_CHANNEL.startsWith('forge:')).toBe(false)
    expect(FORGE_CHANNEL_ALLOWLIST).not.toContain(DIRECTORY_PICKER_CHANNEL)
  })
})
