// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC4 文档浏览（AC2）：仓内/仓外各一 + erDiagram 渲染（文档 tab SVG 在场）+
// 非法源回退占位卡——tech-design Per-Layer e2e 行 + PRD ③。
//   · 仓内 = 本仓 worktree 注册为项目（forge_dir = 仓根——docs/features 与 docs/proposals
//     所在地；knowledgeDir 重定向 tmp 隔离目录 + 仓内两目录齐备 → 注册链 fix-39 建面
//     零写入，仓树只读）→ 真实发现面建行 → 提案子 tab 文档行 → dock 开文档 tab；
//   · 仓外 = 临时夹具预置约定目录结构（docs/proposals/<slug>/proposal.md 内嵌 mermaid
//     段——erDiagram 验收锚 / 非法源）→ 真实发现链建行（S9① 口径）→ 只读渲染 +
//     canonical 路径栏 + 回退占位卡；
//   · 断言经 anchors 单源（docPanelOf/DOC_MERMAID_SVG/DOC_MERMAID_FALLBACK——Hard Rule）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { PROPOSALS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openOverviewDock } from '../../support/navigation.js'
import {
  DOCKKIT_STRIP_TAB,
  DOC_MERMAID_FALLBACK,
  DOC_MERMAID_SVG,
  OV_PARENT_ANY,
  docPanelOf,
  ovDocRowOf,
  ovSubtabOf,
} from '../../support/anchors.js'

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
async function openProposalDoc(page: Page, docRel: string): Promise<void> {
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('proposals')).click()
  await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  const docRow = page.locator(ovDocRowOf(docRel)).first()
  // 文档行在提案父行展开元数据内——未展开则先点父行（行键 = 提案 slug 前缀匹配）
  if ((await docRow.isVisible().catch(() => false)) === false) {
    const slug = docRel.split('/')[2] ?? ''
    const parent = page.locator(OV_PARENT_ANY, { hasText: slug }).first()
    await parent.click()
  }
  await expect(docRow, `提案文档行在场（${docRel}）`).toBeVisible({ timeout: 30_000 })
  await docRow.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// 仓内：本仓 worktree 注册 → 真实发现面建行 → 提案文档浏览（只读 + canonical 路径栏）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 SC4 仓内：本仓注册发现链 → 提案文档 dock tab 只读渲染 + canonical 路径栏', async () => {
  test.setTimeout(360_000)
  // knowledgeDir 重定向仓外 tmp（本仓无 .knowledge——注册链 fix-39 递归建面即写入仓树，
  // e2e 禁污染共享 worktree）；workspaceDir/forgeDir = 仓根（两目录在场 → 零建面零写入）
  const knowledgeDir = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc4-in-kn-'))
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc4-in-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, { workspaceDir: ROOT, name: 'dsh-forge 本仓', forgeDir: ROOT, knowledgeDir })
    const projectId = project.id

    // 真实发现链：本仓 docs/proposals/<slug>/proposal.md 建行（m2-pipeline 提案在列 + rel_path）
    const proposals = await forgeInvoke<readonly { slug: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    const m2 = proposals.find((p) => p.slug === 'dsh-forge-m2-pipeline')
    expect(m2, '发现面建行：本仓 m2-pipeline 提案在列').toBeDefined()
    expect(m2?.relPath).toBe('docs/proposals/dsh-forge-m2-pipeline/proposal.md')

    // dock 开文档 tab：提案子 tab → m2 行展开 → 文档行点击 → 独立文档 tab
    const docRel = 'docs/proposals/dsh-forge-m2-pipeline/proposal.md'
    await openProposalDoc(page, docRel)
    const panel = page.locator(docPanelOf(projectId, docRel)).first()
    await expect(panel, '文档 tab 开出（docRel 去重键 = 地址）').toBeVisible({ timeout: 30_000 })
    // canonical 路径栏：绝对路径呈现（canonical 解析含本机大小写/分隔形态——子串断言面）
    const pathText = (await panel.locator('.dswf-doc-path').textContent()) ?? ''
    expect(pathText.toLowerCase().startsWith(ROOT.slice(0, 2).toLowerCase()), 'canonical 路径 = 绝对路径（盘符起）').toBe(true)
    expect(pathText.endsWith('docs\\proposals\\dsh-forge-m2-pipeline\\proposal.md'), 'canonical 路径栏逐字承载 rel_path 解析').toBe(true)
    // 只读渲染：正文分段（Markdown 正文在场——非悬空非错误态）
    await expect(panel.locator('[data-dswf-doc-body]')).toBeVisible()
    await expect(panel.locator('[data-dswf-doc-body]')).toContainText('M2')
    // 「在编辑器中打开」按钮在场（openExternal 主侧执行面——e2e 断言零崩溃在场性，不触发外部程序）
    await expect(panel.locator('button[aria-label="在编辑器中打开"]')).toBeVisible()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(knowledgeDir)
    rmDirBestEffort(userData)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 仓外：约定目录结构夹具 → erDiagram SVG 渲染 + 非法源回退占位卡 + 多文档 tab 并存
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 SC4 仓外：erDiagram 渲染 SVG 在场 + 非法源回退占位卡 + 双 tab 并存', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc4-out-'))
  const wsDir = join(fixtureRoot, 'ws-docs')
  // 约定目录结构（S9① 口径）：docs/proposals/<slug>/proposal.md——内容含 erDiagram 段（验收锚）
  mkdirSync(join(wsDir, 'docs', 'proposals', 'demo-er'), { recursive: true })
  writeFileSync(
    join(wsDir, 'docs', 'proposals', 'demo-er', 'proposal.md'),
    [
      '---',
      'title: "erDiagram 渲染演示"',
      'status: draft',
      '---',
      '',
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
      '',
    ].join('\n'),
    'utf8',
  )
  mkdirSync(join(wsDir, 'docs', 'proposals', 'demo-bad'), { recursive: true })
  writeFileSync(
    join(wsDir, 'docs', 'proposals', 'demo-bad', 'proposal.md'),
    [
      '---',
      'title: "非法 mermaid 源回退演示"',
      'status: draft',
      '---',
      '',
      '# 非法源回退',
      '',
      '```mermaid',
      'this is :: not <valid mermaid> at all',
      '```',
      '',
    ].join('\n'),
    'utf8',
  )
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc4-out-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // 仓外注册（forge_dir = 夹具仓根 → 真实发现链建行）
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir,
      name: 'SC4 仓外演示',
      forgeDir: wsDir,
      knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const proposals = await forgeInvoke<readonly { slug: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(proposals.map((p) => p.slug).sort()).toEqual(['demo-bad', 'demo-er'])

    // ① erDiagram 渲染（验收锚）：文档 tab → SVG 在场（懒加载渲染收敛面）
    const erRel = 'docs/proposals/demo-er/proposal.md'
    await openProposalDoc(page, erRel)
    const erPanel = page.locator(docPanelOf(projectId, erRel)).first()
    await expect(erPanel).toBeVisible({ timeout: 30_000 })
    await expect(erPanel.locator('[data-dswf-doc-body]')).toContainText('SC4-OUT-BODY')
    await expect(erPanel.locator(DOC_MERMAID_SVG).locator('svg'), 'erDiagram 渲染：SVG 在场（验收锚）').toBeVisible({ timeout: 30_000 })
    await expect(erPanel.locator(DOC_MERMAID_FALLBACK)).toHaveCount(0)

    // ② 非法源回退：占位卡在场（源码呈现 + 回退注记——异常不外溢）
    const badRel = 'docs/proposals/demo-bad/proposal.md'
    await openProposalDoc(page, badRel)
    const badPanel = page.locator(docPanelOf(projectId, badRel)).first()
    await expect(badPanel).toBeVisible({ timeout: 30_000 })
    await expect(badPanel.locator(DOC_MERMAID_FALLBACK), '非法源 → 回退占位卡在场').toBeVisible({ timeout: 30_000 })
    await expect(badPanel.locator(DOC_MERMAID_FALLBACK)).toContainText('回退')
    await expect(badPanel.locator(DOC_MERMAID_SVG)).toHaveCount(0)

    // ③ 多文档 tab 并存（multiple + 地址去重——strip 两页签；keyed body 非激活即卸载
    //    是官方语义，DOM 并存面 = 页签行）
    const docTabs = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: 'proposal.md' })
    await expect(docTabs, '两文档 tab 并存（strip 面——multiple + 异地址各自成 tab）').toHaveCount(2)
    await expect(page.locator(docPanelOf(projectId, badRel)), '激活文档 body 挂载').toBeAttached()
    // 同地址去重：再次打开 er 文档 → reveal 既有 tab（strip 数不变 + body 切回）
    await openProposalDoc(page, erRel)
    await expect(page.locator(docPanelOf(projectId, erRel))).toBeVisible({ timeout: 30_000 })
    await expect(docTabs, '同地址 reveal（不新增 tab）').toHaveCount(2)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
