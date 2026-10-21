// child 诊断 relay 单测（app-observability 1.2）：ctx diag/log 事件 → 结构化 JSON 行；
// main 侧 parseDiagRelayLine 转译；ALS trace_id 同步读入行负载（订阅回调内——评审 Note-1）。
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createDiagContextStore, runWithDiagContext } from './diag-context.js'
import { emitDiag } from './diag-events.js'
import { parseDiagRelayLine, relayDiagOverBridge } from './child-relay.js'

describe('relayDiagOverBridge（child 侧）', () => {
  it('emit 一次 → send 收一行结构化 JSON（payload 字段保真）', () => {
    const ctx = new Context()
    const lines: string[] = []
    relayDiagOverBridge(ctx, (line) => lines.push(line))
    emitDiag(ctx, { level: 'warn', process: 'child', event: 'fail-open', message: 'boom' })
    expect(lines).toHaveLength(1)
    const payload = parseDiagRelayLine(lines[0])
    expect(payload).toMatchObject({ level: 'warn', process: 'child', event: 'fail-open', message: 'boom' })
  })

  it('ALS 上下文内 emit → trace_id 随行携带（链 B 进程内贯穿）', () => {
    const ctx = new Context()
    const als = createDiagContextStore()
    const lines: string[] = []
    relayDiagOverBridge(ctx, (line) => lines.push(line), als)
    runWithDiagContext(als, { traceId: 'tr-child', sessionId: 's1' }, () => {
      emitDiag(ctx, { level: 'error', process: 'child', event: 'gateway-fold', message: 'm' })
    })
    expect(parseDiagRelayLine(lines[0])).toMatchObject({ traceId: 'tr-child', sessionId: 's1' })
  })

  it('send 抛异常不落回 emit 点（红线①——relay 内吞）', () => {
    const ctx = new Context()
    relayDiagOverBridge(ctx, () => { throw new Error('send boom') })
    expect(() => emitDiag(ctx, { level: 'info', process: 'child', event: 'x', message: 'm' })).not.toThrow()
  })

  it('退订生效', () => {
    const ctx = new Context()
    const lines: string[] = []
    const dispose = relayDiagOverBridge(ctx, (line) => lines.push(line))
    dispose()
    emitDiag(ctx, { level: 'info', process: 'child', event: 'x', message: 'm' })
    expect(lines).toHaveLength(0)
  })
})

describe('parseDiagRelayLine（main 侧转译）', () => {
  it('纯文本行（[pair-diag] 既有链）→ undefined（落回 harness.log 链）', () => {
    expect(parseDiagRelayLine('[pair-diag] /pair tokenVerify=pass')).toBeUndefined()
  })
  it('畸形 JSON → undefined', () => {
    expect(parseDiagRelayLine('{"__diag":')).toBeUndefined()
  })
  it('缺字段（level/process/event/message 任一非法）→ undefined', () => {
    expect(parseDiagRelayLine(JSON.stringify({ __diag: { level: 'nope', process: 'child', event: 'e', message: 'm' } }))).toBeUndefined()
    expect(parseDiagRelayLine(JSON.stringify({ __diag: { level: 'warn', process: 'child', event: 'e' } }))).toBeUndefined()
  })
  it('全字段保真（stack/projectId/cwd/traceId/repeat）', () => {
    const line = JSON.stringify({
      __diag: { level: 'error', process: 'child', event: 'gateway-fold', message: 'm', stack: 's', projectId: 'p', cwd: 'c', traceId: 't', repeat: 3 },
    })
    expect(parseDiagRelayLine(line)).toEqual({
      level: 'error', process: 'child', event: 'gateway-fold', message: 'm', stack: 's', projectId: 'p', cwd: 'c', traceId: 't', repeat: 3,
    })
  })
})
