// diag 发射面单测——行为一致快照：console 兜底按级分流与行格式（双源归一前后逐字同行为）
// + emitDiag 事件名/负载透传 + emitDiagOrFallback 缝三态（在场透传 / 发射失败兜底 / 缺席兜底）。
import { describe, expect, it, vi } from 'vitest'
import {
  DIAG_EVENT,
  consoleDiagFallback,
  diagConsoleFallback,
  emitDiag,
  emitDiagOrFallback,
} from './diag.js'

describe('emitDiag', () => {
  it('经结构化 emit 面以 DIAG_EVENT 事件名透传负载（引用同一对象）', () => {
    const payload = { level: 'warn' as const, process: 'main' as const, event: 'worktree-create', message: 'm' }
    const emit = vi.fn()
    emitDiag({ emit }, payload)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(DIAG_EVENT, payload)
  })
})

describe('console 兜底（按级分流——core telemetry / git-worktree 双源归一单实现）', () => {
  it('diagConsoleFallback：payload 形态，行格式 = [event] message', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    diagConsoleFallback({ level: 'error', event: 'fail-open', message: 'boom' })
    diagConsoleFallback({ level: 'warn', event: 'worktree-create', message: 'soft' })
    diagConsoleFallback({ level: 'info', event: 'session-bind', message: 'ok' })
    errSpy.mockRestore()
    warnSpy.mockRestore()
    expect([errSpy.mock.calls, warnSpy.mock.calls]).toMatchSnapshot()
  })

  it('consoleDiagFallback：行形态，缺省 warn 级', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleDiagFallback('[fail-open] boom', 'error')
    consoleDiagFallback('[session-bind] drifted')
    errSpy.mockRestore()
    warnSpy.mockRestore()
    expect([errSpy.mock.calls, warnSpy.mock.calls]).toMatchSnapshot()
  })
})

describe('emitDiagOrFallback（缝三态）', () => {
  const payload = { level: 'warn' as const, event: 'session-bind', message: 'm' }

  it('缝在场 → 透传，零 console', () => {
    const onDiag = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    emitDiagOrFallback(onDiag, payload)
    warnSpy.mockRestore()
    expect(onDiag).toHaveBeenCalledTimes(1)
    expect(onDiag).toHaveBeenCalledWith(payload)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('缝发射失败 → console 兜底（诊断不静默）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    emitDiagOrFallback(
      () => {
        throw new Error('emit failed')
      },
      payload,
    )
    warnSpy.mockRestore()
    expect(warnSpy.mock.calls).toMatchSnapshot()
  })

  it('缝缺席 → console 兜底', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    emitDiagOrFallback(undefined, payload)
    warnSpy.mockRestore()
    expect(warnSpy.mock.calls).toMatchSnapshot()
  })
})
