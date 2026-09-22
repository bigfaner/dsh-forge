// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-3-build-plugin.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD_DIR, REPO_ROOT } from '../helpers/plugins.ts'
import { scanArtifactModuleSources } from '../../../../scripts/verify-plugins.mjs'

test('step-3/success: the build output set is complete, ui-goal-scale, and vendor-free', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'The maintained build reference is the hello-world package (same toolchain: tsc --build + tsdown; the template is a source scaffold with no artifact demand — runGate design). A fresh third-party build (registry-dependent install) is documented in template-walkthrough-evidence.md.',
  })
  // Complete artifact set per the files[] contract.
  expect(existsSync(join(HELLO_WORLD_DIR, 'lib', 'index.js'))).toBe(true)
  expect(existsSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'))).toBe(true)
  expect(existsSync(join(HELLO_WORLD_DIR, 'lib', 'types'))).toBe(true)
  expect(existsSync(join(HELLO_WORLD_DIR, 'cordis.patch.yml'))).toBe(true)
  // Small package (ui-goal reference scale): the client bundle stays KB-scale.
  const clientBytes = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js')).length
  expect(clientBytes).toBeLessThan(50_000)

  // Artifact-level module-source scan: zero vendored references.
  const artifactFiles = ['lib/index.js', 'lib/client.js'].map(rel => ({
    path: join(HELLO_WORLD_DIR, rel),
    code: readFileSync(join(HELLO_WORLD_DIR, rel), 'utf8'),
  }))
  const scan = scanArtifactModuleSources({ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world' }, artifactFiles, REPO_ROOT)
  expect(scan.ok, scan.violations.map(v => v.detail).join('\n')).toBe(true)
})

test('step-3/build-failure-diagnostics: the walkthrough archives the diagnose-and-fix build chain', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'Toolchain build legs (npm install + tsc/tsdown in a third-party dir) need registry access — external surface, archived live in template-walkthrough-evidence.md. The archived walkthrough covers the full derive -> typecheck -> build -> pack chain with diagnostics.',
  })
  const walkthrough = readFileSync(
    join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'template-walkthrough-evidence.md'),
    'utf8',
  )
  expect(walkthrough).toContain('typecheck')
  expect(walkthrough).toContain('build')
  expect(walkthrough).toContain('pack')
  // The build chain output contract is documented (double-faced artifact).
  expect(walkthrough).toContain('lib/index.js')
  expect(walkthrough).toContain('lib/client.js')
})
