// Interface 2 七法类型（knowledge-stage1 1.7 随迁自 contracts——服务面归属插件域）。
// 通道信封类型（五通道 DTO：KnowledgeCard/EntryDetail/RecallGroup/DomainNode 等）仍以
// contracts 为单一来源（web/host 通道面消费不变）；本文件只持服务方法签名与其专有
// 入出参（IndexReport/SearchQuery/SearchHit/ReadAbstractQuery/EntryAbstract）。
// 定位铁律：纯类型，零逻辑（类型依赖仅 contracts 信封）。
import type {
  DomainNode,
  EntryDetail,
  EntryDetailQuery,
  HeatByEntry,
  KnowledgeCard,
  ListEntriesQuery,
  RecallGroup,
  SessionRecallQuery,
} from '@dsh-forge/contracts'

/** rebuildIndex 返回体（容错计数：不合格条目不入索引不硬拒——硬拒收归 M4 写入面） */
export interface IndexReport {
  /** 入索引条目数 */
  indexed: number
  /** 不入索引条目数（缺 summary/keywords 或域超层；UI 空态提示） */
  skipped: number
}

/** search 入参（域前缀可选，省略 = 全域） */
export interface SearchQuery {
  projectId: string
  /** dsh 会话 id（recall_logs tab 分组键；插件 3.4 从会话上下文解析传入——ER session_id NOT NULL / DF004。
   *  缺省空串 = 无会话上下文（不进任何会话 tab）。 */
  sessionId?: string
  /** 域前缀（目录路径前缀匹配） */
  domainPrefix?: string
  /** 关键词细分（keywords 维度） */
  keywords?: string[]
  /** 检索词 */
  text?: string
  limit?: number
}

/** search 返回体（摘要先行；frontmatterId 可空——P1 存而不强求） */
export interface SearchHit {
  /** 索引内稳定（INTEGER PK） */
  entryId: number
  frontmatterId: string | null
  title: string
  summary: string
  domainPath: string
  score: number
}

/** readAbstract 入参 */
export interface ReadAbstractQuery {
  projectId: string
  /** dsh 会话 id（同 SearchQuery.sessionId——recall_logs tab 分组键） */
  sessionId?: string
  entryId: number
}

/** readAbstract 返回体（不含正文） */
export interface EntryAbstract {
  entryId: number
  title: string
  summary: string
  keywords: string[]
  status: string
  domainPath: string
}

/** Interface 2：knowledge 插件服务面（ctx.knowledge——A2 服务切换后归属插件域） */
export interface KnowledgeService {
  /** 按需一次性重建（启动/进面板；事务内删旧插新，幂等） */
  rebuildIndex(projectId: string): Promise<IndexReport>
  /** 索引缓存直读，摘要先行；执行点写 knowledge_recall_logs（零命中写哨兵行） */
  search(q: SearchQuery): Promise<SearchHit[]>
  /** 不含正文；执行点写 knowledge_recall_logs（1 行）；entryId 未命中抛 ERR_ENTRY_NOT_FOUND */
  readAbstract(q: ReadAbstractQuery): Promise<EntryAbstract>
  /** 浏览面数据源（兼作域树聚合数据源） */
  listEntries(q: ListEntriesQuery): Promise<KnowledgeCard[]>
  /** 含 Markdown 正文按需读取 */
  getEntryDetail(q: EntryDetailQuery): Promise<EntryDetail>
  /** = 使用事件计数（哨兵行不计；sessionRecall 同源单表） */
  heatByEntry(projectId: string): Promise<HeatByEntry>
  /** 召回 tab 数据源（统计头 = call_id 聚合；分组行 = 命中快照展开 + 热度徽章按条目计数） */
  sessionRecall(q: SessionRecallQuery): Promise<RecallGroup[]>
}

/** Interface 2 + 第八法聚合面：KnowledgeService 七法 + browse 域树聚合（forge:knowledge/browse 通道 handler 本体） */
export interface BrowseKnowledgeService extends KnowledgeService {
  /** 域树聚合（Interface 2 之外；listEntries 兼作底表 → aggregateDomainTree） */
  browse(q: { projectId: string }): Promise<DomainNode[]>
}
