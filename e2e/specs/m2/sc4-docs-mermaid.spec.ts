// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC4 文档浏览（AC2）：仓内/仓外各一 + erDiagram 渲染（DOM 增强器出图）+
// 非法源官方代码块纯文本兜底——tech-design Per-Layer e2e 行 + PRD ③。
//   · 仓内 = 本仓 worktree 注册为项目（forge_dir = 仓根 .forge——docs/features 与 docs/
//     proposals 迁移后所在 docs 根；knowledgeDir 重定向 tmp 隔离目录 + forge_dir 下两目录 → 注册链 fix-39 建面
//     零写入，仓树只读）→ 真实发现面建行 → 提案子 tab 文档行 → dock 开文档 tab；
//   · 仓外 = 临时夹具预置约定目录结构（docs/proposals/<slug>/proposal.md 内嵌 mermaid
//     段——erDiagram 验收锚 / 非法源）→ 真实发现链建行（S9① 口径）→ 只读渲染 +
//     canonical 路径栏 + 回退占位卡；
//   · 断言经 anchors 单源（docPanelOf/MD_MERMAID_FIGURE/MD_MERMAID_ENHANCED_BLOCK/DOC_CODE_BLOCK
//     ——Hard Rule；mermaid 出图 = DOM 增强器旁插 figure，非法源 = 官方代码块纯文本兜底）。
// M3 drift 台账（5.2 落定）：4.6 行头多动作迁移——提案/feature 父行整行点击退役，
// 展开命中面 = [data-dswf-ov-parent-toggle]（v22 行语言——零嵌套按钮纪律）。
// e2e-fast-shared-launch 存量迁移（1.16 补迁移）：T2 仓外迁共享 launch 形态，T1 仓内保留
// 原断言面随共享会话执行。适配点：①仓外世界落在 fixture 根项目上——概览项目锚 = 主视图
// 会话锚（主视图会话属 fixture 项目，不随新注册项目切换），demo-er/demo-bad 提案夹具经
// seedWorkspace 播种进 forge_dir（{ws}/.forge）之下，注册相位发现链建行，用例幂等重取
// fixture 项目行；②文档 tab 并存计数改相对基线（共享序列下 strip 可能携带前序用例页签——
// 并存/去重语义以计数增量承载）；③T1 仓内独立 fixture 实例（独立 launch/userData）——
// 注册真实仓主检出 + 主视图会话切至本仓项目（概览提案子 tab 是选中项目作用域，worktree
// 检出 .forge docs 稀疏无 proposal.md——发现面锚主检出根 + 其 .forge docs 根），保留结构
// 锚断言面（T1 存量红 = slug 快照锚遇仓结构漂移，D3 triage 判例 b385bc6b 改动态枚举 +
// 结构锚）；与 T2 共享 fixture 并行实例互不波及；pageErrors 断言面改各自 launch 累计
//（批次一同径，语义收紧）。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { PROPOSALS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { ROOT } from '../../support/launch.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openOverviewDock } from '../../support/navigation.js'
import {
  DOCKKIT_STRIP_TAB,
  DOC_CODE_BLOCK,
  DOC_PATH_LABEL,
  MD_MERMAID_ENHANCED_BLOCK,
  MD_MERMAID_FIGURE,
  OV_PARENT_ANY,
  docPanelOf,
  ovDocRowOf,
  ovSubtabOf,
} from '../../support/anchors.js'

