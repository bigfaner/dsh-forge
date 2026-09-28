// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc7
// Traceability: docs/features/dsh-forge-m3/tasks/6.8-sc79-dual-form-outofrepo.md (SC7 AC-1/AC-2/AC-3)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC7 行 +
// 回归), prd-spec G8/SC7 + Story 8 (过渡双形态不破坏), 6.2 base (已迁移语料 /
// unified dispatch stub / instance lock / clean PATH 启动预设)。
//
// SC7 — the dual-form acceptance leg over the 6.2 base, one journey with TWO
// projects on the same machine:
//
//   已注册项目(app 通道;真内核链预迁移语料)跑完整日常管线:看板派发 →
//   renderer launch relay → stub 会话通道执行(journal prompt 行)→ agent
//   经 dsh tool claim/submit → 库级审计(actor = session:<id>)。
//   未注册项目(CLI 通道;index.json 语料 + git 根标记)全程只属于 forge
//   CLI:应用启动/派发期间文件树零变化(应用不干预的文件面证据),随后
//   在应用存活期间以子进程实测真实 forge CLI —— task add / task list /
//   task status 全部行为正常(G8「未注册项目 CLI 照旧」)。
//
// 零 spawn 断言(Hard Rule:进程/日志级,脚本断言,非代码静态检查):
//   - 进程级:全程多轮进程表采样(post-boot / post-dispatch / post-submit),
//     应用进程树内 forge CLI 镜像行数 = 0 且冻结 CC 插件镜像行数 = 0
//     (claude / claude-code 各可执行形 + claude-code 包路径形态;总数
//     跨采样求和后断言 = 0,即「日常管线 spawn 数 = 0」);
//   - 日志级:主进程 stdout 捕获 —— 活性锚点在场(shellLog JSON 行 +
//     WORKBENCH_WATCH,SC1 口径)且零 forge-bridge / forge CLI / cli-resolve
//     / claude-code / cc-plugin 标记。
//
// 回归(AC-3):本腿与 M1/M2 既有腿共用单实例锁纪律 —— 启动前
// assertNoActiveDshForgeInstances 探测(workers=1 串行 lane 之上再加显式
// fail-fast,M1 教训:外部持锁 → 整片 ERR_SINGLE_INSTANCE)。
//
// CLI 语料方言注记:基础任务 md 携带 CLI 可解析 frontmatter —— forge
// task add 的 BuildIndex 从 tasks/*.md 规范重建 index.json,无 frontmatter
// 的描述 md 会被重建丢弃;携 frontmatter 时既有任务在 add 后原样保留
// (list 双行 = CLI 行为正常的强断言)。

import { execSync, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { createDispatchStub, type DispatchStub } from '../stubs/dispatch.ts'
import { launchWorkbenchShell } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService } from '../../../apps/desktop/src/main/workbench/migration/pipeline.ts'
import type { RepoDb } from '../../../apps/desktop/src/main/workbench/repos/types.ts'

// ---------------------------------------------------------------------------
// The SC7 registered corpus: one artifacts-complete feature + one dispatchable
// task (the SC5 discipline — status 'tasks' + docKinds [prd, design] means the
// dispatch reaches the confirm gate with NO warning)
// ---------------------------------------------------------------------------

/** The registered journey's single feature slug. */
const SC7_FEATURE = 'sc7-dual-form'

/** The one zero-dependency pending task riding the app-channel pipeline. */
const SC7_TASK = { localId: '1', title: 'SC7 零 spawn 日常管线任务(coding.feature 协议)' } as const

/** The board-qualified key of the task. */
const TASK_KEY = `${SC7_FEATURE}/${SC7_TASK.localId}`

/** The hand-built task set (1 zero-dep pending typed task). */
function sc7TaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = [{
    stem: '1-sc7',
    localId: SC7_TASK.localId,
    title: SC7_TASK.title,
    status: 'pending',
    type: 'coding.feature',
    dependencies: [],
    record: null,
  }]
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const feature: GeneratedFeature = {
    slug: SC7_FEATURE,
    status: 'tasks',
    docKinds: ['prd', 'design'],
    tasks,
  }
  return {
    options: {
      seed: 'dsh-forge-m3-sc7',
      taskCount: tasks.length,
      featureCount: 1,
      danglingRate: 0,
      recordRate: 0,
      tasksPerPhase: 6,
      gates: false,
      statusWeights: {},
    },
    features: [feature],
    facts: {
      taskCount: tasks.length,
      featureCount: 1,
      statusCounts,
      edgeCount: 0,
      dangling: [],
      tasksWithRecord: 0,
      recordsWithSessionActor: 0,
      recordsWithTerminalActor: 0,
    },
  }
}

