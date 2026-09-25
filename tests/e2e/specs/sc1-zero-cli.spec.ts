// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc1
// Traceability: docs/features/dsh-forge-m3/tasks/6.3-sc1-zero-cli.md (AC-1..5)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC1), prd-spec
// G1/SC1 (零 CLI 执行链 + 15 技能扁平名寻址), 6.2 base (clean env / corpus /
// unified dispatch stub / instance lock).
//
// SC1 — the zero-CLI full chain over the 6.2 base:
//
//   干净环境(无 forge CLI)启动 → 注册既有项目经向导完成一次性迁移(in_repo
//   路径;index.json 检出 → StepMigrate 默认开 → 迁移相位 → 进入工作台)→
//   看板派发任务(工具栏「派发」→ 多选 → 警告门继续 → 确认派发)→ renderer
//   launch relay 转交 host dispatch-launch → stub 会话通道执行(create +
//   prompt 落 journal;sha256(journal.text) === dispatch 行 prompt_hash)→
//   agent 经 dsh tool 完成 claim/submit → 状态回流看板 ≤5s → 库级审计断言
//   (task.updated_by = session:<id>)。
//
// Zero-CLI 双重断言(Hard Rule:进程/日志级缺一不可):
//   - 进程级:启前 clean-env 探针(6.2 face,所有解析形不可达)+ 全程两轮
//     进程表采样(零 forge CLI 可执行镜像行;首标记断言排除自身);
//   - 日志级:主进程 stdout 捕获 —— 必含 WORKBENCH_READY(流的活性反证,
//     防空转通过)且零 forge-bridge / forge CLI spawn 标记。
//
// 15 技能断言(AC-3):boot 的 customSkillDirs 同步真实落笔(profile 用户层
// cordis.patch.yml 指向物化插件技能根)→ 15 扁平名目录在场 → 每项 SKILL.md
// 经 vendored yaml@2(host skill-filesystem provider 的同一解析器字节)解析
// frontmatter,name === 扁平名、description 非空 —— 寻址解析链的 CI 可达
// 最强形(会话内 agent 消费面 = 同一 provider 字节 + 同一根 + 同一解析器)。
//
// agent 腿注记(M2 step-5 先例):stub 会话通道内无真 agent;claim/submit 在
// tool-bridge 泵的同一动词面驱动(preload 桥 taskClaim/taskSubmit,actor =
// session:<id> —— 泵的封闭 switch 把 forge_task_claim/submit 帧映射到恰好
// 这两个调用)。回流与审计断言不受模拟方式影响;工具→桥帧半面由 2.1 单测
// 与 6.2 approval stub 腿(host→renderer→kernel 真桥往返)覆盖。

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { assertForgeCliUnavailable, cleanEnv } from '../fixtures/clean-env.ts'
import { writeUnmigratedCorpus } from '../fixtures/corpus.ts'
import { createDispatchStub, type DispatchStub } from '../stubs/dispatch.ts'
import { freshUserDataDir, launchWorkbenchShell } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'
import { zh } from '../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

// ---------------------------------------------------------------------------
// Constants: the 15 mandatory skills (PRD 技能迁移划分表), status labels, budgets
// ---------------------------------------------------------------------------

/** PRD 必迁 15 项(6 核心执行闭环 + 6 管线创作系 + 3 生成系)。 */
const MANDATORY_SKILLS = [
  'submit-task', 'git-commit', 'git-checkout', 'run-tests', 'fix-bug', 'test-guide',
  'brainstorm', 'write-prd', 'tech-design', 'ui-design', 'breakdown-tasks', 'quick-tasks',
  'gen-contracts', 'gen-journeys', 'gen-test-scripts',
] as const

/** SC1 ≤5s 回流预算(sc3 口径:阈值恒定,永不放宽;重试一次打印分布)。 */
const REFLOW_BUDGET_MS = 5_000
const REFLOW_WAIT_TIMEOUT_MS = 20_000

const SHORT_LABEL_KEYS = {
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
} as const

