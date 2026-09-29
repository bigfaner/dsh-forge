// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc6
// Traceability: docs/features/dsh-forge-m3/tasks/6.7-sc56-prefs-proposals.md (SC6 AC-3/AC-4/AC-5)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC6 行:
// 提案列表/详情/eval 一致性;外部变更 ≤5s;互跳;零写入口)、
// §Interfaces·Interface 1 (getProposalBoard / readProposalDoc 只读双动词)、
// §Cross-Layer Data Map (proposal.feature_slug NULL = 不渲染徽标)、
// §Integration Specs #5 (UF5:第二 tab + 互跳 + 返回不重拉), prd-spec
// G6/SC6 + Story 6 (提案只读浏览, DF007 ≤5s 感知回流), 6.2 base
// (已迁移语料 / instance lock)。
//
// SC6 — the read-only proposal-board acceptance leg over the 6.2 base, one
// journey:
//
//   已迁移项目(真内核链 + proposals/ 语料:关联提案 = slug 同一性命中
//   feature 目录 + eval/final-report.md 在场;孤儿提案 = 无 feature 目录
//   无 eval)→ 提案 tab(工作台第二 tab)→
//     AC-3 一致性:列表元数据与 frontmatter 逐项一致(status Pill 词表/
//     author/created;排序 = 内核 created 倒序基线);详情 proposal/eval
//     双 tab 渲染与文件内容一致(逐字锚点);无关联 feature 不渲染徽标
//     (孤儿行零 feature-jump 控件)vs 关联行徽标在场;
//     AC-5 零写入口(Hard Rule 双重):控件清单级 — 全页面零 input/
//     select/textarea/contenteditable,全部 button ∈ 导航白名单(排序/
//     徽标互跳/面包屑返回/文档 tab);交互级 — 渲染区(proposal/eval 双
//     面板)零交互元素(button/a/[role=button]/input);
//     AC-4 回流:外部新增提案文件 → 列表新行 ≤5s(实测计时);外部改
//     status → 行 Pill 翻转 ≤5s;详情打开时外部修改正文 → 面板重渲染
//     ≤5s 且保滚动(同 DOM 节点 + last-good 重读,6.7 补件);面包屑
//     返回 → 列表不重拉(隐藏期回流已落地);proposal → feature 互跳 →
//     Feature 详情在场 → 返回链(feature back → 列表 → 提案 tab → 板)
//     往返正确。
//
// 只读口径(Hard Rule):断言 = 控件清单级 + 交互级双重,分别落在
//   [data-dsh-forge-proposal-page] 全树与两个 doc 渲染面板上。

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../helpers/app.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService } from '../../../apps/desktop/src/main/workbench/migration/pipeline.ts'

// ---------------------------------------------------------------------------
// The SC6 corpus: one feature (the interjump target) + a proposals/ corpus
// ---------------------------------------------------------------------------

/** The journey's single feature slug — the ASSOCIATED proposal shares it. */
const SC6_FEATURE = 'sc6-proposals-board'

/** The associated proposal slug (slug identity ⇒ feature badge renders). */
const SC6_ASSOCIATED = SC6_FEATURE

/** The orphan proposal slug (no feature dir ⇒ NO badge; no eval ⇒ tab disabled). */
const SC6_ORPHAN = 'sc6-early-pipeline'

/** The externally-ADDED proposal slug (the list reflux leg, mid-journey). */
const SC6_EXTERNAL = 'sc6-external-add'

/** frontmatter anchors the metadata assertions compare against (the files ARE the SoT). */
const ASSOCIATED_AUTHOR = 'faner-sc6'
const ASSOCIATED_CREATED = '2026-09-18'
const ORPHAN_AUTHOR = 'reviewer-sc6'
const ORPHAN_CREATED = '2026-09-20'
const EXTERNAL_AUTHOR = 'external-agent'
const EXTERNAL_CREATED = '2026-09-21'

