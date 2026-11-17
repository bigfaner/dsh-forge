// forge-bundle-absent 诊断发射点单测（plugin-forge-combo fix-1 / CT-DISK-07 · CT-NPM-06
// 意向锚核销）：缺席 @dsh-forge 裸包行 → emitDiag 事件域载荷（event: 'forge-bundle-absent'、
// payload 含缺席裸包名）；非 forge 包跳过不误报；零缺席 = 零事件。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DIAG_EVENT } from '../telemetry/index.js'
import { forgeBundleAbsentPayloads } from './child.js'

describe('forgeBundleAbsentPayloads（forge-bundle-absent 诊断载荷投影）', () => {
  it('缺席 @dsh-forge 裸包行逐件投影：event 固定 + message 携带裸包名与 reason', () => {
    const payloads = forgeBundleAbsentPayloads([
      { packageName: '@dsh-forge/knowledge', reason: 'manifest unreadable' },
      { packageName: '@dsh-forge/task-loop', reason: 'not resolvable' },
    ])
    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toMatchObject({
      level: 'warn',
      process: 'child',
      event: 'forge-bundle-absent',
      message: 'forge bundle absent: @dsh-forge/knowledge (manifest unreadable)',
    })
    expect(payloads[1]!.message).toContain('@dsh-forge/task-loop')
  })

  it('非 @dsh-forge 前缀的跳过行不投影（零误报）', () => {
    const payloads = forgeBundleAbsentPayloads([
      { packageName: 'some-other-plugin', reason: 'compat' },
    ])
    expect(payloads).toEqual([])
  })

  it('零缺席 = 零事件；载荷可经 diag/log 事件域分发（emitDiag 同域形态）', () => {
    expect(forgeBundleAbsentPayloads([])).toEqual([])
    const ctx = new Context()
    const seen: unknown[] = []
    ctx.on(DIAG_EVENT, (payload) => seen.push(payload))
    for (const payload of forgeBundleAbsentPayloads([
      { packageName: '@dsh-forge/knowledge', reason: 'absent' },
    ])) {
      ctx.emit(DIAG_EVENT, payload)
    }
    expect(seen).toHaveLength(1)
  })
})
