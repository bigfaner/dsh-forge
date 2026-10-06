// 20 类型模板族 exhaustive 路由（任务 2.2；tech-design §Interface 9「20 类型模板函数族 +
// ValidTypes ↔ TaskType 映射定稿」）。映射定稿 = 老 forge 21 模板 − fix-record-missed：
// implementation 默认/细分 → coding-*；fix → coding-fix；doc-generation.* → doc/doc-*；
// test.run / test.gen-* → test-*；validation-code/-ux 与 eval-contract/-journey 直名。
// fix-record-missed 不入词汇（TaskType 无此值）——降级 run-tasks 内置静态文本（plugin 侧 3.x）。
// Record<TaskType,…> = 编译期穷尽：加类型即编译红，逼模板裁决（AC3）。
import type { TaskType } from '@dsh-forge/contracts'
import { codeQualitySimplify, codingCleanup, codingEnhancement, codingFeature, codingFix, codingRefactor } from './coding.js'
import { doc, docConsolidate, docDrift, docReview, docSummary } from './doc.js'
import { evalContract, evalJourney } from './eval.js'
import { gate } from './gate.js'
import type { TypePolicyContext } from './shared.js'
import { testGenContracts, testGenJourneys, testGenScripts, testRun } from './test.js'
import { validationCode, validationUx } from './validation.js'

export type { TypePolicyContext }

/**
 * 类型策略模板族（`<type-policy>` 内文单源）。模板纯函数——动态值经 `<task-context>`
 * 键值行传递，模板内文仅消费 TypePolicyContext（slug/localId 自然键）；调用方 =
 * compose.ts（2.4 claimTask 经 composeDispatchPrompt 间接路由）。
 */
export const TYPE_POLICY_TEMPLATES: Readonly<Record<TaskType, (ctx: TypePolicyContext) => string>> = {
  'coding-feature': codingFeature,
  'coding-enhancement': codingEnhancement,
  'coding-cleanup': codingCleanup,
  'coding-refactor': codingRefactor,
  'code-quality-simplify': codeQualitySimplify,
  'coding-fix': codingFix,
  gate,
  doc,
  'doc-consolidate': docConsolidate,
  'doc-drift': docDrift,
  'doc-review': docReview,
  'doc-summary': docSummary,
  'test-run': testRun,
  'test-gen-contracts': testGenContracts,
  'test-gen-journeys': testGenJourneys,
  'test-gen-scripts': testGenScripts,
  'validation-code': validationCode,
  'validation-ux': validationUx,
  'eval-contract': evalContract,
  'eval-journey': evalJourney,
}
