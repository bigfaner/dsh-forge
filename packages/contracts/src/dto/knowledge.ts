// forge:knowledge/* 五通道信封 DTO（通道面负载/响应——web rpc client 与 host 通道注册
// 共享；卡片/抽屉/分组行字段依据 prd/prd-ui-functions.md UF-4 / UF-6）。
// 1.7（A2 服务切换）：Interface 2 七法服务类型（KnowledgeService/BrowseKnowledgeService
// 及其专有入出参 SearchQuery/SearchHit/ReadAbstractQuery/EntryAbstract/IndexReport）
// 随服务面归属迁 @dsh-forge/knowledge 包——contracts 只留通道信封类型（五通道 DTO 不动）。
// 定位铁律：纯类型，零逻辑零依赖。

/** 召回动词（knowledge_recall_logs.verb CHECK 口径） */
export type RecallVerb = 'search' | 'read-abstract'

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
  /** read-abstract 动词的调用参数（search 行不带） */
  entryId?: number
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

