// runActivationSelfProbe 编排单测（boot 竞速根治——1.2 复核欠账 R2-竞速支）：
// 竞速窗口分类钉（404/面缺席 → 静默挂起 + mount 后重试一次，零 console 记录）+
// 终态 fail-loud 语义保持钉（非竞速类失败即时、重试失败单次）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runActivationSelfProbe,
  isBootRaceWindowFailure,
  SELF_CHECK_RETRY_DELAY_MS,
} from './self-check-probe.js'

const RACE_404 = new Error('transport failure for forgeProjects/list: HTTP 404')
const RACE_FACE_ABSENT = new Error(
  'dsh-forge project client: 官方 forge remote 面缺席（forgeProjects.list）——通道不可用（诚实降级）',
)

describe('isBootRaceWindowFailure（竞速窗口分类）', () => {
  it('404 / transport failure / 面缺席 → true；typed business error → false', () => {
    expect(isBootRaceWindowFailure(RACE_404)).toBe(true)
    expect(isBootRaceWindowFailure(RACE_FACE_ABSENT)).toBe(true)
    expect(isBootRaceWindowFailure(new Error('数据通路断裂'))).toBe(false)
    expect(isBootRaceWindowFailure('HTTP 404')).toBe(true)
  })
})

describe('runActivationSelfProbe（两段式编排）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('首败竞速窗口：静默挂起（onRacePending、零终态回调）+ 兜底时延后重试一次成功 → ok', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(RACE_404)
      .mockResolvedValueOnce(undefined)
    const onRacePending = vi.fn()
    const onTerminalFailure = vi.fn()
    const onSuccess = vi.fn()
    runActivationSelfProbe({ probe, onRacePending, onTerminalFailure, onSuccess, retryDelayMs: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onRacePending).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onTerminalFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    // 幂等护栏：晚到的重试触发不重复轻探
    await vi.advanceTimersByTimeAsync(SELF_CHECK_RETRY_DELAY_MS)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('首败面缺席 + internal/service mount 事件先到：事件触发即时重试（免等兜底时延）', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(RACE_FACE_ABSENT)
      .mockResolvedValueOnce(undefined)
    let emit: (() => void) | undefined
    const onRacePending = vi.fn()
    const onSuccess = vi.fn()
    runActivationSelfProbe({
      probe,
      onRacePending,
      onTerminalFailure: vi.fn(),
      onSuccess,
      retryDelayMs: 10_000,
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    // 兜底时延不再二次重试
    await vi.advanceTimersByTimeAsync(10_000)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('重试仍失败：恰一次终态 fail-loud（失败因一行携带 cause）', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<() => Promise<void>>().mockRejectedValue(RACE_404)
    const onTerminalFailure = vi.fn()
    runActivationSelfProbe({ probe, onRacePending: vi.fn(), onTerminalFailure, onSuccess: vi.fn(), retryDelayMs: 1 })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onTerminalFailure).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure.mock.calls[0]?.[0]).toContain('HTTP 404')
    expect(onTerminalFailure.mock.calls[0]?.[0]).toContain('轻探不通')
  })

  it('首败非竞速类（typed business error）：即时终态，不进竞速挂起分支', async () => {
    const probe = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('数据通路断裂'))
    const onRacePending = vi.fn()
    const onTerminalFailure = vi.fn()
    runActivationSelfProbe({ probe, onRacePending, onTerminalFailure, onSuccess: vi.fn(), retryDelayMs: 1 })
    await Promise.resolve()
    await Promise.resolve()
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onRacePending).not.toHaveBeenCalled()
    expect(onTerminalFailure).toHaveBeenCalledTimes(1)
  })
})
