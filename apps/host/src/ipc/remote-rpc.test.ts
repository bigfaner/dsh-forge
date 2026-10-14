// mobile-remote-approval 1.1 forge:remote/* 注册 pin：两通道（progress/approval）+
// 负载映射端到端（替身层）+ allowlist 校验正/负样例（正：两通道注册通过；负：未列通道拒绝）+
// 审批转发器缺席 fail-soft（unavailable——remote.session 先例同型）。
import { describe, expect, it, vi } from 'vitest'
import { REMOTE_CHANNELS } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerRemoteChannels, type RemoteChannelService } from './remote-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

function fakeService(): RemoteChannelService {
  return {
    listTasks: vi.fn(async () => []),
    taskStats: vi.fn(async () => ({
      total: 0,
      byStatus: {
        pending: 0,
        in_progress: 0,
        interrupted: 0,
        blocked: 0,
        suspended: 0,
        completed: 0,
        skipped: 0,
        rejected: 0,
      },
      unmetPending: 0,
    })),
  }
}

function setup(forwardApproval?: Parameters<typeof registerRemoteChannels>[2]) {
  const { ipcMain, handlers } = fakeIpcMain()
  const service = fakeService()
  registerRemoteChannels(createForgeIpc(ipcMain), service, forwardApproval)
  return { service, handlers }
}

describe('1.1 forge:remote/* 注册面（allowlist 正/负样例）', () => {
  it('正样例：注册面恰两通道 = REMOTE_CHANNELS 全集（progress/approval——allowlist 校验通过）', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(Object.values(REMOTE_CHANNELS).sort())
  })

  it('负样例：allowlist 外通道（forge:remote/admin）拒绝注册即抛（fail-loud，不静默降级）', () => {
    const { ipcMain } = fakeIpcMain()
    expect(() =>
      createForgeIpc(ipcMain).register('forge:remote/admin' as never, async () => undefined),
    ).toThrow(/通道不在 allowlist/)
  })

  it('progress：负载透传既有只读口径（listTasks sort=active + taskStats）→ 快照信封（零本地副本）', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(REMOTE_CHANNELS.progress)!
    const envelope = (await handler(undefined, { projectId: 'p-1' })) as { ok: boolean; data: unknown }
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ tasks: [], stats: expect.any(Object) })
    expect(service.listTasks).toHaveBeenCalledWith({ projectId: 'p-1', statusFilter: undefined, sort: 'active' })
    expect(service.taskStats).toHaveBeenCalledWith({ projectId: 'p-1' })
  })

  it('approval 转发器缺席：fail-soft unavailable（forwarded=false + reason——不炸壳）', async () => {
    const { handlers } = setup()
    const handler = handlers.get(REMOTE_CHANNELS.approval)!
    await expect(handler(undefined, { requestId: 'req-1', decision: 'allow' })).resolves.toEqual({
      ok: true,
      data: { forwarded: false, reason: 'unavailable' },
    })
  })

  it('approval 转发器在场：决策原样透传（产品不自持审批状态）', async () => {
    const forwardApproval = vi.fn(async () => ({ forwarded: true }))
    const { handlers } = setup(forwardApproval)
    const handler = handlers.get(REMOTE_CHANNELS.approval)!
    const input = { requestId: 'req-1', decision: 'reject' as const, reason: '不批' }
    await expect(handler(undefined, input)).resolves.toEqual({ ok: true, data: { forwarded: true } })
    expect(forwardApproval).toHaveBeenCalledWith(input)
  })
})
