// forge:knowledge/* 五通道注册（3.5 注册行；定位：基础——通道面装配，域语义归 core 知识域）。
// 通道名仅出自 @dsh-forge/contracts KNOWLEDGE_CHANNELS（三处一体：contracts → web/rpc →
// core 知识域；Interface 2 浏览面 ↔ Interface 4 通道一一对应）；服务经参数注入（结构类型——
// host 禁 import core 源码，tests/structure/host-main pin；真实装配于 main boot 后接
// ctx.forgeKnowledge）。通道面不含 search/readAbstract（agent 面唯一门 = knowledge 插件
// tool——双门分工，AC4）：注入面收窄为浏览四法 Pick + browse 聚合，类型级禁令。
import {
  KNOWLEDGE_CHANNELS,
  type BrowseKnowledgeService,
  type EntryDetailQuery,
  type ListEntriesQuery,
  type SessionRecallQuery,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = 浏览面四法 + browse 聚合法（browse = core 知识域挂接面，3.5；
 * 入/出与 dto/rpc.ts KnowledgeChannelRequests/Responses 的 browse 行同构）。
 * fix-33 起 = contracts BrowseKnowledgeService 命名类型的 Pick（第八法手工同步收口）。
 * search / readAbstract / rebuildIndex 不入面——经 web RPC 不可达（双门分工）。
 */
export type KnowledgeChannelService = Pick<
  BrowseKnowledgeService,
  'listEntries' | 'getEntryDetail' | 'heatByEntry' | 'sessionRecall' | 'browse'
>

/** 五通道全集注册（负载映射 = dto/rpc.ts KnowledgeChannelRequests/Responses，键键对应） */
export function registerKnowledgeChannels(ipc: ForgeIpc, service: KnowledgeChannelService): void {
  ipc.register(
    KNOWLEDGE_CHANNELS.browse,
    rpcEnvelope((req: { projectId: string }) => service.browse(req)),
  )
  ipc.register(
    KNOWLEDGE_CHANNELS.listEntries,
    rpcEnvelope((q: ListEntriesQuery) => service.listEntries(q)),
  )
  ipc.register(
    KNOWLEDGE_CHANNELS.entryDetail,
    rpcEnvelope((q: EntryDetailQuery) => service.getEntryDetail(q)),
  )
  ipc.register(
    KNOWLEDGE_CHANNELS.heat,
    rpcEnvelope((req: { projectId: string }) => service.heatByEntry(req.projectId)),
  )
  ipc.register(
    KNOWLEDGE_CHANNELS.sessionRecall,
    rpcEnvelope((q: SessionRecallQuery) => service.sessionRecall(q)),
  )
}
