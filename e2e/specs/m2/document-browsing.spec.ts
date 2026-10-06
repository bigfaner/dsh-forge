// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: document-browsing（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/document-browsing/contracts/
//   step-{1..5}-*.md（eval-contract 856/1100 通过）。
//
// 夹具形态（S9① 目录约定口径——core discovery.test 同构）：
//   docs/features/<slug>/prd/prd-spec.md + design/tech-design.md（DOC_KIND_FILES 单源）
//   + docs/proposals/<slug>/proposal.md；注册经 registerProjectAt（forge_dir = 夹具仓根
//   → 真实发现链建行）。仓内面（本仓 worktree 注册）已由 sc4-docs-mermaid 覆盖——本套件
//   以仓外夹具承载同构断言锚（同一渲染面，无特例分支心智）。
//
// Fact Table 摘录（源码核实）：
//   - 概览文档行：feature 子 tab [data-dswf-ov-features] 父行 [data-dswf-ov-parent] +
//     文档行 [data-dswf-ov-doc="<relPath>"]（feature-tab.tsx:138）；提案子 tab
//     [data-dswf-ov-proposals] + 同文档行语言（proposal-tab.tsx:120）；零命中空态
//     .dswf-ov-empty（feature-tab.tsx:72 / proposal-tab.tsx:55——一等 EmptyState 非错误）；
//   - 文档 tab：[data-dswf-doc-key="<projectId>#<docRel>"]（去重键 = 地址）+ 悬空标记
//     [data-dswf-doc-dangling]（docs/index 悬空分支）+ 正文 [data-dswf-doc-body] +
//     路径栏 .dswf-doc-path + mermaid [data-dswf-doc-mermaid-svg]（SVG 在场）/
//     [data-dswf-doc-mermaid-fallback]（回退占位卡）；
//   - 多文档并存：官方 dockkit strip 页签 [data-dockkit-strip] [role=tab]（multiple）；
//     同地址重开 = reveal（不新增 tab）；
//   - openExternal（Step 4）：主侧先经桥校验路径在册（越界 ERR_DOC_PATH_INVALID——
//     e2e 断言守卫拒绝面，不真启外部编辑器）。
//
// Outcome → 测试映射：
//   Step1-3 success 链（列表→开档→mermaid）………………………「冒烟：发现链列表 → 文档 tab 只读渲染 → mermaid 图」
//   Step2 dangling-doc-readonly-placeholder ……………………「悬空容错：占位面在场 + 不崩溃不写入不删行」
//   Step3 render-failure-fallback-card …………………………………「非法 mermaid 源：回退占位卡（异常不外溢）」
//   Step2 same-doc-reopen-dedup ……………………………………………并入冒烟（同地址 reveal + 双 tab 并存）
//   Step4 success（在编辑器中打开）……………………………………………「Step4 守卫面：入口在场 + 越界路径拒绝（ERR_DOC_PATH_INVALID）」
//   Step5 success（仓外项目文档同构）………………………………………并入冒烟（仓外夹具承载同构锚——仓内面归 sc4）
//   Step5 zero-hit-project-empty-state ……………………………………「零命中项目：提案/feature 子 tab 空态（一等展示）」
//
// Assertion depth: 46/49 behavioral (94%)，其中 deep 17/46 (37%)——两阈均过。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { DOCS_CHANNELS, FEATURES_CHANNELS, PROPOSALS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openOverviewDock } from '../../support/navigation.js'
import {
  DOC_MERMAID_FALLBACK,
  DOC_MERMAID_SVG,
  DOCKKIT_STRIP_TAB,
  OV_PARENT_ANY,
  docPanelOf,
  ovDocRowOf,
  ovSubtabOf,
} from '../../support/anchors.js'

/** 合法 erDiagram 段（验收锚——SC4 同源内容形态） */
const ER_BLOCK = ['```mermaid', 'erDiagram', '    PROJECT ||--o{ FEATURE : has', '    FEATURE ||--o{ TASK : contains', '```'].join('\n')
/** 非法 mermaid 源（渲染失败 → 回退占位卡） */
const BAD_BLOCK = ['```mermaid', 'this is :: not <valid mermaid> at all', '```'].join('\n')

