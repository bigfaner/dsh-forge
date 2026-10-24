// 1.18 · forge-loop source 铸发面单测（AD-4 / api-handbook 4.3）：
// ① source 形状（kind/loopKind/runId/task/state + ContextForm notice 形态）；
// ② runId 铸发唯一；③ MessageSourceMap 声明合并生效（type 位直接消费 'forge-loop' 键——
// 模块加载期/编译期校验：合并不生效此文件不过 tsc）。
import { describe, expect, it } from 'vitest'
import type { MessageSourceMap } from '@deepseek-ai/dsh-llm/message'
import { forgeLoopSource, FORGE_LOOP_SOURCE_KIND, FORGE_LOOP_KIND_DISPATCH } from './forge-loop-source.js'

/** 声明合并编译期校验：'forge-loop' 键已在官方 MessageSourceMap 上（缺合并 = 此行类型错误） */
type AugmentedLoopSource = MessageSourceMap['forge-loop']

describe('forge-loop source（1.18 AD-4 循环哨兵——桌面循环注入面）', () => {
  it('source 形状：kind/loopKind/task/state + ContextForm notice 形态（summary 必带）', () => {
    const source = forgeLoopSource({ task: 'feat-x', state: 'dispatch', summary: '摘要' })
    const typed: AugmentedLoopSource = source
    expect(typed.kind).toBe('forge-loop')
    expect(typed.loopKind).toBe(FORGE_LOOP_KIND_DISPATCH)
    expect(typed.task).toBe('feat-x')
    expect(typed.state).toBe('dispatch')
    expect(typed.form).toBe('notice')
    expect(typed.summary).toBe('摘要')
    expect(typeof typed.runId).toBe('string')
  })

  it('runId 铸发唯一：每次铸发新 uuid，无共享', () => {
    const a = forgeLoopSource({ summary: 'a' })
    const b = forgeLoopSource({ summary: 'b' })
    expect(a.runId).not.toBe(b.runId)
    expect(a.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('缺席字段落兜底：task 空串、state followup（face 不强求调用方知情）', () => {
    const source = forgeLoopSource({ summary: 'x' })
    expect(source.task).toBe('')
    expect(source.state).toBe('followup')
    expect(FORGE_LOOP_SOURCE_KIND).toBe('forge-loop')
  })
})
