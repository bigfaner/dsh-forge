// renderer console 转发单测（app-observability 1.2）：双形态归一 + warn/error 过滤 +
// 同文重复行折叠（changes.summary 404 轮询不淹没日志）。
import { describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../telemetry/diag-events.js'
import { forwardRendererConsole, normalizeConsoleMessage } from './console-forward.js'

describe('normalizeConsoleMessage（Electron 双形态归一）', () => {
  it('新形事件对象：warn/error 透传；info 级拒绝', () => {
    expect(normalizeConsoleMessage([{ level: 'warn', message: 'm' }])).toEqual({ level: 'warn', message: 'm' })
    expect(normalizeConsoleMessage([{ level: 'error', message: 'm' }])).toEqual({ level: 'error', message: 'm' })
    expect(normalizeConsoleMessage([{ level: 'info', message: 'm' }])).toBeUndefined()
    expect(normalizeConsoleMessage([{ level: 'log', message: 'm' }])).toBeUndefined()
  })
  it('bug 84b5216a：Electron 真机新形 level 枚举 warning（非 warn）→ 归一 warn；debug 拒绝', () => {
    expect(normalizeConsoleMessage([{ level: 'warning', message: 'w' }])).toEqual({ level: 'warn', message: 'w' })
    expect(normalizeConsoleMessage([{ level: 'debug', message: 'd' }])).toBeUndefined()
  })
  it('旧形位置参数：2=warn 3=error；1=info 拒绝', () => {
    expect(normalizeConsoleMessage([{ seed: true }, 2, 'w'])).toEqual({ level: 'warn', message: 'w' })
    expect(normalizeConsoleMessage([{ seed: true }, 3, 'e'])).toEqual({ level: 'error', message: 'e' })
    expect(normalizeConsoleMessage([{ seed: true }, 1, 'i'])).toBeUndefined()
  })
})

describe('forwardRendererConsole（折叠计数 + 诊断域 emit）', () => {
  function harness() {
    const emitted: DiagEventPayload[] = []
    let clock = 1_000
    const listeners: Array<(...args: unknown[]) => void> = []
    const fake = {
      on: (_e: string, l: (...args: unknown[]) => void) => listeners.push(l),
      removeListener: (_e: string, l: unknown) => {
        const i = listeners.indexOf(l as (...args: unknown[]) => void)
        if (i >= 0) listeners.splice(i, 1)
      },
    }
    const forward = forwardRendererConsole(fake, (p) => emitted.push(p), () => clock)
    return { emitted, listeners, forward, bump: (ms: number) => { clock += ms } }
  }

  it('warn/error 逐行 emit（event=console，process=renderer）', () => {
    const h = harness()
    h.listeners[0]?.({ level: 'warn', message: 'a' })
    h.listeners[0]?.({ level: 'error', message: 'b' })
    h.forward.flush()
    expect(h.emitted).toHaveLength(2)
    expect(h.emitted[0]).toMatchObject({ level: 'warn', process: 'renderer', event: 'console', message: 'a' })
  })

  it('info 级零 emit（噪音门）', () => {
    const h = harness()
    h.listeners[0]?.({ level: 'info', message: 'noise' })
    h.listeners[0]?.({ seed: true }, 1, 'noise')
    h.forward.flush()
    expect(h.emitted).toHaveLength(0)
  })

  it('同文重复行折叠为单行 + repeat 计数（404 轮询噪音源）', () => {
    const h = harness()
    for (let i = 0; i < 5; i++) h.listeners[0]?.({ level: 'warn', message: 'changes.summary 404' })
    h.forward.flush()
    expect(h.emitted).toHaveLength(1)
    expect(h.emitted[0].repeat).toBe(4)
  })

  it('bug 84b5216a：真机 warning closer 行收口先行 error 折叠组（无须显式 flush）', () => {
    const h = harness()
    h.listeners[0]?.({ level: 'error', message: 'err-mark' })
    h.listeners[0]?.({ level: 'warning', message: 'closer-mark' })
    expect(h.emitted).toHaveLength(1)
    expect(h.emitted[0]).toMatchObject({ level: 'error', message: 'err-mark' })
    h.forward.flush()
    expect(h.emitted).toHaveLength(2)
    expect(h.emitted[1]).toMatchObject({ level: 'warn', message: 'closer-mark' })
  })

  it('异文切换 / 越窗 → 分组收口', () => {
    const h = harness()
    h.listeners[0]?.({ level: 'warn', message: 'x' })
    h.listeners[0]?.({ level: 'warn', message: 'y' })
    h.bump(61_000)
    h.listeners[0]?.({ level: 'warn', message: 'x' })
    h.forward.flush()
    expect(h.emitted).toHaveLength(3)
  })

  it('listener 异常不外溢（红线①同构）', () => {
    const h = harness()
    expect(() => h.listeners[0]?.(undefined, 'x' as unknown as number, 'y' as unknown as string)).not.toThrow()
    expect(() => h.listeners[0]?.({ level: 42 as unknown as string, message: 'm' })).not.toThrow()
  })
})