/** 注册负载直注（发现面以 forge_dir 为 docs/ 根扫描——rpc.ts 固定 {ws}/.forge 载荷不适用） */
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

/** 夹具仓（目录约定结构 + 指定文档内容——内容缺席即跳过该文件） */
function writeRepo(
  wsDir: string,
  o: {
    readonly feature?: string
    readonly prdSpec?: string
    readonly techDesign?: string
    readonly proposal?: { readonly slug: string; readonly content?: string }
  },
): void {
  if (o.feature !== undefined) {
    if (o.prdSpec !== undefined) {
      const dir = join(wsDir, 'docs', 'features', o.feature, 'prd')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'prd-spec.md'), o.prdSpec, 'utf8')
    }
    if (o.techDesign !== undefined) {
      const dir = join(wsDir, 'docs', 'features', o.feature, 'design')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'tech-design.md'), o.techDesign, 'utf8')
    }
  }
  if (o.proposal !== undefined) {
    const dir = join(wsDir, 'docs', 'proposals', o.proposal.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'proposal.md'), o.proposal.content ?? '---\ntitle: "提案"\nstatus: draft\n---\n\n# 提案\n\n正文。\n', 'utf8')
  }
}

/** feature 子 tab → 展开目标 feature 父行 → 文档行可见 */
async function revealFeatureDocRow(page: Page, docRel: string): Promise<void> {
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('features')).click()
  await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  const docRow = page.locator(ovDocRowOf(docRel)).first()
  if ((await docRow.isVisible().catch(() => false)) === false) {
    const slug = docRel.split('/')[2] ?? ''
    await page.locator(OV_PARENT_ANY, { hasText: slug }).first().click()
  }
  await expect(docRow, `feature 文档行在场（${docRel}）`).toBeVisible({ timeout: 30_000 })
}

