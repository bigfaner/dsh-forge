// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-2-probe-out-of-tree-materialization.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
const section2 = SPIKE.slice(SPIKE.indexOf('## 2. 未验证项②'), SPIKE.indexOf('## 3. 未验证项③'))

test('step-2/success: item ② archives both forms (dev link / prod tarball) with the independent fallback', async () => {
  // Both materialization forms carry their own conclusion, separately listed.
  expect(section2).toContain('dev `link:` 形态(结论:成立')
  expect(section2).toContain('prod tarball 形态(结论:成立')
  // The dev form's brittleness is booked (source dir must be present at boot).
  expect(section2).toContain('脆性')
  expect(section2).toContain('dev 专用')
  // The prod form's live evidence: bare package materialization suffices.
  expect(section2).toContain('autoInstallPeers: false')
  expect(section2).toContain('零 peers')
  // Fallback column: ②-specific and explicitly NOT the two-anchor resolution.
  expect(section2).toContain('npm 发布或 tarball 随包内置')
  expect(section2).toContain('两锚解析')
  expect(section2).toContain('② 的退路——本项退路仅指')
})

test('step-2/materialization-failed: the fallback route for a failed materialization is decided by the distribution adjudication', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'Edge leg (both forms failing) was NOT triggered — the archived forms both hold. The fallback decision path is therefore pinned structurally: §2.4 names the fallback, and §4.1 adjudicates exactly between its two candidates (tarball built-in wins for the packaged form).',
  })
  expect(section2).toContain('独立退路(② 专属')
  const section4 = SPIKE.slice(SPIKE.indexOf('## 4.'), SPIKE.indexOf('## 5.'))
  expect(section4).toContain('tarball 随包内置')
  expect(section4).toContain('预播种')
})