/** 双语短标签(回流判据 = 页内首见目标徽标 + 新状态短标签)。 */
function shortLabelsOf(status: keyof typeof SHORT_LABEL_KEYS): string[] {
  return [zh[SHORT_LABEL_KEYS[status]], en[SHORT_LABEL_KEYS[status]]]
}

/** 迁移终态集(deps 终态判定同口径)。 */
const TERMINAL = new Set(['completed', 'skipped'])

/** 派发对象挑选:pending 且依赖全终态(优先零依赖 —— UI 可派发守卫同语义)。 */
function pickDispatchTarget(
  set: ReturnType<typeof writeUnmigratedCorpus>['set'],
): { key: string; title: string } {
  const byLocalId = new Map(set.features.flatMap(feature =>
    feature.tasks.map(task => [`${feature.slug}/${task.localId}`, task] as const)))
  const candidates: Array<{ key: string; title: string; deps: number }> = []
  for (const feature of set.features) {
    for (const task of feature.tasks) {
      if (task.status !== 'pending') continue
      const unmet = task.dependencies.filter(dep => {
        const upstream = byLocalId.get(`${feature.slug}/${dep}`)
        return upstream === undefined || !TERMINAL.has(upstream.status)
      })
      if (unmet.length === 0) candidates.push({ key: `${feature.slug}/${task.localId}`, title: task.title, deps: task.dependencies.length })
    }
  }
  candidates.sort((a, b) => a.deps - b.deps)
  const picked = candidates[0]
  if (picked === undefined) throw new Error('corpus carries no dispatchable pending task (status + terminal deps)')
  return { key: picked.key, title: picked.title }
}

// ---------------------------------------------------------------------------
// Zero-CLI faces: the APP TREE process scan + main-process stdout capture
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

/** Is one command line a forge CLI execution (any spawn form the resolver yields)? */
function isForgeCliImage(command: string): boolean {
  return /^forge(\.exe|\.cmd|\.bat)?$/i.test(imageOf(command))
}

/**
 * Process-level zero-CLI assertion, scoped to the APP UNDER TEST: no process
 * whose ancestry leads to the launched Electron main may run the forge CLI
 * image (a dev machine legitimately runs unrelated forge.exe sessions — the
 * SC1 claim is about THIS app's chain, and the clean-PATH probe already proves
 * resolution is impossible inside it).
 */
