// forge:knowledge/* 六通道信封 DTO（通道面负载/响应——web rpc client 与 host 通道注册
// 共享；卡片/抽屉/分组行字段依据 prd/prd-ui-functions.md UF-4 / UF-6）。
// 1.7（A2 服务切换）：Interface 2 七法服务类型（KnowledgeService/BrowseKnowledgeService
// 及其专有入出参 SearchQuery/SearchHit/ReadAbstractQuery/EntryAbstract/IndexReport）
// 随服务面归属迁 @dsh-forge/knowledge 包——contracts 只留通道信封类型（五通道 DTO 不动）。
// knowledge-review-ui（1.3）增补：人工裁决写面——ListEntriesQuery 扩 statusFilter、
// EntryAction 入参/回执 DTO（forge:knowledge/entryAction 第六通道；形状/码集契约正本：
// .forge/docs/proposals/knowledge-review-ui/testing/contracts/entry-action-channel.md §1/§2）、
// DomainNode 扩 unconfirmedCount（待审核徽记，未过滤口径独立查询面供数）。
// stage④ 1.7（recall-scope contracts 面）：RecallVerb 扩四值（read/browse——DB v7
// ck_krl_verb 同步承载）；RecallGroup 扩 turnSeq/triggerSnap/contentSnap、RecallGroupHit
// 扩 rowId/score/scope（契约正本：proposals/knowledge-stage4-recall-scope/testing/
// recall-card-turn-summary/contracts/recall-record-channel.md §1 S1–S12）；ListEntriesQuery
// 扩 scopeFilter + KnowledgeCard 扩 scope（scope-source.md §1 S1/S2）；RecallFeedbackRequest
// /Outcome 第七通道信封迁入（feedback-channel.md §1 S2/S3——单一来源 contracts，插件域再导出）。
// 可空字段铁律（判例 7db97a7c）：显式 undefined 炸 lossless JSON——可空字段一律 `| null`
// 且生产面恒显式置 null（键恒在场），禁 undefined。
// 定位铁律：纯类型，零逻辑零依赖。

/** 召回动词（knowledge_recall_logs.verb CHECK 口径——v7 起四值：read/browse 为采纳/浏览动词） */
export type RecallVerb = 'search' | 'read-abstract' | 'read' | 'browse'

/** 条目来源标识（registry.scope 应用层二值——查询面派生产物，无 DDL 义务） */
export type EntryScope = 'project' | 'global'

/** 状态过滤片（UI chips 全部/待审核/已确认——服务端执行，零客户端过滤语义铁律维持） */
export type EntryStatusFilter = 'all' | 'unconfirmed' | 'confirmed'

/** 列表查询面 scope 过滤片（审核入口承载——服务端执行；缺省 'all' = 现役行为零变化） */
export type EntryScopeFilter = 'all' | EntryScope

/** listEntries 入参（组合过滤：目录路径前缀 + 关键词 + 状态片 + 来源片；缺省 = 现役行为） */
export interface ListEntriesQuery {
  projectId: string
  domainPrefix?: string
  keyword?: string
  statusFilter?: EntryStatusFilter
  /**
   * 来源过滤（stage④ 1.7 审核入口承载）：'global' = 仅全局库条目（待审核视图经此可见
   * unconfirmed 全局条目）；'all'/缺省 = 现役行为（调用方项目库）零变化。
   */
  scopeFilter?: EntryScopeFilter
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
  /** 条目来源标识（查询面派生——entry ↔ registry knowledge_dir 归属关联） */
  scope: EntryScope
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
  /** 该域待审核条目计数（含子域；未过滤口径独立查询面供数——不随 statusFilter 抖动） */
  unconfirmedCount: number
}

// ───────────────────────── knowledge-review-ui（1.3）人工裁决写面 ─────────────────────────

/**
 * entryAction 入参（`forge:knowledge/entryAction`——action 判别联合）。
 * entryIds 校验语义（运行期校验归服务/通道层，形状在此锚定）：
 * - confirm/reject：批量数组（语义 = 当前过滤结果集勾选集；空数组 = 请求级拒收）；
 * - move/editMeta：恰 1 条——元组 `[number]` 锚定单条形状（多条/零条 = 请求级拒收）；
 * - createDomain：无 entryIds（树级操作）。
 * entryId → slug id 映射归服务门面（`selectEntryByRowid` 惯例）；通道层/host 零解析。
 */
export type EntryActionRequest =
  | { projectId: string; action: 'confirm' | 'reject'; entryIds: number[] }
  | { projectId: string; action: 'move'; entryIds: [number]; targetDomain: string }
  | {
      projectId: string
      action: 'editMeta'
      entryIds: [number]
      title: string
      keywords: string[]
      summary: string
      body: string
    }
  | { projectId: string; action: 'createDomain'; domain: string }

/**
 * 逐条失败码——封闭字面量联合（码集封闭：实现不得引入联合外成员；新增成员必须
 * 经 fix/disc 链修订契约正本并同步夹具样例）。already-confirmed 不是 failure 码：
 * confirm 混入已 confirmed 条目 = 幂等成功等价回执（outcome 'success'），无重复记账。
 */
