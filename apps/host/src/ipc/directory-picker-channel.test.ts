// fix-14 机制面 pin：__DSH_DIRECTORY_PICKER__ 桥 main 侧通道（官方契约同形零 fork）。
// pick 语义三支（选中绝对路径 / 取消 null / 系统错误 reject = 错误面）对照官方
// dsh-client-ui-directory-picker-native lib/client.js:41-48 消费面（onPicked/onCancel/onError）。
import { FORGE_CHANNEL_ALLOWLIST } from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import {
  DIRECTORY_PICKER_CHANNEL,
  DIRECTORY_PICKER_DIALOG_TITLE,
  pickDirectory,
  registerDirectoryPickerChannel,
  type OpenDirectoryDialog,
  type ParentWindowResolver,
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

describe('fix-21：parent 窗口形参（对话框前台/模态语义）', () => {
  /** 注册后捕获 handler + open 收到的 parent 序列（fake ipcMain + 记录型 open 注入） */
  function registeredPicker(resolveParent?: ParentWindowResolver) {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain: IpcMainLike = {
      handle: (channel, listener) => void handlers.set(channel, listener),
      removeHandler: (channel) => void handlers.delete(channel),
    }
    const seenParents: unknown[] = []
    const open: OpenDirectoryDialog = async (parent) => {
      seenParents.push(parent)
      return { canceled: false, filePaths: ['D:\\work\\alpha'] }
    }
    registerDirectoryPickerChannel(ipcMain, open, resolveParent)
    return { invoke: (event: unknown) => handlers.get(DIRECTORY_PICKER_CHANNEL)!(event), seenParents }
  }

  it('handler 捕获 event.sender → 解析出的父窗原样传入 open（showOpenDialog parent 形参）', async () => {
    const fakeWindow = { id: 7 } // BrowserWindow 结构切片（通道面 unknown 透传）
    const { invoke, seenParents } = registeredPicker((sender) => (sender === 'wc-main' ? fakeWindow : null))
    await expect(invoke({ sender: 'wc-main' })).resolves.toBe('D:\\work\\alpha')
    expect(seenParents).toEqual([fakeWindow])
  })

  it('sender 解析为 null（无窗，理论不可达）→ 无 parent 形参回退（fail-soft，不比现状差）', async () => {
    const { invoke, seenParents } = registeredPicker(() => null)
    await expect(invoke({ sender: 'wc-orphan' })).resolves.toBe('D:\\work\\alpha')
    expect(seenParents).toEqual([null])
  })

  it('未注入解析器（缺省）→ 同 null 回退径', async () => {
    const { invoke, seenParents } = registeredPicker()
    await expect(invoke(undefined)).resolves.toBe('D:\\work\\alpha')
    expect(seenParents).toEqual([null])
  })

  it('标题对齐官方 host-directory-picker-native DIALOG_TITLE（Select Workspace Directory 逐字）', () => {
    expect(DIRECTORY_PICKER_DIALOG_TITLE).toBe('Select Workspace Directory')
  })
})
