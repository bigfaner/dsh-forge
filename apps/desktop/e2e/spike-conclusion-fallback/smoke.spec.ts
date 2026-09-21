// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Journey smoke test (happy path): probe ① -> probe ② -> probe ③ ->
// distribution + offline conclusion -> report review gate, success Outcomes
// in sequence over the archived report structure.
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-{1..5}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')

test('spike-conclusion-fallback journey smoke: three two-column conclusions + distribution + gate', async () => {
  // Step 1 — item ①: conclusion + independent fallback (①-specific).
  expect(SPIKE).toContain('未验证项①')
  expect(SPIKE).toContain('内置 bundle 清单路线')
  expect(SPIKE).toContain('不得挪用于 ②③')

  // Step 2 — item ②: both materialization forms + fallback ②.
  expect(SPIKE).toContain('dev `link:` 形态(结论:成立')
  expect(SPIKE).toContain('prod tarball 形态(结论:成立')
  expect(SPIKE).toContain('npm 发布或 tarball 随包内置')

  // Step 3 — item ③: two-set comparison + fallback ③.
  expect(SPIKE).toContain('子集合法性:成立')
  expect(SPIKE).toContain('误读防御')
  expect(SPIKE).toContain('DSH Studio')

  // Step 4 — distribution form + offline compatibility, inseparable.
  expect(SPIKE).toContain('tarball 随包内置')
  expect(SPIKE).toContain('预播种')
  expect(SPIKE).toContain('离线自足')
  expect(existsSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'shell-assembly-packaged-evidence.md'))).toBe(true)

  // Step 5 — the report gates M2 (no conclusion-less start).
  expect(SPIKE).toContain('三项均未被推翻')
  expect(SPIKE).toContain('M2 设计按现路线开工')
  expect(SPIKE).toContain('重新门控')
  expect(SPIKE).toContain('附录 A')
})
