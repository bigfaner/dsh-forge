// forge:knowledge/* 五通道注册（3.5 注册行；定位：基础——通道面装配，域语义归 knowledge
// 插件服务域）。1.7 A2 服务切换：通道名仅出自 @dsh-forge/contracts KNOWLEDGE_CHANNELS
//（三处一体：contracts → web/rpc → knowledge 插件服务域；Interface 2 浏览面 ↔ Interface 4
// 通道一一对应）；句柄来源 = knowledge 插件 provide 'knowledge' 服务（boot 桥面世，
// main 只 wiring——编排零下沉）。通道面不含 search/readAbstract（agent 面唯一门 =
// knowledge 插件 tool——双门分工，AC4）：注入面收窄为浏览四法 Pick + browse 聚合，
// 类型级禁令。host 禁 import 插件实现源码（tests/structure/host-main pin）——服务经
// 参数注入（结构类型）。
import {
  KNOWLEDGE_CHANNELS,
  type EntryDetailQuery,
  type ListEntriesQuery,
  type SessionRecallQuery,
} from '@dsh-forge/contracts'
import type { BrowseKnowledgeService } from '@dsh-forge/knowledge'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = 浏览面四法 + browse 聚合法（browse = knowledge 服务域挂接面，3.5；
 * 入/出与 dto/rpc.ts KnowledgeChannelRequests/Responses 的 browse 行同构）。
 * = @dsh-forge/knowledge BrowseKnowledgeService 命名类型的 Pick（第八法手工同步收口，
 * 类型随服务面归属迁 knowledge 包——1.7）。
 * search / readAbstract / rebuildIndex 不入面——经 web RPC 不可达（双门分工）。
 * fix-评审2 裁定（2026-11-05）：supersede/reinstate 随 agent tool 化（knowledge_supersede/
 * knowledge_reinstate）不扩员本 allowlist——归并/逆向为 agent 面/人工裁决动词，与
 * write 同守双门分工，web renderer 不可达（落文见提案裁决 #1 修订）。
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
