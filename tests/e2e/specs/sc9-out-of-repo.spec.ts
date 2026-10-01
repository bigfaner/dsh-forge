// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc9
// Traceability: docs/features/dsh-forge-m3/tasks/6.8-sc79-dual-form-outofrepo.md (SC9 AC-1/AC-2 + 回归)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC9 行 +
// 回归)、§Data Model·文档根(默认仓外/仓内兼容,tech-design I4.8 落地面),
// prd-spec G7/SC9 + Story 7 (过程文档默认仓外)、6.2 base (未迁移语料 /
// unified dispatch stub / instance lock)。
//
// SC9 — the out-of-repo docs acceptance over the 6.2 base, two journeys:
//
//   Leg 1 默认仓外:纯代码仓(.forge 标记 + git 基线,零 docs/ 树)注册 ——
//     向导文档位置步骤默认值 = 仓外应用管理路径(external 单选默认选中 +
//     预填值 === <userData>/workbench/docs/<dirname> + 「已预填」提示行;
//     显式授权 → 注册)。文档语料位于仓外文档根(测试扮演落文档角色)→
//     向导检出 index.json → 一次性迁移(原位相位)→ 日常管线四类读写全部
//     落文档根:
//       任务:看板派发(产物齐 → 直达确认)→ stub 会话执行 → claim/submit;
//       记录:records/<stem>.md 落文档根 → getTaskDetail 读回(逐字锚点);
//       阶段资产:stageSummarize → <文档根>/features/<slug>/stages/tasks.md
//         + advanceStage → manifest status 翻 in-progress(均文档根);
//       proposals:<文档根>/proposals/<slug>/proposal.md 外部落 → 提案板行;
//     代码仓零新增过程文档:文件树快照全等 + git status --porcelain 空 +
//     codeRoot 下 docs/ 不存在(git status/文件断言,AC 原文口径)。
//
//   Leg 2 仓内兼容:既有仓内文档项目(index.json 语料在仓内)注册 —— 向导
//     显式选仓内 → 迁移(index.json 原位淘汰归档)→ 读写正常且文件落仓内
//     原位:board 读回 + claim/submit + 记录读回 + stageSummarize 落
//     <codeRoot>/docs/features/<slug>/stages/tasks.md + manifest 原位翻转;
//     应用管理空间(<userData>/workbench/docs)零创建(写入不旁落)。
//
// 回归:两腿共用单实例锁纪律(启动前 assertNoActiveDshForgeInstances,
// M1/M2 腿不回归的 Hard Rule 面)。

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { createDispatchStub, type DispatchStub } from '../stubs/dispatch.ts'
import { launchWorkbenchShell, freshUserDataDir } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openBoardPane, openOverviewPane } from './_lib/journey-world.ts'

// ---------------------------------------------------------------------------
// Shared helpers (SC1/SC4/SC5 precedents)
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

/** `git status --porcelain` of one tree ('' = clean). */
function gitStatusPorcelain(root: string): string {
  return execSync('git status --porcelain', { cwd: root, encoding: 'utf8', timeout: 30_000 }).trim()
}

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

/** The recorded-task md body (frontmatter + ## Summary; forge 记录方言). */
function recordMarkdown(input: { actor: string; summary: string }): string {
  return [
    '---',
    'status: "completed"',
    'started: "2026-09-24T10:00:00.000Z"',
    'completed: "2026-09-24T10:05:00.000Z"',
    'time_spent: "~1m"',
    `actor: "${input.actor}"`,
    '---',
    '',
    '## Summary',
    input.summary,
    '',
  ].join('\n')
}

