// 3.1 forge:proposals/* 注册 pin：仅 list 单通道（写动词 createProposal/transitionProposal
// = agent tool 专属恒不上 RPC——SC7 Hard Rule）+ 负载映射端到端（替身层）。
import { describe, expect, it, vi } from 'vitest'
import { PROPOSALS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerProposalsChannels, type ProposalsChannelService } from './proposals-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

describe('3.1 forge:proposals/* 面分治（SC7：写动词不上 RPC）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const service: ProposalsChannelService = {
      listProposals: vi.fn().mockResolvedValue([
        {
          proposalId: 'pr-1',
          slug: 'demo-proposal',
          title: '演示提案',
          proposalStatus: 'open',
          createdAt: '2026-10-06T00:00:00.000Z',
          updatedAt: '2026-10-06T00:00:00.000Z',
        },
      ]),
    }
    registerProposalsChannels(createForgeIpc(ipcMain), service)
    return { service, handlers }
  }

  it('注册面恰一通道 = forge:proposals/list（createProposal/transitionProposal 无通道）', () => {
    const { handlers } = setup()
    expect([...handlers.keys()]).toEqual([PROPOSALS_CHANNELS.list])
    expect(handlers.has('forge:proposals/createProposal' as never)).toBe(false)
    expect(handlers.has('forge:proposals/transitionProposal' as never)).toBe(false)
  })

  it('list：ListProposalsQuery 透传 → ProposalCard[] typed 返回', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(PROPOSALS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1', sort: 'created' })).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({ proposalId: 'pr-1', slug: 'demo-proposal' })],
    })
    expect(service.listProposals).toHaveBeenCalledWith({ projectId: 'p-1', sort: 'created' })
  })
})
