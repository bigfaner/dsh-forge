// MermaidDiagram 装载重试回归测 —— 2026-10-13 提案图回退取证定性：
// loadMermaidEngine 曾把被拒 promise 永久缓存（enginePromise ??= import().then() 无拒后
// 清理）——页面存活期间一次瞬时装载失败（dist 重建 chunk 404 等同态）= 该页会话内一切
// mermaid 图恒回退，直到整页刷新。修复语义：reject 即清缓存，下次挂载以新 promise 重试。
// （本文件独立成件：'mermaid' mock 面为「工厂抛错 = import 恒拒」，与主测件的引擎替身互斥。）
import { describe, expect, it, vi } from 'vitest'

vi.mock('mermaid', () => {
  throw new Error('chunk load failed (mock: 瞬时装载失败)')
})

const { loadMermaidEngine } = await import('./mermaid-diagram.js')

describe('loadMermaidEngine 装载瞬时失败不粘住（毒化修复回归）', () => {
  it('reject 后清缓存：下次调用得新 promise（不复用被拒 promise）；单次调用内并发仍单飞', async () => {
    const p1 = loadMermaidEngine()
    const p1Concurrent = loadMermaidEngine()
    expect(p1Concurrent, '在途并发复用同 promise（单飞语义不因修复降级）').toBe(p1)
    await expect(p1, '装载失败如实 reject（归一面在 renderMermaidDiagram）').rejects.toThrow()

    const p2 = loadMermaidEngine()
    expect(p2, '毒化修复锚：失败后不缓存被拒 promise——新调用新 promise').not.toBe(p1)
    await expect(p2).rejects.toThrow()
  })
})
