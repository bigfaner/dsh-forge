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
  /** 四档派生 rank（stage② §2.4——confirmed 1.0 / unconfirmed 0.6 / 冲突 0.4 / superseded 0.2） */
  effectiveRank: number
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
  // ── stage② 写入门（§2.3/§2.4——write/read/confirm 三法） ──
  /** 严契约写入：三拒收/三问不过/查重建议/版本化复用 id（回执面见 KnowledgeWriteOutcome） */
  write(q: KnowledgeWriteQuery): Promise<KnowledgeWriteOutcome>
  /** 全文读取（agent 面）：confirmed 全开 / unconfirmed 拒且不露存在性 / superseded 曾审可读 */
  read(q: KnowledgeReadQuery): Promise<KnowledgeReadOutcome>
  /** confirm 升格（服务方法非 tool）：CAS 前置（未归并）+ 事务内旧版降 superseded + 指针前移 */
  confirm(q: KnowledgeConfirmQuery): Promise<KnowledgeConfirmOutcome>
  // ── stage② 1.6 存量收编（§2.5——服务方法非 tool） ──
  /** scan 只读体检：违规 + 重复清单逐文件指名（零写入） */
  scanKnowledge(q: { projectId: string }): Promise<KnowledgeScanReport>
  /** register 幂等注册：realpath canonical / deny 系统目录 / reparse 拒收 + 入库默认 unconfirmed */
  registerKnowledge(q: RegisterKnowledgeQuery): Promise<RegisterKnowledgeOutcome>
}

/** Interface 2 + 第八法聚合面：KnowledgeService 七法 + browse 域树聚合（forge:knowledge/browse 通道 handler 本体）+ 注册行写入（第九法） */
export interface BrowseKnowledgeService extends KnowledgeService, KnowledgeRegistryWriter {
  /** 域树聚合（Interface 2 之外；listEntries 兼作底表 → aggregateDomainTree） */
  browse(q: { projectId: string }): Promise<DomainNode[]>
}

/** registerProject 入参（第九法——1.15 注册链进表径：projects.knowledge_dir 列退役后注册行唯一产品写径） */
export interface RegisterProjectWrite {
  /** 工作区 canonical 路径（注册行 ws_path 键——upsert 内 canonical 化） */
  readonly wsPath: string
  /** 知识目录（缺省 = `<wsPath>/.knowledge`——列退役后产品面恒缺省派生） */
  readonly knowledgeDir?: string
  /** API 级 projectId（fix-2 一级解析动态化：落注册行 project_id 列——config 静态表未命中时回查此列） */
  readonly projectId?: string
}

/** 注册行写入面（BrowseKnowledgeService 第九法：host 注册链 wiring 消费，fail-soft 于 host 侧） */
export interface KnowledgeRegistryWriter {
  /** 目录缺则递归建（fix-39 建面语义随列退役迁本域）+ upsert 注册行（幂等） */
  registerProject(input: RegisterProjectWrite): Promise<void>
}

// ── stage② 写入门（§2.3/§2.4）──

/** 五类 type 枚举（§2.1：conventions/pitfalls/decisions/lessons/facts） */
export const KNOWLEDGE_TYPES = ['conventions', 'pitfalls', 'decisions', 'lessons', 'facts'] as const
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

/** 必要性三问结论（agent 自判必答——§2.3 落库闸：不过不写） */
export interface NecessityAnswers {
  /** 长期稳定（非一次性上下文） */
  readonly stable: boolean
  /** 非常识（通用工程常识不落库） */
  readonly nonTrivial: boolean
  /** 本域价值（对该项目知识域有预估价值） */
  readonly value: boolean
  /** 结论依据（弃置项轨迹可见） */
  readonly reason?: string
}

/** write 入参（严契约：title/summary/keywords/body/type/necessity 必答） */
export interface KnowledgeWriteQuery {
  readonly projectId: string
  readonly sessionId?: string
  readonly title: string
  readonly summary: string
  readonly keywords: readonly string[]
  readonly body: string
  /** 域（目录相对路径，≤3 层；缺省根域） */
  readonly domain?: string
  /** 五类 type（agent 预判；低置信机器预判回退 procedure 默认+待定） */
  readonly type?: string
  /** 形态标签（独立 tag 维度，不改写 type 判定） */
  readonly procedure?: boolean
  /** 中文 title 时的英译提示（slug id 生成链第二优先级） */
  readonly slugHint?: string
  /** 同概念版本化：复用既有条目 id（supersedes 锚当前权威 version_ts；与 candidate_of 互斥） */
  readonly versionOf?: string
  /** 必要性三问结论（必答） */
  readonly necessity: NecessityAnswers
}

/** 查重归并建议（不拒收——§2.3：查重给归并建议） */
export interface MergeSuggestion {
  readonly id: string
  readonly title: string
  /** title_norm 精确 / fts-approx / jaccard */
  readonly basis: 'title-norm' | 'fts-approx' | 'jaccard'
  /** Jaccard 相似度 / FTS 归一分（basis 对应维度携带） */
  readonly similarity?: number
}

