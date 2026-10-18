// W4 行存续看门单测（shell/prune-watchdog.ts——壳 bundle 全局面 prune 检测判读核 +
// 装配面 + fail-loud 呈现）。判读双信号：__DSH_FORGE_CLIENT__ 标记 + slots entries 计数；
// 事件转发钩（__DSH_FORGE_PRUNE_CHECK__）+ 周期轮询双保险共用判读核。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announcePruneLapse,
  createPruneWatchdog,
  installPruneWatchdog,
  type PruneWatchdogState,
} from './prune-watchdog.js'

afterEach(() => {
  delete (globalThis as { __DSH_FORGE_PRUNE_CHECK__?: unknown }).__DSH_FORGE_PRUNE_CHECK__
  if (typeof document !== 'undefined') document.getElementById('dswf-prune-lapse')?.remove()
})

function state(markerPresent: boolean, slotCount: number): PruneWatchdogState {
  return { markerPresent, slotCount }
}

describe('createPruneWatchdog（判读核——轮询与事件两径共用）', () => {
  it('探测面未就绪（readState undefined）= 不武装不误报；首次成功读数武装并记基线', () => {
    let snap: PruneWatchdogState | undefined = undefined
    const lapses: string[] = []
    const wd = createPruneWatchdog({ readState: () => snap, onLapse: (r) => lapses.push(r), intervalMs: 1_000_000 })
    expect(wd.armed()).toBe(false)
    wd.check()
    expect(lapses).toEqual([])
    snap = state(true, 7)
    wd.check()
    expect(wd.armed()).toBe(true)
    expect(lapses).toEqual([])
    wd.stop()
  })

  it('武装后标记摘除（__DSH_FORGE_CLIENT__ 消失）→ prune 失效闩锁一次', () => {
    let snap: PruneWatchdogState | undefined = state(true, 7)
    const lapses: string[] = []
    const wd = createPruneWatchdog({ readState: () => snap, onLapse: (r) => lapses.push(r), intervalMs: 1_000_000 })
    wd.check()
    snap = state(false, 7)
    wd.check()
    expect(lapses).toHaveLength(1)
    expect(lapses[0]).toContain('__DSH_FORGE_CLIENT__')
    snap = state(false, 0)
    wd.check()
    expect(lapses).toHaveLength(1) // 闩锁——一次失效后不重复呈现
    expect(wd.lapsed()).toBe(true)
    wd.stop()
  })

  it('武装后 slots entries 计数回落（< 基线）→ prune 失效；回升/持平不误报', () => {
    let snap: PruneWatchdogState | undefined = state(true, 7)
    const lapses: string[] = []
    const wd = createPruneWatchdog({ readState: () => snap, onLapse: (r) => lapses.push(r), intervalMs: 1_000_000 })
    wd.check()
    snap = state(true, 7)
    wd.check()
    expect(lapses).toEqual([])
    snap = state(true, 6)
    wd.check()
    expect(lapses).toHaveLength(1)
    expect(lapses[0]).toContain('基线 7 → 现 6')
    wd.stop()
  })

  it('check() = 事件转发入口与轮询共用判读核；stop 摘除 __DSH_FORGE_PRUNE_CHECK__ 钩', () => {
    let snap: PruneWatchdogState | undefined = state(true, 7)
    const wd = createPruneWatchdog({ readState: () => snap, onLapse: vi.fn(), intervalMs: 1_000_000 })
    expect((globalThis as { __DSH_FORGE_PRUNE_CHECK__?: () => void }).__DSH_FORGE_PRUNE_CHECK__).toBe(wd.check)
    wd.stop()
    expect((globalThis as { __DSH_FORGE_PRUNE_CHECK__?: unknown }).__DSH_FORGE_PRUNE_CHECK__).toBeUndefined()
  })
})

describe('installPruneWatchdog（壳 bundle 全局装配面）', () => {
  it('readState = __DSH_FORGE_CLIENT__ 标记 + __DSH_FORGE_HEALTH__ 计数探针；探针缺席 = 不武装', () => {
    const wd = installPruneWatchdog({ onLapse: vi.fn(), intervalMs: 1_000_000 })
    expect(wd.armed()).toBe(false)
    ;(globalThis as { __DSH_FORGE_HEALTH__?: unknown }).__DSH_FORGE_HEALTH__ = {
      slotCount: () => 3,
      check: () => {},
    }
    ;(globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ = { plugin: 'x' }
    wd.check()
    expect(wd.armed()).toBe(true)
    // 标记摘除 → 失效呈现
    const lapses: string[] = []
    delete (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__
    const wd2 = installPruneWatchdog({ onLapse: (r) => lapses.push(r), intervalMs: 1_000_000 })
    wd2.check() // 武装
    wd2.check() // 判定
    expect(lapses).toHaveLength(1)
    wd.stop()
    wd2.stop()
    delete (globalThis as { __DSH_FORGE_HEALTH__?: unknown }).__DSH_FORGE_HEALTH__
  })
})

describe('announcePruneLapse（fail-loud 呈现——console + 显式横幅）', () => {
  it('console.error fail-loud 一行；无 DOM 面（node 单测池）时仅 console 呈现不抛', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      announcePruneLapse('测试失效因')
      expect(err).toHaveBeenCalledTimes(1)
      expect(err.mock.calls[0]?.[0]).toContain('prune')
      announcePruneLapse('再次失效') // 幂等不抛（横幅插条仅浏览器面生效）
    } finally {
      err.mockRestore()
    }
  })
})
