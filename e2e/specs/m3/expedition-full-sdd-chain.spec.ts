// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: expedition-full-sdd-chain（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/contracts/
//   step-{1..8}-*.md（eval-contract 963/1100 通过——本特性 Golden Path）。
//
// 载体纪律（Hard Rule）：零真实模型——brainstorm/write-prd/ui-design/tech-design/
// breakdown-tasks 技能产出经回放主径承载（createProposal/upsertFeatureDoc/addTask——
// M2/5.2 既定口径：技能写径与 RPC/桥同一服务门）。
//
// Fact Table 摘录（源码核实）：
//   - 五态机（ProposalVerdictDialog.tsx）：draft → [under-review]；under-review →
//     [accepted, rejected, draft]（目标态列表不含当前态自身）；accepted → [superseded]
//     （必带 supersededBy——vd-supersede-by select，空目标 = superseded-by-required）；
//   - 成链三件 + 审计动词：features 行 / proposal_id / feature_records（verb ∈
//     {register, transition, doc-upsert}——actor ∈ {core, ui, plugin-tool}）；
//   - claim 守卫（claim.ts:137）：前置全 ∈ {completed, skipped} 才放行，未满足 =
//     ERR_DEPENDENCIES_UNMET「前置依赖未满足：<slug>/<localId> <status>…——满足集…」；
//   - upsertDoc（FEATURES_CHANNELS.upsertDoc）：feature_documents 按 (feature_id, doc_kind)
//     幂等更新；features/register RPC 对既有 slug 复用行（不重复建链）；
//   - 概览锚：提案行/展开 meta（成链 → slug）+ feature 文档行 ovDocRowOf + 任务行
//     ttItemOf + mode chip [data-dswf-mode-chip]（feature 行恒远征）；
//   - 核心包技能目录（fs）：packages/plugin-forge/skills——git-commit/git-checkout 零条目。
//
// Outcome → 测试映射：
//   Step1 success（brainstorm 产出提案 + mode=expedition 创建时写入）……………………「冒烟」
//   Step1 spec-skill-catalog-complete（远征 spec 目录全量挂载 + core 无退役技能）………「冒烟」尾
//   Step2 success（UI 评审 accepted——双面流转同门 UI 半）……………………………………「冒烟」
//   Step2 revised-back-to-draft / validation-error-reason-empty………………………………「Step2b」
//   Step2 superseded-evolution（取代链 + superseded_by 落库）…………………………………「Step2c」
//   Step3 success（单步成链三件）………………………………………………………………………「冒烟」
//   Step3 chain-atomicity（正向承载：三件同在；故障注入通道缺席——core 单测承载）……「冒烟」+映射
//   Step4 success（write-prd → feature_documents + 分层文档区真实路径）…………………「冒烟」
//   Step5 success（ui-design/tech-design 同门入库）………………………………………………「冒烟」
//   Step6 success（breakdown-tasks 建任务 + mode 快照 expedition + 依赖边落库）………「冒烟」
//   Step7 success（claim/submit 全绿 + 提交哈希入执行记录）…………………………………「冒烟」
//   Step7 zero-manual-file-transfer（三域动词对账——全程经 tool 读写）…………………「冒烟」
//   Step8 success（四域全景一致）………………………………………………………………………「冒烟」
//   Step8 audit-rows-accompany（每次写入伴随审计行 + append-only 触发器）………………「Step3b」
//   Step3 幂等（同 proposal 已有 feature 不重复建链）…………………………………………「Step3b」
//   Step4 upsert-idempotent（同 kind 更新不重复建行）…………………………………………「Step3b」
//   Step6 dag-dependency-ordering（前置未终态不可领取——无越序）…………………………「Step3b」
//   Step5 spec-skill-unavailable-outside-expedition / Step7 blocked-recovery………诚实映射
//
// 诚实映射（无 e2e 通道 / 已有承载面——不伪造断言）：
//   - Step3 chain-atomicity 故障注入半段（事务中段失败回滚）→ core 成链单测（事务边界
//     单元面承载）；e2e 正向断言 = 三件同在（无半链状态的可达侧证）；
//   - Step5 spec-skill-unavailable-outside-expedition（突击组合 spec 物理缺位）→
//     SC2① + blitz-direct-chain.spec.ts 冒烟尾（同源 overlay 断言）；
//   - Step7 blocked-recovery（fix 链自动恢复）→ M2 fix-chain-auto-recovery.spec.ts +
//     worker-provisioning.spec.ts（本批 T1）。
//
// Assertion depth: 52/56 behavioral（93%），其中 deep 22/52（42%）——两阈均过。

