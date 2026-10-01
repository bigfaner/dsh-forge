// 1.4 AC3 机制面 pin：{url, injections} boot 通道注册（renderer receipt 由 e2e 自证）。
import { FORGE_CHANNEL_ALLOWLIST } from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import { buildBootManifest } from '../boot/index.js'
import { BOOT_CHANNEL, registerBootChannel } from './boot-channel.js'
import type { IpcMainLike } from './forge-channels.js'

describe('boot 通道（dsh-forge:boot）', () => {
  it('注册于 BOOT_CHANNEL 名下，invoke 返回 manifest（异步 getManifest 支持）', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain: IpcMainLike = {
      handle: (channel, listener) => void handlers.set(channel, listener),
      removeHandler: (channel) => void handlers.delete(channel),
    }
    const manifest = buildBootManifest('http://127.0.0.1:19400/', [{ kind: 'style', text: 'x' }])
    registerBootChannel(ipcMain, async () => manifest)
    expect(handlers.has(BOOT_CHANNEL)).toBe(true)
    const out = (await handlers.get(BOOT_CHANNEL)!(undefined)) as typeof manifest
    expect(out.url).toBe(manifest.url)
    expect(out.injections).toEqual(manifest.injections)
  })

  it('分面自证：boot 通道非 forge:* 域通道（不进域 allowlist）', () => {
    expect(BOOT_CHANNEL).toBe('dsh-forge:boot')
    expect(BOOT_CHANNEL.startsWith('forge:')).toBe(false)
    expect(FORGE_CHANNEL_ALLOWLIST).not.toContain(BOOT_CHANNEL)
  })
})
