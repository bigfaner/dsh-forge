// M2 词汇与中英标签常量（tech-design §Interface 9 §7-6 映射定稿 + design/schema.sql 三态 CHECK
// + Cross-Layer Data Map「标签 contracts 常量（搜索中英共用）」）。
// TaskType 20 值（= 21 模板 − fix-record-missed）/ TaskStatus 八态 / FeatureStatus 六态 /
// ProposalStatus 五态——exhaustive 词汇 + 中英标签（服务端 search 双语标签匹配共用；
// UI 状态 tag 中文呈现）。定位铁律：纯常量与类型，零逻辑零依赖（P1 沿袭）。
// S3（run-tasks-host-command）：TaskStatus 七态 → 八态——+interrupted（进程重启真化的
// 非终态，run-tasks-host-command proposal.md S3/SC3/R6；schema v1 直改先例）。
// fix-bug：+BugStatus 三态（bugs.ck_bugs_status 行序 open|fixed|unresolved——两阶段落库
// 登记/回填状态机词汇；子 tab 状态 chips 用）。

/** 中英标签形状（双语搜索匹配面——en 兼搜索词，zh 兼展示与中文搜索） */
export interface BilingualLabel {
  zh: string
  en: string
}

/**
 * TaskType 20 值词汇（§7-6 映射定稿；行序 = 映射表读序）。
 * 老 ValidTypes → TaskType：implementation 默认/细分 → coding-*；fix → coding-fix；
 * doc-generation.* → doc / doc-*；test.run / test.gen-* → test-*；
 * validation-code/-ux 与 eval-contract/-journey 直名。
 * fix-record-missed 不入词汇（降级 run-tasks 内置静态文本）；值域 kebab（与 21 模板文件名一致）。
 */
export const TASK_TYPES = [
  'coding-feature',
  'coding-enhancement',
  'coding-cleanup',
  'coding-refactor',
  'code-quality-simplify',
  'coding-fix',
  'gate',
  'doc',
  'doc-consolidate',
  'doc-drift',
  'doc-review',
  'doc-summary',
  'test-run',
  'test-gen-contracts',
  'test-gen-journeys',
  'test-gen-scripts',
  'validation-code',
  'validation-ux',
  'eval-contract',
  'eval-journey',
] as const

export type TaskType = (typeof TASK_TYPES)[number]

/**
 * 验证族 V（loop-phase-gate 设计 §3——形式化验证 §0 定义：实现收口后才可执行的验证动作）。
 * test-gen-* 属实现族（测试代码生产，随相位推进）；gate 属 G 类单列（闸门动作，非验证语义）。
 * 词表单点：任何消费方（phase-gate GATE_SQL / claim.ts 分支①排除 / 本 pin 测试）不手抄字面清单。
 */
export const VALIDATION_TASK_TYPES = [
  'test-run',
  'validation-code',
  'validation-ux',
  'eval-contract',
  'eval-journey',
] as const

export type ValidationTaskType = (typeof VALIDATION_TASK_TYPES)[number]

/**
 * 实现链集合 I（loop-phase-gate 设计 §3）：TASK_TYPES 全集 − V − gate 的派生常量——
 * 容器实现链终态合取的成员域；运行期再叠加 local_id NOT LIKE 'fix-%'/'disc-%' 前缀排除
 * （SQL 内）与 BUSINESS_LOCAL_ID 数值语义（TS 守卫同判据）。类型侧 Exclude 同源派生。
 */
export type ImplementationTaskType = Exclude<TaskType, 'gate' | ValidationTaskType>
export const IMPLEMENTATION_TASK_TYPES: readonly ImplementationTaskType[] = TASK_TYPES.filter(
  (t): t is ImplementationTaskType => t !== 'gate' && !(VALIDATION_TASK_TYPES as readonly string[]).includes(t),
)

/** E2E 归因卡标记列名（loop-phase-gate 设计 §1.1 承载字段裁定：tasks.e2e_attribution 列——
 *  生成侧机械事实，不经 addTask 参数暴露，白名单豁免 = 无入边 ∧ 标记 = 1）。 */
export const E2E_ATTRIBUTION_COLUMN = 'e2e_attribution'

