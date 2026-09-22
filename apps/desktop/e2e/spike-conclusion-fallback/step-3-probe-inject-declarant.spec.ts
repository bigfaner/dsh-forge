// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-3-probe-inject-declarant.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD_DIR, REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
const section3 = SPIKE.slice(SPIKE.indexOf('## 3. 未验证项③'), SPIKE.indexOf('## 4.'))

test('step-3/success: item ③ archives the two-set comparison with the two independent dimensions', async () => {
  // Both declaration sets are compared side by side.
  expect(section3).toContain('最小稳定子集')
  expect(section3).toContain('ui-goal')
  expect(section3).toContain('7 边')
  // Subset legality + equivalence verdict with the precise criterion.
  expect(section3).toContain('子集合法性:成立')
  expect(section3).toContain('等价性')
  expect(section3).toContain('工厂实际 require')
  // Fallback column: ③-specific (DSH Studio declaration form).
  expect(section3).toContain('DSH Studio')
  expect(section3).toContain('③ 专属')
})

test('step-3/subset-illegal: the misreading guard separates subset-legality from declarant-feasibility', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'Edge leg (subset rejected) NOT triggered — the archived conclusion is 子集合法. The misreading defense is pinned: even a future rejection falls back to the FULL-SET declaration form and never concludes "non-official declarant infeasible".',
  })
  expect(section3).toContain('误读防御')
  expect(section3).toContain('非官方声明方不可行')
  // The shipped plugin really uses the minimal subset (3 edges).
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as { dsh?: { client?: { inject?: string[] } } }
  expect(manifest.dsh?.client?.inject).toHaveLength(3)
})