test('@web-e2e @m2 文档浏览·冒烟：发现链列表 → 文档 tab 只读渲染 → mermaid 图 → 去重（Step1-3 全链）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-'))
  const wsDir = join(fixtureRoot, 'ws-doc')
  writeRepo(wsDir, {
    feature: 'db-feat',
    prdSpec: `---\ntitle: "浏览演示 PRD"\n---\n\n# PRD\n\n正文段——锚文本 DOC-PRD-BODY。\n\n${BAD_BLOCK}\n`,
    techDesign: `---\ntitle: "浏览演示设计"\n---\n\n# 技术设计\n\n正文段——锚文本 DOC-DESIGN-BODY。\n\n${ER_BLOCK}\n`,
    proposal: { slug: 'db-prop' },
  })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir, name: '文档浏览演示', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const designRel = 'docs/features/db-feat/design/tech-design.md'
    const prdRel = 'docs/features/db-feat/prd/prd-spec.md'

    // ── Step 1：真实发现链建行（feature 文档两类 + 提案一行）──
    const features = await forgeInvoke<readonly { slug: string; docCount: number }[]>(page, FEATURES_CHANNELS.list, { projectId })
    expect(features.find((f) => f.slug === 'db-feat')?.docCount, 'feature 文档统计 = 2（多类在场，含 design 类）').toBe(2)
    await revealFeatureDocRow(page, designRel)
    await expect(page.locator(ovDocRowOf(prdRel)).first(), '同 feature 另一类文档行在场').toBeVisible()

    // ── Step 2：点开 design 文档 → 独立文档 tab（docRel 去重）+ 只读渲染 + canonical 路径栏 ──
    await page.locator(ovDocRowOf(designRel)).first().click()
    const designPanel = page.locator(docPanelOf(projectId, designRel)).first()
    await expect(designPanel, '文档 tab 开出（docRel 去重键 = 地址）').toBeVisible({ timeout: 30_000 })
    await expect(designPanel.locator('[data-dswf-doc-body]'), '正文只读渲染（MarkdownDoc）').toContainText('DOC-DESIGN-BODY')
    const pathText = (await designPanel.locator('.dswf-doc-path').textContent()) ?? ''
    expect(pathText.toLowerCase().startsWith(wsDir.slice(0, 2).toLowerCase()), 'canonical 路径栏 = 绝对路径（盘符起）').toBe(true)
    expect(pathText.endsWith(join('docs', 'features', 'db-feat', 'design', 'tech-design.md')), 'canonical 路径栏逐字承载 rel_path 解析').toBe(true)

    // ── Step 3：mermaid 图渲染（erDiagram 验收锚——SVG 在场）──
    await expect(designPanel.locator(DOC_MERMAID_SVG).locator('svg'), 'erDiagram 渲染为图（SVG 在场——懒加载收敛）').toBeVisible({ timeout: 30_000 })
    await expect(designPanel.locator(DOC_MERMAID_FALLBACK), '合法源无回退卡').toHaveCount(0)

    // ── Step 2b（去重 + 并存）：第二文档另开新 tab；同地址重开 = reveal ──
    await revealFeatureDocRow(page, prdRel)
    await page.locator(ovDocRowOf(prdRel)).first().click()
    const prdPanel = page.locator(docPanelOf(projectId, prdRel)).first()
    await expect(prdPanel, '第二文档另开新 tab').toBeVisible({ timeout: 30_000 })
    const docTabs = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '.md' })
    await expect(docTabs, '两文档 tab 并存（multiple + 异地址各自成 tab）').toHaveCount(2)
    await revealFeatureDocRow(page, designRel)
    await page.locator(ovDocRowOf(designRel)).first().click()
    await expect(page.locator(docPanelOf(projectId, designRel)).first(), '同地址重开 = reveal 既有 tab（body 切回）').toBeVisible({ timeout: 30_000 })
    await expect(docTabs, 'reveal 不新增 tab（去重）').toHaveCount(2)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 文档浏览·悬空容错：占位面在场 + 不崩溃不写入不删行（SC-branch）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-dang-'))
  const wsDir = join(fixtureRoot, 'ws-dang')
  writeRepo(wsDir, { feature: 'dang-feat', techDesign: '---\ntitle: "悬空演示"\n---\n\n# 设计\n\n正文。\n' })
  const designPath = join(wsDir, 'docs', 'features', 'dang-feat', 'design', 'tech-design.md')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-dang-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir, name: '悬空容错演示', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const docRel = 'docs/features/dang-feat/design/tech-design.md'

    // 发现链建行先行（惰性首开单径——onRegistered 协作者缝在场未接线，建库归 ensureOpen
    // 首次 forge 域触达：record 5.summary §5.2 裁决）：文件在场时触达列举读面，索引行落库
    const beforeDelete = await forgeInvoke<readonly { slug: string; docCount: number }[]>(page, FEATURES_CHANNELS.list, { projectId })
    expect(beforeDelete.find((f) => f.slug === 'dang-feat')?.docCount, '删除前文档行已入索引（惰性首开触达）').toBe(1)

    // 分支切换模拟：文件移除（索引行在场、盘上缺席）
    rmSync(designPath)

    // 行稳定（悬空 ≠ 缺行）→ 打开 → 只读缺省渲染 + 悬空标注
    await revealFeatureDocRow(page, docRel)
    const panel = page.locator(docPanelOf(projectId, docRel)).first()
    await page.locator(ovDocRowOf(docRel)).first().click()
    await expect(panel, '悬空文档 tab 可开').toBeVisible({ timeout: 30_000 })
    await expect(panel, '悬空标记在场（panel 级属性——dangling 容错锚）').toHaveAttribute('data-dswf-doc-dangling', '')
    await expect(panel, '悬空标注文案').toContainText('文档引用悬空')
    await expect(panel.locator('.dswf-doc-path'), '路径栏保留（库内 rel_path 原值）').toBeVisible()

    // 不崩溃：renderer 零未捕获异常
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    // 不写入：文件不被重建（应用对悬空只读）
    expect(existsSync(designPath), '悬空文件不被重建（零写入）').toBe(false)
    // 不删行：feature 文档行仍在（读面）
    const features = await forgeInvoke<readonly { slug: string; docCount: number }[]>(page, FEATURES_CHANNELS.list, { projectId })
    expect(features.find((f) => f.slug === 'dang-feat')?.docCount, '悬空读后文档行仍在（行稳定）').toBe(1)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 文档浏览·非法 mermaid 源：回退占位卡（异常不外溢）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-bad-'))
  const wsDir = join(fixtureRoot, 'ws-bad')
  writeRepo(wsDir, {
    feature: 'bad-feat',
    prdSpec: `---\ntitle: "非法源演示"\n---\n\n# PRD\n\n正文段——锚文本 DOC-BAD-BODY。\n\n${BAD_BLOCK}\n`,
  })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-bad-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir, name: '非法源演示', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const docRel = 'docs/features/bad-feat/prd/prd-spec.md'

    await revealFeatureDocRow(page, docRel)
    await page.locator(ovDocRowOf(docRel)).first().click()
    const panel = page.locator(docPanelOf(projectId, docRel)).first()
    await expect(panel).toBeVisible({ timeout: 30_000 })

    // 回退占位卡：源码 + 回退注记（纯文本呈现）；文档其余部分照常渲染
    await expect(panel.locator(DOC_MERMAID_FALLBACK), '非法源 → 回退占位卡在场').toBeVisible({ timeout: 30_000 })
    await expect(panel.locator(DOC_MERMAID_FALLBACK), '回退注记文案').toContainText('回退')
    await expect(panel.locator(DOC_MERMAID_FALLBACK), '源码纯文本呈现（not <valid mermaid> 在卡内）').toContainText('valid mermaid')
    await expect(panel.locator(DOC_MERMAID_SVG), '非法源零 SVG').toHaveCount(0)
    await expect(panel.locator('[data-dswf-doc-body]'), '异常不外溢——文档其余部分照常渲染').toContainText('DOC-BAD-BODY')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 文档浏览·Step4 守卫面：入口在场 + 越界路径拒绝（ERR_DOC_PATH_INVALID）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-ext-'))
  const wsDir = join(fixtureRoot, 'ws-ext')
  writeRepo(wsDir, { feature: 'ext-feat', techDesign: '---\ntitle: "守卫演示"\n---\n\n# 设计\n\n正文。\n' })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-ext-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir, name: '守卫演示', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const docRel = 'docs/features/ext-feat/design/tech-design.md'

    // 文档 tab 开出 →「在编辑器中打开」入口在场（e2e 不真启外部编辑器——sc4 口径）
    await revealFeatureDocRow(page, docRel)
    await page.locator(ovDocRowOf(docRel)).first().click()
    const panel = page.locator(docPanelOf(projectId, docRel)).first()
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('button[aria-label="在编辑器中打开"]'), '在编辑器中打开入口在场').toBeVisible()

    // 守卫面（deep）：openExternal 越界路径（在册文档之外）→ 桥校验拒绝
    const rejection = await forgeInvoke(page, DOCS_CHANNELS.openExternal, { projectId, docRel: '../../../evil.md' }).then(
      () => 'unexpectedly-resolved',
      (cause: unknown) => String((cause as Error)?.message ?? cause),
    )
    expect(rejection, '越界路径拒绝（readDoc 路径守卫——resolve 后须 startsWith canonical(forge_dir))').toMatch(/ERR_DOC_PATH_INVALID|越界|失败/)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 文档浏览·零命中项目：提案/feature 子 tab 空态（一等展示非错误）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-zero-'))
  const wsDir = join(fixtureRoot, 'ws-zero')
  mkdirSync(wsDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-doc-zero-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir, name: '零命中演示', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id

    // 零命中（features 与 proposals 均无约定文件）——发现面扫描无任何行
    const proposals = await forgeInvoke<readonly { slug: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(proposals, '提案零行（零命中态）').toEqual([])
    const features = await forgeInvoke<readonly { slug: string }[]>(page, FEATURES_CHANNELS.list, { projectId })
    expect(features, 'feature 零行（零命中态）').toEqual([])

    // UI 面：提案子 tab 空态（EmptyState 一等展示，非错误条）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator('.dswf-ov-empty').first(), '提案子 tab 空态在场（一等展示）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-ov-error]').first(), '空态非错误（零错误条）').toHaveCount(0)
    // feature 子 tab 同构空态
    await page.locator(ovSubtabOf('features')).click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator('.dswf-ov-empty').first(), 'feature 子 tab 空态在场').toBeVisible({ timeout: 15_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
