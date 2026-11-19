// runActivationSelfProbe 编排单测（boot 竞速根治——1.2 复核欠账 R2-竞速支；fix-2
// 语义修正钉）：竞速分类钉（404/面缺席 → 静默挂起 + internal/service mount 事件驱动
// 轻探、无固定短窗）+ 长诊断超时钉（有事件缝 = 仅诊断不 fail-loud；事件缝缺席 = 兜底
// 终态）+ 终态 fail-loud 语义保持钉（非竞速类失败即时）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runActivationSelfProbe,
  isBootRaceWindowFailure,
  SELF_CHECK_DIAG_TIMEOUT_MS,
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

describe('runActivationSelfProbe（mount 事件驱动编排）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('首败竞速窗口：静默挂起（onRacePending、零终态回调）+ mount 事件驱动重试成功 → ok', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(RACE_404)
      .mockResolvedValueOnce(undefined)
    const onRacePending = vi.fn()
    const onTerminalFailure = vi.fn()
    const onSuccess = vi.fn()
    let emit: (() => void) | undefined
    runActivationSelfProbe({
      probe,
      onRacePending,
      onTerminalFailure,
      onSuccess,
      diagTimeoutMs: SELF_CHECK_DIAG_TIMEOUT_MS,
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onRacePending).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onTerminalFailure).not.toHaveBeenCalled()
    // 事件到达（mount 落座）→ 即时轻探，无固定短窗
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    // 幂等护栏：成功后晚到的事件/超时不重复轻探
    emit?.()
    await vi.advanceTimersByTimeAsync(SELF_CHECK_DIAG_TIMEOUT_MS)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('mount 事件早于 mount 完成（事件后仍竞速类失败）：继续挂起等待下一事件，不误 fail-loud', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(RACE_FACE_ABSENT)
      .mockRejectedValueOnce(RACE_404)
      .mockResolvedValueOnce(undefined)
    const onTerminalFailure = vi.fn()
    const onSuccess = vi.fn()
    let emit: (() => void) | undefined
    runActivationSelfProbe({
      probe,
      onRacePending: vi.fn(),
      onTerminalFailure,
      onSuccess,
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(3)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).not.toHaveBeenCalled()
  })

  it('长诊断超时（有事件缝）：仅出一条诊断（onDiag），不终态，后续事件仍可成功', async () => {
    vi.useFakeTimers()
    let succeed = false
    const probe = vi.fn<() => Promise<void>>(() =>
      succeed ? Promise.resolve() : Promise.reject(RACE_FACE_ABSENT),
    )
    const onDiag = vi.fn()
    const onTerminalFailure = vi.fn()
    let emit: (() => void) | undefined
    runActivationSelfProbe({
      probe,
      onRacePending: vi.fn(),
      onTerminalFailure,
      onSuccess: vi.fn(),
      onDiag,
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SELF_CHECK_DIAG_TIMEOUT_MS)
    expect(onDiag).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    // 超时后 mount 事件到达 → 轻探成功
    succeed = true
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    expect(onDiag).toHaveBeenCalledTimes(1)
  })

  it('mount 事件缝缺席（onServiceEvent undefined）：诊断超时兜底终态 fail-loud', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<() => Promise<void>>().mockRejectedValue(RACE_FACE_ABSENT)
    const onTerminalFailure = vi.fn()
    runActivationSelfProbe({ probe, onRacePending: vi.fn(), onTerminalFailure, onSuccess: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SELF_CHECK_DIAG_TIMEOUT_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure.mock.calls[0]?.[0]).toContain('事件缝缺席')
  })

  it('重试事件触发后非竞速类失败：恰一次终态 fail-loud（失败因一行携带 cause）', async () => {
    vi.useFakeTimers()
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(RACE_404)
      .mockRejectedValueOnce(new Error('数据通路断裂'))
    const onTerminalFailure = vi.fn()
    let emit: (() => void) | undefined
    runActivationSelfProbe({
      probe,
      onRacePending: vi.fn(),
      onTerminalFailure,
      onSuccess: vi.fn(),
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onTerminalFailure).toHaveBeenCalledTimes(1)
    expect(onTerminalFailure.mock.calls[0]?.[0]).toContain('数据通路断裂')
    expect(onTerminalFailure.mock.calls[0]?.[0]).toContain('轻探不通')
  })

  it('首败非竞速类（typed business error）：即时终态，不进竞速挂起分支', async () => {
    const probe = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('数据通路断裂'))
    const onRacePending = vi.fn()
    const onTerminalFailure = vi.fn()
    runActivationSelfProbe({ probe, onRacePending, onTerminalFailure, onSuccess: vi.fn() })
    await Promise.resolve()
    await Promise.resolve()
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onRacePending).not.toHaveBeenCalled()
    expect(onTerminalFailure).toHaveBeenCalledTimes(1)
  })

  it('探呼在途时事件到达：跳过本次事件（零并发轻探）', async () => {
    vi.useFakeTimers()
    let resolveProbe: (() => void) | undefined
    const probe = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveProbe = resolve
      }))
      .mockResolvedValue(undefined)
    let emit: (() => void) | undefined
    runActivationSelfProbe({
      probe,
      onRacePending: vi.fn(),
      onTerminalFailure: vi.fn(),
      onSuccess: vi.fn(),
      onServiceEvent: (fn) => {
        emit = fn
        return () => {}
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    emit?.()
    await vi.advanceTimersByTimeAsync(0)
    // 首呼在途（挂起前），事件不触发第二次轻探
    expect(probe).toHaveBeenCalledTimes(1)
    resolveProbe?.()
    await vi.advanceTimersByTimeAsync(0)
  })
})
