// @feature ui-plugin-foundation | @web-e2e | @journey spike-conclusion-fallback
// Traceability: docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-1-probe-plugin-add-profile.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT } from '../helpers/plugins.ts'

const SPIKE = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
const section1 = SPIKE.slice(SPIKE.indexOf('## 1. 未验证项①'), SPIKE.indexOf('## 2. 未验证项②'))

test('step-1/success: item ① is archived as conclusion + independent fallback (two columns)', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'Scratch-env live probes are archived evidence (the probe runs on throwaway profiles per the report); the e2e leg pins the delivered artifact: the two-column structure, the conclusion\'s three layers, and the fallback\'s independence markers.',
  })
  // Conclusion column: the three-layer verdict is inline (source-level facts).
  expect(section1).toContain('结构性不可寻址')
  expect(section1).toContain('上游显式拒绝')
  expect(section1).toContain('误用时无害')
  expect(section1).toContain('managed exclusively by the Electron application')
  // Fallback column: ①-specific, never borrowed from ②/③.
  expect(section1).toContain('独立退路')
  expect(section1).toContain('内置 bundle 清单路线')
  expect(section1).toContain('不得挪用于 ②③')
})

test('step-1/assumption-overturned: fallback ① is adopted, independent, and delivered as the product route', async () => {
  // The report marks the fallback as delivered (no longer just a fallback).
  expect(section1).toContain('已不是退路而是已交付的产品路线')
  // Delivered reality on the current tree: the built-in manifest route exists
  // as the product config — the single source of truth the shell reconciles.
  expect(existsSync(join(REPO_ROOT, 'apps', 'desktop', 'resources', 'plugin-bundles.json'))).toBe(true)
  const projector = readFileSync(join(REPO_ROOT, 'apps', 'desktop', 'src', 'main', 'host-profile', 'index.ts'), 'utf8')
  expect(projector).toContain('single source of truth')
  // The fallback is independent of plugin add: the reconciliation path never
  // references the CLI channel.
  expect(projector).not.toContain('plugin add')
})
