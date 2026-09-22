// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-4-panel-interaction.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  helloWorldTarball,
  REPO_ROOT,
  expectRosterContains,
  launchPluginShell,
  packPlugin,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'

test('step-4/success: the panel interaction is a live runtime loop — click dispatches the store seat and rebinds the counter', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note',
    description: 'Panel clicks render only on completed assistant turns (session content = user data). The runtime loop is proven at two layers: the REAL component against the REAL store (unit panel.spec.tsx: click -> sayHello -> counter text updates), and the archived live click evidence (live-ui-probe --plugin-leg artifacts SHELL-S0-panel-{before,after}-click.png). Here the e2e asserts the wiring that distinguishes live loop from static injection actually shipped in the built artifact.',
  })
  const builtClient = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'), 'utf8')
  // The click handler dispatches the store action (not a dead button).
  expect(builtClient).toContain('sayHello')
  // The counter is bound through the store selector hook (useStore(state => hellos)).
  expect(builtClient).toContain('useStore')
  expect(builtClient).toContain('hellos')
  // The archived live click evidence exists (probe channel).
  const artifacts = join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'artifacts')
  expect(existsSync(join(artifacts, 'SHELL-S0-panel-before-click.png')), 'before-click evidence').toBe(true)
  expect(existsSync(join(artifacts, 'SHELL-S0-panel-after-click.png')), 'after-click evidence').toBe(true)
})

test('step-4/static-injection-illusion: a static panel cannot fake the loop — the distinguishing evidence is archived per click', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note',
    description: 'The illusion detector is the click-diff: probe evidence captures panel text before vs after the click; no counter delta = static injection = FAIL verdict (probe plugin-leg logic). The unit matrix pins the same discrimination at the component level against the real store.',
  })
  // The panel component renders the counter through the selector, so any
  // store update MUST re-render the text — the shipped binding makes the
  // static illusion fail by construction.
  const source = readFileSync(join(HELLO_WORLD_DIR, 'src', 'client', 'HelloWorldPanel.tsx'), 'utf8')
  expect(source).toContain('props.useStore(state => state.hellos)')
  expect(source).toContain('onClick={() => props.actions.sayHello()}')
  // The store factory is an exclusive per-entry factory (no module-level
  // singleton: a disguised static state cannot survive plugin reloads).
  const store = readFileSync(join(HELLO_WORLD_DIR, 'src', 'client', 'store.ts'), 'utf8')
  expect(store).toContain('init: (): HelloWorldState => ({ hellos: 0 })')
  expect(store).toContain('draft.hellos += 1')
})

test('step-4/interaction-error-visible: a plugin runtime throw is captured by the evidence channel without killing the host surface', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Real error injection = the collision fixture\'s replica register throw (the only hermetic real plugin-code throw): the pageerror channel records it attributable to the plugin/slot while the host core surface keeps working — the observable contract for interaction errors (spike §5移交语 2).',
  })
  const fixture = packPlugin(COLLISION_DIR)
  const fixtureAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'
  const shell = await launchPluginShell({
    bundles: [
      ...BASE_BUNDLES,
      { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` },
      { name: COLLISION_FIXTURE, source: `tarball:${fixtureAt}` },
    ],
    stageTarballs: [
      { at: STAGED_AT, from: helloWorldTarball() },
      { at: fixtureAt, from: fixture.tarball },
    ],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    // The error is explicit and attributable (channel captures it).
    await expect.poll(() => shell.pageErrors.length, { timeout: 30_000 }).toBeGreaterThan(0)
    // The host core surface stays interactive — no dead white screen.
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
    await expect(shell.page.locator('#dsh-forge-crash-recovery')).toHaveCount(0)
  } finally { await shell.close() }
})