export type EntryActionFailureCode =
  /** reject 作用于 confirmed 条目（仅 unconfirmed 可驳回） */
  | 'rejected-confirmed'
  /** editMeta 提交时条目已前进（并发编辑窗口，CAS）。死码记账：当前服务面不产出此码（CAS 锚待通道层扩展），合成夹具 stale.json 预录承载——码集封闭性维持，扩展前不触发 */
  | 'stale'
  /** TOCTOU：勾选与执行间状态漂移（confirm 径 = 已归并 merged / reject 径 = 已升格） */
  | 'cas-failed'
  /** entryId 未命中（外部删除/错误 id）/ move 目标域不存在 */
  | 'not-found'
  /** 域 >3 层（createDomain/move/editMeta 三径同函数校验） */
  | 'domain-depth'
  /** YAML round-trip 注入拒收（editMeta 重写校验） */
  | 'yaml-invalid'
  /** reject 文件前置预检失败（文件不可删/不可读） */
  | 'precheck-failed'

/** 请求级拒收码（整请求拒回，不进逐条数组） */
export type EntryActionRequestRejectCode = 'invalid-request'

/** 逐条回执项：成功（含 already-confirmed 幂等等价）或失败（code ∈ 封闭码集） */
export type EntryActionResult =
  | { entryId: number; outcome: 'success' }
  | { entryId: number; outcome: 'failure'; code: EntryActionFailureCode; message: string }

/** entryAction 回执（逐条结果数组；部分失败不回滚已成功条目） */
export interface EntryActionReceipt {
  results: EntryActionResult[]
}

/** entryAction 请求级拒收（action 非法 / move·editMeta 条数 ≠ 恰 1 / 批量空数组 / 载荷字段不符） */
export interface EntryActionRequestReject {
  outcome: 'rejected-request'
  code: EntryActionRequestRejectCode
  message: string
}

/** sessionRecall 入参 */
export interface SessionRecallQuery {
  projectId: string
  /** dsh 会话 id（tab 分组键） */
  sessionId: string
}

/** 调用参数快照（query_json 的形状；可选键仅记在位过滤维度——JSON.parse 直转保持存量行兼容） */
export interface RecallQuerySnapshot {
  domainPrefix?: string
  /**
   * legacy 可选键（stage④ 1.4 keywords 调用参数退役）：存量快照行仍携带该键——
   * 保留为可选以防 JSON.parse 直转静默丢存量过滤事实；清理留 stage④b。
   */
  keywords?: string[]
  text?: string
  /** read-abstract 动词的调用参数（search 行不带） */
  entryId?: number
  /** read 动词的条目锚（id/标题锚——stage④ 1.5 落 query_json 快照键；有值才落键） */
  frontmatterId?: string
  /** search 出参 hint 写时点快照（stage④ 1.5——落 query_json 零新列；有值才落键） */
  hint?: string
  /** browse 动词调用参数快照（stage④ 1.5） */
  domain?: string
  offset?: number
  limit?: number
  order?: 'status' | 'created'
}

/** 召回分组行内的单条命中展开（快照字段抗索引重建） */
export interface RecallGroupHit {
  /** recall_logs 行级锚（rowid——行级反馈通道的目标键，stage④ 1.7） */
  rowId: number
  /** null = 条目已重建清除（行保留；索引未命中行级失效标注） */
  entryId: number | null
  frontmatterId: string | null
  /** title_snap */
  title: string | null
  /** domain_snap */
  domainPath: string | null
  /** 热度徽章 = 该条目使用事件计数（数据面事实保留；召回卡片 UI 不渲染） */
  heat: number
  /** 检索分（search 命中行有值；其余动词/哨兵行 null——DDL v7 score REAL NULL） */
  score: number | null
  /** 来源标识（查询面派生产物，无 DDL 义务） */
  scope: EntryScope
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
  /** 轮次序（session 事件日志派生；null = 轮次未锚——legacy 行/降级链） */
  turnSeq: number | null
  /** 触发输入快照（写时点派生，≤2000 字符含尾部截断标记；null = legacy 双缺/降级） */
  triggerSnap: string | null
  /** read 动词的 tool result 全文快照（不截断，含 render 头行）；非 read 动词恒 null */
  contentSnap: string | null
  hits: RecallGroupHit[]
}

// ───────────────────────── stage④ 1.5/1.7 召回反馈动作通道（第七通道信封） ─────────────────────────

/**
 * recallFeedback 入参（`forge:knowledge/recallFeedback`——判别联合）。
 * `feedback: 0` = toggle 撤销（置回未反馈态——feedback 列 0 + note/at 双 NULL）；事件级 👍
 * 不存在（正反馈无批动作语义——仅 👎 批 / 批撤销）。通道层只承担 IPC 载荷形状防线；
 * 越界/缺 note/unconfirmed 业务校验归插件服务域（沿 entryAction 分工先例）。
 */
export type RecallFeedbackRequest =
  | { projectId: string; action: 'row'; rowId: number; feedback: 1 | -1 | 0; note?: string }
  | { projectId: string; action: 'batch'; callId: string; feedback: -1 | 0; note?: string }

/** 逐行失败码（封闭联合——实现不得引入联合外成员；新增成员须经 fix/disc 链修订契约正本） */
export type RecallFeedbackFailureCode = 'not-found' | 'note-required' | 'unconfirmed'

/** 逐行回执项（batch 展开为逐行；行级真相恒逐行回执） */
export type RecallFeedbackResult =
  | { rowId: number; outcome: 'success' }
  | { rowId: number; outcome: 'failure'; code: RecallFeedbackFailureCode; message: string }

/** recallFeedback 回执联合（请求级拒收 = action 非法 / feedback 越界 / 载荷字段不符） */
export type RecallFeedbackOutcome =
  | { results: RecallFeedbackResult[] }
  | { outcome: 'rejected-request'; code: 'invalid-request'; message: string }