/** The distinctive body anchors (详情/eval 渲染与文件内容一致的逐字锚点). */
const ASSOCIATED_H1 = 'SC6 提案看板验收语料(关联 feature)'
const ASSOCIATED_BODY_MARK = 'SC6 提案正文锚点 — 列表/详情一致性验收的逐字锚点。'
const EVAL_H1 = 'SC6 评估终稿(final-report)'
const EVAL_BODY_MARK = 'SC6 eval 报告锚点 — eval 渲染一致性验收的逐字锚点。'
const ORPHAN_H1 = 'SC6 早期管线提案(无关联 feature)'
/** The reflux paragraph appended to the associated proposal.md mid-journey. */
const REFLUX_APPEND_MARK = 'SC6 回流腿追加段落 — detail 打开时外部修改的逐字锚点。'

/** One scrollable proposal body (≥ the 60vh panel's scroll range). */
function proposalBody(title: string, mark: string): string {
  const filler = Array.from({ length: 30 }, (_, index) =>
    `填充段 ${String(index + 1)} — 滚动验收语料(detail 面板 60vh 内滚动,保滚动断言的内容高度垫层)。`)
  return [`# ${title}`, '', mark, '', ...filler.map(paragraph => `${paragraph}\n`)].join('\n')
}

/** One proposal.md file body (frontmatter + markdown). */
function proposalFile(input: { status: string; author: string; created: string; title: string; mark: string }): string {
  return [
    '---',
    `status: ${input.status}`,
    `author: ${input.author}`,
    `created: "${input.created}"`,
    'intent: new-feature',
    '---',
    '',
    proposalBody(input.title, input.mark),
    '',
  ].join('\n')
}

/** The orphan proposal body (short — no scroll needed, no eval). */
const ORPHAN_PROPOSAL = [
  '---',
  'status: draft',
  `author: ${ORPHAN_AUTHOR}`,
  `created: "${ORPHAN_CREATED}"`,
  'intent: new-feature',
  '---',
  '',
  `# ${ORPHAN_H1}`,
  '',
  '管线早期提案语料 — 无 features/<slug>/ 目录(slug 同一性未命中 ⇒ 徽标不渲染)、无 eval/ 报告(双 tab 中 eval 禁用)。',
  '',
].join('\n')

/** The eval report body (the deterministic final-report.md anchor). */
const EVAL_REPORT = [
  `# ${EVAL_H1}`,
  '',
  EVAL_BODY_MARK,
  '',
  '评估结论:验收语料自洽(列表元数据/详情渲染/eval 锚点三面一致)。',
  '',
].join('\n')

