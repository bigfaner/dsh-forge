// forge:proposals/* 通道注册（3.1 注册行；M3 3.8 扩池四通道；定位：基础——通道面装配，
// 域语义归 core 提案域）。通道名仅出自 @dsh-forge/contracts PROPOSALS_CHANNELS（三处一体：
// contracts → web/rpc → core 提案域）。
// 面分治（tech-design Interface 4 drift 修订）：createProposal 恒 agent tool 专属不上 RPC
// （注入类型收窄为四法 Pick——类型级禁令）；transitionProposal M3 起双面（UF-1 人工裁决，
// agent 面保留——评审发生在 agent 会话时技能代笔）；setMode = 律三唯一正门·UI 专属
// （Hard Rule：agent tool 面无模式改写动词）；listDocs = 提案文档区只读扫描（2.3 目录扫描法）。
import {
  PROPOSALS_CHANNELS,
  type ForgeProposalsService,
  type ListProposalDocsQuery,
  type ListProposalsQuery,
  type SetProposalModeInput,
  type TransitionProposalInput,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = RPC 四法（list/transition/setMode/listDocs）。createProposal 不入面——
 * agent tool 专属写动词（SC7）；setMode 仅经本面可达 = 模式改写唯一人类正门。
 */
export type ProposalsChannelService = Pick<
  ForgeProposalsService,
  'listProposals' | 'transitionProposal' | 'setProposalMode' | 'listProposalDocs'
>

/** 通道注册（负载映射 = contracts ProposalsChannelRequests/Responses，键键对应） */
export function registerProposalsChannels(ipc: ForgeIpc, service: ProposalsChannelService): void {
  ipc.register(PROPOSALS_CHANNELS.list, rpcEnvelope((q: ListProposalsQuery) => service.listProposals(q)))
  ipc.register(
    PROPOSALS_CHANNELS.transition,
    rpcEnvelope((input: TransitionProposalInput) => service.transitionProposal(input)),
  )
  ipc.register(
    PROPOSALS_CHANNELS.setMode,
    rpcEnvelope((input: SetProposalModeInput) => service.setProposalMode(input)),
  )
  ipc.register(
    PROPOSALS_CHANNELS.listDocs,
    rpcEnvelope((q: ListProposalDocsQuery) => service.listProposalDocs(q)),
  )
}
