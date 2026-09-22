// @feature dsh-forge-m2 | @web-e2e | @journey sc1-board-consistency
// Traceability: docs/features/dsh-forge-m2/tasks/6.2-sc1-board-consistency.md
//
// SC1 验收腿(tech-design Key Test Scenarios):500 任务/50 feature fixture
// (6.1 生成器 —— 同种子 ⇒ 同文件字节)→ 真实链注册 → 三视图与 forge 文件
// 派生事实的一致性断言 + 任务页首屏可交互性能预算。
//
// 计量口径(AC2 —— 记录于本注释,Implementation Notes 要求):
//   - 窗口 [t0, t1]:t0 = 页内在「任务」tab click 派发前一瞬(performance.now),
//     t1 = 依赖树面板 500 节点齐全后再过两帧 rAF(首屏绘制落定)—— 即
//     「进入任务页(getState/启动就绪)→ 首屏可交互」。app 启动段不含在
//     预算内,单独计入诊断分解。
//   - 预热一次不计(注册 + 全部一致性断言在预热靴完成);之后连续 3 次全新
//     启动各测一次,取三次中位数,预算 2000ms,失败即红 —— 不放宽阈值;
//     三次原始值 + 分布打印进输出([sc1] 行,CI 波动 → 记录分布)。
//   - 失败可诊断(AC4):耗时分解(boot=launch→uiReady / switch=进入工作台 /
//     data=getTaskBoard 代表性直调 / render≈窗口−data)+ 一致性差异样本(≤5 条)。
//
// Hard Rule:腿内每次启动前跑单实例探测守卫(ERR_SINGLE_INSTANCE 教训);
// DSH_FORGE_USER_DATA = journey 临时目录(6.1 隔离缝,DB/overlay/锁全隔离)。
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isProcessAlive } from '../../helpers/fixture-app.ts'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../../helpers/plugins.ts'
import type { PluginShell } from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import { TASK_STATUSES, sc1TaskSet, seededRandom } from '../../fixtures/task-generator.ts'
import type { GeneratedRecord, GeneratedTaskStatus } from '../../fixtures/task-generator.ts'
import { en } from '../../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import type { WorkbenchKey } from '../../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import { zh } from '../../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'

/** AC2 budget: median of 3 measured boots must be ≤ 2s (no CI relaxation). */
const FIRST_INTERACTIVE_BUDGET_MS = 2_000
/** Measured boots after the (uncounted) warm-up boot. */
const MEASURED_RUNS = 3
/** The SC1 preset seed — fixed so the whole leg is byte-reproducible. */
const SC1_SEED = 'sc1'

/** The preload-bridge subsets the in-page evaluates read (declared once). */
interface Sc1BridgeGlobals {
  dshForge?: {
    workbench?: {
      getState?: () => Promise<{ activeProjectId: string | null }>
      getTaskBoard?: (id: string) => Promise<unknown>
    }
  }
}

// ---------------------------------------------------------------------------
// Ground truth: the generator model → the exact rows/edges/badges the board
// must render (source: task-generator facts + the 2.5/indexer dialect rules
// the main process applies — actor ① else terminal ②, no active links here).
// ---------------------------------------------------------------------------

interface GroundTask {
  readonly key: string
  readonly feature: string
  readonly localId: string
  readonly title: string
  readonly status: GeneratedTaskStatus
  readonly type: string
  readonly dependencies: readonly string[]
  /** Same-feature deps resolving to no task (the 悬空 slice, verbatim). */
  readonly dangling: readonly string[]
  /** Board source: record actor ①, else the ② inference (no links → terminal). */
  readonly source: 'session' | 'terminal'
  readonly record: GeneratedRecord | null
}

/** resolveActorSource (indexer/source.ts) — path ① only, verbatim semantics. */
function actorSource(actor: string | null): 'session' | 'terminal' | null {
  if (actor !== null && actor.startsWith('session:')) return 'session'
  if (actor === 'terminal') return 'terminal'
  return null
}

