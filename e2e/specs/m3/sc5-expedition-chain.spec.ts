// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC5 远征全链（PRD Goals SC5 / 图 12 下链；自举走查即此流程作用于 M3.5——运行期
// 真实走查归 5.3 dogfood）：
//   brainstorm 产出（回放主径承载：createProposal mode=expedition——Hard Rule 禁真实模型）
//   → accepted → 成链原子三行（features 行 + proposal_id 谱系 + feature_records(register)
//   审计行——单事务）→ 规格文档（upsertFeatureDoc → feature_documents 两行——write-prd/
//   tech-design 产出的 RPC 双门承载）→ 任务（addTask source=feature·mode=expedition 快照）
//   → 派发入口（UF-3 新开路由联动断言：远征模式 + /run-tasks 单行自动发送）→
//   提案/文档/任务/记录四域全景一致。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { awaitPresetHeaderLabel, seatPresent } from '../../support/m3.js'

const WS_NAME = 'ws-sc5'
const PROP = 'sc5-expedition'
/** 派发指令单行（v23——dispatchTask 唯一必要参数 contextSlug） */
const DISPATCH_CMD = `/run-tasks ${PROP}`

test('@web-e2e @m3 SC5·远征全链：成链原子三行 → 规格文档 → 任务 → 派发入口 → 四域全景一致', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc5-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc5-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // ── brainstorm → proposal（回放主径承载）→ accepted → 成链原子三行 ──
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'SC5 远征全链演示', mode: 'expedition',
    })) as { proposalId: string; slug: string }
    const verdict = (await driver.call('forgeProposals', 'transitionProposal', {
      projectId, proposalId: proposal.proposalId, toStatus: 'accepted',
    })) as { chained?: { featureId: string; slug: string } }
    expect(verdict.chained, '成链返回（accepted ∧ expedition）').toBeDefined()
    const featureId = verdict.chained?.featureId ?? ''
    const db = openForgeDbAt(dir)
    try {
      // 原子三行：features 行 + 谱系 + feature_records(register) 审计行（同事务全在）
      const feature = db.prepare<unknown[], { slug: string; proposal_id: string | null }>(`SELECT slug, proposal_id FROM features WHERE id = ?`).get(featureId)
      expect(feature?.slug, 'feature 行同名继承').toBe(PROP)
      expect(feature?.proposal_id, 'proposal_id 谱系在行').toBe(proposal.proposalId)
      const audit = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(featureId)
      expect(audit, '审计伴随行（register·actor=core）').toEqual([{ verb: 'register', actor: 'core' }])
    } finally {
      db.close()
    }

    // ── 规格文档（write-prd / tech-design 产出的 RPC 双门承载——文档入 feature_documents）──
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath: `docs/features/${PROP}/prd/prd-spec.md`, summary: 'SC5 演示 PRD' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'tech-design', relPath: `docs/features/${PROP}/design/tech-design.md`, summary: 'SC5 演示技术设计' })

    // ── 任务（breakdown-tasks 产出承载：source=feature·mode=expedition 快照）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: 'SC5 远征任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: 'SC5 远征任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string }

    // ── 派发入口（UF-3 新开路由联动）：任务子 tab「派发」→ 新会话（远征）+ 单行指令自动发送 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    // feature 容器缺省选中（活跃 feature）；行在场 = 容器装载完成
    await expect(page.locator(ttItemOf(t1.taskId)).first(), 'feature 容器任务行在场').toBeVisible({ timeout: 30_000 })
    const dispatchButton = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchButton, '派发按钮亮起（存在未终态）').toBeVisible({ timeout: 15_000 })
    await dispatchButton.click()
    // 新开：远征模式会话 + /run-tasks 单行自动发送（v23 最小消息）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '转录面承载自动发送指令').toContainText(DISPATCH_CMD, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '远征模式')
    expect(await seatPresent(page, 1_000), '指令已发送 = 非 blank（hero 座位退场）').toBe(false)

    // ── 四域全景一致（概览三子 tab + 库记录域）──
    // （会话编排 replaceMain 后右栏 dock 激活面可被会话面取代——keyed body 非激活即卸载，
    //  官方语义；openOverviewDock 幂等重开[strip 页签重激活径]）
    await openOverviewDock(page)
    // ① 提案域：行状态已接受 + 谱系成链
    await page.locator(ovSubtabOf('proposals')).click()
    const propRow = page.locator('[data-dswf-ov-parent]', { hasText: 'SC5 远征全链演示' }).first()
    await expect(propRow, '提案行在场').toBeVisible({ timeout: 30_000 })
    await expect(propRow).toContainText('已接受')
    const propToggle = propRow.locator('[data-dswf-ov-parent-toggle]')
    await expect(propToggle).toBeVisible({ timeout: 15_000 })
    await propToggle.click()
    await expect(propToggle, '行展开（aria-expanded）').toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
    // meta = 父行的兄弟节点（.dswf-ov-item 内两段结构——非子元素）
    const propMeta = propRow.locator('xpath=following-sibling::div[@data-dswf-ov-meta]')
    await expect(propMeta, '展开元数据在场').toBeVisible({ timeout: 15_000 })
    await expect(propMeta, '谱系成链行').toContainText(`成链 → ${PROP}`)
    // ② feature 域：恒远征 chip + 两规格文档行（feature 行主显 = slug——提案标题在展开元数据）
    await page.locator(ovSubtabOf('features')).click()
    const featRow = page.locator('[data-dswf-ov-parent]', { hasText: PROP }).first()
    await expect(featRow, 'feature 行在场（成链即时）').toBeVisible({ timeout: 30_000 })
    await expect(featRow.locator('[data-dswf-mode-chip]'), 'feature 恒远征（只读投影）').toHaveAttribute('data-dswf-mode-chip', 'expedition')
    const featToggle = featRow.locator('[data-dswf-ov-parent-toggle]')
    await featToggle.click()
    await expect(featToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
    await expect(page.locator('[data-dswf-ov-doc="docs/features/sc5-expedition/prd/prd-spec.md"]').first(), 'PRD 文档行').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-ov-doc="docs/features/sc5-expedition/design/tech-design.md"]').first(), '技术设计文档行').toBeVisible({ timeout: 15_000 })
    // ③ 任务域：feature 容器两行
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行甲在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ttItemOf(t2.taskId)).first(), '任务行乙在场').toBeVisible({ timeout: 15_000 })
    // ④ 记录域：task_records 审计链（add 两行——库级）
    const db2 = openForgeDbAt(dir)
    try {
      const verbs = db2.prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records ORDER BY id`).all().map((r) => r.verb)
      expect(verbs, '记录域审计链（两 add 行）').toEqual(['add', 'add'])
      const docs = db2.prepare<unknown[], { doc_kind: string }>(`SELECT doc_kind FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`).all(featureId)
      expect(docs.map((d) => d.doc_kind), 'feature_documents 两行').toEqual(['prd-spec', 'tech-design'])
    } finally {
      db2.close()
    }

    // 指令单行（v23）：转录不含多行模板（@path/名称/摘要族不参与派发指令）
    const transcript = await page.locator(CONVERSATION_CONTENT).first().textContent({ timeout: 10_000 })
    expect((transcript ?? '').includes('我的意图：'), '派发指令 = 单行最小消息（非 prefill 格式族）').toBe(false)
    expect(page.locator(COMPOSER_INPUT).last(), 'composer 在场（新会话就绪）').toBeVisible()

    // 零凭据模型失败面不计入产品断言（指令已落地 = 派发入口交付面）
    if (pageErrors.length > 0) console.log(`[sc5-diagnostic] pageerror：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
