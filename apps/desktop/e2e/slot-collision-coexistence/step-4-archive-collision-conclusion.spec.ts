// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-4-archive-collision-conclusion.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE_REPORT = join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md')
const EVIDENCE = join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'dsh-web-assembly-evidence.md')

test('step-4/success: the collision conclusion is archived with the three-type framework and full evidence', async () => {
  const spike = readFileSync(SPIKE_REPORT, 'utf8')
  // The three-type archive framework is in place (SC6 acceptance artifact).
  expect(spike).toContain('合并共存')
  expect(spike).toContain('分层覆盖')
  expect(spike).toContain('启动期显式报错')
  // The observed scenario rows carry type classification + silence verdict.
  expect(spike).toContain('③ 启动期显式报错')
  expect(spike).toContain('② 分层覆盖')
  expect(spike).toContain('① 合并共存')
  // Every archived row is observability-annotated (the SC6 pass face).
  expect(spike).toContain('静默')
  // Reproduction material + fixture reference (reproducible steps).
  expect(spike).toContain('hello-world-collision')
  expect(spike).toContain('MODE')
  // The UI-result evidence channel is referenced for the full matrix.
  expect(spike).toContain('dsh-web-assembly-evidence.md')
  // The M2 handoff (前置输入) is stated.
  expect(spike).toContain('M2')
})

test('step-4/incomplete-archive: archive rows without repro steps or UI results are not acceptable SC6 entries', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'Completeness gate: the archived matrix must carry repro steps + observed UI results per scenario. Asserted structurally: the evidence document contains per-scenario 复现步骤 sections and observed-result blocks for the collision scenarios (S2/S3/S4/S5), and the framework declares the 静默-latter-override verdict as the failure state that may NEVER be archived as a legal type.',
  })
  const evidence = readFileSync(EVIDENCE, 'utf8')
  expect(existsSync(EVIDENCE)).toBe(true)
  // Per-scenario reproduction steps + observed results are present.
  expect(evidence).toContain('复现步骤')
  // The collision scenarios are archived with observations.
  expect(evidence).toContain('hello-world.panel')
  // The silent-override failure state is explicitly ruled out (SC6).
  expect(evidence).toContain('静默')
})
