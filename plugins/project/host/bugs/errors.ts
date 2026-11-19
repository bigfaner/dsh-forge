// bugs 域 typed errors（plugin-project 1.11 归拢——自 core small-domains/bugs.ts 承袭；
// 域内就近落位）。code 字面量锚定 lib/api errors.ts ERROR_CODES；类名/name 手写字面量
// （contracts 不持运行期名映射）。RPC 边界序列化为 RpcErrorPayload { code, message, data }。
// 与 core 同 code 异类：插件域禁 import core，typed 类按域就近落位，跨 IPC 以 code 判别。

/** ERR_REASON_REQUIRED 附载（resolveBug unresolved 空因——与任务域 transition 同语义） */
export interface ReasonRequiredData {
  readonly verb: string
}

/** 转移动词空因（400）：reason trim 后为空 */
export class ReasonRequiredError extends Error {
  readonly code = 'ERR_REASON_REQUIRED' as const
  readonly data: ReasonRequiredData

  constructor(data: ReasonRequiredData) {
    super(`${data.verb} 需要 reason（转移缘由必带——空因拒绝）`)
    this.name = 'ReasonRequiredError'
    this.data = data
  }
}

/** ERR_BUG_NOT_FOUND 附载 */
export interface BugNotFoundData {
  readonly projectId: string
  readonly bugId: string
}

/** bugId 未命中（404） */
export class BugNotFoundError extends Error {
  readonly code = 'ERR_BUG_NOT_FOUND' as const
  readonly data: BugNotFoundData

  constructor(data: BugNotFoundData) {
    super(`bug 未命中：${data.bugId}（project ${data.projectId}）`)
    this.name = 'BugNotFoundError'
    this.data = data
  }
}

/** ERR_BUG_SUMMARY_TOO_LONG 附载 */
export interface BugSummaryTooLongData {
  readonly summary: string
  readonly max: number
}

/** registerBug summary 超长拒写（≤50 字） */
export class BugSummaryTooLongError extends Error {
  readonly code = 'ERR_BUG_SUMMARY_TOO_LONG' as const
  readonly data: BugSummaryTooLongData

  constructor(data: BugSummaryTooLongData) {
    super(`summary 超长拒绝：${data.max} 字上限，实际 ${Array.from(data.summary).length} 字`)
    this.name = 'BugSummaryTooLongError'
    this.data = data
  }
}

/** ERR_BUG_ALREADY_RESOLVED 附载 */
export interface BugAlreadyResolvedData {
  readonly projectId: string
  readonly bugId: string
  readonly current: 'open' | 'fixed' | 'unresolved'
}

/** 终态再迁移拒绝（open→fixed｜unresolved 单向——不可改史） */
export class BugAlreadyResolvedError extends Error {
  readonly code = 'ERR_BUG_ALREADY_RESOLVED' as const
  readonly data: BugAlreadyResolvedData

  constructor(data: BugAlreadyResolvedData) {
    super(`bug 已终态（${data.current}），拒绝再迁移：${data.bugId}（project ${data.projectId}）`)
    this.name = 'BugAlreadyResolvedError'
    this.data = data
  }
}

/** ERR_COMMIT_HASH_REQUIRED 附载 */
export interface CommitHashRequiredData {
  readonly bugId: string
}

/** resolveBug(fixed) 缺 commit_hash（agent 原子提交后捕获——并发安全锚，工具不自取 HEAD） */
export class CommitHashRequiredError extends Error {
  readonly code = 'ERR_COMMIT_HASH_REQUIRED' as const
  readonly data: CommitHashRequiredData

  constructor(data: CommitHashRequiredData) {
    super(`resolveBug(fixed) 需要 commit_hash（agent 原子提交后捕获）：${data.bugId}`)
    this.name = 'CommitHashRequiredError'
    this.data = data
  }
}

/** ERR_BUG_RECURRENCE_INVALID 附载：弱引用格式非法的 recurrenceOf 原值（trim 后） */
export interface BugRecurrenceInvalidData {
  readonly recurrenceOf: string
}

/** registerBug recurrenceOf 弱引用格式非法拒写（bug_id 形制校验先于在场性预检） */
export class BugRecurrenceInvalidError extends Error {
  readonly code = 'ERR_BUG_RECURRENCE_INVALID' as const
  readonly data: BugRecurrenceInvalidData

  constructor(data: BugRecurrenceInvalidData) {
    super(`recurrenceOf 弱引用格式非法拒绝：${data.recurrenceOf}（须为 bug_id 形制）`)
    this.name = 'BugRecurrenceInvalidError'
    this.data = data
  }
}

/** ERR_BUG_RECURRENCE_DANGLING：registerBug recurrenceOf 指向不存在的 bug_id（拒写零副作用） */
export class BugRecurrenceDanglingError extends Error {
  readonly code = 'ERR_BUG_RECURRENCE_DANGLING' as const
  readonly data: { readonly recurrenceOf: string }

  constructor(data: { readonly recurrenceOf: string }) {
    super(`recurrenceOf 悬空引用拒绝：${data.recurrenceOf} 不存在（挂链零副作用）`)
    this.name = 'BugRecurrenceDanglingError'
    this.data = data
  }
}

/** ERR_BUG_PROJECT_KEY_REQUIRED 附载（I5——行级归属键派生失败） */
export interface BugProjectKeyRequiredData {
  readonly projectId: string
}

/** registerBug 行级归属键 project_key 派生失败拒写（NOT NULL 无 default——派生失败零副作用） */
export class BugProjectKeyRequiredError extends Error {
  readonly code = 'ERR_BUG_PROJECT_KEY_REQUIRED' as const
  readonly data: BugProjectKeyRequiredData

  constructor(data: BugProjectKeyRequiredData) {
    super(`project_key 派生失败拒绝登记：project ${data.projectId}（I5——行级归属键 NOT NULL）`)
    this.name = 'BugProjectKeyRequiredError'
    this.data = data
  }
}

/** ERR_BUG_COVERAGE_DECLARATION_REQUIRED 附载 */
export interface BugCoverageDeclarationRequiredData {
  readonly bugId: string
  readonly missing: readonly ('declaration' | 'anchor')[]
}

/** 复发家族 resolveBug(fixed) 覆盖声明段/报告锚行缺席拒写（纯 DB 面——零文件 IO 零语义） */
export class BugCoverageDeclarationRequiredError extends Error {
  readonly code = 'ERR_BUG_COVERAGE_DECLARATION_REQUIRED' as const
  readonly data: BugCoverageDeclarationRequiredData

  constructor(data: BugCoverageDeclarationRequiredData) {
    super(
      `复发家族覆盖声明闸门：resolveBug(fixed) 的 fix_approach 缺协议段（${data.missing.join('、')}）——` +
        `须携 coverage: <为何覆盖整条复发链共同根因> 与 anchor: <排查报告卷宗文件路径> 两行，退回补证`,
    )
    this.name = 'BugCoverageDeclarationRequiredError'
    this.data = data
  }
}
