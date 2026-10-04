// use-forge-projects 单测 —— 项目拉取相位映射（AC2：forge:projects/list；fail-soft 错误归一）。
// hook 的 effect 胶水不在 SSR 测面（renderToStaticMarkup 不跑 effect—— ForgeSidebarSlot.test
// 已证骨架相位；fix-24 ① silentRefresh 的 open 边沿重拉同归 e2e hero-control spec）；本件测
// 纯异步映射 fetchProjectsPhase（成功/typed error/preload 缺席归一）。
import { describe, expect, it } from 'vitest'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { fetchProjectsPhase } from './use-forge-projects.js'

function clientWith(list: () => Promise<unknown[]>): ForgeRpcClient {
  return createForgeRpcClient(async (_channel, _payload) => ({ ok: true, data: await list() }))
}

describe('fetchProjectsPhase（单次拉取相位映射）', () => {
  it('成功 → ready（projects 原样承载）', async () => {
    const out = await fetchProjectsPhase(() =>
      clientWith(async () => [
        { id: 'p1', workspaceId: 'w1', name: '网关', wsPath: 'Z:/w', archived: false },
      ]),
    )
    expect(out).toEqual({
      phase: 'ready',
      projects: [{ id: 'p1', workspaceId: 'w1', name: '网关', wsPath: 'Z:/w', archived: false }],
    })
  })

  it('typed error / 通道缺席 → error 相位（fail-soft 不抛）', async () => {
    const failing = (): ForgeRpcClient =>
      createForgeRpcClient(async () => {
        throw new RpcClientError({ code: 'ERR_PROJECT_WRITE', message: 'boom' })
      })
    const out = await fetchProjectsPhase(failing)
    expect(out.phase).toBe('error')
    expect((out as { message: string }).message).toBe('boom')

    // preload 真身缺席（非 Electron 载体）同样归一 error，不炸壳
    const absent = await fetchProjectsPhase(() => {
      // transport 构造期抛（preloadTransport fail-loud 面）
      throw new Error('window.dshForge.invoke 缺席')
    })
    expect(absent.phase).toBe('error')
    expect((absent as { message: string }).message).toContain('缺席')
  })
})
