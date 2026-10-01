// 2.4 AC3 renderer 侧守门——preload 暴露面：allowlist 通道转发、未列通道拒绝（负样例）。
import { describe, expect, it, vi } from 'vitest'
import { BOOT_CHANNEL } from './boot-channel.js'
import { createDshForgePreloadApi, type PreloadInvokeFace } from './preload-api.js'

function fakeFace() {
  return { invoke: vi.fn().mockResolvedValue({ ok: true, data: [] }) satisfies PreloadInvokeFace }
}

describe('preload 暴露面（window.dshForge）', () => {
  it('getBootManifest → BOOT_CHANNEL 转发（1.4 面不回退）', async () => {
    const face = fakeFace()
    const api = createDshForgePreloadApi(face)
    await api.getBootManifest()
    expect(face.invoke).toHaveBeenCalledWith(BOOT_CHANNEL)
  })

  it('invoke：allowlist 通道 + 负载原样转发，返回RpcResult', async () => {
    const face = fakeFace()
    const api = createDshForgePreloadApi(face)
    await api.invoke('forge:projects/register', { name: 'demo' })
    expect(face.invoke).toHaveBeenCalledWith('forge:projects/register', { name: 'demo' })
  })

  it('负样例：未列通道拒绝（forge 前缀伪通道 / 邪恶前缀 / boot 通道混用）——不触 ipcRenderer', () => {
    const face = fakeFace()
    const api = createDshForgePreloadApi(face)
    for (const channel of ['forge:projects/drop-table', 'evil:anything', 'dsh-forge:boot']) {
      expect(() => api.invoke(channel as never, {})).toThrow(/allowlist/)
    }
    expect(face.invoke).not.toHaveBeenCalled()
  })

  it('负样例：五通道之外的既列域通道拼错名同样拒绝（仅精确常量值放行）', () => {
    const face = fakeFace()
    const api = createDshForgePreloadApi(face)
    expect(() => api.invoke('forge:projects/lists' as never)).toThrow(/allowlist/)
    expect(() => api.invoke('forge:knowledge/search' as never)).toThrow(/allowlist/) // agent 面动词不入 web RPC（双门分工）
  })
})
