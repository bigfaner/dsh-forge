// forge:knowledge/* 六通道注册（3.5 注册行；定位：基础——通道面装配，域语义归 knowledge
// 插件服务域）。1.7 A2 服务切换：通道名仅出自 @dsh-forge/contracts KNOWLEDGE_CHANNELS
//（三处一体：contracts → web/rpc → knowledge 插件服务域；Interface 2 浏览面 ↔ Interface 4
// 通道一一对应）；句柄来源 = knowledge 插件 provide 'knowledge' 服务（boot 桥面世，
// main 只 wiring——编排零下沉）。通道面不含 search/readAbstract（agent 面唯一门 =
// knowledge 插件 tool——双门分工，AC4）：注入面收窄为浏览四法 Pick + browse 聚合，
// 类型级禁令。host 禁 import 插件实现源码（tests/structure/host-main pin）——服务经
// 参数注入（结构类型）。
// knowledge-review-ui 1.6：entryAction 第六通道挂接（人工裁决写面）——Pick 面扩裁决五法
//（confirmBatch/rejectBatch/moveEntry/updateEntry/createDomain）；通道层 = 判别联合形状
// 校验 + 五分支无状态纯透传分派（回执/码集语义归插件域，编排零下沉）；knowledge 插件
// 缺席 = entryAction 与现役五通道同判定缝整体不挂（main.ts if 分支）。
// stage④ 1.7：recallFeedback 第七通道挂接（召回反馈动作写面）——Pick 面扩 recallFeedback
// 法；通道层 = 判别联合形状校验（action 判别键 + feedback 三值/二值 + 字段类型）+ 纯透传
//（越界/缺 note/unconfirmed 业务校验归插件服务域）；缺席同判定缝整体不挂。
import {
  KNOWLEDGE_CHANNELS,
  type EntryActionReceipt,
  type EntryActionRequest,
  type EntryActionRequestReject,
  type EntryDetailQuery,
  type ListEntriesQuery,
  type RecallFeedbackOutcome,
  type RecallFeedbackRequest,
  type SessionRecallQuery,
} from '@dsh-forge/contracts'
import type { BrowseKnowledgeService } from '@dsh-forge/knowledge'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/**
 * 注入服务面 = 浏览面四法 + browse 聚合法（browse = knowledge 服务域挂接面，3.5；
 * 入/出与 dto/rpc.ts KnowledgeChannelRequests/Responses 的 browse 行同构）+ 1.6 人工
 * 裁决写面五法（entryAction 通道分派目标）+ stage④ 1.7 召回反馈法（recallFeedback
 * 通道分派目标）。
 * = @dsh-forge/knowledge BrowseKnowledgeService 命名类型的 Pick（手工同步收口，
 * 类型随服务面归属迁 knowledge 包——1.7）。
 * search / readAbstract / rebuildIndex 不入面——经 web RPC 不可达（双门分工）。
 * fix-评审2 裁定（2026-11-05）：supersede/reinstate 随 agent tool 化（knowledge_supersede/
 * knowledge_reinstate）不扩员本 allowlist——归并/逆向为 agent 面/人工裁决动词，与
 * write 同守双门分工，web renderer 不可达（落文见提案裁决 #1 修订）。
 */
export type KnowledgeChannelService = Pick<
  BrowseKnowledgeService,
  | 'listEntries' | 'getEntryDetail' | 'heatByEntry' | 'sessionRecall' | 'browse'
  | 'confirmBatch' | 'rejectBatch' | 'moveEntry' | 'updateEntry' | 'createDomain'
  | 'recallFeedback'
>

/** entryAction 回执全集：逐条回执 / 请求级拒收 / createDomain 树级 outcome（无 entryId 维度） */
type EntryActionResponse =
  | EntryActionReceipt
  | EntryActionRequestReject
  | Awaited<ReturnType<BrowseKnowledgeService['createDomain']>>

function invalidRequest(message: string): EntryActionRequestReject {
  return { outcome: 'rejected-request', code: 'invalid-request', message }
}

/**
 * entryAction 判别联合分派（无状态纯透传——形状校验 + 五分支转发，编排零下沉）：
 * 批量两法集合语义原生透传；move/editMeta 解包恰单条；createDomain 直返树级 outcome。
 * 运行期校验仅承担 IPC 载荷形状防线（action 判别键 + entryIds 条数约束 + 载荷字段
 * 类型）——域校验/深度/YAML/TOCTOU 等业务拒收全归插件服务域。
 */
