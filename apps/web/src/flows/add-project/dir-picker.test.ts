// dir-picker 单测 —— fix-14 官方 __DSH_DIRECTORY_PICKER__ 桥契约 pin（防官方漂移）：
// 形状与 pick 语义对照 @deepseek-ai/dsh-client-ui-directory-picker-native lib/client.js:62-76
// 消费面（desktop = globalThis.__DSH_DIRECTORY_PICKER__；缺席 → undefined → 回退浏览器）。
import { describe, expect, it } from 'vitest'
import { directoryPickerBridgeOf, type DshDirectoryPickerBridge } from './dir-picker.js'

const REAL_BRIDGE: DshDirectoryPickerBridge = { pick: () => Promise.resolve('D:\\work\\alpha') }

describe('桥契约 pin（client.js:62-76 同形）', () => {
  it('桥在场：pick 为函数 → 桥返回（原生主路径启用）', () => {
    expect(directoryPickerBridgeOf({ __DSH_DIRECTORY_PICKER__: REAL_BRIDGE })).toBe(REAL_BRIDGE)
  })

  it('桥缺席（非 Electron 载体/单测/e2e 回退口径）→ undefined → 装配回退内嵌浏览器', () => {
    expect(directoryPickerBridgeOf({})).toBeUndefined()
    expect(directoryPickerBridgeOf(undefined)).toBeUndefined() // globalThis 无暴露面
  })

  it('畸形暴露面防御：null / 非 pick 对象 / pick 非函数 → 一律按缺席回退', () => {
    expect(directoryPickerBridgeOf({ __DSH_DIRECTORY_PICKER__: null })).toBeUndefined()
    expect(directoryPickerBridgeOf({ __DSH_DIRECTORY_PICKER__: 'x' })).toBeUndefined()
    expect(directoryPickerBridgeOf({ __DSH_DIRECTORY_PICKER__: {} })).toBeUndefined()
    expect(directoryPickerBridgeOf({ __DSH_DIRECTORY_PICKER__: { pick: 'not-fn' } })).toBeUndefined()
  })
})
