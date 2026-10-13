// forge:bugs/* 通道注册（fix-bug——proposals-rpc.ts 同径：通道常量/注册/装配三处一体：
// contracts → web/rpc → core bug 域）。通道名仅出自 @dsh-forge/contracts BUGS_CHANNELS。
// 面分治：listBugs = Bug 子 tab 列表读面（服务端搜索/状态过滤/排序）；recordBug/resolveBug
// 写动词 = agent tool 专属不上 RPC（channels.ts 面分治纪律）。
import { BUGS_CHANNELS, type ForgeBugsService, type ListBugsQuery } from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 注入服务面 = RPC 单法（list）。recordBug/resolveBug 不入面——agent tool 专属写动词。 */
export type BugsChannelService = Pick<ForgeBugsService, 'listBugs'>

/** 通道注册（负载映射 = contracts BugsChannelRequests/Responses，键键对应） */
export function registerBugsChannels(ipc: ForgeIpc, service: BugsChannelService): void {
  ipc.register(BUGS_CHANNELS.list, rpcEnvelope((q: ListBugsQuery) => service.listBugs(q)))
}