async function dispatchEntryAction(service: KnowledgeChannelService, req: EntryActionRequest): Promise<EntryActionResponse> {
  switch (req.action) {
    case 'confirm':
    case 'reject': {
      if (typeof req.projectId !== 'string' || !Array.isArray(req.entryIds) || req.entryIds.length === 0) {
        return invalidRequest(`批量 ${req.action} 需非空 entryIds 数组`)
      }
      const results = req.action === 'confirm'
        ? await service.confirmBatch({ projectId: req.projectId, entryIds: req.entryIds })
        : await service.rejectBatch({ projectId: req.projectId, entryIds: req.entryIds })
      return { results }
    }
    case 'move': {
      if (
        typeof req.projectId !== 'string'
        || !Array.isArray(req.entryIds) || req.entryIds.length !== 1 || typeof req.entryIds[0] !== 'number'
        || typeof req.targetDomain !== 'string'
      ) {
        return invalidRequest('move 需恰 1 条 entryIds 与 targetDomain 载荷')
      }
      const result = await service.moveEntry({ projectId: req.projectId, entryId: req.entryIds[0], targetDomain: req.targetDomain })
      return { results: [result] }
    }
    case 'editMeta': {
      if (
        typeof req.projectId !== 'string'
        || !Array.isArray(req.entryIds) || req.entryIds.length !== 1 || typeof req.entryIds[0] !== 'number'
        || typeof req.title !== 'string' || !Array.isArray(req.keywords) || req.keywords.some((k) => typeof k !== 'string')
        || typeof req.summary !== 'string' || typeof req.body !== 'string'
      ) {
        return invalidRequest('editMeta 需恰 1 条 entryIds 与 title/keywords/summary/body 载荷')
      }
      const result = await service.updateEntry({
        projectId: req.projectId,
        entryId: req.entryIds[0],
        title: req.title,
        keywords: req.keywords,
        summary: req.summary,
        body: req.body,
      })
      return { results: [result] }
    }
    case 'createDomain': {
      if (typeof req.projectId !== 'string' || typeof req.domain !== 'string' || req.domain === '') {
        return invalidRequest('createDomain 需 domain 域路径载荷')
      }
      return service.createDomain({ projectId: req.projectId, domain: req.domain })
    }
  }
}

/**
 * recallFeedback 判别联合分派（无状态纯透传——形状校验 + 转发，编排零下沉）：
 * 运行期校验仅承担 IPC 载荷形状防线（action 判别键 + feedback 三值/二值 + 字段类型）
 * ——note-required/unconfirmed/not-found 业务校验归插件服务域（feedback-channel.md §1
 * 校验分工先例）。未识别 action / feedback 越界 = 请求级拒收（invalid-request）。
 */
async function dispatchRecallFeedback(service: KnowledgeChannelService, req: RecallFeedbackRequest): Promise<RecallFeedbackOutcome> {
  const feedbackOk = (v: unknown): v is 1 | -1 | 0 => v === 1 || v === -1 || v === 0
  if (typeof req.projectId !== 'string') return invalidRequest('recallFeedback 需 projectId 载荷')
  if (req.action === 'row') {
    if (typeof req.rowId !== 'number' || !Number.isInteger(req.rowId) || !feedbackOk(req.feedback)) {
      return invalidRequest('row 动作需整数 rowId 与 feedback ∈ {1,-1,0}')
    }
    if (req.note !== undefined && typeof req.note !== 'string') {
      return invalidRequest('note 需 string 载荷')
    }
    return service.recallFeedback({ projectId: req.projectId, action: 'row', rowId: req.rowId, feedback: req.feedback, ...(req.note !== undefined ? { note: req.note } : {}) })
  }
  if (req.action === 'batch') {
    if (typeof req.callId !== 'string' || req.callId === '' || (req.feedback !== -1 && req.feedback !== 0)) {
      return invalidRequest('batch 动作需 callId 与 feedback ∈ {-1,0}（事件级 👍 不存在）')
    }
    if (req.note !== undefined && typeof req.note !== 'string') {
      return invalidRequest('note 需 string 载荷')
    }
    return service.recallFeedback({ projectId: req.projectId, action: 'batch', callId: req.callId, feedback: req.feedback, ...(req.note !== undefined ? { note: req.note } : {}) })
  }
  return invalidRequest('recallFeedback action 需 row | batch')
}

/** 七通道全集注册（负载映射 = dto/rpc.ts KnowledgeChannelRequests/Responses，键键对应） */
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
  ipc.register(
    KNOWLEDGE_CHANNELS.entryAction,
    rpcEnvelope((req: EntryActionRequest) => dispatchEntryAction(service, req)),
  )
  ipc.register(
    KNOWLEDGE_CHANNELS.recallFeedback,
    rpcEnvelope((req: RecallFeedbackRequest) => dispatchRecallFeedback(service, req)),
  )
}
