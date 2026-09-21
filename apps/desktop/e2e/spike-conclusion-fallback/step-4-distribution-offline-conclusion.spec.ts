// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-4-distribution-offline-conclusion.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
const section4 = SPIKE.slice(SPIKE.indexOf('## 4.'), SPIKE.indexOf('## 5.'))
const PACKAGED_EVIDENCE = readFileSync(
  join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'shell-assembly-packaged-evidence.md'),
  'utf8',
)

test('step-4/success: distribution form + offline compatibility are archived together', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'The two artifacts are inseparable by invariant: §4.1 adjudicates the form, §4.2 declares the NFR compatibility — and the executed leg (task 6) archived the packaged/offline verification evidence.',
  })
  // Form adjudicated (one winner between the candidates).
  expect(section4).toContain('npm 物化')
  expect(section4).toContain('tarball 随包内置')
  expect(section4).toContain('预播种')
  expect(section4).toContain('选中')
  // Compatibility statement explicit (二者同报告不可拆分).
  expect(section4).toContain('离线自足')
  expect(section4).toContain('兼容')
  // The executed packaged-leg evidence carries the offline verification.
  expect(PACKAGED_EVIDENCE).toContain('离线')
  expect(PACKAGED_EVIDENCE).toContain('预播种')
  expect(PACKAGED_EVIDENCE).toContain('roster')
})

test('step-4/offline-conflict: the network-dependent candidate is rejected with the conflict recorded', async () => {
  // The npm-materialization candidate's offline conflict is adjudicated
  // loudly (rejected for the packaged form), not waved through.
  expect(section4).toContain('否决')
  expect(section4).toContain('违反离线自足')
})