/** One proposal.md body (SC6 dialect: status/author/created frontmatter). */
function proposalMarkdown(input: { status: string; author: string; created: string; title: string; mark: string }): string {
  return [
    '---',
    `status: ${input.status}`,
    `author: ${input.author}`,
    `created: "${input.created}"`,
    'intent: new-feature',
    '---',
    '',
    `# ${input.title}`,
    '',
    `${input.mark}`,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Leg 1 — 默认仓外: wizard default flip + doc-root read/write + repo zero-write
// ---------------------------------------------------------------------------

/** Leg 1's single feature slug (docs live OUT of the repo, at the doc root). */
const SC9A_FEATURE = 'sc9-out-of-repo'

/** Leg 1's one zero-dependency pending task (the pipeline rider). */
const SC9A_TASK = { stem: '1-sc9a', localId: '1', title: 'SC9 默认仓外管线任务(coding.feature 协议)' } as const

/** The board-qualified key of the task. */
const SC9A_TASK_KEY = `${SC9A_FEATURE}/${SC9A_TASK.localId}`

/** Leg 1's distinctive anchors (逐字一致断言用). */
const SC9A_RECORD_MARK = 'SC9 记录读写锚点 — 记录 .md 落仓外文档根,getTaskDetail 读回。'
const SC9A_STAGE_GOAL = 'SC9 默认仓外验收 — 阶段资产与 manifest 读写全落文档根的目标锚点'
const SC9A_STAGE_SUMMARY_MARK = 'SC9 阶段摘要锚点 — stageSummarize 落 <文档根>/features/<slug>/stages/<stage>.md。'
const SC9A_PROPOSAL_MARK = 'SC9 提案读写锚点 — proposals/ 落仓外文档根,提案板行回流。'

/**
 * Write the LEG-1 corpus INTO the app-managed doc root (the out-of-repo docs
 * tree the registration will settle on): manifest(prd/design/tasks 完备 →
 * 派发无警告)+ index.json + 任务 md(the fixture dialect the indexer and
 * the migration consume)。
 */
function writeSc9aDocCorpus(docRoot: string): { readonly featuresRoot: string; readonly indexPath: string } {
  const featureDir = join(docRoot, 'docs', 'features', SC9A_FEATURE)
  const tasksDir = join(featureDir, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(featureDir, 'manifest.md'), `---\nstatus: tasks\n---\n# ${SC9A_FEATURE}\n`)
  mkdirSync(join(featureDir, 'prd'), { recursive: true })
  writeFileSync(join(featureDir, 'prd', 'prd-spec.md'), `# ${SC9A_FEATURE} prd fixture\n\nSC9 leg-1 仓外文档根语料(prd)。\n`)
  mkdirSync(join(featureDir, 'design'), { recursive: true })
  writeFileSync(join(featureDir, 'design', 'tech-design.md'), `# ${SC9A_FEATURE} design fixture\n\nSC9 leg-1 仓外文档根语料(design)。\n`)
  const indexPath = join(tasksDir, 'index.json')
  writeFileSync(indexPath, `${JSON.stringify({
    feature: SC9A_FEATURE,
    tasks: {
      [SC9A_TASK.stem]: {
        id: SC9A_TASK.localId,
        title: SC9A_TASK.title,
        status: 'pending',
        dependencies: [],
        type: 'coding.feature',
        file: `${SC9A_TASK.stem}.md`,
      },
    },
  }, undefined, 2)}\n`)
  writeFileSync(join(tasksDir, `${SC9A_TASK.stem}.md`), `# ${SC9A_TASK.localId} — ${SC9A_TASK.title}\n\nSC9 leg-1 任务描述(仓外文档根)。\n`)
  return { featuresRoot: join(docRoot, 'docs', 'features'), indexPath }
}

// ---------------------------------------------------------------------------
// Leg 1
// ---------------------------------------------------------------------------

test('sc9/default-out-of-repo: wizard doc-location default = app-managed out-of-repo path; tasks/records/stage-assets/proposals read+write land at the doc root; code repo gains ZERO process docs (git status + file faces)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule(回归纪律)— the instance-lock probe runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc9a-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc9a-stub-'))
  const stub: DispatchStub = createDispatchStub(stubDir)

  // 纯代码仓:git 根 + .forge 检出标记,零 docs/ 树(基线快照 = 干净仓)。
  const codeRoot = join(root, 'sc9-alpha-repo')
  mkdirSync(join(codeRoot, '.forge'), { recursive: true })
  writeFileSync(join(codeRoot, '.forge', 'state.json'), `${JSON.stringify({ sc9: 'leg-1 pure code repo' }, undefined, 2)}\n`)
  execSync('git init -q .', { cwd: codeRoot, timeout: 30_000 })
  execSync('git add -A', { cwd: codeRoot, timeout: 30_000 })
  execSync('git -c user.name=dsh-e2e -c user.email=dsh-e2e@local commit -qm "sc9 leg-1 baseline"', { cwd: codeRoot, timeout: 30_000 })
  const repoBaseline = snapshotTree(codeRoot)

  // 仓外文档根语料(应用管理路径;测试扮演文档落位角色)。
  const userDataDir = freshUserDataDir('dsh-forge-m3-sc9a')
  const docRoot = join(userDataDir, 'workbench', 'docs', 'sc9-alpha-repo')
  const docCorpus = writeSc9aDocCorpus(docRoot)
  const normalizedDocRoot = docRoot.replaceAll('\\', '/')

  const shell = await launchWorkbenchShell({
    userDataDir,
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- AC-1 注册向导:文档位置步骤默认值 = 仓外应用管理路径 -------------
    await page.locator('[data-dsh-forge-overview-register]').click() // 1.8 起注册入口 = 概览空态 CTA
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()

    // 默认值三面:仓外单选默认选中(仓内未选)+ 预填值 = 应用管理路径 +
    // 「已预填」提示行在场(hint 只在 value === defaultPath 时渲染 —— 其
    // 在场本身就是默认值断言;值再作归一化比对)。
    await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '默认 = 仓外(external 单选选中)').toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-doc-in-repo]'), '仓内单选未选(可选项,非默认)').not.toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-external-default]'), '已预填提示行在场(value === 应用管理默认路径)').toBeVisible({ timeout: 10_000 })
    const prefilled = await page.locator('[data-dsh-forge-wizard-external-input]').inputValue()
    expect(prefilled.replaceAll('\\', '/'), '预填值 = <userData>/workbench/docs/<dirname>(应用管理路径)').toBe(normalizedDocRoot)

    // 显式授权(仓外纪律:BIZ-workbench-001)→ 下一步。
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await page.locator('[data-dsh-forge-wizard-next]').click()

    // 文档根检出 index.json → 条件迁移步骤(默认开)→ 摘要 → 完成。
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]'), '文档根语料携 index.json → 迁移步骤在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()

    // 迁移相位(读的是仓外文档根):完成 = parity-ok + [进入工作台]。
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0)

    // 文件面:index.json 在文档根原位淘汰 + 归档在场(读写落文档根之迁移腿)。
    expect(existsSync(docCorpus.indexPath), '文档根 index.json 已淘汰').toBe(false)
    expect(readdirSync(join(docCorpus.featuresRoot, SC9A_FEATURE, 'tasks')).some(name => name.startsWith('index.json.migrated-')),
      '文档根归档 index.json.migrated-<ts> 在场').toBe(true)

    // 注册行:external + 应用管理路径(库权威);卡片仓外徽标。
    const displayName = codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-dsh-forge-card-doc="external"]'), '项目卡仓外徽标').toBeVisible()
    const state = await bridgeInvoke<{
      activeProjectId: string | null
      projects: Array<{ id: string; codeRoot: string; docLocationType: string; docLocationPath: string | null }>
    }>(page, 'getState', [])
    const project = state.projects.find(row => row.codeRoot.replaceAll('\\', '/') === codeRoot.replaceAll('\\', '/'))
    expect(project?.docLocationType, '注册行 docLocationType = external').toBe('external')
    expect(project?.docLocationPath?.replaceAll('\\', '/'), '注册行 docLocationPath = 应用管理文档根').toBe(normalizedDocRoot)
    const projectId = project?.id as string

    // 显式激活 → 任务 tab → 看板读回(读面经文档根)。
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    // 2.10 右栏宿主 store 推送位(同 bootAppWorld):裸 card-activate 不发
    // project_list_changed —— 同值 renameProject(纯 DB)推列表变更,概览/
    // 看板 pane 绑定的 active-project store 随之重读。
    await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: {
        getState(): Promise<{ activeProjectId: string | null; projects: Array<{ id: string; displayName?: string }> }>
        renameProject(input: { projectId: string; displayName: string }): Promise<unknown>
      } } }).dshForge?.workbench
      if (bridge === undefined) return
      const state = await bridge.getState()
      const id = state.activeProjectId
      if (id === null) return
      const name = state.projects.find(row => row.id === id)?.displayName ?? id
      await bridge.renameProject({ projectId: id, displayName: name }).catch(() => {})
    })

    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${SC9A_TASK_KEY}"]`), '迁移摄入任务上看板(文档根读面)').toBeVisible({ timeout: 20_000 })

    // ---- AC-1 任务读写在文档根:派发(产物齐 → 直达确认)→ stub 执行 -----
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    await page.locator(`[data-dsh-forge-select-chk="${SC9A_TASK_KEY}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐 → 无警告直达确认').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await orchBadge(page, SC9A_TASK_KEY, 'running').waitFor({ state: 'visible', timeout: 20_000 })

    interface DispatchRowView { readonly id: string; readonly taskKey: string; readonly state: string; readonly sessionId: string | null }
    const dispatchRow = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === SC9A_TASK_KEY)[0] as DispatchRowView
    expect(dispatchRow.state, '派发成功(running)').toBe('running')
    expect(dispatchRow.sessionId, '行携带预铸 session id').not.toBeNull()
    const prompt = await waitForPromptRow(shell, stub, dispatchRow.sessionId as string)
    expect(prompt.text.length, 'stub 会话执行(journal prompt 行在场)').toBeGreaterThan(0)

    // agent 经 dsh tool claim/submit(日常管线的执行/提交腿)。
    const actor = `session:${dispatchRow.sessionId as string}`
    const claimed = await bridgeInvoke<{ status: string }>(page, 'taskClaim', [{ projectId, taskKey: SC9A_TASK_KEY }, actor])
    expect(claimed.status, 'claim → in_progress').toBe('in_progress')
    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId, taskKey: SC9A_TASK_KEY }, actor])
    expect(submitted.status, 'submit → completed').toBe('completed')

    // ---- AC-1 记录读写在文档根:records/<stem>.md 落文档根 → 读回 ----------
    const recordPath = join(docCorpus.featuresRoot, SC9A_FEATURE, 'tasks', 'records', `${SC9A_TASK.stem}.md`)
    mkdirSync(join(docCorpus.featuresRoot, SC9A_FEATURE, 'tasks', 'records'), { recursive: true })
    writeFileSync(recordPath, recordMarkdown({ actor: 'sc9-alpha-agent', summary: SC9A_RECORD_MARK }), 'utf8')
    interface TaskDetailView { readonly records: Array<{ at: string; kind: string; source: string | null; summary: string }> }
    // taskGet = M3 读路由(sqlite 权威 → assembleAuthoritativeDetail:desc_path
    // + records/<stem>.md 方言寻址文档根;getTaskDetail 是 M2 files 面,其
    // 记录读经 index.json —— 迁移后已淘汰归档,非本腿读通道)。
    const detail = await bridgeInvoke<TaskDetailView>(page, 'taskGet', [{ projectId, taskKey: SC9A_TASK_KEY }])
    expect(detail.records.length, '记录读回(文档根 records/ 方言)').toBe(1)
    expect(detail.records[0]?.summary, '记录正文逐字锚点(读的 = 文档根的)').toContain(SC9A_RECORD_MARK)

    // ---- AC-1 阶段资产读写在文档根:stageSummarize + advanceStage ----------
    const summarized = await bridgeInvoke<{ path: string; featureStage: string; gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId,
      featureSlug: SC9A_FEATURE,
      stage: 'tasks',
      goal: SC9A_STAGE_GOAL,
      summary: `${SC9A_STAGE_SUMMARY_MARK}\n`,
    }])
    expect(summarized.path, '资产相对路径 = <slug>/stages/tasks.md').toBe(`${SC9A_FEATURE}/stages/tasks.md`)
    expect(summarized.gateOpen, '本次写入即开门').toBe(true)
    const stageAssetAbs = join(docCorpus.featuresRoot, SC9A_FEATURE, 'stages', 'tasks.md')
    expect(existsSync(stageAssetAbs), '阶段资产落【文档根】stages/tasks.md').toBe(true)
    expect(readFileSync(stageAssetAbs, 'utf8'), '资产内容含目标锚点(逐字)').toContain(SC9A_STAGE_GOAL)

    const advanced = await bridgeInvoke<{ status: string }>(page, 'advanceStage', [projectId, SC9A_FEATURE])
    expect(advanced.status, '推进 → in-progress').toBe('in-progress')
    const docManifest = readFileSync(join(docCorpus.featuresRoot, SC9A_FEATURE, 'manifest.md'), 'utf8')
    expect(docManifest, 'manifest status 翻转落【文档根】(内核唯一写面)').toContain('status: in-progress')

    // ---- AC-1 proposals 读落在文档根:外部落 proposal.md → 提案板行 --------
    const proposalDir = join(docRoot, 'docs', 'proposals', 'sc9-alpha-proposal')
    mkdirSync(proposalDir, { recursive: true })
    writeFileSync(join(proposalDir, 'proposal.md'), proposalMarkdown({
      status: 'draft',
      author: 'sc9-alpha-agent',
      created: '2026-09-24',
      title: 'SC9 仓外提案语料',
      mark: SC9A_PROPOSAL_MARK,
    }), 'utf8')
    await openOverviewPane(page, 'proposals')
    await expect(page.locator('[data-dsh-forge-overview-prop-dir="sc9-alpha-proposal"]'),
      'proposals/ 落文档根 → 提案板行(感知回流)').toBeVisible({ timeout: 20_000 })

    // ---- AC-1 代码仓零新增过程文档(git status/文件断言)------------------
    expect(existsSync(join(codeRoot, 'docs')), '代码仓内 docs/ 根本不存在(零过程文档)').toBe(false)
    expect(snapshotTree(codeRoot), '代码仓文件树与基线全等(零新增/零改写)').toEqual(repoBaseline)
    expect(gitStatusPorcelain(codeRoot), 'git status --porcelain 为空(git 断言面)').toBe('')

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg 2 — 仓内兼容: the existing in-repo docs project keeps working, files
// land at the original in-repo seats
// ---------------------------------------------------------------------------

/** Leg 2's single feature slug (docs stay IN the repo). */
const SC9B_FEATURE = 'sc9-in-repo-compat'

/** Leg 2's one zero-dependency pending task. */
const SC9B_TASK = { stem: '1-sc9b', localId: '1', title: 'SC9 仓内兼容管线任务(coding.feature 协议)' } as const

/** The board-qualified key of the task. */
const SC9B_TASK_KEY = `${SC9B_FEATURE}/${SC9B_TASK.localId}`

/** Leg 2's distinctive anchors. */
const SC9B_RECORD_MARK = 'SC9 仓内兼容记录锚点 — 记录 .md 落仓内原位,getTaskDetail 读回。'
const SC9B_STAGE_GOAL = 'SC9 仓内兼容验收 — 阶段资产落仓内原位的目标锚点'
const SC9B_STAGE_SUMMARY_MARK = 'SC9 仓内摘要锚点 — stageSummarize 落 <codeRoot>/docs/features/<slug>/stages/<stage>.md。'

/** The hand-built task set (1 zero-dep pending typed task;SC5 形)。 */
function sc9bTaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = [{
    stem: SC9B_TASK.stem,
    localId: SC9B_TASK.localId,
    title: SC9B_TASK.title,
    status: 'pending',
    type: 'coding.feature',
    dependencies: [],
    record: null,
  }]
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const feature: GeneratedFeature = {
    slug: SC9B_FEATURE,
    status: 'tasks',
    docKinds: ['prd', 'design'],
    tasks,
  }
  return {
    options: {
      seed: 'dsh-forge-m3-sc9b',
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

test('sc9/in-repo-compat: existing in-repo docs project registers (explicit in_repo) + migrates in place; reads/writes keep landing at the original in-repo seats; the app-managed docs root is never created', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule(回归纪律)— the instance-lock probe runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc9b-'))
  const written = writeForgeProject(sc9bTaskSet(), { codeRoot: join(root, 'sc9-beta-repo') })
  const featuresRoot = join(written.docsRoot, 'docs', 'features')
  const userDataDir = freshUserDataDir('dsh-forge-m3-sc9b')

  const shell = await launchWorkbenchShell({ userDataDir })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- AC-2 注册(既有仓内文档项目;向导显式选仓内)---------------------
    await page.locator('[data-dsh-forge-overview-register]').click() // 1.8 起注册入口 = 概览空态 CTA
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(written.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    // 默认是仓外(M3 翻转);本腿显式切回仓内 —— 兼容形态是可选项。
    await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '前置:默认仍为仓外(leg-1 已验;本腿显式切回)').toBeChecked()
    await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click()
    await page.locator('[data-dsh-forge-wizard-next]').click()

    // 仓内树携 index.json → 条件迁移步骤(默认开)→ 摘要 → 完成。
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-wizard-migrate-toggle]')).toBeChecked()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-finish]').click()

    // 迁移相位(读的是仓内树):完成 + 进入工作台。
    await expect(page.locator('[data-dsh-forge-wizard-step="migration"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-migration-run="done"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-dsh-forge-migration-parity-ok]')).toBeVisible()
    await page.locator('[data-dsh-forge-wizard-migration-enter]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0)

    // 文件面:index.json 仓内原位淘汰 + 归档在场(读写落仓内原位之迁移腿)。
    expect(existsSync(join(featuresRoot, SC9B_FEATURE, 'tasks', 'index.json')), '仓内 index.json 已淘汰(原位)').toBe(false)
    expect(readdirSync(join(featuresRoot, SC9B_FEATURE, 'tasks')).some(name => name.startsWith('index.json.migrated-')),
      '仓内归档在场(原位)').toBe(true)

    // 注册行:in_repo;激活 → 看板读回(仓内读面)。
    const state = await bridgeInvoke<{
      activeProjectId: string | null
      projects: Array<{ id: string; codeRoot: string; docLocationType: string; docLocationPath: string | null }>
    }>(page, 'getState', [])
    const project = state.projects.find(row => row.codeRoot.replaceAll('\\', '/') === written.codeRoot.replaceAll('\\', '/'))
    expect(project?.docLocationType, '注册行 docLocationType = in_repo').toBe('in_repo')
    expect(project?.docLocationPath, 'in_repo 不携带 docLocationPath').toBeNull()
    const projectId = project?.id as string

    const displayName = written.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    // 2.10 右栏宿主 store 推送位(同 bootAppWorld):裸 card-activate 不发
    // project_list_changed —— 同值 renameProject(纯 DB)推列表变更,概览/
    // 看板 pane 绑定的 active-project store 随之重读。
    await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: {
        getState(): Promise<{ activeProjectId: string | null; projects: Array<{ id: string; displayName?: string }> }>
        renameProject(input: { projectId: string; displayName: string }): Promise<unknown>
      } } }).dshForge?.workbench
      if (bridge === undefined) return
      const state = await bridge.getState()
      const id = state.activeProjectId
      if (id === null) return
      const name = state.projects.find(row => row.id === id)?.displayName ?? id
      await bridge.renameProject({ projectId: id, displayName: name }).catch(() => {})
    })

    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${SC9B_TASK_KEY}"]`), '看板读回(仓内文档树)').toBeVisible({ timeout: 20_000 })

    // ---- AC-2 写读正常(动词面;文件落仓内原位)---------------------------
    const actor = 'session:sc9-beta-agent'
    const claimed = await bridgeInvoke<{ status: string }>(page, 'taskClaim', [{ projectId, taskKey: SC9B_TASK_KEY }, actor])
    expect(claimed.status, 'claim → in_progress').toBe('in_progress')
    const submitted = await bridgeInvoke<{ status: string }>(page, 'taskSubmit', [{ projectId, taskKey: SC9B_TASK_KEY }, actor])
    expect(submitted.status, 'submit → completed').toBe('completed')

    // 记录:落仓内原位 records/<stem>.md → getTaskDetail 读回。
    const recordPath = join(featuresRoot, SC9B_FEATURE, 'tasks', 'records', `${SC9B_TASK.stem}.md`)
    mkdirSync(join(featuresRoot, SC9B_FEATURE, 'tasks', 'records'), { recursive: true })
    writeFileSync(recordPath, recordMarkdown({ actor: 'sc9-beta-agent', summary: SC9B_RECORD_MARK }), 'utf8')
    interface TaskDetailView { readonly records: Array<{ at: string; kind: string; source: string | null; summary: string }> }
    // taskGet(M3 读路由,同 leg-1 注记):sqlite 权威的记录读 = 文档根
    // desc_path/records 方言。
    const detail = await bridgeInvoke<TaskDetailView>(page, 'taskGet', [{ projectId, taskKey: SC9B_TASK_KEY }])
    expect(detail.records.length, '记录读回(仓内 records/ 原位)').toBe(1)
    expect(detail.records[0]?.summary, '记录正文逐字锚点(读的 = 仓内的)').toContain(SC9B_RECORD_MARK)

    // 阶段资产:stageSummarize 落仓内原位 + manifest 原位翻转。
    const summarized = await bridgeInvoke<{ path: string; gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId,
      featureSlug: SC9B_FEATURE,
      stage: 'tasks',
      goal: SC9B_STAGE_GOAL,
      summary: `${SC9B_STAGE_SUMMARY_MARK}\n`,
    }])
    expect(summarized.path, '资产相对路径 = <slug>/stages/tasks.md').toBe(`${SC9B_FEATURE}/stages/tasks.md`)
    const stageAssetAbs = join(featuresRoot, SC9B_FEATURE, 'stages', 'tasks.md')
    expect(stageAssetAbs.startsWith(written.docsRoot), '阶段资产绝对路径落【代码仓】内').toBe(true)
    expect(existsSync(stageAssetAbs), '阶段资产落仓内原位 stages/tasks.md').toBe(true)
    expect(readFileSync(stageAssetAbs, 'utf8'), '资产内容含目标锚点(逐字)').toContain(SC9B_STAGE_GOAL)

    const advanced = await bridgeInvoke<{ status: string }>(page, 'advanceStage', [projectId, SC9B_FEATURE])
    expect(advanced.status, '推进 → in-progress').toBe('in-progress')
    expect(readFileSync(join(featuresRoot, SC9B_FEATURE, 'manifest.md'), 'utf8'),
      'manifest status 翻转落仓内原位').toContain('status: in-progress')

    // 极性对照:应用管理文档根从未被创建(仓内项目的写入不旁落仓外空间)。
    expect(existsSync(join(userDataDir, 'workbench', 'docs')), '应用管理 docs 根零创建(in_repo 不触碰仓外空间)').toBe(false)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
