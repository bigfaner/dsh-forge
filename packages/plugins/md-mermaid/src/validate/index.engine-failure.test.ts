// bug 62211111 伴生面：引擎失败裁决 lossless JSON 合规——显式 undefined 属性会被
// harness 输出快照边界整值拒绝（「value is not lossless JSON」），真实报错被吞。
// 桩引擎注入 {ok:false, message}（引擎装载失败形态：无 line）驱动 verdictToVerdictShape。
import { describe, expect, it, vi } from 'vitest'

vi.mock('./mermaid-engine.js', () => ({
  parseMermaidSource: vi.fn(async () => ({ ok: false as const, message: 'mermaid 引擎装载失败：ERR_MODULE_NOT_FOUND' })),
}))

import { validateSource } from './index.js'

/** harness lossless JSON 同口径： Own 键值不得为 undefined */
function assertLossless(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return
  for (const [key, v] of Object.entries(value)) {
    expect(v, `显式 undefined 属性：${path}.${key}`).not.toBeUndefined()
    assertLossless(v, `${path}.${key}`)
  }
}

describe('bug 62211111：引擎失败裁决 = 键缺席式（lossless JSON——显式 undefined 整值拒绝）', () => {
  it('引擎失败（无 line）裁决不含显式 undefined 属性', async () => {
    const r = await validateSource('flowchart LR\n  A --> B')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('ERR_MODULE_NOT_FOUND')
    expect('line' in r, 'line 缺席 = 键缺席（非显式 undefined）').toBe(false)
    expect('unsupported' in r, 'unsupported 缺席 = 键缺席').toBe(false)
    assertLossless(r, 'verdict')
  })
})