// ─────────────────────────────────────────────────────────────────────────────
// 共享 launch fixture（仓内/仓外两用例一条会话——见头注适配点）
// ─────────────────────────────────────────────────────────────────────────────
// T1 独立 fixture 实例（独立 launch/userData——T1 须把主视图会话切到本仓项目才能让概览
// 提案子 tab 锚本仓行集；独立实例使该切换零波及 T2 的 fixture 项目锚定，无需选中态还原）
const { test: testIn } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: 'sc4-in-isolated',
  launch: { expectPhase: 'hero' },
})
const { test: testShared } = createSharedLaunchFixture({
  seedWorkspace: (dir) => {
    // 约定目录结构（S9① 口径）：forge_dir（{ws}/.forge）之下的 docs/proposals/<slug>/
    // proposal.md——demo-er 内嵌 erDiagram 段（验收锚）/ demo-bad 非法源
    const put = (slug: string, title: string, body: readonly string[]): void => {
      const abs = join(dir, '.forge', 'docs', 'proposals', slug, 'proposal.md')
      if (existsSync(abs)) return
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, ['---', `title: "${title}"`, 'status: draft', '---', '', ...body, ''].join('\n'), 'utf8')
    }
    put('demo-er', 'erDiagram 渲染演示', [
      '# erDiagram 渲染演示',
      '',
      '正文段（MarkdownDoc 渲染）——锚文本 SC4-OUT-BODY。',
      '',
      '```mermaid',
      'erDiagram',
      '    PROJECT ||--o{ FEATURE : has',
      '    FEATURE ||--o{ TASK : contains',
      '    TASK ||--o{ RECORD : logs',
      '```',
    ])
    put('demo-bad', '非法 mermaid 源回退演示', [
      '# 非法源回退',
      '',
      '```mermaid',
      'this is :: not <valid mermaid> at all',
      '```',
    ])
  },
  workspaceName: 'sc4-docs-mermaid-shared',
  launch: { expectPhase: 'hero' },
})

/**
 * 注册负载直注（custom forgeDir/knowledgeDir 形态——发现面以 forge_dir 为 docs/ 根扫描；
 * rpc.ts registerProject 固定 {ws}/.forge 载荷不适用于文档发现夹具）。返回应用库行。
 */
async function registerProjectAt(
  page: Page,
  o: { readonly workspaceDir: string; readonly name: string; readonly forgeDir: string; readonly knowledgeDir: string },
): Promise<ProjectSummary> {
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: o.workspaceDir,
    name: o.name,
    forgeDir: o.forgeDir,
    knowledgeDir: o.knowledgeDir,
  })
  const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
  const row = projects.find((p) => p.id === result.projectId)
  expect(row, `注册行入列（${o.name}）`).toBeDefined()
  return row as ProjectSummary
}

/** 概览提案子 tab → 展开目标提案行 → 点击其文档行（dock 开文档 tab 的 UI 唯一径） */
async function openProposalDoc(page: Page, docRel: string, rowTitle: string): Promise<void> {
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('proposals')).click()
  await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  const docRow = page.locator(ovDocRowOf(docRel)).first()
  // 文档行在提案父行展开元数据内——未展开则先点展开钮（M3 行主显 = 提案标题，slug 不再入行文本；
  // dock 文档 tab 切换后概览 body 重挂载——点击可落于重渲染窗口，展开态确认 + 一轮补点）
  if ((await docRow.isVisible().catch(() => false)) === false) {
    const toggle = page.locator(OV_PARENT_ANY, { hasText: rowTitle }).first().locator('[data-dswf-ov-parent-toggle]')
    await toggle.click()
    try {
      await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 })
    } catch {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 })
    }
  }
  await expect(docRow, `提案文档行在场（${docRel}）`).toBeVisible({ timeout: 30_000 })
  await docRow.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// 仓内：本仓 worktree 注册 → 真实发现面建行 → 提案文档浏览（只读 + canonical 路径栏）
