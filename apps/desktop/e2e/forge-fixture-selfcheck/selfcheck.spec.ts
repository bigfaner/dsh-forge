// @feature dsh-forge-m2 | @web-e2e | @journey forge-fixture-selfcheck
// Traceability: docs/features/dsh-forge-m2/tasks/6.1-e2e-forge-fixture.md
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  FORGE_WORKBENCH,
  FORGE_WORKBENCH_STAGED_AT,
  forgeWorkbenchTarball,
  launchPluginShell,
} from '../helpers/plugins.ts'
import {
  generateTaskSet,
} from '../fixtures/task-generator.ts'
import {
  registerFixtureProject,
  writeForgeProject,
} from '../fixtures/forge-project.ts'
import {
  materializeStubCli,
} from '../fixtures/stubs/cli.ts'
import {
  createChannelStub,
} from '../fixtures/stubs/channel.ts'

// Task 6.1 AC6 — the fixture-suite self-check: 生成 → (真实链)注册/扫描 →
// 对拍 → 清理 in ONE smoke. Everything the phase-6 legs build on proves
// itself here end-to-end:
//
//   1. the generator's deterministic model → written dialect tree;
//   2. the REAL registration/validation/scan chain (dshForge.workbench verb
//      face over the REAL SQLite kernel) ingests it error-free (AC1);
//   3. the board DTO matches the generator facts (task count, statuses,
//      blockers incl. the dangling verbatim slice — the 6.2 oracle, sampled);
//   4. the isolated userData seam holds: workbench.db lives under the
//      journey temp dir (Hard Rule: 绝不复用开发实例 userData) — which also
//      makes the ERR_SINGLE_INSTANCE cross-run poisoning structurally
//      impossible (every journey owns its lock);
//   5. the stub CLI answers argument-array spawns from the TEST process
//      (shell off — the win32 node.exe-copy trick included; a terminal-side
//      oracle only since 6.1 — the app chain spawns nothing);
//   6. cleanup removes every temp root (AC5).
//
// Detailed per-surface legs are 6.2-6.5's; this spec stays a smoke.

function selfcheckBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

test('6.1/fixture-selfcheck: generate → register+scan (real chain) → compare → cleanup', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-selfcheck-'))
  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  const set = generateTaskSet({ seed: 'selfcheck', taskCount: 30, featureCount: 3, danglingRate: 0.1 })
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  stub.attachProject(project.codeRoot)

  // --- stub CLI: resolver-shaped spawns (before the app — pure child proofs) ----
  const versionRun = spawnSync(stub.cliPath, ['version'], { cwd: stub.launchCwd, encoding: 'utf8', windowsHide: true })
  expect(versionRun.status).toBe(0)
  expect(versionRun.stdout).toMatch(/^VERSION: 5\./)
  const promptRun = spawnSync(stub.cliPath, ['prompt', 'get-by-task-id', '1.1'], { cwd: project.codeRoot, encoding: 'utf8', windowsHide: true })
  expect(promptRun.status).toBe(0)
  expect(promptRun.stdout).toContain('TASK_ID: 1.1')
  const statusRun = spawnSync(stub.cliPath, ['task', 'status'], { cwd: project.codeRoot, encoding: 'utf8', windowsHide: true })
  expect(statusRun.status).toBe(0)
  expect(statusRun.stdout?.split('\n').filter(line => line !== '').length).toBe(set.facts.taskCount)

  // --- the real app over the isolated userData + the stub env seams -------------
  const shell = await launchPluginShell({
    bundles: selfcheckBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: root,
    cwd: stub.launchCwd,
    userDataDir: join(root, 'user-data'),
    env: { ...stub.env, ...channel.env },
  })
  try {
    await shell.uiReady()
    const { page } = shell

    // The isolated userData holds the workbench DB (the seam the whole leg set
    // leans on — 5.14's shared-registry flag closed).
    expect(shell.userDataDir).toBeDefined()
    expect(existsSync(join(shell.userDataDir as string, 'workbench', 'workbench.db'))).toBe(true)

    // Registration + activation + board read over the REAL verb face.
    const projectId = await registerFixtureProject(page, project)
    expect(typeof projectId).toBe('string')
    const board = await page.evaluate(async (id: string) => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<unknown> } } }).dshForge?.workbench
      if (bridge?.getTaskBoard === undefined) throw new Error('dshForge.workbench.getTaskBoard unavailable')
      return await bridge.getTaskBoard(id)
    }, projectId) as {
      tasks: Array<{ key: string; status: string; blockers: string[]; source: string | null }>
      sync: { state: string; errors?: unknown }
    }

    // The scan ingested the whole model error-free (AC1) and the board agrees
    // with the generator facts (the 6.2 comparison oracle, sampled).
    expect(board.sync.state).toBe('idle')
    expect(board.tasks.length).toBe(set.facts.taskCount)
    const byKey = new Map(board.tasks.map(task => [task.key, task]))
    const generatorTasks = set.features.flatMap(feature => feature.tasks.map(task => ({ key: `${feature.slug}/${task.localId}`, task })))
    for (const { key, task } of generatorTasks) {
      const row = byKey.get(key)
      expect(row, `board row ${key}`).toBeDefined()
      expect(row?.status).toBe(task.status)
      expect(row?.blockers).toEqual(task.dependencies)
    }
    // The dangling slice is preserved verbatim (never rewritten, never dropped).
    const danglingTargets = new Set(set.facts.dangling.map(edge => edge.target))
    expect(danglingTargets.size).toBeGreaterThan(0)
    const withDangling = board.tasks.filter(task => task.blockers.some(blocker => danglingTargets.has(blocker)))
    expect(withDangling.length).toBeGreaterThan(0)
    // Actor-bearing records drive the [会话]/[终端] source ground truth.
    const sessionSourced = board.tasks.filter(task => task.source === 'session').length
    const terminalSourced = board.tasks.filter(task => task.source === 'terminal').length
    expect(sessionSourced).toBe(set.facts.recordsWithSessionActor)
    expect(terminalSourced).toBeGreaterThanOrEqual(set.facts.recordsWithTerminalActor)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
  } finally {
    await shell.close()
    // Cleanup (AC5): the whole journey root — fixture tree, stubs, userData.
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