/** TaskType 中英标签（exhaustive；按类型条件区/类别 chip 的搜索匹配面） */
export const TASK_TYPE_LABELS: Readonly<Record<TaskType, BilingualLabel>> = {
  'coding-feature': { zh: '新功能', en: 'Feature' },
  'coding-enhancement': { zh: '功能增强', en: 'Enhancement' },
  'coding-cleanup': { zh: '代码清理', en: 'Cleanup' },
  'coding-refactor': { zh: '重构', en: 'Refactor' },
  'code-quality-simplify': { zh: '质量简化', en: 'Simplify' },
  'coding-fix': { zh: '缺陷修复', en: 'Fix' },
  gate: { zh: '质量门', en: 'Gate' },
  doc: { zh: '文档', en: 'Documentation' },
  'doc-consolidate': { zh: '文档整合', en: 'Doc Consolidate' },
  'doc-drift': { zh: '文档漂移检查', en: 'Doc Drift' },
  'doc-review': { zh: '文档评审', en: 'Doc Review' },
  'doc-summary': { zh: '文档摘要', en: 'Doc Summary' },
  'test-run': { zh: '测试执行', en: 'Test Run' },
  'test-gen-contracts': { zh: '契约测试生成', en: 'Test Gen Contracts' },
  'test-gen-journeys': { zh: '旅程测试生成', en: 'Test Gen Journeys' },
  'test-gen-scripts': { zh: '测试脚本生成', en: 'Test Gen Scripts' },
  'validation-code': { zh: '代码验证', en: 'Code Validation' },
  'validation-ux': { zh: '体验验证', en: 'UX Validation' },
  'eval-contract': { zh: '契约评估', en: 'Contract Eval' },
  'eval-journey': { zh: '旅程评估', en: 'Journey Eval' },
}

/** TaskStatus 八态（schema.sql ck_tasks_status 行序；相位/状态机与 chips 共用）。
 *  interrupted = 中断（S3——进程重启对账真化的非终态：in_progress ∧ 循环来源标记 ∧ 登记表空；
 *  恢复 = 循环定向领取 adopt → in_progress。非终态：不计满足集、不入终态集） */
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'interrupted',
  'skipped',
  'rejected',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** TaskStatus 中英标签（exhaustive；泳道列名/状态 tag/双语搜索共用） */
export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, BilingualLabel>> = {
  pending: { zh: '待处理', en: 'Pending' },
  in_progress: { zh: '进行中', en: 'In Progress' },
  completed: { zh: '已完成', en: 'Completed' },
  blocked: { zh: '已阻塞', en: 'Blocked' },
  suspended: { zh: '已挂起', en: 'Suspended' },
  interrupted: { zh: '已中断', en: 'Interrupted' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  rejected: { zh: '已拒绝', en: 'Rejected' },
}

/** FeatureStatus 六态（schema.sql ck_features_status 行序；相位推导机快照值域） */
export const FEATURE_STATUSES = ['prd', 'design', 'tasks', 'in-progress', 'completed', 'archived'] as const

export type FeatureStatus = (typeof FEATURE_STATUSES)[number]

/** FeatureStatus 中英标签（exhaustive；feature 父行状态/双语搜索共用） */
export const FEATURE_STATUS_LABELS: Readonly<Record<FeatureStatus, BilingualLabel>> = {
  prd: { zh: 'PRD 阶段', en: 'PRD' },
  design: { zh: '设计阶段', en: 'Design' },
  tasks: { zh: '任务分解', en: 'Tasks' },
  'in-progress': { zh: '进行中', en: 'In Progress' },
  completed: { zh: '已完成', en: 'Completed' },
  archived: { zh: '已归档', en: 'Archived' },
}

/** ProposalStatus 五态（schema.sql ck_proposals_status 行序；裁决写 decided_at） */
export const PROPOSAL_STATUSES = ['draft', 'under-review', 'accepted', 'rejected', 'superseded'] as const

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/** ProposalStatus 中英标签（exhaustive；提案子 tab 状态/双语搜索共用） */
export const PROPOSAL_STATUS_LABELS: Readonly<Record<ProposalStatus, BilingualLabel>> = {
  draft: { zh: '草稿', en: 'Draft' },
  'under-review': { zh: '评审中', en: 'Under Review' },
  accepted: { zh: '已接受', en: 'Accepted' },
  rejected: { zh: '已拒绝', en: 'Rejected' },
  superseded: { zh: '已取代', en: 'Superseded' },
}

/** BugStatus 三态（bugs.ck_bugs_status 行序；两阶段落库：open 登记 → fixed｜unresolved 回填终态） */
export const BUG_STATUSES = ['open', 'fixed', 'unresolved'] as const

export type BugStatus = (typeof BUG_STATUSES)[number]

/** BugStatus 中英标签（exhaustive；概览 Bug 子 tab 状态 chips 与双语搜索共用） */
export const BUG_STATUS_LABELS: Readonly<Record<BugStatus, BilingualLabel>> = {
  open: { zh: '待修复', en: 'Open' },
  fixed: { zh: '已修复', en: 'Fixed' },
  unresolved: { zh: '无法复现', en: 'Unresolved' },
}