/** Facts about the built registered corpus. */
interface Sc7Corpus {
  readonly codeRoot: string
  readonly userDataDir: string
  readonly projectId: string
}

/**
 * Build the PRE-MIGRATED registered corpus through the REAL kernel chain
 * (write → register → scan → migrate), so the app boots on
 * `data_authority='sqlite'` with the one typed row (the SC5 discipline).
 */
async function buildSc7Corpus(root: string): Promise<Sc7Corpus> {
  const written = writeForgeProject(sc7TaskSet(), { codeRoot: join(root, 'app-repo') })
  const userDataDir = join(root, 'user-data')
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    const service = createMigrationService({
      db: db as RepoDb,
      userDataPath: userDataDir,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
    })
    await service.startMigration(project.id)
    return { codeRoot: written.codeRoot, userDataDir, projectId: project.id }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// The SC7 unregistered corpus: the CLI's own world (git root marker + the
// CLI-era md dialect with frontmatter so BuildIndex preserves it)
// ---------------------------------------------------------------------------

/** The unregistered feature slug (a world the app never sees). */
const CLI_FEATURE = 'sc7-cli-unregistered'

/** The base task's anchors (frontmatter-carried; survives the add rebuild). */
const CLI_BASE_TITLE = 'SC7 未注册项目基础任务(CLI 通道)'

/** The add-leg task (id 9 → file 9.md; the probe of normal CLI behavior). */
const CLI_ADD_TITLE = 'SC7 未注册项目 CLI 探针任务(dual-form 子进程实测)'
const CLI_ADD_ID = '9'

/** Facts about the built unregistered corpus. */
interface CliCorpus {
  readonly codeRoot: string
  readonly indexPath: string
}

/**
 * Write the unregistered forge checkout: `.forge/state.json` + the CLI-era
 * dialect (manifest / index.json / a frontmatter-carrying base task md), then
 * `git init` — the CLI's root marker (NO_PROJECT without .git or CLAUDE.md).
 */
function buildUnregisteredCliCorpus(codeRoot: string): CliCorpus {
  mkdirSync(join(codeRoot, '.forge'), { recursive: true })
  writeFileSync(join(codeRoot, '.forge', 'state.json'), `${JSON.stringify({ feature: CLI_FEATURE }, undefined, 2)}\n`)
  const tasksDir = join(codeRoot, 'docs', 'features', CLI_FEATURE, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(codeRoot, 'docs', 'features', CLI_FEATURE, 'manifest.md'), `---\nstatus: tasks\n---\n# ${CLI_FEATURE}\n`)
  const indexPath = join(tasksDir, 'index.json')
  writeFileSync(indexPath, `${JSON.stringify({
    feature: CLI_FEATURE,
    tasks: {
      '1-base': {
        id: '1',
        title: CLI_BASE_TITLE,
        priority: 'P1',
        status: 'pending',
        dependencies: [],
        type: 'doc',
        file: '1-base.md',
      },
    },
  }, undefined, 2)}\n`)
  writeFileSync(join(tasksDir, '1-base.md'), [
    '---',
    'id: "1"',
    `title: "${CLI_BASE_TITLE}"`,
    'priority: "P1"',
    'status: pending',
    'dependencies: []',
    'type: doc',
    '---',
    '',
    `# 1 — ${CLI_BASE_TITLE}`,
    '',
    '未注册项目语料 —— 全程只属于 forge CLI(dual-form:app 通道与 CLI 通道并存互不破坏)。',
    '',
  ].join('\n'))
  execSync('git init -q .', { cwd: codeRoot, timeout: 30_000 })
  return { codeRoot, indexPath }
}

/** Resolve the REAL forge CLI executable (SC7-未注册的环境前提). */
function resolveForgeCli(): string {
  const out = process.platform === 'win32'
    ? execSync('where.exe forge', { encoding: 'utf8', timeout: 15_000 })
    : execSync('which forge', { encoding: 'utf8', timeout: 15_000 })
  const exe = out.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')[0]
  if (exe === undefined || !existsSync(exe)) {
    throw new Error(
      'SC7 未注册腿需要本机可解析的真实 forge CLI(子进程实测的环境前提);'
        + `解析输出:${out.trim() === '' ? '(空)' : out.trim()}`,
    )
  }
  return exe
}

/** One real CLI invocation in the unregistered project (cwd = codeRoot). */
function runForgeCli(exe: string, args: readonly string[], cwd: string): string {
  return execFileSync(exe, [...args], { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true })
}

/** The recursive file snapshot (relative path → bytes) of one tree. */
function snapshotTree(root: string): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (dir: string, rel: string): void => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`
      if (dirent.isDirectory()) walk(join(dir, dirent.name), childRel)
      else files.set(childRel, readFileSync(join(dir, dirent.name), 'utf8'))
    }
  }
  walk(root, '')
  return files
}

// ---------------------------------------------------------------------------
// Zero-spawn faces: the APP TREE process scan + main-process stdout capture
// ---------------------------------------------------------------------------

/** One process-tree row (pid + parent + command — the ancestry faces). */
interface TreeRow { readonly pid: number; readonly parent: number; readonly command: string }

/** Enumerate the OS process table WITH parentage (win32 CIM / posix ps). */
function listProcessTree(): TreeRow[] {
  if (process.platform === 'win32') {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf8', timeout: 30_000 },
    )
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as
      { ProcessId: number; ParentProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string | null }>
    return (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({
      pid: Number(row.ProcessId),
      parent: Number(row.ParentProcessId),
      command: row.CommandLine ?? '',
    }))
  }
  const out = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8', timeout: 30_000 })
  const rows: TreeRow[] = []
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (match !== null) rows.push({ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? '' })
  }
  return rows
}

/** A command line's resolved executable image (first token, quoted or bare). */
function imageOf(command: string): string {
  const first = /"([^"]+)"/.exec(command)?.[1] ?? command.split(/\s+/)[0] ?? ''
  return first.split(/[\\/]/).pop() ?? ''
}

/** Is one command line a forge CLI execution (any spawn form)? */
function isForgeCliImage(command: string): boolean {
  return /^forge(\.exe|\.cmd|\.bat)?$/i.test(imageOf(command))
}

/**
 * Is one command line a frozen-CC-plugin spawn? The plugin's runtime faces:
 * the Claude Code executable (claude / claude-code, every PATHEXT form) or a
 * claude-code package invocation (the npm-distribution spawn shapes).
 */
function isCcPluginSpawn(command: string): boolean {
  if (/^claude(-code)?(\.exe|\.cmd|\.bat|\.ps1)?$/i.test(imageOf(command))) return true
  return /@anthropic-ai[\\/]claude-code|claude-code[\\/]cli\.js/i.test(command)
}

/**
 * Process-level zero-spawn assertion, scoped to the APP UNDER TEST: no process
 * whose ancestry leads to the launched Electron main may run the forge CLI or
 * the frozen CC plugin (a dev machine legitimately runs unrelated forge/claude
 * sessions — the SC7 claim is about THIS app's chain).
 */
function spawnViolationsUnderApp(appPid: number, label: string, rows: readonly TreeRow[]): string[] {
  const byPid = new Map(rows.map(row => [row.pid, row]))
  const isDescendant = (pid: number): boolean => {
    let current = byPid.get(pid)
    let hops = 0
    while (current !== undefined && hops < 64) {
      if (current.pid === appPid) return true
      current = byPid.get(current.parent)
      hops += 1
    }
    return false
  }
  return rows
    .filter(row => row.pid !== appPid && isDescendant(row.pid) && (isForgeCliImage(row.command) || isCcPluginSpawn(row.command)))
    .map(row => `[${label}] pid ${String(row.pid)}: ${row.command.slice(0, 160)}`)
}

/** The main-process stdout capture (log-level face; pipe buffers keep early lines). */
function captureMainStdout(shell: PluginShell): string[] {
  const lines: string[] = []
  const child = shell.electronApp.process()
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim() !== '') lines.push(line)
    }
  })
  return lines
}

/**
 * 日志级断言:流活性 + 零 spawn 标记(SC1 活性口径:捕获必须收到主进程
 * shellLog JSON 行,且含 WORKBENCH_WATCH —— 本腿激活项目时感知 watcher
 * 必写该码)。spawn 标记 = forge CLI 三形(SC1 口径)+ CC 插件两形。
 */
function assertZeroSpawnInLog(lines: readonly string[]): void {
  expect(lines.some(line => /"level":"(info|warn|error)".*"code":"[A-Z_]+"/.test(line)),
    '主进程日志流在场(shellLog JSON 行;反空转证据)').toBe(true)
  expect(lines.some(line => line.includes('WORKBENCH_WATCH')), 'WORKBENCH_WATCH 在场(本腿激活的感知日志,活性锚点)').toBe(true)
  const spawns = lines.filter(line => /forge-bridge|forge CLI|cli-resolve|claude-code|cc-plugin/i.test(line))
  expect(spawns, '日志级零 forge CLI / 冻结 CC 插件 spawn 标记').toEqual([])
}

// ---------------------------------------------------------------------------
// Renderer-side helpers (SC1/SC4/SC5 precedents)
// ---------------------------------------------------------------------------

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

const workbenchRow = (page: Page) => page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()
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

/** The card-level orchestration badge of one task (its state attribute). */
const orchBadge = (page: Page, taskKey: string, state: string) =>
  page.locator(`[data-dsh-forge-node-card="${taskKey}"] [data-dsh-forge-orch-badge="${state}"]`)

/** One journal prompt row (the stub execution leg's evidence). */
interface PromptRow { readonly sessionId: string; readonly text: string; readonly requestId: string }

/** Poll the unified stub journal until one session's prompt row lands. */
async function waitForPromptRow(shell: PluginShell, stub: DispatchStub, sessionId: string): Promise<PromptRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = stub.readJournal()
      .filter(entry => entry.kind === 'prompt' && entry.sessionId === sessionId)
      .map(entry => ({ sessionId: entry.sessionId as string, text: entry.text as string, requestId: entry.requestId as string }))[0]
    if (row !== undefined) return row
    await shell.page.waitForTimeout(100)
  }
  throw new Error(`stub journal never recorded the prompt row of session ${sessionId}`)
}

// ---------------------------------------------------------------------------
// The SC7 leg
// ---------------------------------------------------------------------------

// [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('sc7/dual-form: registered daily pipeline (dispatch→execute→submit) spawns ZERO frozen-CC-plugin/CLI processes (process+log level) while the unregistered project\'s real forge CLI runs unaffected (subprocess, app live)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / AC-3(回归纪律)— the instance-lock probe runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  // AC-1 环境前提:真实 forge CLI 可解析(子进程实测的硬前提)。
  const forgeExe = resolveForgeCli()

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc7-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc7-stub-'))
  const stub: DispatchStub = createDispatchStub(stubDir)
  const corpus = await buildSc7Corpus(root)
  const cli = buildUnregisteredCliCorpus(join(root, 'cli-repo'))
  const cliTreeBefore = snapshotTree(cli.codeRoot)

  const shell = await launchWorkbenchShell({
    userDataDir: corpus.userDataDir,
    stubEnv: stub.env,
  })
  const mainLog = captureMainStdout(shell)
  const appPid = shell.electronApp.process().pid ?? -1
  const spawnSamples: string[][] = []
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- 进程级 face ①:boot 后零 spawn ------------------------------------
    spawnSamples.push(spawnViolationsUnderApp(appPid, 'post-boot', listProcessTree()))

    // 显式激活(单激活事务)→ 任务 tab → 日常管线起点。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"]`)).toBeVisible({ timeout: 20_000 })

    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId
    expect(projectId, '激活项目在座').toBe(corpus.projectId)

    // ---- AC-2 派发(看板;产物齐全 → 无警告直达确认)----------------------
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    await page.locator(`[data-dsh-forge-select-chk="${TASK_KEY}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐全 → 无警告直达确认').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await orchBadge(page, TASK_KEY, 'running').waitFor({ state: 'visible', timeout: 20_000 })

    // ---- AC-2(进程级 face ②:派发后)--------------------------------------
    spawnSamples.push(spawnViolationsUnderApp(appPid, 'post-dispatch', listProcessTree()))

    // ---- AC-1 应用不干预(文件面):应用启动+派发全程未注册树零变化 ---------
    expect(snapshotTree(cli.codeRoot), '未注册项目文件树零变化(应用不干预的文件面证据)').toEqual(cliTreeBefore)

    // ---- AC-1 未注册项目 CLI 照旧(应用存活期间,子进程实测)---------------
    const addOut = runForgeCli(forgeExe, [
      'task', 'add', '--title', CLI_ADD_TITLE, '--type', 'doc', '--id', CLI_ADD_ID, '--description', 'SC7 dual-form CLI probe body',
    ], cli.codeRoot)
    expect(addOut, 'task add 行为正常(ACTION: ADDED)').toContain('ACTION: ADDED')
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], cli.codeRoot)
    expect(listOut, 'task list 呈现既有 + 新增双行(rebuild 保留 frontmatter 语料)').toContain(CLI_BASE_TITLE)
    expect(listOut, 'task list 呈现新增任务').toContain(CLI_ADD_TITLE)
    const statusOut = runForgeCli(forgeExe, ['task', 'status', CLI_ADD_ID], cli.codeRoot)
    expect(statusOut, 'task status 行为正常(pending)').toContain('pending')

    // CLI 自写文件面:index.json 收录新任务;任务 md 落盘(CLI 自己的世界)。
    const cliIndex = JSON.parse(readFileSync(cli.indexPath, 'utf8')) as { tasks: Record<string, { id: string; title: string }> }
    const addedEntry = Object.values(cliIndex.tasks).find(entry => entry.id === CLI_ADD_ID)
    expect(addedEntry?.title, 'index.json 收录新增任务(CLI 权威文件)').toBe(CLI_ADD_TITLE)
    expect(existsSync(join(cli.codeRoot, 'docs', 'features', CLI_FEATURE, 'tasks', `${CLI_ADD_ID}.md`)), '任务 md 落盘').toBe(true)

    // ---- AC-2 执行(stub 会话通道)+ 提交(dsh tool 动词面)----------------
    interface DispatchRowView { readonly id: string; readonly taskKey: string; readonly state: string; readonly sessionId: string | null }
    const dispatchRow = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === TASK_KEY)[0] as DispatchRowView
    expect(dispatchRow.state, '派发成功(running)').toBe('running')
    expect(dispatchRow.sessionId, '行携带预铸 session id').not.toBeNull()

    // stub 执行腿:journal prompt 行在场(launch relay → host dispatch-launch)。
    const prompt = await waitForPromptRow(shell, stub, dispatchRow.sessionId as string)
    expect(prompt.text.length, '注入内容非空(预合成组合串)').toBeGreaterThan(0)

    // agent 经 dsh tool 完成 claim/submit(工具→桥帧同动词面,SC1 口径)。
    const actor = `session:${dispatchRow.sessionId as string}`
    const claimed = await bridgeInvoke<{ status: string; source: string | null }>(page, 'taskClaim', [{ projectId, taskKey: TASK_KEY }, actor])
    expect(claimed.status, 'claim → in_progress').toBe('in_progress')
    expect(claimed.source, '来源投影 = [会话]').toBe('session')
    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId, taskKey: TASK_KEY }, actor])
    expect(submitted.status, 'submit → completed(日常管线闭合)').toBe('completed')

    // ---- AC-2(库级审计:actor 留痕)----------------------------------------
    expect(shell.userDataDir, 'isolated userData pinned(DSH_FORGE_USER_DATA 缝)').toBeDefined()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(shell.userDataDir as string, 'workbench', 'workbench.db'), { readOnly: true })
    try {
      const taskRow = db.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?')
        .get(projectId, TASK_KEY) as { status: string; updated_by: string }
      expect(taskRow.status, '库内终态 = completed').toBe('completed')
      expect(taskRow.updated_by, '审计主体 = session:<id>(claim/submit 留痕)').toBe(actor)
    } finally {
      db.close()
    }

    // ---- AC-2(进程级 face ③:提交后 + 总数断言;日志级 face)---------------
    spawnSamples.push(spawnViolationsUnderApp(appPid, 'post-submit', listProcessTree()))
    const totalSpawns = spawnSamples.reduce((sum, sample) => sum + sample.length, 0)
    console.log(`[sc7] zero-spawn samples: ${spawnSamples.map(sample => String(sample.length)).join('/')} total=${String(totalSpawns)} (forge CLI + frozen CC plugin images under the app tree)`)
    expect(spawnSamples.flat(), '日常管线全程应用进程树内 forge CLI / 冻结 CC 插件 spawn 数 = 0(进程级断言)').toEqual([])
    expect(totalSpawns, 'spawn 总数 = 0(跨采样求和)').toBe(0)

    await page.waitForTimeout(1_000) // flush the pipe tail before the read
    assertZeroSpawnInLog(mainLog)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