/** The hand-built task set (1 zero-dep pending task — the feature's minimal board). */
function sc6TaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = [{
    stem: '1-sc6',
    localId: '1',
    title: 'SC6 提案看板腿占位任务(coding.feature 协议)',
    status: 'pending',
    type: 'coding.feature',
    dependencies: [],
    record: null,
  }]
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const feature: GeneratedFeature = { slug: SC6_FEATURE, status: 'tasks', docKinds: ['prd', 'design'], tasks }
  return {
    options: {
      seed: 'dsh-forge-m3-sc6',
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

/** Facts about the built journey corpus. */
interface Sc6Corpus {
  readonly codeRoot: string
  readonly userDataDir: string
  readonly projectId: string
  /** docs/proposals — where the external-write legs land (the watched root). */
  readonly proposalsRoot: string
  /** The associated proposal.md absolute path (the modify-reflux target). */
  readonly associatedProposalPath: string
  /** The orphan proposal.md absolute path (the status-flip target). */
  readonly orphanProposalPath: string
}

/**
 * Build the PRE-MIGRATED SC6 corpus through the REAL kernel chain (write →
 * register → scan → migrate): the scan indexes proposals/ into
 * proposal_snapshot (5.3 感知索引), and the app boots on the rows.
 */
async function buildSc6Corpus(root: string): Promise<Sc6Corpus> {
  const written = writeForgeProject(sc6TaskSet(), { codeRoot: join(root, 'repo') })
  const proposalsRoot = join(written.docsRoot, 'docs', 'proposals')
  const associatedDir = join(proposalsRoot, SC6_ASSOCIATED)
  mkdirSync(join(associatedDir, 'eval'), { recursive: true })
  const associatedProposalPath = join(associatedDir, 'proposal.md')
  writeFileSync(associatedProposalPath, proposalFile({
    status: 'accepted',
    author: ASSOCIATED_AUTHOR,
    created: ASSOCIATED_CREATED,
    title: ASSOCIATED_H1,
    mark: ASSOCIATED_BODY_MARK,
  }), 'utf8')
  writeFileSync(join(associatedDir, 'eval', 'final-report.md'), EVAL_REPORT, 'utf8')
  const orphanProposalPath = join(proposalsRoot, SC6_ORPHAN, 'proposal.md')
  mkdirSync(join(proposalsRoot, SC6_ORPHAN), { recursive: true })
  writeFileSync(orphanProposalPath, ORPHAN_PROPOSAL, 'utf8')

  const userDataDir = join(root, 'user-data')
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    const service = createMigrationService({
      db,
      userDataPath: userDataDir,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
    })
    await service.startMigration(project.id)
    return { codeRoot: written.codeRoot, userDataDir, projectId: project.id, proposalsRoot, associatedProposalPath, orphanProposalPath }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Renderer-side helpers (SC1/SC3/SC4 precedents)
// ---------------------------------------------------------------------------

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

/** One board row (slug-addressed). */
const rowOf = (page: Page, slug: string) => page.locator(`[data-dsh-forge-proposal-row="${slug}"]`)

/** The detail subview of one slug. */
const detailOf = (page: Page, slug: string) => page.locator(`[data-dsh-forge-proposal-detail="${slug}"]`)

// ---------------------------------------------------------------------------
// The SC6 leg
// ---------------------------------------------------------------------------

// [M4 1.8 e2e 迁移·迁移清单 第③行 · M3 提案板(workbench/proposals)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('sc6/proposals: board metadata/detail/eval consistency + external reflux ≤5s (scroll kept) + proposal↔feature round trip + zero write affordances (double-level)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / 6.2 base — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc6-'))
  const corpus = await buildSc6Corpus(root)

  const shell = await launchWorkbenchShell({ userDataDir: corpus.userDataDir })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // 显式激活(单激活事务)→ 提案 tab(工作台第二 tab)。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()

    // =========================================================================
    // AC-3:列表元数据与 frontmatter 一致(排序 = 内核 created 倒序基线)
    // =========================================================================
    const rows = page.locator('[data-dsh-forge-proposal-row]')
    await expect(rows, '板载两行(关联 + 孤儿)').toHaveCount(2, { timeout: 30_000 })
    await expect(rows.nth(0), 'created 倒序基线:孤儿(09-20)在前').toHaveAttribute('data-dsh-forge-proposal-row', SC6_ORPHAN)
    await expect(rows.nth(1), '关联(09-18)在后').toHaveAttribute('data-dsh-forge-proposal-row', SC6_ASSOCIATED)

    // 孤儿行:status=draft(Pill 词表 + zh label)/ author / created 与
    // frontmatter 逐项一致;无关联 feature ⇒ 徽标不渲染(Cross-Layer Data
    // Map:feature_slug NULL = 不渲染徽标)。
    const orphanRow = rowOf(page, SC6_ORPHAN)
    await expect(orphanRow.locator('[data-dsh-forge-proposal-status="draft"]'), '孤儿 status Pill = draft(词表原词)')
      .toHaveText('草稿')
    await expect(orphanRow, '孤儿 author 与 frontmatter 一致').toContainText(ORPHAN_AUTHOR)
    await expect(orphanRow, '孤儿 created 与 frontmatter 一致').toContainText(ORPHAN_CREATED)
    await expect(orphanRow.locator('[data-dsh-forge-proposal-feature-jump]'), '无关联 feature → 徽标不渲染').toHaveCount(0)

    // 关联行:status=accepted / author / created 一致;徽标在场(slug 同一性)。
    const associatedRow = rowOf(page, SC6_ASSOCIATED)
    await expect(associatedRow.locator('[data-dsh-forge-proposal-status="accepted"]'), '关联 status Pill = accepted')
      .toHaveText('已接受')
    await expect(associatedRow, '关联 author 与 frontmatter 一致').toContainText(ASSOCIATED_AUTHOR)
    await expect(associatedRow, '关联 created 与 frontmatter 一致').toContainText(ASSOCIATED_CREATED)
    await expect(associatedRow.locator(`[data-dsh-forge-proposal-feature-jump="${SC6_FEATURE}"]`), '关联 feature 徽标在场(→ feature 互跳入口)')
      .toBeVisible()

    // =========================================================================
    // AC-5(前半,列表形态):零写入口 — 控件清单级双重断言
    // =========================================================================
    await expect(page.locator(
      '[data-dsh-forge-proposal-page] input, [data-dsh-forge-proposal-page] select, '
      + '[data-dsh-forge-proposal-page] textarea, [data-dsh-forge-proposal-page] [contenteditable="true"]',
    ), '控件清单级:全页面零表单控件(无编辑面)').toHaveCount(0)
    const listButtons = await page.locator('[data-dsh-forge-proposal-page] button').evaluateAll(nodes =>
      nodes.map(node => ({
        sort: node.hasAttribute('data-dsh-forge-menu-trigger') || node.hasAttribute('data-dsh-forge-proposal-sort'),
        jump: node.hasAttribute('data-dsh-forge-proposal-feature-jump'),
        back: node.hasAttribute('data-dsh-forge-proposal-back') || node.hasAttribute('data-dsh-forge-proposal-notfound-back'),
        tab: node.hasAttribute('data-dsh-forge-proposal-doc-tab'),
      })))
    expect(listButtons.length, '列表形态的按钮集非空(排序/徽标)').toBeGreaterThan(0)
    for (const [index, button] of listButtons.entries()) {
      expect(Object.values(button).some(Boolean), `按钮 #${String(index)} ∈ 导航白名单(排序/互跳/返回/tab;零写动词)`).toBe(true)
    }

    // =========================================================================
    // AC-3(详情/eval 一致性)+ AC-5(详情形态与渲染区)
    // =========================================================================
    await associatedRow.click()
    const detail = detailOf(page, SC6_ASSOCIATED)
    await expect(detail, '关联提案详情在场').toBeVisible({ timeout: 15_000 })
    await expect(detail.locator('[data-dsh-forge-proposal-detail-title]'), '详情标题 = slug').toHaveText(SC6_ASSOCIATED)
    await expect(detail.locator('[data-dsh-forge-proposal-status="accepted"]'), '详情头部 status Pill 同源').toBeVisible()
    await expect(detail.locator('[data-dsh-forge-proposal-header]'), '详情头部 meta = author · created(frontmatter 一致)')
      .toContainText(`${ASSOCIATED_AUTHOR} · ${ASSOCIATED_CREATED}`)

    // proposal tab:渲染与文件内容一致(逐字锚点)。
    const proposalPanel = detail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]')
    await expect(proposalPanel, 'proposal 渲染 H1 与文件一致').toContainText(ASSOCIATED_H1)
    await expect(proposalPanel, 'proposal 渲染正文锚点与文件一致').toContainText(ASSOCIATED_BODY_MARK)

    // eval tab:渲染与 eval/final-report.md 一致(确定性选锚)。
    await detail.locator('[data-dsh-forge-proposal-doc-tab="eval"]').click()
    const evalPanel = detail.locator('[data-dsh-forge-proposal-doc-panel="eval"]')
    await expect(evalPanel, 'eval 渲染终稿 H1 与文件一致').toContainText(EVAL_H1)
    await expect(evalPanel, 'eval 渲染锚点与文件一致').toContainText(EVAL_BODY_MARK)

    // AC-5(交互级,Hard Rule):渲染区零交互元素 — proposal/eval 双面板。
    await expect(proposalPanel.locator('button, a, input, select, textarea, [role="button"]'), 'proposal 渲染区零交互元素').toHaveCount(0)
    await expect(evalPanel.locator('button, a, input, select, textarea, [role="button"]'), 'eval 渲染区零交互元素').toHaveCount(0)

    // AC-5(控件清单级,详情形态):详情按钮 = 面包屑返回 + 双 doc tab,
    // 再无其他(无编辑/流转/删除动词)。
    await expect(page.locator(
      '[data-dsh-forge-proposal-page] input, [data-dsh-forge-proposal-page] select, '
      + '[data-dsh-forge-proposal-page] textarea, [data-dsh-forge-proposal-page] [contenteditable="true"]',
    ), '详情形态:全页面零表单控件').toHaveCount(0)
    const detailButtons = await page.locator('[data-dsh-forge-proposal-page] button').evaluateAll(nodes =>
      nodes.map(node => ({
        back: node.hasAttribute('data-dsh-forge-proposal-back') || node.hasAttribute('data-dsh-forge-proposal-notfound-back'),
        tab: node.hasAttribute('data-dsh-forge-proposal-doc-tab'),
        sort: node.hasAttribute('data-dsh-forge-menu-trigger') || node.hasAttribute('data-dsh-forge-proposal-sort'),
        // The list seat stays MOUNTED (hidden) while the detail is open — its
        // navigation buttons (feature-jump) remain in the DOM, allowlisted.
        jump: node.hasAttribute('data-dsh-forge-proposal-feature-jump'),
      })))
    for (const [index, button] of detailButtons.entries()) {
      expect(Object.values(button).some(Boolean), `详情按钮 #${String(index)} ∈ 导航白名单`).toBe(true)
    }

    // 孤儿详情:eval 缺失 → tab 禁用(双槽稳定映射,非隐藏)。
    await detail.locator('[data-dsh-forge-proposal-back]').click()
    await expect(page.locator('[data-dsh-forge-proposal-list-seat]')).toBeVisible({ timeout: 15_000 })
    await rowOf(page, SC6_ORPHAN).click()
    const orphanDetail = detailOf(page, SC6_ORPHAN)
    await expect(orphanDetail, '孤儿详情在场').toBeVisible({ timeout: 15_000 })
    await expect(orphanDetail.locator('[data-dsh-forge-proposal-doc-panel="proposal"]'), '孤儿 proposal 渲染与文件一致')
      .toContainText(ORPHAN_H1)
    await expect(orphanDetail.locator('[data-dsh-forge-proposal-doc-tab="eval"]'), '无 eval → tab 禁用(不隐藏)')
      .toBeDisabled()
    await orphanDetail.locator('[data-dsh-forge-proposal-back]').click()
    await expect(page.locator('[data-dsh-forge-proposal-list-seat]'), '面包屑返回 → 板').toBeVisible({ timeout: 15_000 })

    // =========================================================================
    // AC-4(回流):外部新增 → 列表新行 ≤5s;外部改 status → Pill 翻转 ≤5s
    // =========================================================================
    const externalDir = join(corpus.proposalsRoot, SC6_EXTERNAL)
    mkdirSync(externalDir, { recursive: true })
    const tAdd = Date.now()
    writeFileSync(join(externalDir, 'proposal.md'), proposalFile({
      status: 'rejected',
      author: EXTERNAL_AUTHOR,
      created: EXTERNAL_CREATED,
      title: 'SC6 外部新增提案(回流腿)',
      mark: '外部会话新增的提案文件 — 列表回流 ≤5s 验收锚点。',
    }), 'utf8')
    const externalRow = rowOf(page, SC6_EXTERNAL)
    await externalRow.waitFor({ state: 'visible', timeout: 20_000 })
    const addMs = Date.now() - tAdd
    console.log(`[sc6] external-add→list-row(ms)=${String(addMs)} budget=5000 (watcher 400ms debounce + scan + sync 批 + reflux)`)
    expect(addMs, `外部新增 → 列表回流 ≤5000ms(实际 ${String(addMs)}ms)`).toBeLessThanOrEqual(5_000)
    await expect(externalRow.locator('[data-dsh-forge-proposal-status="rejected"]'), '新行 status Pill 与 frontmatter 一致')
      .toHaveText('已拒绝')
    await expect(page.locator('[data-dsh-forge-proposal-row]'), '板载三行').toHaveCount(3)

    // 外部改 status(draft → accepted)→ Pill 翻转 ≤5s(修改回流腿)。
    const tStatus = Date.now()
    writeFileSync(corpus.orphanProposalPath, ORPHAN_PROPOSAL.replace('status: draft', 'status: accepted'), 'utf8')
    await rowOf(page, SC6_ORPHAN).locator('[data-dsh-forge-proposal-status="accepted"]').waitFor({ state: 'visible', timeout: 20_000 })
    const statusMs = Date.now() - tStatus
    console.log(`[sc6] external-status→pill-flip(ms)=${String(statusMs)} budget=5000`)
    expect(statusMs, `外部修改 status → Pill 回流 ≤5000ms(实际 ${String(statusMs)}ms)`).toBeLessThanOrEqual(5_000)

    // =========================================================================
    // AC-4(详情回流 + 保滚动):detail 打开时外部修改正文 → ≤5s 重渲染
    // =========================================================================
    await rowOf(page, SC6_ASSOCIATED).click()
    await expect(detailOf(page, SC6_ASSOCIATED), '重开关联详情(回流腿)').toBeVisible({ timeout: 15_000 })
    const scrollPanel = detailOf(page, SC6_ASSOCIATED).locator('[data-dsh-forge-proposal-doc-panel="proposal"]')
    await expect(scrollPanel, '详情正文在场(重读完成)').toContainText(ASSOCIATED_BODY_MARK)
    // 滚动到面板中段(60vh 内滚动;内容高度垫层已在语料中)。
    const scrollTopBefore = await scrollPanel.evaluate((element) => {
      element.scrollTop = 320
      return element.scrollTop
    })
    expect(scrollTopBefore, '前置:面板确已滚动(>0)').toBeGreaterThan(0)

    const tModify = Date.now()
    const before = existsSync(corpus.associatedProposalPath) ? readFileSync(corpus.associatedProposalPath, 'utf8') : ''
    writeFileSync(corpus.associatedProposalPath, `${before}\n## 外部修订段(回流锚)\n\n${REFLUX_APPEND_MARK}\n`, 'utf8')
    await expect(scrollPanel, '详情重渲染含外部修订锚点').toContainText(REFLUX_APPEND_MARK, { timeout: 20_000 })
    const modifyMs = Date.now() - tModify
    console.log(`[sc6] external-modify→detail-reflux(ms)=${String(modifyMs)} budget=5000 (last-good 重读,无骨架闪断)`)
    expect(modifyMs, `外部修改 → 详情回流 ≤5000ms(实际 ${String(modifyMs)}ms)`).toBeLessThanOrEqual(5_000)
    const scrollTopAfter = await scrollPanel.evaluate(element => element.scrollTop)
    expect(scrollTopAfter, '保滚动:回流前后 scrollTop 不变(同 DOM 节点 + last-good 重读)').toBe(scrollTopBefore)

    // 面包屑返回 → 列表不重拉:隐藏期回流已落地(三行在场 + 孤儿 Pill 已翻)。
    await detailOf(page, SC6_ASSOCIATED).locator('[data-dsh-forge-proposal-back]').click()
    await expect(page.locator('[data-dsh-forge-proposal-list-seat]'), '返回 → 板(列表保持挂载)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-proposal-row]'), '返回不重拉:三行仍在(隐藏期回流已落地)').toHaveCount(3)
    await expect(rowOf(page, SC6_ORPHAN).locator('[data-dsh-forge-proposal-status="accepted"]'), '孤儿 Pill = 修改后状态').toBeVisible()

    // =========================================================================
    // AC-4(互跳):proposal → feature → 返回面包屑往返
    // =========================================================================
    // 互跳入口 = 列表行的 feature 徽标(详情子视图本体无跳转控件 — 只读面
    // 的导航集 = 面包屑 + doc tab;徽标是行级控件,面包屑返回列表后可达)。
    const jumpBadge = rowOf(page, SC6_ASSOCIATED).locator(`[data-dsh-forge-proposal-feature-jump="${SC6_FEATURE}"]`)
    await expect(jumpBadge, '互跳入口:关联行 feature 徽标在场').toBeVisible()
    await jumpBadge.click()

    // Feature tab:对应 feature 详情打开(openFeatureDetail 寻址)。
    const featureDetail = page.locator(`[data-dsh-forge-feature-detail="${SC6_FEATURE}"]`)
    await expect(featureDetail, '徽标互跳 → Feature 详情在场').toBeVisible({ timeout: 20_000 })

    // 返回链:feature 详情 back → Feature 列表 → 提案 tab → 板(往返闭合)。
    await featureDetail.locator('[data-dsh-forge-feature-back]').click()
    await expect(page.locator(`[data-dsh-forge-feature-card="${SC6_FEATURE}"]`), 'feature back → Feature 列表').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await expect(page.locator('[data-dsh-forge-proposal-list-seat]'), '提案 tab → 板(互跳往返闭合)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-proposal-row]'), '板完整(互跳零丢失)').toHaveCount(3)

    // ---- 收尾:零 renderer pageerrors ---------------------------------------
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
