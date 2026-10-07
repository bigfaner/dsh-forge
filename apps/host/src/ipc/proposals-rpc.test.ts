// 3.1 → M3 3.8 forge:proposals/* 注册 pin：四通道（list + M3 三新——Interface 4 drift 修订：
// transition 双面上 RPC / setMode UI 专属正门 / listDocs 目录扫描读）+ 面分治（createProposal
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

const proposalRow = {
  proposalId: 'pr-1',
  slug: 'demo-proposal',
  title: '演示提案',
  proposalStatus: 'under-review',
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
}

describe('3.8 forge:proposals/* 注册面（Interface 4 扩池：M2 单 list → 四通道）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const service: ProposalsChannelService = {
      listProposals: vi.fn().mockResolvedValue([{ ...proposalRow, taskCount: 2 }]),
      transitionProposal: vi.fn().mockResolvedValue({ ...proposalRow, proposalStatus: 'accepted' }),
      setProposalMode: vi.fn().mockResolvedValue({ ...proposalRow, mode: 'expedition' }),
      listProposalDocs: vi.fn().mockResolvedValue([
        { fileName: 'proposal.md', relPath: 'docs/proposals/demo-proposal/proposal.md' },
      ]),
    }
    registerProposalsChannels(createForgeIpc(ipcMain), service)
    return { service, handlers }
  }

  it('注册面 = contracts PROPOSALS_CHANNELS 全集四通道（list/transition/setMode/listDocs——无多无少）', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(Object.values(PROPOSALS_CHANNELS).sort())
  })

  it('SC7 面分治：createProposal 无通道（agent tool 专属写动词——注入类型收窄四法 Pick）', () => {
    const { handlers } = setup()
    expect(handlers.has('forge:proposals/createProposal' as never)).toBe(false)
    // Hard Rule：tool 面零 setMode 的对偶面——RPC 面 setMode 在场（UI 专属正门），
    // agent tool 注册面无模式改写动词（SC6 契约断言对象归 5.1 pin）
    expect(handlers.has(PROPOSALS_CHANNELS.setMode)).toBe(true)
  })

  it('list：ListProposalsQuery 透传 → ProposalCard[] typed 返回', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(PROPOSALS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1', sort: 'created' })).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({ proposalId: 'pr-1', taskCount: 2 })],
    })
    expect(service.listProposals).toHaveBeenCalledWith({ projectId: 'p-1', sort: 'created' })
  })

  it('transition（drift 修订——双面）：TransitionProposalInput 透传 → 成链水化结果 typed 返回', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(PROPOSALS_CHANNELS.transition)!
    const input = { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' as const }
    await expect(handler(undefined, input)).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ proposalId: 'pr-1', proposalStatus: 'accepted' }),
    })
    expect(service.transitionProposal).toHaveBeenCalledWith(input)
  })

  it('setMode（律三唯一正门·UI 专属）：SetProposalModeInput 透传（reason 必填——人工变更溯源）', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(PROPOSALS_CHANNELS.setMode)!
    const input = { projectId: 'p-1', proposalId: 'pr-1', mode: 'expedition' as const, reason: '远征成链' }
    await expect(handler(undefined, input)).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ proposalId: 'pr-1', mode: 'expedition' }),
    })
    expect(service.setProposalMode).toHaveBeenCalledWith(input)
  })

  it('listDocs（2.3 扫描法）：ListProposalDocsQuery 透传 → ProposalDocRow[] typed 返回', async () => {
    const { service, handlers } = setup()
    const handler = handlers.get(PROPOSALS_CHANNELS.listDocs)!
    const input = { projectId: 'p-1', slug: 'demo-proposal' }
    await expect(handler(undefined, input)).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({ fileName: 'proposal.md' })],
    })
    expect(service.listProposalDocs).toHaveBeenCalledWith(input)
  })
})