/** buildDepChain (ipc/services.ts) mirrored — post-order upstream walk. */
function expectedDepChain(byKey: ReadonlyMap<string, GroundTask>, taskKey: string): string[] {
  const chain: string[] = []
  const visited = new Set([taskKey])
  const walkUpstream = (key: string): void => {
    const row = byKey.get(key)
    if (row === undefined) return
    for (const blocker of row.dependencies) {
      const qualified = blocker.includes('/') ? blocker : `${row.feature}/${blocker}`
      if (visited.has(qualified)) continue
      visited.add(qualified)
      walkUpstream(qualified)
      if (byKey.has(qualified)) chain.push(qualified)
    }
  }
  walkUpstream(taskKey)
  return chain
}

/** ≤N missing/unexpected samples between two id collections (AC4 差异样本). */
function diffSamples(expected: readonly string[], actual: readonly string[], perSide = 4): string[] {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const samples: string[] = []
  for (const item of expected) {
    if (!actualSet.has(item)) samples.push(`missing: ${item}`)
    if (samples.length >= perSide) return samples
  }
  for (const item of actual) {
    if (!expectedSet.has(item)) samples.push(`unexpected: ${item}`)
    if (samples.length >= perSide * 2) break
  }
  return samples
}

/** view-B/C status labels → status (both locales; the shell's `t` seat). */
const STATUS_LABEL_KEY_OF: Readonly<Record<GeneratedTaskStatus, WorkbenchKey>> = {
  pending: 'tasks.status.pending',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  blocked: 'tasks.status.blocked',
  suspended: 'tasks.status.suspended',
  skipped: 'tasks.status.skipped',
  rejected: 'tasks.status.rejected',
}
const statusOfLabel = new Map<string, GeneratedTaskStatus>()
const labelsOf = new Map<GeneratedTaskStatus, string[]>()
for (const status of TASK_STATUSES) {
  const key = STATUS_LABEL_KEY_OF[status]
  for (const label of [zh[key], en[key]]) {
    statusOfLabel.set(label, status)
    const bucket = labelsOf.get(status) ?? []
    bucket.push(label)
    labelsOf.set(status, bucket)
  }
}

// ---------------------------------------------------------------------------
// Hard-Rule helpers: single-instance probe guard + graceful close-and-wait.
// ---------------------------------------------------------------------------

/** Live dsh-forge shell processes (dev instance or a leaked e2e boot). */
function listActiveForgeInstances(): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = []
  if (process.platform === 'win32') {
    // Double-quoted JS string (content carries single quotes — avoidEscape).
    // The inner \" pairs escape through the sh layer so powershell receives
    // ONE -Command argument whose WQL strings ride PS single quotes.
    const psCommand = "Get-CimInstance Win32_Process -Filter 'Name LIKE \\\"electron%\\\" OR Name LIKE \\\"dsh%\\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
    const out = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8' })
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as
      { ProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; CommandLine: string | null }>
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      const pid = Number(row.ProcessId)
      if (pid === process.pid) continue
      const command = row.CommandLine ?? ''
      if (command.includes('dsh-forge')) rows.push({ pid, command: command.slice(0, 160) })
    }
    return rows
  }
  const out = execSync('ps -eo pid=,command=', { encoding: 'utf8' })
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match === null) continue
    const pid = Number(match[1])
    const command = match[2] ?? ''
    if (pid === process.pid) continue
    if (command.includes('dsh-forge') && /electron|main\.cjs/.test(command)) {
      rows.push({ pid, command: command.slice(0, 160) })
    }
  }
  return rows
}

/** Hard Rule: fail loudly BEFORE launching if any dsh-forge instance is live. */
function assertNoActiveForgeInstance(): void {
  const found = listActiveForgeInstances()
  if (found.length > 0) {
    throw new Error(
      `active dsh-forge instance(s) detected before launch (ERR_SINGLE_INSTANCE guard): ${JSON.stringify(found)}`
      + ' — close the dev shell / leaked e2e boot before running this leg',
    )
  }
}

/** Close the shell and wait for the Electron main pid to actually exit. */
async function closeAndAwaitExit(shell: PluginShell): Promise<void> {
  const mainPid = await shell.electronApp.evaluate(() => process.pid).catch(() => null)
  await shell.close()
  if (mainPid === null) return
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (!isProcessAlive(mainPid)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`electron main pid ${String(mainPid)} still alive 20s after close`)
}

