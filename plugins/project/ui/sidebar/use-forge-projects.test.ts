// use-forge-projects 单测 —— 项目拉取相位映射（AC2：forge:projects/list；fail-soft 错误归一）。
// 1.6 随 sidebar 族注册面自 apps/web 平移本包，数据源改接 Typert（ui/rpc face）；本件测
// 纯异步映射 fetchProjectsPhase（成功/typed error/face 缺席归一）。hook 的 effect 胶水不在
// SSR 测面（renderToStaticMarkup 不跑 effect—— ForgeSidebarSlot.test 已证骨架相位）。
import { describe, expect, it } from 'vitest'
import { createForgeRpcClient, RpcClientError, type ForgeRpcClient } from '../rpc.js'
import { fetchProjectsPhase } from './use-forge-projects.js'

function clientWith(list: () => Promise<unknown[]>): ForgeRpcClient {
  const client = createForgeRpcClient()
  return { ...client, projects: { ...client.projects, list } }
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

  it('typed error / face 缺席 → error 相位（fail-soft 不抛）', async () => {
    const failing = (): ForgeRpcClient =>
      clientWith(async () => {
        throw new RpcClientError({ code: 'ERR_PROJECT_WRITE', message: 'boom' })
      })
    const out = await fetchProjectsPhase(failing)
    expect(out.phase).toBe('error')
    expect((out as { message: string }).message).toBe('boom')

    // face 缺席（官方 remote 面缺席宿主——诚实降级 typed Error）同样归一 error，不炸壳
    const absent = await fetchProjectsPhase(() => {
      throw new Error('官方 forge remote 面缺席（forgeProjects.list）')
    })
    expect(absent.phase).toBe('error')
    expect((absent as { message: string }).message).toContain('缺席')
  })
})
