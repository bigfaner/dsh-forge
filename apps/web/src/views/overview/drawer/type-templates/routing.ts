// 类型模板族路由（定位：业务——AC3：TaskType 20 值 × 六族穷尽；未注册类型走通用键值回退）。
// 词汇表 = contracts TASK_TYPES（20 值 = 21 模板 − fix-record-missed）；族划分锚 ui-design
// 块一模板表 + tech-design §Interface 9 §7-6 映射定稿。类别色族 = Design System 六色
//（编码=蓝/文档=紫/测试=青/评估=红/验证=琥珀/质量门=绿——紫/青无语义令牌，最近似映射见 drawer.css）。
import type { TaskType } from '@dsh-forge/contracts'

/** 模板族（六族 + generic 回退） */
export type TemplateFamily = 'coding' | 'fix' | 'doc' | 'gate' | 'test' | 'eval' | 'generic'

/** 词汇表 20 值 → 族穷尽映射（Record 全键 = 编译期穷举——TASK_TYPES 增值即红） */
export const TASK_TYPE_FAMILY: Readonly<Record<TaskType, TemplateFamily>> = {
  'coding-feature': 'coding',
  'coding-enhancement': 'coding',
  'coding-cleanup': 'coding',
  'coding-refactor': 'coding',
  'code-quality-simplify': 'coding',
  'coding-fix': 'fix',
  gate: 'gate',
  doc: 'doc',
  'doc-consolidate': 'doc',
  'doc-drift': 'doc',
  'doc-review': 'doc',
  'doc-summary': 'doc',
  'test-run': 'test',
  'test-gen-contracts': 'test',
  'test-gen-journeys': 'test',
  'test-gen-scripts': 'test',
  'validation-code': 'eval',
  'validation-ux': 'eval',
  'eval-contract': 'eval',
  'eval-journey': 'eval',
}

/** 词汇外防御路由（TaskType 封闭外的字符串面：doc-fix → fix——ui-design 块一表 fix 族 = coding.fix/doc.fix） */
const EXTRA_FAMILY: Readonly<Record<string, TemplateFamily>> = {
  'doc-fix': 'fix',
}

/** 族路由（词汇表直查 → 防御表 → generic 回退） */
export function templateFamilyOf(taskType: string): TemplateFamily {
  if (taskType in TASK_TYPE_FAMILY) return TASK_TYPE_FAMILY[taskType as TaskType]
  return EXTRA_FAMILY[taskType] ?? 'generic'
}

/** 类别色族（Design System 六色——类别 chip 与抽屉族类 class 的着色键） */
export type TypeCategoryClass = 'coding' | 'doc' | 'test' | 'eval' | 'validation' | 'gate' | 'generic'

/** 类别色族映射（类型前缀口径：coding/code-quality → 编码；validation 独立琥珀；未注册 → 中性） */
export function typeCategoryClassOf(taskType: string): TypeCategoryClass {
  if (taskType === 'gate') return 'gate'
  if (taskType.startsWith('validation')) return 'validation'
  if (taskType.startsWith('eval')) return 'eval'
  if (taskType.startsWith('test')) return 'test'
  if (taskType.startsWith('doc')) return 'doc'
  if (taskType.startsWith('coding') || taskType.startsWith('code-quality')) return 'coding'
  return 'generic'
}