/** The minimal product config: base bundles + the mandatory forge core. */
function sc1Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

function sc1Tarballs() {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

/** The upstream sidebar's workbench row (the 5.15 locator). */
const workbenchRow = (page: Page) => page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** Switch into the workbench tolerating the boot session-restore bounce (3.3). */
async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** Wait until the default view-A panel carries the full node population. */
async function waitForTreeNodes(page: Page, expectedNodes: number, timeout = 45_000): Promise<void> {
  await page.waitForFunction((expected: number) => {
    const panel = document.querySelector('[data-dsh-forge-board-panel="tree"]')
    if (panel === null) return false
    return document.querySelectorAll('.react-flow__node').length === expected
  }, expectedNodes, { timeout })
}

test('6.2/sc1-board-consistency [@web-e2e @journey sc1-board-consistency]: three-view data vs forge-derived truth + 500-task first interactive ≤2s (median of 3)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- ground truth off the generator model (byte-stable, seed-pinned) --------
  const set = sc1TaskSet(SC1_SEED)
  const localIdsByFeature = new Map(set.features.map(feature =>
    [feature.slug, new Set(feature.tasks.map(task => task.localId))]))
  const ground: GroundTask[] = []
  for (const feature of set.features) {
    const ids = localIdsByFeature.get(feature.slug) ?? new Set<string>()
    for (const task of feature.tasks) {
      ground.push({
        key: `${feature.slug}/${task.localId}`,
        feature: feature.slug,
        localId: task.localId,
        title: task.title,
        status: task.status,
        type: task.type,
        dependencies: task.dependencies,
        dangling: task.dependencies.filter(dep => !ids.has(dep)),
        source: actorSource(task.record?.actor ?? null) ?? 'terminal',
        record: task.record,
      })
    }
  }
  const groundByKey = new Map(ground.map(task => [task.key, task] as const))
  const expectedEdgeIds = new Set<string>()
  for (const task of ground) {
    for (const dep of task.dependencies) {
      if (!task.dangling.includes(dep)) expectedEdgeIds.add(`e:${task.feature}/${dep}->${task.key}`)
    }
  }
  const expectedDanglingKeys = new Set(ground.filter(task => task.dangling.length > 0).map(task => task.key))
  // Generator-fact cross-checks (the model and its own facts agree).
  expect(ground.length).toBe(set.facts.taskCount)
  expect(expectedEdgeIds.size).toBe(set.facts.edgeCount - set.facts.dangling.length)
  expect(expectedDanglingKeys.size).toBe(set.facts.dangling.length)
  // view C's default sort: canonical status rank, ties on the key.
  const statusRank = new Map(TASK_STATUSES.map((status, index) => [status, index] as const))
  const expectedOrder = [...ground].sort((a, b) =>
    (statusRank.get(a.status) ?? 0) - (statusRank.get(b.status) ?? 0)
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  // --- journey scaffolding: fixture tree + isolated userData + warm shell root -
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc1-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  const shellRoot = join(root, 'shell')
  const userDataDir = join(root, 'user-data')
  const expectedNodes = set.facts.taskCount

  try {
    // ======================================================================
    // Warm-up boot (uncounted): register over the real chain, then run ALL
    // consistency assertions (AC1/AC3) on the fully-rendered board.
    // ======================================================================
    assertNoActiveForgeInstance()
    const warm = await launchPluginShell({
      bundles: sc1Bundles(), stageTarballs: sc1Tarballs(), rootDir: shellRoot, userDataDir,
    })
    try {
      await warm.uiReady()
      const { page } = warm
      // The isolation seam holds (6.1): the workbench DB lives in the journey
      // userData, never the dev machine's real one.
      expect(existsSync(join(userDataDir, 'workbench', 'workbench.db'))).toBe(true)

      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')

      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, expectedNodes, 60_000)

      // ---- AC1 · view A(依赖树): edge set = fixture blockers 全集 ----------
      // Resolvable blockers draw edges (id `e:<blocker>-><blocked>`); the
      // dangling slice draws NO edge but marks the node card — union = 全集.
      const tree = await page.evaluate(() => ({
        nodeKeys: Array.from(document.querySelectorAll('.react-flow__node')).map(node => node.getAttribute('data-id') ?? ''),
        edgeIds: Array.from(document.querySelectorAll('.react-flow__edge')).map(edge => edge.getAttribute('data-id') ?? ''),
        danglingNodes: Array.from(document.querySelectorAll('.react-flow__node [data-dsh-forge-badge="dangling"]'))
          .map(badge => badge.closest('.react-flow__node')?.getAttribute('data-id') ?? ''),
      }))
      expect(new Set(tree.nodeKeys).size, `view A node count (got ${String(tree.nodeKeys.length)})`).toBe(expectedNodes)
      expect(diffSamples([...groundByKey.keys()], tree.nodeKeys), 'view A node-key diff samples').toEqual([])
      expect(tree.edgeIds.length, 'view A edge count = resolvable blocker pairs').toBe(expectedEdgeIds.size)
      expect(diffSamples([...expectedEdgeIds], tree.edgeIds), 'view A edge-id diff samples').toEqual([])
      expect(diffSamples([...expectedDanglingKeys], tree.danglingNodes), 'view A dangling-mark diff samples').toEqual([])
      expect(
        tree.edgeIds.length + tree.danglingNodes.length,
        'view A edges + dangling marks = fixture blocker 全集',
      ).toBe(set.facts.edgeCount)

      // ---- AC1 · view B(状态分组): 7 columns, counts, card fields ----------
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      const columns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-status-column]')).map(column => ({
        status: column.getAttribute('data-dsh-forge-status-column') ?? '',
        count: column.querySelector('[data-dsh-forge-status-count]')?.textContent ?? '',
        cards: Array.from(column.querySelectorAll('[data-dsh-forge-task-card]')).map(card => ({
          key: card.getAttribute('data-dsh-forge-task-card') ?? '',
          ariaLabel: card.getAttribute('aria-label') ?? '',
          badges: Array.from(card.querySelectorAll('[data-dsh-forge-badge]')).map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
        })),
      })))
      expect(columns.map(column => column.status), 'view B column order = canonical 7 态').toEqual([...TASK_STATUSES])
      const bMismatches: string[] = []
      for (const column of columns) {
        const expectedTasks = expectedOrder.filter(task => task.status === column.status)
        if (column.count !== String(expectedTasks.length)) {
          bMismatches.push(`column ${column.status}: count ${column.count} != ${String(expectedTasks.length)}`)
        }
        if (column.cards.length !== expectedTasks.length) {
          bMismatches.push(`column ${column.status}: ${String(column.cards.length)} cards != ${String(expectedTasks.length)}`)
          continue
        }
        for (const card of column.cards) {
          const task = groundByKey.get(card.key)
          if (task === undefined) {
            bMismatches.push(`column ${column.status}: unknown card key ${card.key}`)
            continue
          }
          if (card.ariaLabel !== `${task.key} · ${task.title}`) bMismatches.push(`card ${task.key}: aria-label mismatch`)
          if (!card.badges.includes(`source:${task.source}`)) bMismatches.push(`card ${task.key}: no ${task.source} source badge`)
          if (card.badges.includes('worktree')) bMismatches.push(`card ${task.key}: worktree badge fabricated`)
          if (task.dangling.length > 0 && !card.badges.includes('dangling')) bMismatches.push(`card ${task.key}: dangling mark missing`)
          if (task.dangling.length === 0 && card.badges.includes('dangling')) bMismatches.push(`card ${task.key}: dangling mark fabricated`)
          if (bMismatches.length >= 5) break
        }
        if (bMismatches.length >= 5) break
      }
      expect(bMismatches, `view B field mismatches (samples of ${String(columns.length)} columns)`).toEqual([])

      // ---- AC1 · view C(列表): every row field vs the task files -----------
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map(row => ({
        key: row.getAttribute('data-dsh-forge-task-row') ?? '',
        title: row.children[1]?.textContent ?? '',
        statusText: row.children[2]?.textContent ?? '',
        feature: row.children[3]?.textContent ?? '',
        branch: row.children[4]?.textContent ?? '',
        worktree: row.children[5]?.textContent ?? '',
        sourceBadge: row.querySelector('[data-dsh-forge-badge^="source:"]')?.getAttribute('data-dsh-forge-badge') ?? null,
        updatedAt: row.children[7]?.textContent ?? '',
      })))
      expect(rows.length, 'view C row count').toBe(expectedNodes)
      const rowByKey = new Map(rows.map(row => [row.key, row] as const))
      const cMismatches: string[] = []
      for (const task of expectedOrder) {
        const row = rowByKey.get(task.key)
        if (row === undefined) {
          cMismatches.push(`row ${task.key} missing`)
          if (cMismatches.length >= 5) break
          continue
        }
        const diffs = [
          row.title === task.title ? null : `title ${JSON.stringify(row.title)} != ${JSON.stringify(task.title)}`,
          statusOfLabel.get(row.statusText) === task.status ? null : `status "${row.statusText}" != ${task.status}`,
          row.feature === task.feature ? null : `feature "${row.feature}" != ${task.feature}`,
          row.branch === '—' ? null : `branch "${row.branch}" != —(dialect: 恒 null)`,
          row.worktree === '—' ? null : `worktree "${row.worktree}" != —(dialect: 恒 false)`,
          row.sourceBadge === `source:${task.source}` ? null : `source ${String(row.sourceBadge)} != ${task.source}`,
          row.updatedAt !== '' ? null : 'updatedAt empty',
        ].filter((diff): diff is string => diff !== null)
        if (diffs.length > 0) cMismatches.push(`${task.key}: ${diffs.join('; ')}`)
        if (cMismatches.length >= 5) break
      }
      expect(cMismatches, `view C row-field mismatches (samples of ${String(expectedNodes)} rows)`).toEqual([])
      let divergence = -1
      for (let i = 0; i < Math.max(rows.length, expectedOrder.length); i += 1) {
        if ((rows[i]?.key ?? '') !== (expectedOrder[i]?.key ?? '')) {
          divergence = i
          break
        }
      }
      expect(divergence, `view C sort order diverges at #${String(divergence)}: got ${rows[divergence]?.key ?? ''}, expected ${expectedOrder[divergence]?.key ?? ''}`).toBe(-1)

      // ---- AC3 · 详情侧板: seeded-random 5 tasks vs file contents ----------
      // Deterministic sample (quota'd so 依赖链/记录 both get coverage).
      const rand = seededRandom(`${SC1_SEED}::sc1-board-consistency::detail-sample`)
      const shuffled = [...ground]
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = shuffled[i] as GroundTask
        shuffled[i] = shuffled[j] as GroundTask
        shuffled[j] = tmp
      }
      const sampled: GroundTask[] = []
      let withDeps = 0
      let withRecord = 0
      let withoutRecord = 0
      for (const task of shuffled) {
        if (sampled.length >= 5) break
        const quotasMet = withDeps >= 2 && withRecord >= 1 && withoutRecord >= 1
        const fillsQuota = (task.dependencies.length > 0 && withDeps < 2)
          || (task.record !== null && withRecord < 1)
          || (task.record === null && withoutRecord < 1)
        if (!quotasMet && !fillsQuota) continue
        sampled.push(task)
        if (task.dependencies.length > 0) withDeps += 1
        if (task.record !== null) withRecord += 1
        else withoutRecord += 1
      }
      expect(sampled.length).toBe(5)
      for (const task of sampled) {
        await page.locator(`[data-dsh-forge-task-row="${task.key}"]`).click()
        const dock = page.locator(`[data-dsh-forge-task-detail="${task.key}"]`)
        await expect(dock).toBeVisible({ timeout: 15_000 })
        await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })
        const dockData = await page.evaluate((taskKey: string) => {
          const root = document.querySelector(`[data-dsh-forge-task-detail="${taskKey}"]`)
          if (root === null) return null
          return {
            depKeys: Array.from(root.querySelectorAll('[data-dsh-forge-detail-dep]'))
              .map(item => item.getAttribute('data-dsh-forge-detail-dep') ?? ''),
            depTexts: Array.from(root.querySelectorAll('[data-dsh-forge-detail-dep]'))
              .map(item => item.textContent ?? ''),
            descriptionText: root.querySelector('[data-dsh-forge-detail-section="description"]')?.textContent ?? '',
            recordsText: root.querySelector('[data-dsh-forge-detail-section="records"]')?.textContent ?? '',
            recordTimes: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] time'))
              .map(time => time.getAttribute('dateTime') ?? ''),
            recordBadges: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] [data-dsh-forge-badge]'))
              .map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
            hasRecordsEmpty: root.querySelector('[data-dsh-forge-detail-records-empty]') !== null,
          }
        }, task.key)
        expect(dockData, `dock content for ${task.key}`).not.toBeNull()
        const detail = dockData as NonNullable<typeof dockData>
        // 描述: the fixture task .md body, verbatim (read-only markdown render).
        const bodyLine = `Fixture task body for ${task.feature}/${task.localId} (status: ${task.status}, type: ${task.type}).`
        expect(detail.descriptionText, `description for ${task.key}`).toContain(bodyLine)
        const blockersLine = task.dependencies.length > 0 ? `Blockers: ${task.dependencies.join(', ')}.` : 'No blockers.'
        expect(detail.descriptionText, `description blockers line for ${task.key}`).toContain(blockersLine)
        // 依赖链: the post-order upstream walk, same order as the DAG source.
        const expectedChain = expectedDepChain(groundByKey, task.key)
        expect(detail.depKeys, `depChain for ${task.key} (walk: ${expectedChain.join(' → ')})`).toEqual(expectedChain)
        for (let i = 0; i < expectedChain.length; i += 1) {
          const upstream = groundByKey.get(expectedChain[i] ?? '')
          const labels = upstream === undefined ? [] : labelsOf.get(upstream.status) ?? []
          const text = detail.depTexts[i] ?? ''
          if (labels.length > 0 && !labels.some(label => text.includes(label))) {
            throw new Error(`depChain item ${expectedChain[i] ?? ''}: status label missing in "${text}"`)
          }
        }
        // 执行记录: the write-once record .md mapped through the dialect.
        if (task.record === null) {
          expect(detail.hasRecordsEmpty, `records-empty hint for ${task.key}`).toBe(true)
          expect(detail.recordTimes, `no record timestamps for ${task.key}`).toEqual([])
        } else {
          expect(detail.recordTimes, `record timestamp verbatim for ${task.key}`).toEqual([task.record.completed])
          expect(detail.recordsText, `record summary for ${task.key}`).toContain(task.record.summary)
          expect(detail.recordsText, `record kind = task type for ${task.key}`).toContain(task.type)
          const recordSource = actorSource(task.record.actor)
          expect(
            detail.recordBadges,
            `record source badge for ${task.key} (actor ${String(task.record.actor)})`,
          ).toEqual(recordSource === null ? [] : [`source:${recordSource}`])
        }
        await page.locator('[data-dsh-forge-detail-close]').click()
        await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)
      }

      expect(warm.pageErrors, `renderer pageerrors: ${warm.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await warm.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
      await closeAndAwaitExit(warm)
    }

    // ======================================================================
    // AC2 · measured boots (3, median): first interactive ≤ 2s.
    // ======================================================================
    interface RunBreakdown { bootMs: number; switchMs: number; interactiveMs: number; dataSampleMs: number | null }
    const runs: RunBreakdown[] = []
    for (let run = 1; run <= MEASURED_RUNS; run += 1) {
      assertNoActiveForgeInstance()
      const bootStart = Date.now()
      const shell = await launchPluginShell({
        bundles: sc1Bundles(), stageTarballs: sc1Tarballs(), rootDir: shellRoot, userDataDir,
      })
      try {
        await shell.uiReady()
        const bootMs = Date.now() - bootStart
        const { page } = shell
        const state = await page.evaluate(async () => {
          const bridge = (globalThis as Sc1BridgeGlobals).dshForge?.workbench
          return await bridge?.getState?.() ?? null
        })
        const projectId = state?.activeProjectId
        if (typeof projectId !== 'string' || projectId === '') {
          throw new Error(`measured run ${String(run)}: persisted active project missing (got ${String(projectId)})`)
        }
        const switchStart = Date.now()
        await switchToWorkbench(page)
        const switchMs = Date.now() - switchStart
        // t0 + tab click in ONE evaluate: the window opens exactly at the
        // click dispatch (启动就绪 → 进入任务页), no driver latency inside.
        await page.evaluate(() => {
          const tab = Array.from(document.querySelectorAll('[data-dsh-forge-shell] [role="tab"]'))
            .find((el) => { const text = (el.textContent ?? '').trim(); return text === '任务' || text === 'Tasks' })
          if (tab === undefined) throw new Error('tasks tab not found inside the workbench shell')
          (globalThis as { __sc1t0?: number }).__sc1t0 = performance.now()
          ;(tab as HTMLElement).click()
        })
        await waitForTreeNodes(page, expectedNodes)
        // t1: two rAFs after the full population = first paint settled; the
        // timeout fallback keeps a throttled rAF (occluded window) from
        // hanging the leg — it reports, never rescues a slow render.
        const { t0, t1 } = await page.evaluate(() => new Promise<{ t0: number; t1: number }>((resolve) => {
          const g = globalThis as { __sc1t0?: number }
          const started = g.__sc1t0 ?? performance.now()
          const settle = (): void => resolve({ t0: started, t1: performance.now() })
          const frame = requestAnimationFrame(() => { requestAnimationFrame(settle) })
          setTimeout(() => { cancelAnimationFrame(frame); settle() }, 5_000)
        }))
        // Data leg (diagnostic): a representative direct getTaskBoard call
        // AFTER the window — SQLite read + IPC serialization of 500 rows.
        const dataSampleMs = await page.evaluate(async (id: string) => {
          const bridge = (globalThis as Sc1BridgeGlobals).dshForge?.workbench
          if (bridge?.getTaskBoard === undefined) return null
          const started = performance.now()
          await bridge.getTaskBoard(id)
          return performance.now() - started
        }, projectId)
        expect(shell.pageErrors, `measured run ${String(run)} renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
        runs.push({ bootMs, switchMs, interactiveMs: t1 - t0, dataSampleMs })
      } finally {
        await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
        await closeAndAwaitExit(shell)
      }
    }
    const medians = [...runs].sort((a, b) => a.interactiveMs - b.interactiveMs)
    const median = (medians[1] ?? medians[0])?.interactiveMs ?? Number.POSITIVE_INFINITY
    // Distribution always logged (CI 波动 → 记录分布).
    const distribution = runs.map((row, index) => ({
      run: index + 1,
      boot: Math.round(row.bootMs),
      switch: Math.round(row.switchMs),
      data: row.dataSampleMs === null ? null : Math.round(row.dataSampleMs),
      render: Math.round(row.interactiveMs - (row.dataSampleMs ?? 0)),
    }))
    console.log(`[sc1] first-interactive runs(ms)=${JSON.stringify(runs.map(row => Math.round(row.interactiveMs)))}`
      + ` median=${String(Math.round(median))} budget=${String(FIRST_INTERACTIVE_BUDGET_MS)}`)
    console.log('[sc1] breakdown per run (boot=launch→uiReady, switch=进入工作台, data=getTaskBoard 直调, render≈窗口−data):')
    console.log('[sc1] ' + JSON.stringify(distribution))
    expect(
      median,
      `500 任务首屏可交互中位数 ${String(Math.round(median))}ms > ${String(FIRST_INTERACTIVE_BUDGET_MS)}ms`
      + ` — 耗时分解(启动/数据/渲染): ${JSON.stringify(runs.map(row => ({
        bootMs: Math.round(row.bootMs), switchMs: Math.round(row.switchMs),
        dataSampleMs: row.dataSampleMs === null ? null : Math.round(row.dataSampleMs),
        interactiveMs: Math.round(row.interactiveMs),
      })), null, 2)}`,
    ).toBeLessThanOrEqual(FIRST_INTERACTIVE_BUDGET_MS)
  } finally {
    // Journey cleanup (6.1 Hard Rule: 测试后清理 — fixture tree + userData + shell root).
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
