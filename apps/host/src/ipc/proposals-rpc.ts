// forge:proposals/* 通道注册（3.1 注册行；定位：基础——通道面装配，域语义归 core 提案域）。
// 通道名仅出自 @dsh-forge/contracts PROPOSALS_CHANNELS（三处一体：contracts → web/rpc →
// core 提案域）。面分治（SC7 Hard Rule）：createProposal/transitionProposal = agent tool
// 专属写动词，恒不上 RPC——注入类型收窄为 listProposals 单法 Pick（类型级禁令）。
import { PROPOSALS_CHANNELS, type ForgeProposalsService, type ListProposalsQuery } from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 注入服务面 = listProposals 单法（写动词 createProposal/transitionProposal 不入面——tool 专属） */
export type ProposalsChannelService = Pick<ForgeProposalsService, 'listProposals'>

/** 通道注册（负载映射 = contracts ProposalsChannelRequests/Responses，键键对应） */
export function registerProposalsChannels(ipc: ForgeIpc, service: ProposalsChannelService): void {
  ipc.register(PROPOSALS_CHANNELS.list, rpcEnvelope((q: ListProposalsQuery) => service.listProposals(q)))
}
