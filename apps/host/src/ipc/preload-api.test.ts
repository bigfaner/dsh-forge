// 2.4 AC3 renderer 侧守门——preload 暴露面：allowlist 通道转发、未列通道拒绝（负样例）；
// fix-14 __DSH_DIRECTORY_PICKER__ 桥成员 + e2e 回退面开关。
import { describe, expect, it, vi } from 'vitest'
import { BOOT_CHANNEL } from './boot-channel.js'
import { DIRECTORY_PICKER_CHANNEL } from './directory-picker-channel.js'
import {
  createDirectoryPickerBridge,
  createDshForgePreloadApi,
  directoryPickerEnabled,
  type PreloadInvokeFace,
} from './preload-api.js'

function fakeFace() {
  // fix-33 ⑩ 测试类型门：vi.fn 泛型锚 PreloadInvokeFace['invoke']（裸 Mock<Procedure> 不满足面型）
  return { invoke: vi.fn<PreloadInvokeFace['invoke']>().mockResolvedValue({ ok: true, data: [] }) }
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

describe('目录选取桥（window.__DSH_DIRECTORY_PICKER__——fix-14 官方契约同形）', () => {
  it('形状 pin：唯一成员 pick()（零参）→ DIRECTORY_PICKER_CHANNEL 直转（结构同型 client.js:62-76 消费面）', async () => {
    const face = { invoke: vi.fn().mockResolvedValue('D:\\work\\alpha') satisfies PreloadInvokeFace['invoke'] }
    const bridge = createDirectoryPickerBridge(face)
    expect(Object.keys(bridge)).toEqual(['pick']) // 唯一成员——不自创 API
    await expect(bridge.pick()).resolves.toBe('D:\\work\\alpha')
    expect(face.invoke).toHaveBeenCalledWith(DIRECTORY_PICKER_CHANNEL)
  })

  it('pick 语义：null（取消）/ string（选中）/ reject（错误面）均 invoke 原样透传（桥零解释）', async () => {
    for (const value of [null, 'Z:\\project\\dsh'] as const) {
      const face = { invoke: vi.fn().mockResolvedValue(value) satisfies PreloadInvokeFace['invoke'] }
      await expect(createDirectoryPickerBridge(face).pick()).resolves.toBe(value)
    }
    const face = { invoke: vi.fn().mockRejectedValue(new Error('E:\\gone 不可达')) satisfies PreloadInvokeFace['invoke'] }
    await expect(createDirectoryPickerBridge(face).pick()).rejects.toThrow('不可达')
  })

  it('暴露开关：缺省恒开（产品/开发载体）；DSH_FORGE_DIRECTORY_PICKER=off → 不暴露（e2e 回退面口径）', () => {
    expect(directoryPickerEnabled({})).toBe(true)
    expect(directoryPickerEnabled({ DSH_FORGE_DIRECTORY_PICKER: 'on' })).toBe(true)
    expect(directoryPickerEnabled({ DSH_FORGE_DIRECTORY_PICKER: 'off' })).toBe(false)
  })
})
