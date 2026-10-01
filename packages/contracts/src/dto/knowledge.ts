// KnowledgeService 方法签名与 DTO（tech-design §Interface 2 逐项对照，不自行增删字段；
// 卡片/抽屉/分组行字段依据 prd/prd-ui-functions.md UF-4 / UF-6）。
// 定位铁律：纯类型，零逻辑零依赖。

/** 召回动词（knowledge_recall_logs.verb CHECK 口径） */
export type RecallVerb = 'search' | 'read-abstract'

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

/** listEntries 入参（组合过滤：目录路径前缀 + 关键词） */
export interface ListEntriesQuery {
  projectId: string
  domainPrefix?: string
  keyword?: string
}

/** 浏览卡片（UF-6：标题/摘要/关键词/状态/时间 + 热度徽章；兼作域树聚合数据源——domainPath 前缀派生） */
export interface KnowledgeCard {
  entryId: number
  title: string
  summary: string
  keywords: string[]
  status: string
  domainPath: string
  /** frontmatter.updated（缺省取文件 mtime） */
  updated: string
  /** 热度 = 使用事件按条目计数（与 knowledge_recall_logs 断言一致，哨兵行不计） */
  heat: number
}

/** getEntryDetail 入参 */
export interface EntryDetailQuery {
  projectId: string
  entryId: number
}

/** 详情抽屉（UF-6：摘要块 + 两列元数据 + Markdown 正文，元数据与正文分离；正文区不含 frontmatter） */
export interface EntryDetail {
  entryId: number
  title: string
  summary: string
  keywords: string[]
  status: string
  domainPath: string
  /** frontmatter.authors（可缺省） */
  authors: string | null
  /** frontmatter.updated（缺省取文件 mtime） */
  updated: string
  /** Markdown 正文（按需读取；统一 MarkdownDoc 包装渲染，variant = body） */
  body: string
}

/** heatByEntry 返回体（entryId → 使用事件计数） */
export type HeatByEntry = ReadonlyMap<number, number>

/** 域树节点（forge:knowledge/browse 聚合返回体；域 = 目录路径派生 ≤3 层） */
export interface DomainNode {
  /** 完整域路径，段间以 `/` 连接（目录相对段派生，如 `编程/java`） */
  domainPath: string
  /** 末段目录名 */
  label: string
  /** 1..3（层级上限见 frontmatter 契约常量） */
  depth: number
  /** 该域条目计数（含子域，与域前缀过滤同口径） */
  entryCount: number
}

/** sessionRecall 入参 */
export interface SessionRecallQuery {
  projectId: string
  /** dsh 会话 id（tab 分组键） */
  sessionId: string
}

/** 调用参数快照（query_json 的形状） */
export interface RecallQuerySnapshot {
  domainPrefix?: string
  keywords?: string[]
  text?: string
}

/** 召回分组行内的单条命中展开（快照字段抗索引重建） */
export interface RecallGroupHit {
  /** null = 条目已重建清除（行保留；索引未命中行级失效标注） */
  entryId: number | null
  frontmatterId: string | null
  /** title_snap */
  title: string | null
  /** domain_snap */
  domainPath: string | null
  /** 热度徽章 = 该条目使用事件计数 */
  heat: number
}

/** 召回分组行（统计头 = call_id 聚合；零命中调用 hitCount = 0 且 hits 为空） */
export interface RecallGroup {
  callId: string
  verb: RecallVerb
  query: RecallQuerySnapshot | null
  hitCount: number
  durationMs: number | null
  /** 最近时间（ISO-8601） */
  createdAt: string
  hits: RecallGroupHit[]
}

/** Interface 2：core · 知识域服务面（ctx.forgeKnowledge） */
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
