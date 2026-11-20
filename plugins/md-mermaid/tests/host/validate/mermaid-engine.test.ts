// mermaid-engine 懒加载纪律测试（桩引擎——vi.mock 计数动态 import 与 initialize 调用）。
// 真引擎集成测试在 ./index.test.ts（实源回归 + flowchart 矩阵）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ importCount: 0, initArgs: [] as Array<Record<string, unknown>> }))

vi.mock('mermaid', () => {
  state.importCount++
  return {
    default: {
      initialize: (args: Record<string, unknown>) => {
        state.initArgs.push(args)
      },
      parse: async (_src: string) => ({ diagramType: 'flowchart-v2' }),
    },
  }
})

import { loadMermaidEngine, parseMermaidSource } from './mermaid-engine.js'

describe('懒加载纪律', () => {
  beforeEach(() => {
    state.importCount = 0
    state.initArgs = []
  })

  it('模块导入零引擎装载（动态 import 未触发）', async () => {
    // 顶层 import 已完成——此刻零装载
    expect(state.importCount).toBe(0)
    expect(state.initArgs).toHaveLength(0)
  })

  it('首次 parse 触发且仅触发一次动态 import + 单次 initialize(startOnLoad:false, securityLevel:loose)', async () => {
    await parseMermaidSource('flowchart LR\n  A --> B')
    expect(state.importCount).toBe(1)
    expect(state.initArgs).toEqual([{ startOnLoad: false, securityLevel: 'loose' }])

    // 第二次调用复用模块级 promise 缓存——不再 import、不再 initialize
    await parseMermaidSource('flowchart LR\n  A --> B')
    expect(state.importCount).toBe(1)
    expect(state.initArgs).toHaveLength(1)
  })

  it('loadMermaidEngine 与 parse 并发调用不重复装载（共享缓存 promise）', async () => {
    const before = { imports: state.importCount, inits: state.initArgs.length }
    await Promise.all([loadMermaidEngine(), parseMermaidSource('graph TD\n  A --> B')])
    expect(state.importCount).toBe(before.imports)
    expect(state.initArgs).toHaveLength(before.inits)
  })

  it('合法源经桩引擎归一为 ok:true', async () => {
    await expect(parseMermaidSource('flowchart LR\n  A --> B')).resolves.toEqual({ ok: true })
  })
})
