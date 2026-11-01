// bug 7ba48c55（diag-face-consolidation 统一口径）：诊断缝缺席的 console 兜底必须按级
// 分流——error→console.error、其余→console.warn（expert-squad index.ts 配方），禁止直落
// 单级 console.warn 兜底。三站点：index.ts config.diag 兜底 / rpc-service.ts deps.warn 兜底
// / session-send-wrap.ts warn 参数兜底。
import { afterEach, describe, expect, it, vi } from 'vitest'
import gitWorktreePlugin from './index.js'
import { createWorktreeRpcService } from './rpc-service.js'
import { interceptSessionSends } from './session-send-wrap.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('诊断缝缺席 console 兜底按级分流（bug 7ba48c55）', () => {
  it('index.ts：config.diag 缺席 + provide 失败（error 级）→ console.error，不落 console.warn', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = { provide: () => { throw new Error('boom') } }
    const dispose = gitWorktreePlugin(ctx as never, { checkGit: async () => true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    dispose()
    expect(err).toHaveBeenCalledTimes(1)
    expect(err.mock.calls[0]?.[0]).toContain('provide 失败')
    expect(warn).not.toHaveBeenCalled()
  })

  it('index.ts：config.diag 缺席 + 官方 provide 面缺席（error 级）→ console.error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = gitWorktreePlugin({} as never, { checkGit: async () => true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    dispose()
    expect(err).toHaveBeenCalledTimes(1)
    expect(err.mock.calls[0]?.[0]).toContain('官方面缺席')
  })

  it('rpc-service.ts：deps.warn 缺席 + workspace 懒物化失败（warn 级）→ console.warn', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const service = createWorktreeRpcService({
      workspaceRegistry: () => ({ create: async () => { throw new Error('registry boom') } }) as never,
    })
    await service.ensureWorkspace({ path: process.cwd(), projectRoot: process.cwd() } as never)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('workspace 懒物化失败')
    expect(err).not.toHaveBeenCalled()
  })

  it('session-send-wrap.ts：warn 缺席 + 判读链异常 fail-open（warn 级）→ console.warn', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = { prompt: async () => 'ok' } as never
    const restore = interceptSessionSends(
      controller,
      async () => { throw new Error('seal boom') },
    )
    await expect((controller as { prompt: () => Promise<string> }).prompt({ sessionId: 's1' })).resolves.toBe('ok')
    restore()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('发送拦截判读失败')
    expect(err).not.toHaveBeenCalled()
  })
})