function assertNoForgeCliUnderApp(appPid: number, label: string): void {
  const rows = listProcessTree()
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
  const hits = rows
    .filter(row => row.pid !== appPid && isForgeCliImage(row.command) && isDescendant(row.pid))
    .map(row => `pid ${String(row.pid)}: ${row.command.slice(0, 160)}`)
  expect(hits, `[${label}] the app tree must hold zero forge CLI processes (进程级断言)`).toEqual([])
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
 * 日志级断言:流活性 + 零 CLI spawn 标记。
 *
 * 活性反证:捕获必须收到主进程 shellLog JSON 行(code 字段形)且含
 * WORKBENCH_WATCH —— 本腿激活项目时感知 watcher 必写该码(attach 竞态下
 * boot 早期行可能已被 Playwright 消费,故活性锚点选旅程自身必产的日志行,
 * 而非 boot 期的 WORKBENCH_READY)。
 */
function assertNoForgeCliInLog(lines: readonly string[]): void {
  expect(lines.some(line => /"level":"(info|warn|error)".*"code":"[A-Z_]+"/.test(line)),
    '主进程日志流在场(shellLog JSON 行;反空转证据)').toBe(true)
  expect(lines.some(line => line.includes('WORKBENCH_WATCH')), 'WORKBENCH_WATCH 在场(本腿激活的感知日志,活性锚点)').toBe(true)
  const cli = lines.filter(line => /forge-bridge|forge CLI|cli-resolve/i.test(line))
  expect(cli, '日志级零 forge CLI 调用标记').toEqual([])
}

// ---------------------------------------------------------------------------
// 15-skill flat-name resolution (boot-synced root + vendored yaml parser)
// ---------------------------------------------------------------------------

/** The vendored yaml@2.9.1 the host's skill-filesystem provider parses with. */
function vendoredYamlParse(): (text: string) => Record<string, unknown> {
  const specDir = fileURLToPath(new URL('.', import.meta.url))
  const require = createRequire(join(specDir, '../../../packages/desktop-host-vendor/vendored/packages/skill/skill-filesystem/lib/index.js'))
  const yaml = require('yaml') as { parse(text: string): Record<string, unknown> }
  return text => yaml.parse(text)
}

/** The 15 flat-name resolution assertion over the LIVE synced skill root. */
function assertSkillsResolve(profileDir: string): void {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  expect(existsSync(patchPath), 'boot 同步落笔用户层 dsh 配置(customSkillDirs 承载面)').toBe(true)
  const patch = readFileSync(patchPath, 'utf8')
  const managed = /id:\s*skill-filesystem/.test(patch)
  expect(managed, 'patch 用户层持有 skill-filesystem 受管行').toBe(true)
  const skillRoot = /customSkillDirs:[\s\S]*?-\s*'([^']+)'/.exec(patch)?.[1]
  expect(typeof skillRoot, 'customSkillDirs 条目指向技能根').toBe('string')
  expect(existsSync(skillRoot as string), `技能根在场: ${String(skillRoot)}`).toBe(true)

  const dirs = readdirSync(skillRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  expect(dirs, '技能根持有恰好 15 个扁平名目录').toEqual([...MANDATORY_SKILLS].sort())

  const parse = vendoredYamlParse()
  for (const name of MANDATORY_SKILLS) {
    const skillMd = readFileSync(join(skillRoot as string, name, 'SKILL.md'), 'utf8')
    expect(skillMd.startsWith('---'), `${name}/SKILL.md frontmatter 在场`).toBe(true)
    const end = skillMd.indexOf('\n---', 3)
    expect(end, `${name}/SKILL.md frontmatter 闭合`).toBeGreaterThan(0)
    const frontmatter = parse(skillMd.slice(3, end)) as Record<string, unknown>
    expect(frontmatter.name, `${name} frontmatter.name === 扁平名(寻址解析)`).toBe(name)
    expect(typeof frontmatter.description === 'string' && (frontmatter.description as string).trim() !== '',
      `${name} description 非空(vendored 解析器接受)`).toBe(true)
  }
}

// ---------------------------------------------------------------------------
// Renderer-side oracle faces (the preload bridge — the tool-bridge pump's verb face)
// ---------------------------------------------------------------------------

/**
 * The in-page preload-bridge verb dispatcher (functions cannot cross the wire —
 * one evaluate per call; args ride Playwright's parameter channel). This is the
 * SAME verb face the tool-bridge pump maps forge_task_claim/submit frames onto.
 */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

/** t0 → t1:claim/submit 动词返回(写完成)→ 页内首见 [会话] 徽标 + 新状态短标签。 */
async function measureReflow(page: Page, taskKey: string, status: keyof typeof SHORT_LABEL_KEYS, apply: () => Promise<void>): Promise<number> {
  const labels = shortLabelsOf(status)
  const t0 = Date.now()
  await apply()
  await page.waitForFunction((input: { key: string; labels: string[] }) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${input.key}"]`)
    if (card === null) return false
    const badge = card.querySelector('[data-dsh-forge-badge^="source:"]')
    if (badge?.getAttribute('data-dsh-forge-badge') !== 'source:session') return false
    const text = card.textContent ?? ''
    return input.labels.some(label => text.includes(label))
  }, { key: taskKey, labels }, { timeout: REFLOW_WAIT_TIMEOUT_MS, polling: 50 })
  return Date.now() - t0
}

/** The upstream sidebar's workbench row + the boot-bounce-tolerant switch (6.2 base). */
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

// ---------------------------------------------------------------------------
// The SC1 leg
// ---------------------------------------------------------------------------

