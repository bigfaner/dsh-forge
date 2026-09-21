// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-5-report-review-gate.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { LOCK_BASELINE, REPO_ROOT } from '../helpers/plugins.ts'
import { loadBaseline } from '../../../../scripts/verify-plugins.mjs'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')

test('step-5/success: the report is complete and gates M2 with per-item fallbacks', async () => {
  // Total gate: all three items archived, route assumptions hold, M2 cleared.
  expect(SPIKE).toContain('三项均未被推翻')
  expect(SPIKE).toContain('M2 设计按现路线开工')
  // Coverage: three probe items + distribution conclusion + compatibility.
  expect(SPIKE).toContain('未验证项①')
  expect(SPIKE).toContain('未验证项②')
  expect(SPIKE).toContain('未验证项③')
  expect(SPIKE).toContain('分发形态')
  expect(SPIKE).toContain('离线自足')
  // Revision clause: any future overturn re-activates the per-item fallback
  // and RE-GATES M2 (no sick-at-work path).
  expect(SPIKE).toContain('修正路线条款')
  expect(SPIKE).toContain('重新门控')
})

test('step-5/doc-drift: the report is self-sufficient — inline facts anchored to the vendored SHA, not the Draft docs', async () => {
  // Inline fact appendix anchored to the sole authoritative checkout.
  expect(SPIKE).toContain('附录 A')
  expect(SPIKE).toContain(LOCK_BASELINE.pinnedSha.slice(0, 7))
  expect(SPIKE).toContain('packages/desktop-host-vendor/vendored')
  // The live baseline on the tree matches the anchor the report cites.
  const baseline = loadBaseline(REPO_ROOT)
  expect(baseline.pinnedSha).toBe(LOCK_BASELINE.pinnedSha)
  expect(baseline.desktopHostVersion).toBe(LOCK_BASELINE.desktopHostVersion)
})