/** write 成功回执 */
export interface KnowledgeWritten {
  readonly outcome: 'written'
  /** 生成/复用的条目 id（slug——agent 可见稳定标识） */
  readonly id: string
  readonly versionTs: string
  readonly filePath: string
  /** type 机器预判（低置信 → procedure 默认 + pending） */
  readonly typeJudged: KnowledgeType | undefined
  /** 预判低置信标记（procedure 默认 + 待定——升格审核面消费） */
  readonly typePending: boolean
  /** 查重归并建议（不拒收） */
  readonly mergeSuggestions: readonly MergeSuggestion[]
  /** 疑似同概念但 id 不同的跨条目挂起（与版本化互斥） */
  readonly candidateOf?: string
  /** 版本化路径（复用 id + supersedes 锚） */
  readonly supersedes?: string
}

/** write 回执联合：written / not-written（三问不过）/ rejected（严契约三拒收） */
export type KnowledgeWriteOutcome =
  | KnowledgeWritten
  | { readonly outcome: 'not-written'; readonly reason: 'necessity-failed'; readonly detail: string }
  | {
      readonly outcome: 'rejected'
      /** 三拒收：illegal-path / roundtrip / missing-field */
      readonly reason: 'illegal-path' | 'roundtrip' | 'missing-field'
      readonly field?: string
      readonly detail: string
    }

/** knowledge_read 入参（按条目 id——agent 可见稳定标识） */
export interface KnowledgeReadQuery {
  readonly projectId: string
  readonly sessionId?: string
  readonly id: string
}

/** read 回执联合：read（md 全文）/ denied（unconfirmed 拒正文且不露存在性） */
export type KnowledgeReadOutcome =
  | {
      readonly outcome: 'read'
      readonly id: string
      readonly title: string
      readonly status: string
      readonly versionTs: string
      /** md 全文（与盘上文件逐字节等值——CT-WG-14 O1） */
      readonly body: string
    }
  | { readonly outcome: 'denied'; readonly message: string }

/** confirm 入参（服务方法非 tool——§2.3 裁决 1） */
export interface KnowledgeConfirmQuery {
  readonly projectId: string
  /** 条目 id */
  readonly id: string
  /** 目标版本（缺省 = 最新版本） */
  readonly versionTs?: string
}

/** confirm 回执联合：confirmed / cas-failed（已归并） */
export type KnowledgeConfirmOutcome =
  | { readonly outcome: 'confirmed'; readonly id: string; readonly versionTs: string; readonly demoted: readonly string[] }
  | { readonly outcome: 'cas-failed'; readonly id: string; readonly reason: 'merged'; readonly detail: string }

/** 回流配置面（§2.4：阈值归插件 config，非代码常量） */
export interface BackflowConfig {
  /** 冲突隔离档（0.4）回流的检索分阈值（score×rank 归一） */
  readonly conflictThreshold?: number
  /** superseded 档（0.2）回流的检索分阈值 */
  readonly supersededThreshold?: number
  /** 每对（新旧版）回流次数上限（滞回——默认 2） */
  readonly maxPerPair?: number
  /** 回流冷却窗毫秒（默认 24h） */
  readonly cooldownMs?: number
}

// ── stage② 1.6 存量收编：scan 体检 + register 注册（§2.5/§2.6——服务方法非 tool） ──

/** scan 体检违规项（逐文件指名——违规清单每文件一行，reasons 累积） */
export interface ScanViolation {
  /** 相对知识目录的规范化路径 */
  readonly relPath: string
  /** 违规原因（frontmatter/summary/keywords/domain-depth/id-missing/id-invalid） */
  readonly reasons: readonly string[]
}

/** 重复清单组（title_norm 归一重复 / 全文 content_hash 重复——逐文件指名） */
export interface ScanDuplicateGroup {
  readonly basis: 'title' | 'content'
  readonly relPaths: readonly string[]
}

/** scan 只读体检报告（零写入——不建目录不落行） */
export interface KnowledgeScanReport {
  readonly knowledgeDir: string
  readonly fileCount: number
  readonly violations: readonly ScanViolation[]
  readonly duplicates: readonly ScanDuplicateGroup[]
}

/** register 入参（wsPath canonical 化 + 系统目录拒绝 + reparse 拒收——幂等） */
export interface RegisterKnowledgeQuery {
  /** 工作区路径（realpath canonical 化后作注册行键） */
  readonly wsPath: string
  /** 知识目录（缺省 = `<wsPath>/.knowledge`） */
  readonly knowledgeDir?: string
  /** API 级 projectId（一级解析回查列） */
  readonly projectId?: string
}

/** register 回执联合：registered（幂等重入同值）/ rejected（三类拒绝） */
export type RegisterKnowledgeOutcome =
  | {
      readonly outcome: 'registered'
      readonly wsPath: string
      readonly knowledgeDir: string
      /** 入库条目数（rebuild 后；默认 unconfirmed） */
      readonly indexed: number
      /** 不入索引文件数（违规/出索引） */
      readonly skipped: number
    }
  | {
      readonly outcome: 'rejected'
      /** system-dir（系统目录拒收）/ reparse-point（符号链接/junction 拒收）/ unreachable（不可达且不可建） */
      readonly reason: 'system-dir' | 'reparse-point' | 'unreachable'
      readonly detail: string
    }