test('sc1/zero-cli: wizard migration → board dispatch → stub subagent → tool claim/submit → ≤5s reflow; 0 forge CLI calls; 15 skills resolve', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / AC-5 — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  // AC-2 (环境面) — the clean environment is asserted, not assumed: under the
  // sanitized PATH the forge CLI is unresolvable on every probe face.
  const sanitized = cleanEnv()
  assertForgeCliUnavailable(sanitized)

  // The journey corpus: a small deterministic unmigrated project (index.json +
  // task md). The dispatch target = pending + terminal deps.
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc1-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc1-stub-'))
  const corpus = writeUnmigratedCorpus(root, { seed: 'dsh-forge-m3-sc1', taskCount: 10, featureCount: 1 })
  const target = pickDispatchTarget(corpus.set)
  const featureSlug = target.key.slice(0, target.key.lastIndexOf('/'))
  const tasksDir = join(corpus.docsRoot, 'docs', 'features', featureSlug, 'tasks')

  const stub: DispatchStub = createDispatchStub(stubDir)
  const shell = await launchWorkbenchShell({
    userDataDir: freshUserDataDir('dsh-forge-m3-sc1'),
    stubEnv: stub.env,
  })
  const mainLog = captureMainStdout(shell)
  const appPid = shell.electronApp.process().pid ?? -1
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // AC-2 (进程级 face ①) — the app tree holds zero forge CLI processes.
    assertNoForgeCliUnderApp(appPid, 'post-boot')

    // ---- AC-3(15 技能):boot 同步已落笔,解析全部成功 --------------------
    assertSkillsResolve(shell.profileDir)

    // ---- AC-1 注册(向导迁移路径)----------------------------------------
    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(corpus.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click() // in_repo:授权面不进本腿
    await page.locator('[data-dsh-forge-wizard-next]').click()

    // 条件迁移步骤:index.json 检出 → StepMigrate(默认开)+ 摘要四步。
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()

    // 迁移相位(原位):完成 = parity-ok + [进入工作台]。
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0)

    // 一次性迁移的文件面:index.json 淘汰,归档在场(SC2 口径的前半,SC1 顺带)。
    expect(existsSync(join(tasksDir, 'index.json')), '迁移后 index.json 不存在').toBe(false)
    expect(readdirSync(tasksDir).some(name => name.startsWith('index.json.migrated-')), '归档 index.json.migrated-<ts> 在场').toBe(true)

    // 显式激活(单激活事务;register 动词不激活 —— M2 divergence note)。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

    // ---- AC-1 派发(看板)------------------------------------------------
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator('[data-dsh-forge-dispatch-entry]'), '派发入口在场(有可派发任务)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-node-card="${target.key}"]`)).toBeVisible({ timeout: 20_000 })

    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible()
    await page.locator(`[data-dsh-forge-select-chk="${target.key}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()

    // 警告门(阶段资产缺失,warn 不阻断)或直达确认 —— 两者其一必达。
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"], [data-dsh-forge-dialog="dispatch-confirm"]').first())
      .toBeVisible({ timeout: 10_000 })
    if (await page.locator('[data-dsh-forge-dialog="dispatch-warning"]').isVisible().catch(() => false)) {
      await page.locator('[data-dsh-forge-dispatch-warning-continue]').click()
    }
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toHaveCount(0, { timeout: 15_000 })

    // ---- AC-1 stub subagent 执行 -----------------------------------------
    // renderer launch relay(6.3 补齐的两段式第二段)→ host dispatch-launch →
    // stub 通道 create + prompt(journal 逐字符可取回)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId
    expect(typeof projectId).toBe('string')

    let created: { sessionId: string; cwd: string } | undefined
    let prompted: { sessionId: string; text: string } | undefined
    const codeRootNormalized = corpus.codeRoot.replaceAll('\\', '/')
    for (let attempt = 0; attempt < 200 && (created === undefined || prompted === undefined); attempt += 1) {
      const rows = stub.readJournal()
      created = rows.find(row => row.kind === 'create' && String(row.cwd).replaceAll('\\', '/') === codeRootNormalized) as typeof created
      prompted = rows.find(row => row.kind === 'prompt' && row.sessionId === created?.sessionId) as typeof prompted
      if (created === undefined || prompted === undefined) await page.waitForTimeout(250)
    }
    const dispatchRows = await bridgeInvoke<Array<{ id: string; taskKey: string; state: string; sessionId: string | null; promptHash: string; error: string | null }>>(page, 'getDispatches', [projectId])
    const dispatchRow = dispatchRows.find(row => row.taskKey === target.key)
    expect(created, 'stub journal 记录 subagent create(cwd = 项目 codeRoot)').toBeDefined()
    expect(prompted, 'stub journal 记录首条消息投递(预合成组合串)').toBeDefined()
    expect(dispatchRow, 'dispatch 行在库(getDispatches)').toBeDefined()
    expect(dispatchRow?.state, 'launch relay 回填 running(notifySessionStarted)').toBe('running')
    expect(dispatchRow?.sessionId, '行 session_id = 预铸 id(= stub create adopt 的 id)').toBe(created?.sessionId)
    expect(createHash('sha256').update(prompted?.text ?? '').digest('hex'),
      'sha256(stub journal 注入全文) === dispatch 行 prompt_hash(spike③ 口径)').toBe(dispatchRow?.promptHash)

    // ---- AC-2(进程级 face ②:派发后全程采样)----------------------------
    assertNoForgeCliUnderApp(appPid, 'post-dispatch')

    // ---- AC-1/AC-4 agent 经 dsh tool 完成 claim/submit → 回流 ≤5s ---------
    // 驱动面 = tool-bridge 泵的同一动词面 + 同一 actor 形(session:<id>)。
    const actor = `session:${created?.sessionId as string}`
    const claimMs = await measureReflow(page, target.key, 'in_progress', async () => {
      const claimed = await bridgeInvoke<{ status: string; source: string | null }>(page, 'taskClaim', [{ projectId, taskKey: target.key }, actor])
      expect(claimed.status).toBe('in_progress')
      expect(claimed.source, '来源投影 = [会话]').toBe('session')
    })
    const submitMs = await measureReflow(page, target.key, 'completed', async () => {
      const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId, taskKey: target.key }, actor])
      expect(submitted.status).toBe('completed')
    })
    console.log(`[sc1] reflow(ms)=claim:${String(claimMs)} submit:${String(submitMs)} budget=${String(REFLOW_BUDGET_MS)} (事件推送+渲染全链,真实时钟)`)
    expect(claimMs, `claim 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)
    expect(submitMs, `submit 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // ---- AC-4 actor 标识(库断言)----------------------------------------
    expect(shell.userDataDir, 'isolated userData pinned(DSH_FORGE_USER_DATA 缝)').toBeDefined()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(shell.userDataDir as string, 'workbench', 'workbench.db'), { readOnly: true })
    try {
      const taskRow = db.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?')
        .get(projectId as string, target.key) as { status: string; updated_by: string }
      expect(taskRow.status, '库内终态 = completed').toBe('completed')
      expect(taskRow.updated_by, '审计主体 = session:<id>(claim/submit 留痕)').toBe(actor)
      const dispatchDbRow = db.prepare('SELECT state, session_id FROM dispatch WHERE id = ?')
        .get(dispatchRow?.id as string) as { state: string; session_id: string }
      expect(dispatchDbRow.state).toBe('running')
      expect(dispatchDbRow.session_id).toBe(created?.sessionId)
    } finally {
      db.close()
    }

    // ---- AC-2(日志级 face:主进程 stdout)-------------------------------
    await page.waitForTimeout(1_000) // flush the pipe tail before the read
    assertNoForgeCliInLog(mainLog)
    assertNoForgeCliUnderApp(appPid, 'post-submit')

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
