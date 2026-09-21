// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-1-scaffold-plugin-package.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT, TEMPLATE_DIR } from '../helpers/plugins.ts'
import { scanManifestModuleSources } from '../../../../scripts/verify-plugins.mjs'

/** Derive a third-party package from the real template (pure copy + rename). */
function derivePackage(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-derived-'))
  cpSync(TEMPLATE_DIR, join(dir, 'my-plugin'), { recursive: true })
  const manifestPath = join(dir, 'my-plugin', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string }
  manifest.name = name
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2))
  return join(dir, 'my-plugin')
}

test('step-1/success: a derived package carries the template structure (two halves, npm-form deps)', async () => {
  const derived = derivePackage('@third-party/plugin-demo')
  // Empty host half + client half, client exposed via exports["./client"].
  const manifest = JSON.parse(readFileSync(join(derived, 'package.json'), 'utf8')) as {
    name: string
    exports?: Record<string, unknown>
    peerDependencies?: Record<string, string>
  }
  expect(manifest.name).toBe('@third-party/plugin-demo')
  expect(Object.hasOwn(manifest.exports ?? {}, './client'), 'exports["./client"] exposed').toBe(true)
  expect(existsSync(join(derived, 'src', 'client'))).toBe(true)
  expect(existsSync(join(derived, 'src', 'index.ts'))).toBe(true)
  // Pure npm-form dependencies: no workspace:/file:/link: specs anywhere.
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    for (const spec of Object.values((manifest as unknown as Record<string, Record<string, string>>)[field] ?? {})) {
      expect(spec, `${field} spec is npm-form`).not.toMatch(/^(workspace|file|link):/)
    }
  }
  // Template scaffolding face: patch row + version stamp ride along.
  expect(existsSync(join(derived, 'cordis.patch.yml'))).toBe(true)
  expect(existsSync(join(derived, 'version-stamp.json'))).toBe(true)
})

test('step-1/workspace-protocol-copied: verbatim workspace specs trip the real manifest scan; the README pre-warns', async () => {
  // The template documentation front-warns the first-step trap.
  const readme = readFileSync(join(TEMPLATE_DIR, 'README.md'), 'utf8')
  expect(readme).toContain('workspace:^')
  expect(readme).toContain('禁止把 monorepo 工作区写法照抄出来')

  // A derived package that ignored the warning: the machine gate is red,
  // naming the entry — the user gets a correctable diagnosis.
  const derived = derivePackage('@third-party/plugin-demo')
  const manifestPath = join(derived, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const peers = manifest.peerDependencies as Record<string, string>
  peers['@deepseek-ai/dsh-client-ui-chat'] = 'workspace:^'
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2))
  const report = scanManifestModuleSources(
    [{ name: '@third-party/plugin-demo', dir: 'packages/plugins/demo', manifest }],
    REPO_ROOT,
  )
  expect(report.ok).toBe(false)
  expect(report.violations[0]?.detail).toContain('workspace:')
})
