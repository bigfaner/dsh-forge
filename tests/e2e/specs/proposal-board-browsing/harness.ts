// tests/e2e/specs/proposal-board-browsing/harness — the journey's worlds
// (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m3/testing/proposal-board-browsing/
// contracts/step-{1..4}-*.md. Worlds:
//   main — feature `prop-board` + a proposals/ corpus: associated (slug 共享
//          feature,eval 报告在场)+ orphan(无关联无 eval)+ hostile(含
//          恶意 markdown 结构,防注入腿语料)— fixture: Proposal ≥2(≥1
//          associated,≥1 unassociated)+ EvalReport ≥1;
//   bare — 同型项目但 proposals/ 为空(empty 态腿)。
// 前置 anchors:page "工作台 · 提案看板(第二 tab)" / route workbench/proposals。

import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

export const PROP_FEATURE = 'prop-board'
export const ASSOCIATED = PROP_FEATURE
export const ORPHAN = 'prop-early-pipeline'
export const HOSTILE = 'prop-hostile-md'

/** frontmatter anchors(列表元数据一致性断言的对照面)。 */
export const ASSOCIATED_AUTHOR = 'prop-author-a'
export const ASSOCIATED_CREATED = '2026-09-18'
export const ORPHAN_AUTHOR = 'prop-author-o'
export const ORPHAN_CREATED = '2026-09-20'
export const HOSTILE_CREATED = '2026-09-22'

/** 逐字锚点(详情/eval 渲染与文件一致)。 */
export const ASSOCIATED_H1 = '提案看板验收语料(关联 feature)'
export const ASSOCIATED_MARK = 'prop-board 关联提案正文锚点 — 列表/详情一致性。'
export const EVAL_H1 = 'prop-board 评估终稿(final-report)'
export const EVAL_MARK = 'prop-board eval 报告锚点 — eval 渲染一致性。'
export const ORPHAN_H1 = '早期管线提案(无关联 feature)'
export const HOSTILE_MARK = 'prop-board 恶意 markdown 语料(防注入腿)。'

const TASKS: readonly TaskSpec[] = [
  { stem: '1-x', localId: '1', title: '提案看板占位任务(prop-board)', status: 'pending', type: 'coding.feature', dependencies: [] },
]

/** The malicious markdown body(脚本注入 + 危险链接形态)。 */
function hostileBody(): string {
  return [
    '# 恶意提案语料(白名单渲染验收)',
    '',
    HOSTILE_MARK,
    '',
    '<script>window.__injected = true</script>',
    '',
    '<img src=x onerror="window.__imgInjected = true" />',
    '',
    '[危险链接](javascript:window.__linkInjected = true)',
    '',
  ].join('\n')
}

/** The main world (associated + orphan + hostile proposals corpus). */
export async function buildMainWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: PROP_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
    tasks: TASKS,
    proposals: [
      {
        slug: ASSOCIATED, status: 'accepted', author: ASSOCIATED_AUTHOR, created: ASSOCIATED_CREATED,
        title: ASSOCIATED_H1, mark: ASSOCIATED_MARK,
        evalReport: `# ${EVAL_H1}\n\n${EVAL_MARK}\n`,
      },
      { slug: ORPHAN, status: 'draft', author: ORPHAN_AUTHOR, created: ORPHAN_CREATED, title: ORPHAN_H1, mark: '管线早期提案 — 无关联 feature、无 eval。' },
      { slug: HOSTILE, status: 'review', author: 'hostile-author', created: HOSTILE_CREATED, title: '恶意 markdown 提案', mark: 'body-ignored', evalReport: hostileBody() },
    ],
  })
}

/** The bare world (proposals/ empty — the empty-state leg). */
export async function buildBareWorld(root: string): Promise<KernelWorld> {
  return await buildKernelWorld(root, {
    feature: { slug: PROP_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
    tasks: TASKS,
  })
}
