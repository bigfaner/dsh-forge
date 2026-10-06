// M2 词汇与中英标签常量（tech-design §Interface 9 §7-6 映射定稿 + design/schema.sql 三态 CHECK
// + Cross-Layer Data Map「标签 contracts 常量（搜索中英共用）」）。
// TaskType 20 值（= 21 模板 − fix-record-missed）/ TaskStatus 七态 / FeatureStatus 六态 /
// ProposalStatus 五态——exhaustive 词汇 + 中英标签（服务端 search 双语标签匹配共用；
// UI 状态 tag 中文呈现）。定位铁律：纯常量与类型，零逻辑零依赖（P1 沿袭）。

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

/** TaskStatus 七态（schema.sql ck_tasks_status 行序；相位/状态机与七态 chips 共用） */
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
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