import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovDocRowOf, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { overlayTextOf, presetSkillDirs } from '../../support/m3.js'

const WS_NAME = 'ws-jefc'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

/** UI 评审流转（⋯ 菜单 → 对话框 → 目标态 + reason 提交——双面同门的 UI 半） */
async function uiVerdict(page: Page, title: string, to: string, reason: string): Promise<void> {
  const row = page.locator('[data-dswf-ov-parent]', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.locator('[data-dswf-ov-more]').click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
  const dialog = page.locator('[data-dswf-ov-vd]')
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-dswf-ov-vd-to]').selectOption(to)
  await page.locator('[data-dswf-ov-vd-reason]').fill(reason)
  await page.locator('[data-dswf-ov-vd-confirm]').click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

test('@web-e2e @m3 远征全链·冒烟：brainstorm → 评审 accepted → 成链 → 三类规格文档 → 建任务 → 全绿 → 四域全景（Step1-8）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jefc-golden'

    // ── Step1：brainstorm 产出提案（回放主径）——mode 溯源 = expedition 创建时写入 ──
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'Jefc 远征全链演示', mode: 'expedition',
    })) as { proposalId: string; slug: string }
    const db0 = openForgeDbAt(dir)
    try {
      const row = db0.prepare<unknown[], { mode: string | null; proposal_status: string }>(
        `SELECT mode, proposal_status FROM proposals WHERE id = ?`,
      ).get(proposal.proposalId)
      expect(row?.mode, 'mode 溯源 = expedition（创建时写入）').toBe('expedition')
      expect(row?.proposal_status, '五态 draft 起步').toBe('draft')
    } finally {
      db0.close()
    }

    // ── Step2：UI 评审 accepted（draft → under-review → accepted，人工裁决按钮）──
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await uiVerdict(page, 'Jefc 远征全链演示', 'accepted', 'Jefc 证据充分可接受（UI 人工裁决半）')
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jefc 远征全链演示' }).first()
    await expect(row, '提案行 = 已接受').toContainText('已接受', { timeout: 30_000 })

    // ── Step3：registerFeature 单步成链（三件同在——原子性正向承载）──
    const db = openForgeDbAt(dir)
    let featureId = ''
    try {
      const feature = db.prepare<unknown[], { id: string; proposal_id: string | null }>(
        `SELECT id, proposal_id FROM features WHERE proposal_id = ?`,
      ).get(proposal.proposalId)
      expect(feature, 'feature 行在场').toBeDefined()
      featureId = (feature as { id: string }).id
      expect((feature as { proposal_id: string | null }).proposal_id, 'proposal_id 谱系在行').toBe(proposal.proposalId)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_records WHERE feature_id = ? AND verb = 'register'`).get(featureId)?.n, 'feature_records 审计行同事务在场（无半链）').toBe(1)
    } finally {
      db.close()
    }

    // ── Step4/5：三类规格文档（write-prd / ui-design / tech-design 的 RPC 双门承载）──
    // 词表事实（contracts DOC_KINDS 七类封闭）：无 ui-design kind——ui-design.md 为 on-disk
    // 工件不入册（ui-design SKILL.md State-Layer Discipline）；UI 段入册工件 = page-map
    // （tech-design SKILL 登记，规范位 design/page-map.md——core discovery 同映射）。
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath: `docs/features/${PROP}/prd/prd-spec.md`, summary: 'Jefc PRD' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'page-map', relPath: `docs/features/${PROP}/design/page-map.md`, summary: 'Jefc 页面图' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'tech-design', relPath: `docs/features/${PROP}/design/tech-design.md`, summary: 'Jefc 技术设计' })

    // ── Step6：breakdown-tasks 建任务（挂 feature = 提案链 + 依赖 DAG）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '远征任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '远征任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }

    // ── Step7：派发执行（回放主径）——AC gate → commit → submitTask 全绿 ──
    const COMMIT = '0f1e2d3c4b5a6978877665544332211ff0e1d2c3'
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jefc-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jefc 甲结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jefc-executor',
    })
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t2.slug, localId: t2.localId }, result: 'success',
      summary: 'Jefc 乙结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jefc-executor',
    })

    // ── Step7c：零手工搬文件对账（三域全部动词可溯源——task/feature 记录链）──
    const db2 = openForgeDbAt(dir)
    try {
      const taskVerbs = db2.prepare<unknown[], { verbs: string }>(
        `SELECT GROUP_CONCAT(verb, ',') AS verbs FROM task_records`,
      ).get()?.verbs as string
      expect(taskVerbs.includes('add') && taskVerbs.includes('claim') && taskVerbs.includes('submit'), '任务域全程经动词（add/claim/submit）').toBe(true)
      const snapshot = db2.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM tasks WHERE id = ?`).get(t1.taskId)?.mode
      expect(snapshot, '任务 mode 快照 = expedition（远征语义）').toBe('expedition')
      const commits = db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE verb = 'submit' AND commit_hash = ?`,
      ).get(COMMIT)?.n
      expect(commits, '提交哈希入执行记录（两行）').toBe(2)
      const featureVerbs = db2.prepare<unknown[], { verb: string }>(
        `SELECT verb FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(featureId).map((r) => r.verb)
      expect(featureVerbs, 'feature 域动词全经门（register + doc-upsert ×3）').toEqual(['register', 'doc-upsert', 'doc-upsert', 'doc-upsert'])
      const docs = db2.prepare<unknown[], { doc_kind: string }>(
        `SELECT doc_kind FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`,
      ).all(featureId)
      expect(docs.map((d) => d.doc_kind), 'feature_documents 三类在场（分层多类——UI 段 = page-map，词表无 ui-design）').toEqual(['page-map', 'prd-spec', 'tech-design'])
    } finally {
      db2.close()
    }

    // ── Step8：四域全景一致（提案/文档/任务/记录跨面）──
    const propToggle = row.locator('[data-dswf-ov-parent-toggle]')
    await propToggle.click()
    await expect(propToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
    await expect(row.locator('xpath=following-sibling::div[@data-dswf-ov-meta]'), '谱系成链行').toContainText(`成链 → ${PROP}`, { timeout: 15_000 })
    await page.locator(ovSubtabOf('features')).click()
    const featRow = page.locator('[data-dswf-ov-parent]', { hasText: PROP }).first()
    await expect(featRow, 'feature 行在场').toBeVisible({ timeout: 30_000 })
    await expect(featRow.locator('[data-dswf-mode-chip]'), 'feature 恒远征（只读投影）').toHaveAttribute('data-dswf-mode-chip', 'expedition')
    await featRow.locator('[data-dswf-ov-parent-toggle]').click()
    await expect(page.locator(ovDocRowOf(`docs/features/${PROP}/prd/prd-spec.md`)).first(), 'PRD 分层文档行（真实路径）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ovDocRowOf(`docs/features/${PROP}/design/page-map.md`)).first(), 'UI 文档组页面图行（UI 段入册工件——词表无 ui-design）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ovDocRowOf(`docs/features/${PROP}/design/tech-design.md`)).first(), '技术设计文档行').toBeVisible({ timeout: 15_000 })
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行甲 = 已完成').toContainText('已完成', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(t2.taskId)).first(), '任务行乙 = 已完成').toContainText('已完成', { timeout: 30_000 })

    // ── Step1b：远征组合技能目录（数据直证——spec 全量挂载 + core 无退役技能）──
    const overlay = overlayTextOf(userData)
    const expDirs = presetSkillDirs(overlay, 'expedition')
    expect(expDirs.filter((d) => d.toLowerCase().includes('plugin-forge-spec')).length, '远征组合 spec 技能目录全量挂载').toBe(1)
    const coreEntries = readdirSync(join(ROOT, 'packages', 'plugin-forge', 'skills')).filter((e) => e !== 'README.md')
    expect(coreEntries, 'core 包无 git-commit（移除断言）').not.toContain('git-commit')
    expect(coreEntries, 'core 包无 git-checkout（未迁断言）').not.toContain('git-checkout')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 远征全链·Step2b/2c：打回修订循环（空因拒绝 + under-review → draft）+ superseded 演进链', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })

    // ── 打回修订循环：under-review →（空因拒）→ draft → 再走接受 ──
    const pA = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jefc-revise', title: 'Jefc 打回循环提案', mode: 'expedition',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pA.proposalId, toStatus: 'under-review' })
    const rowA = page.locator('[data-dswf-ov-parent]', { hasText: 'Jefc 打回循环提案' }).first()
    await expect(rowA).toBeVisible({ timeout: 30_000 })
    await rowA.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    // 目标态允许集（disallowed-target 同面）：under-review 目标 = accepted/rejected/draft（无自身）
    const optionValues = await page.locator('[data-dswf-ov-vd-to] option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
    expect(optionValues, '目标态仅列五态机允许集（不含当前态自身）').toEqual(['accepted', 'rejected', 'draft'])
    await page.locator('[data-dswf-ov-vd-to]').selectOption('draft')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd-error="reason-required"]'), '空因拒绝留场').toBeVisible({ timeout: 10_000 })
    await expect(dialog, '对话框不关闭').toBeVisible()
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jefc 需补充调研（打回）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(rowA, '打回 = 草稿').toContainText('草稿', { timeout: 30_000 })
    const db0 = openForgeDbAt(dir)
    try {
      expect(db0.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(pA.proposalId)?.n, '打回期间零 feature 行（扫描行不破坏）').toBe(0)
    } finally {
      db0.close()
    }
    // 修订后再走接受（评审工作流完整可用）——先等行面呈现新态（bridge 写后事件刷新落地）：
    // vd-to 允许集 = mount 时状态快照，陈旧 draft 态下目标仅 under-review（accepted 不在列）
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pA.proposalId, toStatus: 'under-review' })
    await expect(rowA, '再送审 = 评审中（事件刷新落地后才开弹）').toContainText('评审中', { timeout: 30_000 })
    await uiVerdict(page, 'Jefc 打回循环提案', 'accepted', 'Jefc 修订完成可接受')
    await expect(rowA, '再接受 = 已接受').toContainText('已接受', { timeout: 30_000 })

    // ── superseded 演进链：accepted → superseded（supersededBy 必带——空目标拒）──
    // 后继提案先行（对话框候选 = mount 时 listProposals 快照——开弹后新建不入选）
    const successor = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jefc-next', title: 'Jefc 后继提案', mode: 'expedition',
    })) as { proposalId: string }
    await uiVerdictOpen(page, 'Jefc 打回循环提案')
    await page.locator('[data-dswf-ov-vd-to]').selectOption('superseded')
    await expect(page.locator('[data-dswf-ov-vd-supersede-by]'), '取代目标选择面在场').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jefc 被后续版本取代')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd-error="superseded-by-required"]'), '取代目标缺席拒绝（目标在场校验）').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dswf-ov-vd-supersede-by]').selectOption({ label: 'Jefc 后继提案' })
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd]'), '提交成功关对话框').toBeHidden({ timeout: 15_000 })
    await expect(rowA, '行状态 = 已取代').toContainText('已取代', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      const sup = db.prepare<unknown[], { proposal_status: string; superseded_by: string | null }>(
        `SELECT proposal_status, superseded_by FROM proposals WHERE id = ?`,
      ).get(pA.proposalId)
      expect(sup?.proposal_status, 'superseded 落库').toBe('superseded')
      expect(sup?.superseded_by, '取代链谱系可见（superseded_by = 后继 id）').toBe(successor.proposalId)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

/** 打开评审流转对话框（不提交——目标态/候选面断言用） */
async function uiVerdictOpen(page: Page, title: string): Promise<void> {
  const row = page.locator('[data-dswf-ov-parent]', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.locator('[data-dswf-ov-more]').click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
  await expect(page.locator('[data-dswf-ov-vd]')).toBeVisible({ timeout: 15_000 })
}

test('@web-e2e @m3 远征全链·Step3b/4b/6b/8b：成链幂等 + 文档 upsert 幂等 + DAG 领取守卫 + 审计 append-only', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jefc3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jefc-idem'
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'Jefc 幂等与守卫演示', mode: 'expedition',
    })) as { proposalId: string }
    const chained = (await driver.call('forgeProposals', 'transitionProposal', {
      projectId, proposalId: proposal.proposalId, toStatus: 'accepted',
    })) as { chained?: { featureId: string } }
    expect(chained.chained, '成链返回 feature').toBeDefined()
    const featureId = chained.chained?.featureId ?? ''

    // ── 成链幂等：同 proposal 已有 feature → 再 register typed 拒（ERR_FEATURE_EXISTS——
    // registerFeature slug UNIQUE 冲突 409 = features.ts 契约面；防重复建链由词表单源承载）──
    const dup = await rejectMessage(forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jefc 幂等与守卫演示' }))
    expect(dup, '重复 register typed 拒（code 面）').toContain('ERR_FEATURE_EXISTS')
    expect(dup, '重复 register typed 拒（message 面）').toContain('feature 已存在')
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '重复 register 不建第二链（幂等）').toBe(1)
    } finally {
      db.close()
    }

    // ── upsert 幂等：同 (feature, kind) 再写 = 更新不重复建行 ──
    const relPath = `docs/features/${PROP}/prd/prd-spec.md`
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath, summary: '初版' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath, summary: '修订版' })
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_documents WHERE feature_id = ? AND doc_kind = 'prd-spec'`).get(featureId)?.n, '同名同路径 upsert = 单行更新（无重复条目）').toBe(1)
    } finally {
      db2.close()
    }

    // ── DAG 领取守卫：前置未终态不可领取（无越序）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '前置任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '依赖任务', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    const premature = await rejectMessage(driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc3-dispatch',
    }))
    expect(premature, '前置未终态领取拒（ERR_DEPENDENCIES_UNMET 面）').toContain('前置依赖未满足')
    expect(premature, '未满足清单含前置自然键 + 当前状态').toContain(`${PROP}/${t1.localId} pending`)
    // 前置终态后放行（满足集 = completed ∪ skipped）
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jefc3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jefc 前置结算（守卫放行门）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jefc3-executor',
    })
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc3-dispatch' })
    const db3 = openForgeDbAt(dir)
    try {
      expect(db3.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(t2.taskId)?.task_status, '前置终态后领取放行（按 DAG 顺序）').toBe('in_progress')
    } finally {
      db3.close()
    }

    // ── 审计 append-only：UPDATE / DELETE 直接 ABORT（双触发器）+ 动词伴随 ──
    const db4 = openForgeDbAt(dir)
    try {
      const auditCount = db4.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_records WHERE feature_id = ?`).get(featureId)?.n ?? 0
      expect(auditCount, 'feature 域多次写入每次伴随审计行（register + doc-upsert ×2）').toBeGreaterThanOrEqual(3)
      expect(() => db4.prepare(`UPDATE feature_records SET verb = 'tampered' WHERE feature_id = ?`).run(featureId), 'feature_records UPDATE 被触发器拒绝（append-only）').toThrow()
      expect(() => db4.prepare(`DELETE FROM feature_records WHERE feature_id = ?`).run(featureId), 'feature_records DELETE 被触发器拒绝（append-only）').toThrow()
    } finally {
      db4.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