// ─────────────────────────────────────────────────────────────────────────────
testIn('@web-e2e @m2 5.2 SC4 仓内：本仓注册发现链 → 提案文档 dock tab 只读渲染 + canonical 路径栏', async ({ sharedLaunch }) => {
  testIn.setTimeout(360_000)
  const { page, pageErrors } = sharedLaunch
  // knowledgeDir 重定向仓外 tmp（本仓无 .knowledge——注册链 fix-39 递归建面即写入仓树，
  // e2e 禁污染仓树）；workspaceDir/forgeDir = 本仓主检出（worktree 检出的 .forge/docs/
  // proposals 为 git 外工作数据、检出稀疏无 proposal.md——真实发现面锚主检出根 + 其
  // .forge docs 根；两目录在场 → 零建面零写入）
  const knowledgeDir = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc4-in-kn-'))
  const repoRoot = resolve(ROOT, '..', '..', '..') // <main>/.forge/worktrees/<name> → 主检出根
  const project = await registerProjectAt(page, { workspaceDir: repoRoot, name: 'dsh-forge 本仓', forgeDir: join(repoRoot, '.forge'), knowledgeDir })
  const projectId = project.id

  // 概览提案子 tab 是选中项目作用域（主视图会话锚）：选中本仓项目（hero chip picker）
  // 使提案行集切到本仓发现面（独立 fixture 实例——切换零波及 T2，无需选中态还原）
  await selectWorkspaceViaChip(page, 'dsh-forge 本仓')

  // 真实发现链：本仓 docs/proposals/<slug>/proposal.md 建行——动态枚举 + 结构锚
  // （D3 triage 判例 b385bc6b：slug 快照锚退役——仓结构漂移（提案增删/slug 演进）不再
  // 翻红；行为语义仍守住：发现行形制 + 行 slug 与 relPath 同构 + canonical 解析 + 渲染）。
  // unit 侧映射齐全（proposal 行 slug/relPath 结构判读单测在册），快照锚可安全移除。
  const proposals = await forgeInvoke<readonly { slug: string; title?: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
  const docProposal = proposals.find((p) => p.relPath !== undefined && /^docs\/proposals\/[^/]+\/proposal\.md$/.test(p.relPath))
  expect(docProposal, '发现面建行：仓内挂 proposal.md 的提案行在列（结构锚）').toBeDefined()
  const docRel = docProposal!.relPath!
  expect(docRel, '行 slug 与 relPath 同构（slug 目录段一致）').toBe(`docs/proposals/${docProposal!.slug}/proposal.md`)

  // dock 开文档 tab：提案子 tab → 目标行展开 → 文档行点击 → 独立文档 tab
  await openProposalDoc(page, docRel, docProposal!.title ?? docProposal!.slug)
  const panel = page.locator(docPanelOf(projectId, docRel)).first()
  await expect(panel, '文档 tab 开出（docRel 去重键 = 地址）').toBeVisible({ timeout: 30_000 })
  // canonical 单行头路径：绝对路径呈现（1.6 载体适配：官方 PathLabel [data-path-label]——
  // 目录段+文件名 textContent 拼接全值；canonical 解析含本机大小写/分隔形态——子串断言面）
  const pathText = (await panel.locator(DOC_PATH_LABEL).textContent()) ?? ''
  expect(pathText.toLowerCase().startsWith(ROOT.slice(0, 2).toLowerCase()), 'canonical 路径 = 绝对路径（盘符起）').toBe(true)
  expect(pathText.endsWith(docRel.replaceAll('/', '\\')), 'canonical 路径栏逐字承载 rel_path 解析（结构锚——不钉具体 slug）').toBe(true)
  // 只读渲染：正文分段（Markdown 正文在场且非空——非悬空非错误态；正文字面随仓漂移不钉）
  const body = panel.locator('[data-dswf-doc-body]')
  await expect(body).toBeVisible()
  await expect(body, '正文非空（渲染收敛——非悬空）').toContainText(/\S/)
  // 「在编辑器中打开」按钮在场（openExternal 主侧执行面——e2e 断言零崩溃在场性，不触发外部程序）
  await expect(panel.locator('button[aria-label="在编辑器中打开"]')).toBeVisible()

  expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  rmDirBestEffort(knowledgeDir)
})

// ─────────────────────────────────────────────────────────────────────────────
// 仓外：约定目录结构夹具 → erDiagram SVG 渲染 + 非法源回退占位卡 + 多文档 tab 并存
// ─────────────────────────────────────────────────────────────────────────────
testShared('@web-e2e @m2 5.2 SC4 仓外：erDiagram 增强器出图 + 非法源代码块兜底 + 双 tab 并存', async ({ sharedLaunch }) => {
  testShared.setTimeout(360_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  // 仓外注册（fixture 根项目——forge_dir = {ws}/.forge，demo 提案夹具经 seedWorkspace
  // 播种，注册相位发现链建行；此处幂等重取项目行）
  const project = await registerProject(page, wsDir, 'SC4 仓外演示')
  const projectId = project.id
  const proposals = await forgeInvoke<readonly { slug: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
  expect(proposals.map((p) => p.slug).sort()).toEqual(['demo-bad', 'demo-er'])

  // 相对页签基线（在首开文档前取样——共享序列下 strip 可能携带前序用例页签，
  // 并存/去重语义以计数增量承载，不依赖零页签起点）
  const docTabs = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: 'proposal.md' })
  const baseTabs = await docTabs.count()

  // ① erDiagram 渲染（验收锚）：文档 tab → SVG 在场（懒加载渲染收敛面）
  const erRel = 'docs/proposals/demo-er/proposal.md'
  await openProposalDoc(page, erRel, 'erDiagram 渲染演示')
  const erPanel = page.locator(docPanelOf(projectId, erRel)).first()
  await expect(erPanel).toBeVisible({ timeout: 30_000 })
  await expect(erPanel.locator('[data-dswf-doc-body]')).toContainText('SC4-OUT-BODY')
  await expect(
    erPanel.locator(MD_MERMAID_FIGURE).locator('.dswf-doc-mermaid-canvas svg'),
    'erDiagram 渲染：SVG 在场（验收锚）',
  ).toBeVisible({ timeout: 30_000 })
  await expect(erPanel.locator(MD_MERMAID_ENHANCED_BLOCK).first(), '原 mermaid 块已渲染隐藏态').not.toBeVisible()

  // ② 非法源兜底：增强器不产 figure（无占位卡面）——官方代码块纯文本在场（源码原样、异常不外溢）
  const badRel = 'docs/proposals/demo-bad/proposal.md'
  await openProposalDoc(page, badRel, '非法 mermaid 源回退演示')
  const badPanel = page.locator(docPanelOf(projectId, badRel)).first()
  await expect(badPanel).toBeVisible({ timeout: 30_000 })
  await expect(badPanel.locator(MD_MERMAID_FIGURE), '非法源 → 增强器不出图').toHaveCount(0)
  await expect(badPanel.locator(DOC_CODE_BLOCK), '非法源 → 官方代码块兜底在场').toBeVisible({ timeout: 30_000 })
  await expect(badPanel.locator(DOC_CODE_BLOCK)).toContainText('valid mermaid')

  // ③ 多文档 tab 并存（multiple + 地址去重——strip 两页签；keyed body 非激活即卸载
  //    是官方语义，DOM 并存面 = 页签行）
  await expect(docTabs, '两文档 tab 并存（strip 面——multiple + 异地址各自成 tab）').toHaveCount(baseTabs + 2)
  await expect(page.locator(docPanelOf(projectId, badRel)), '激活文档 body 挂载').toBeAttached()
  // 同地址去重：再次打开 er 文档 → reveal 既有 tab（strip 数不变 + body 切回）
  await openProposalDoc(page, erRel, 'erDiagram 渲染演示')
  await expect(page.locator(docPanelOf(projectId, erRel))).toBeVisible({ timeout: 30_000 })
  await expect(docTabs, '同地址 reveal（不新增 tab）').toHaveCount(baseTabs + 2)

  expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
})
