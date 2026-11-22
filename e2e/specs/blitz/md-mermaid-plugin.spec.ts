// @proposal:md-mermaid-plugin @web-e2e
// blitz e2e 锚——官方 builtin md 预览 + DOM 增强单径五断言实跑（官方文件入口全径，零产品源码改动）。
//
// 打开动线（既有官方动线）：夹具工作区预置 4 份 md（erDiagram 合法源 / 非法源 / 纯文 /
// 超宽 LR 长链）→ RPC 注册项目 → composer 工作区芯片流开空白会话（绑定夹具工作区——files
// tab cwd 源；零模型往返零凭据依赖）→ 右栏 reveal → 官方 guide 入口卡「工作区文件」→
// files tab 点开文件行 → `dsh-resource://file/session/…` → 官方 text 文档 tab。
//
// Fact Table（产品现状，e2e/勘面口径）：
//   - 'dswf-md-mermaid' 预览扩展注册链已整体退役（本提案 AC7；client-plugin/plugin.test.ts
//     零注册 pin）——md 文件由官方 builtin Markdown 渲染器默认接管：容器
//     [data-document-preview=<内建 id>]，正文锚 [data-document-markdown]；
//   - mermaid 能力走 DOM 增强单径（plugins/md-mermaid ui enhancer——凡
//     .md-code-block 即扫描）：门控（head-words.ts 单源词表，mermaid@12.1.0 全 detector
//     重抽）+ parse 确认通过 → 旁插 figure[data-dswf-md-mermaid]
//     （内含 .dswf-doc-mermaid-canvas → svg）并隐藏原块（原块打
//     data-dswf-md-mermaid-enhanced 标记）；失败 / 门控不过 = 原官方代码块现状（安全降级，
//     原块内容保留可见、零 figure）；
//   - 超宽图：canvas overflow-x = auto（横滚机制）+ mermaid inline max-width 自适应收窄；
//   - 官方 files 面锚与文档预览 chrome 锚经 anchors.ts 单源（guideEntryOf/FILES_BODY/
//     FILES_FILE_ROW/DOCKKIT_STRIP_TAB/documentPreviewOf/DOC_PREVIEW_ANY/
//     DOC_BUILTIN_MARKDOWN[_ID]）。
//   - 双信号判决面（契约 J1-CT-02）：validateDocFences（@dsh-forge/markdown-kit host 校验
//     单源）——门控拒 fence 判 ok:false + unsupported:true（键在场），引擎败 fence 判
//     ok:false 且 unsupported 键缺席；DOM 黑盒面两分支同形不分辨（契约 §1 O2/O3 声明）。
//
// Hard Rules：零产品源码改动（断言失败 → 判定归属：实现缺陷回本提案语义、锚面缺陷本任务
// 修锚）；夹具 = 仓外 tmp（AGENTS.md 过程件纪律——零 git 面）；实跑前 tasklist 预检无活跃
// dsh-forge Electron 实例（单实例锁坑——m3 gate 先例）。
// 断言锚纪律：data-dswf-* 状态语义锚，不锁文案与 DOM 层级；每条断言标注来源契约条目 id。

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { revealRightbar } from '../../support/navigation.js'
import {
  DOC_BUILTIN_MARKDOWN,
  DOC_BUILTIN_MARKDOWN_ID,
  DOC_PREVIEW_ANY,
  DOCKKIT_STRIP_TAB,
  FILES_BODY,
  FILES_FILE_ROW,
  MD_MERMAID_ENHANCED_BLOCK,
  MD_MERMAID_FIGURE,
  documentPreviewOf,
  guideEntryOf,
} from '../../support/anchors.js'
// 双信号判决面单源（契约 §1 O2/O3 判据）：包 dist 经 pnpm build 产出（test-run 环境前置构建）
import { validateDocFences } from '../../../plugins/markdown-kit/dist/host/validate/index.js'

/** 合法 erDiagram 源文档（断言①——增强出图，单径判定面） */
const ER_DOC = [
  '# erDiagram 渲染演示',
  '',
  '正文段——锚文本 MMP-ER-BODY。',
  '',
  '```mermaid',
  'erDiagram',
  '    PROJECT ||--o{ FEATURE : has',
  '    FEATURE ||--o{ TASK : contains',
  '    TASK ||--o{ RECORD : logs',
  '```',
  '',
].join('\n')

/** 非法 mermaid 源文档（断言②——安全降级：原代码块内容保留、零 figure） */
const BAD_DOC = [
  '# 非法源降级',
  '',
  '正文段——锚文本 MMP-BAD-BODY。',
  '',
  '```mermaid',
  'this is :: not <valid mermaid> at all',
  '```',
  '',
].join('\n')

/** 纯文 md（断言③——零 mermaid 段：懒加载零触发，正文零退化） */
const PLAIN_DOC = [
  '# 纯文演示',
  '',
  '正文段——锚文本 MMP-PLAIN-BODY。',
  '',
  '- 列表项甲',
  '- 列表项乙',
  '',
].join('\n')

/** 超宽 LR 长链（断言④——固有宽必超容器的横滚判定面） */
const WIDE_DOC = [
  '```mermaid',
  'flowchart LR',
  '  ' + Array.from({ length: 14 }, (_, i) => `N${i}`).join(' --> '),
  '```',
  '',
].join('\n')

/**
 * 新图代表型三 fence（J1-G2/G3/G4，契约 O1 成功出图分支）：
 * venn-beta / c4dynamic / flowchart-elk——12.1.0 门控词表补齐代表样本。源均 parse+render
 * 双预校验（浏览器真机探针 task_logs/001-c4-render-probe：c4dynamic 必须声明 Rel 两端
 * shape——裸 Rel(a,b) parse 过但 render 抛 unknown shape，门控 parse 判据不判渲染合法性）。
 */
const NEW_TYPES_DOC = [
  '# 新图代表型出图',
  '',
  '正文段——锚文本 MMP-NEW-BODY。',
  '',
  '```mermaid',
  'venn-beta',
  'set A',
  'set B',
  'union A,B',
  '```',
  '',
  '```mermaid',
  'C4Dynamic',
  '  title 动态',
  '  System(a, "A")',
  '  System(b, "B")',
  '  Rel(a, b, "x")',
  '```',
  '',
  '```mermaid',
  'flowchart-elk LR',
  '  A --> B',
  '```',
  '',
].join('\n')

/**
 * 双信号混合页（J1-B1/B2/B3/B4，契约 O2/O3 + 双信号互斥判据）：
 * fence1 = flowchart + 非法源（门控放行、引擎 parse 败——O3 引擎败分支）；
 * fence2 = zenuml（12.1.0 已移除头词——O2 门控拒分支）；
 * fence3 = 合法 flowchart（同页对照面——降级逐 fence 判定非整页一刀切）。
 */
const MIXED_SIGNALS_DOC = [
  '# 门控拒与引擎败混合',
  '',
  '正文段——锚文本 MMP-MIX-BODY。',
  '',
  '```mermaid',
  'flowchart',
  'this is :: not <valid mermaid> at all',
  '```',
  '',
  '```mermaid',
  'zenuml',
  'alice -> bob: hi',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
  '',
].join('\n')

/**
 * 多 fence 混合页（J2 enhancer 单实例不变量，契约 O4 正向判据 INV-A/B/C/D）：
 * 存量图（erDiagram）+ 新图（venn-beta）+ 门控拒（zenuml）+ 引擎败（flowchart 非法源）
 * + 纯文段——四种终态同页共存。
 */
const SINGLE_INSTANCE_DOC = [
  '# 单实例不变量混合页',
  '',
  '正文段——锚文本 MMP-SI-BODY。',
  '',
  '```mermaid',
  'erDiagram',
  '    PROJECT ||--o{ FEATURE : has',
  '    FEATURE ||--o{ TASK : contains',
  '```',
  '',
  '```mermaid',
  'venn-beta',
  'set A',
  'set B',
  'union A,B',
  '```',
  '',
  '```mermaid',
  'zenuml',
  'alice -> bob: hi',
  '```',
  '',
  '```mermaid',
  'flowchart',
  'this is :: not <valid mermaid> at all',
  '```',
  '',
].join('\n')

/** 官方代码块卡（PR 稳定全局类 .md-code-block——零哈希类引用纪律允许面） */
const DOC_CODE_BLOCK = '.md-code-block'
/** 增强器画布（增强器 figure 内定值类——enhancer.ts CANVAS_SELECTOR 同源字面量） */
const MD_MERMAID_CANVAS = '.dswf-doc-mermaid-canvas'
/** figure 同源 hash 值属性（enhancer 打点——figure 值 = enhanced 标记值断言面） */
const FIGURE_VALUE_ATTR = 'data-dswf-md-mermaid'
const MARKER_VALUE_ATTR = 'data-dswf-md-mermaid-enhanced'

/** 夹具工作区（仓外 tmp——既有四份 md 置根目录，files tab 首层直达） */
function writeFixtureWorkspace(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mmp-'))
  const wsDir = join(fixtureRoot, 'mmp-demo')
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'er-demo.md'), ER_DOC, 'utf8')
  writeFileSync(join(wsDir, 'bad-mermaid.md'), BAD_DOC, 'utf8')
  writeFileSync(join(wsDir, 'plain-notes.md'), PLAIN_DOC, 'utf8')
  writeFileSync(join(wsDir, 'wide-lr.md'), WIDE_DOC, 'utf8')
  return fixtureRoot
}

/** 夹具工作区·增补轮（仓外 tmp——既有四份 + 新图/双信号/单实例三份，一 workspace 共用动线） */
function writeFixtureWorkspaceExtended(): string {
  const fixtureRoot = writeFixtureWorkspace()
  const wsDir = join(fixtureRoot, 'mmp-demo')
  writeFileSync(join(wsDir, 'new-types.md'), NEW_TYPES_DOC, 'utf8')
  writeFileSync(join(wsDir, 'mixed-signals.md'), MIXED_SIGNALS_DOC, 'utf8')
  writeFileSync(join(wsDir, 'single-instance.md'), SINGLE_INSTANCE_DOC, 'utf8')
  return fixtureRoot
}

/** 打开动线公共段：注册 → 芯片流空白会话 → 右栏 reveal → files 入口卡 → files body（含根校验） */
async function openFilesTab(page: import('@playwright/test').Page, wsDir: string): Promise<void> {
  await registerProject(page, wsDir, 'mmp-demo')
  await selectWorkspaceViaChip(page, 'mmp-demo')
  // 零凭据形态：空白会话开户可异步挂 API Key onboarding 模态（全屏 mask 拦指针——sw 同径收起）
  await ensureNoBlockingDialog(page)
  await revealRightbar(page)
  const filesCard = page.locator(guideEntryOf('files')).first()
  await expect(filesCard, '官方文件入口卡在场（guide 种子页「工作区文件」）').toBeVisible({ timeout: 30_000 })
  await filesCard.click()
  const filesBody = page.locator(FILES_BODY).first()
  await expect(filesBody, 'files tab body 挂载（guide 卡原位替换）').toBeVisible({ timeout: 30_000 })
  expect(
    (await filesBody.getAttribute('data-files-root'))?.toLowerCase(),
    'files 根 = 夹具工作区（会话 cwd 绑定）',
  ).toContain('mmp-demo')
}

/** O1 三件套断言（契约 §1 O1，INV-2 同源）：逐 fence figure(svg+canvas) + 原块 enhanced 隐藏 + 值同源 */
async function expectEnhancedTriples(preview: ReturnType<import('@playwright/test').Page['locator']>, fenceCount: number, label: string): Promise<void> {
  const figures = preview.locator(MD_MERMAID_FIGURE)
  await expect(figures, `[O1/${label}] figure 总数 = 合法 fence 数（${fenceCount}）`).toHaveCount(fenceCount)
  const enhanced = preview.locator(`${DOC_CODE_BLOCK}${MD_MERMAID_ENHANCED_BLOCK}`)
  await expect(enhanced, `[O1/${label}] enhanced 标记块总数 = ${fenceCount}`).toHaveCount(fenceCount)
  for (let i = 0; i < fenceCount; i++) {
    const figure = figures.nth(i)
    await expect(figure.locator('svg'), `[O1/${label}] fence#${i} SVG 在场（引擎渲染终点）`).toBeVisible({ timeout: 30_000 })
    await expect(figure.locator(MD_MERMAID_CANVAS), `[O1/${label}] fence#${i} 画布挂载`).toBeVisible()
  }
  await expect(enhanced.first(), `[O1/${label}] 原块打标记且隐藏（display:none）`).toBeHidden({ timeout: 30_000 })
  // figure 值 = enhanced 标记值（同源 hash——值相等断言，禁裸真值；契约 O1 判定面）
  const figureValues = await figures.evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr)), FIGURE_VALUE_ATTR)
  const markerValues = await enhanced.evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr)), MARKER_VALUE_ATTR)
  expect(figureValues.every((v) => typeof v === 'string' && v.length > 0), `[O1/${label}] figure 值逐个非空（禁裸真值面）`).toBe(true)
  expect(figureValues, `[O1/${label}] figure 值 = enhanced 标记值（同源 hash 逐位相等）`).toEqual(markerValues)
}

/**
 * files tab 点开文件行（官方文件入口唯一径）：strip 已有「文件」页签（非首开）= 先点回
 * 激活（非激活即卸载——官方语义）；行按文件名过滤（data-files-path 值含宿主分隔符不入选
 * ——hasText 命中行内文件名段）。点击后断言官方 text 文档 tab 开出。
 */
async function openFileFromFilesTab(page: import('@playwright/test').Page, fileName: string): Promise<void> {
  const filesStripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '文件' }).first()
  if ((await filesStripTab.isVisible().catch(() => false)) === true) {
    await filesStripTab.click()
  }
  const row = page.locator(FILES_FILE_ROW).filter({ hasText: fileName }).first()
  await expect(row, `文件行在场（${fileName}）`).toBeVisible({ timeout: 30_000 })
  await row.locator('button').click()
  await expect(page.locator(DOC_PREVIEW_ANY).first(), `官方文档 tab 开出（${fileName}）`).toBeVisible({ timeout: 30_000 })
}

test('@web-e2e @blitz md-mermaid DOM 增强单径五断言：builtin 接管+erDiagram SVG / 非法源安全降级 / 纯文零退化 / 超宽横滚 / 零 pageErrors', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = writeFixtureWorkspace()
  const wsDir = join(fixtureRoot, 'mmp-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mmp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── 打开动线：注册 → 芯片流空白会话（files tab cwd 源）→ 右栏 reveal → 官方文件入口 ──
    await openFilesTab(page, wsDir)

    // ── ① erDiagram md → builtin 预览默认接管 + 增强出图（SVG 在场、原块隐藏、零降级残留）──
    await openFileFromFilesTab(page, 'er-demo.md')
    const erPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(erPreview, 'builtin Markdown 渲染器默认接管（扩展链退役——AC7 口径）').toBeVisible({ timeout: 30_000 })
    expect(
      await erPreview.getAttribute('data-textpreview-url'),
      '地址 = dsh-resource://file/session/…（官方文件引用径）',
    ).toContain('dsh-resource://file/session/')
    await expect(erPreview.locator(DOC_BUILTIN_MARKDOWN), '内建正文锚在场').toBeVisible({ timeout: 30_000 })
    const erFigure = erPreview.locator(MD_MERMAID_FIGURE).first()
    await expect(erFigure.locator('svg'), 'erDiagram 增强：SVG 在场（DOM 增强单径）').toBeVisible({ timeout: 30_000 })
    await expect(erFigure.locator(MD_MERMAID_CANVAS), 'figure 内画布挂载').toBeVisible()
    await expect(
      erPreview.locator(`${DOC_CODE_BLOCK}${MD_MERMAID_ENHANCED_BLOCK}`),
      '原代码块已增强并隐藏（标记 + display:none）',
    ).toBeHidden({ timeout: 30_000 })
    await expect(erPreview.locator(DOC_BUILTIN_MARKDOWN), '正文零退化').toContainText('MMP-ER-BODY')

    // ── ② 非法源 → 安全降级：原 .md-code-block 内容保留可见、零 figure、tab 不炸 ──
    await openFileFromFilesTab(page, 'bad-mermaid.md')
    const badPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(badPreview, '非法源仍走 builtin 预览').toBeVisible({ timeout: 30_000 })
    const badBlock = badPreview.locator(DOC_CODE_BLOCK).first()
    await expect(badBlock, '非法源安全降级：原代码块保留可见（不隐藏）').toBeVisible({ timeout: 30_000 })
    await expect(badBlock, '源码内容保留（not <valid mermaid> 逐字在场）').toContainText('valid mermaid')
    await expect(badPreview.locator(MD_MERMAID_FIGURE), '非法源零增强 figure').toHaveCount(0)
    await expect(badPreview.locator(MD_MERMAID_ENHANCED_BLOCK), '非法源零增强标记').toHaveCount(0)
    await expect(badPreview.locator(DOC_BUILTIN_MARKDOWN), '异常不外溢——正文其余部分照常渲染').toContainText('MMP-BAD-BODY')

    // ── ③ 纯文 md → 正文零退化、零增强痕迹（懒加载零触发面）──
    await openFileFromFilesTab(page, 'plain-notes.md')
    const plainPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(plainPreview, '纯文 md 走 builtin 预览').toBeVisible({ timeout: 30_000 })
    await expect(plainPreview.locator(DOC_BUILTIN_MARKDOWN), '正文按官方 MarkdownText 呈现（零退化）').toContainText('MMP-PLAIN-BODY')
    await expect(plainPreview.locator(MD_MERMAID_FIGURE), '零 mermaid 段零 figure').toHaveCount(0)
    await expect(plainPreview.locator(MD_MERMAID_ENHANCED_BLOCK), '零 mermaid 段零增强标记').toHaveCount(0)

    // ── ④ 超宽 LR 图 → 横滚机制在场（canvas overflow-x:auto + svg 自适应收窄 ≤ 容器宽）──
    await openFileFromFilesTab(page, 'wide-lr.md')
    const widePreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    const wideFigure = widePreview.locator(MD_MERMAID_FIGURE).first()
    await expect(wideFigure.locator('svg'), '超宽图 SVG 在场').toBeVisible({ timeout: 30_000 })
    const wide = await wideFigure
      .locator(MD_MERMAID_CANVAS)
      .first()
      .evaluate((canvas: HTMLElement) => ({
        overflowX: getComputedStyle(canvas).overflowX,
        canvasClientWidth: canvas.clientWidth,
        canvasScrollWidth: canvas.scrollWidth,
        svgBoundingWidth: (canvas.querySelector('svg') as SVGElement | null)?.getBoundingClientRect().width ?? -1,
      }))
    expect(wide.overflowX, '④ 画布 overflow-x = auto（超宽横滚机制在场）').toBe('auto')
    expect(wide.svgBoundingWidth, '④ svg 盒 ≤ 容器宽（自适应收窄，零破版式）').toBeLessThanOrEqual(wide.canvasClientWidth + 1)

    // ── ⑤ 全程 pageErrors 空（增强器单块降级异常不外溢的总证面）──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @blitz md-mermaid 新图门控抽样出图：venn-beta/c4dynamic/flowchart-elk 三件套出图 + 正文零退化 + 零 pageErrors', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = writeFixtureWorkspaceExtended()
  const wsDir = join(fixtureRoot, 'mmp-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mmp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await openFilesTab(page, wsDir)

    // ── J1-G1 打开 new-types.md：builtin 预览接管 ──
    await openFileFromFilesTab(page, 'new-types.md')
    const newPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(newPreview, '[J1-G1] builtin Markdown 渲染器默认接管').toBeVisible({ timeout: 30_000 })
    await expect(newPreview.locator(DOC_BUILTIN_MARKDOWN), '[J1-G1] 内建正文锚在场').toBeVisible({ timeout: 30_000 })

    // ── J1-G2/G3/G4（契约 O1）：三代表 fence 三件套同现 + 值同源 ──
    await expectEnhancedTriples(newPreview, 3, 'new-types')

    // ── J1-G5：正文其余部分零退化 + 零 pageErrors（INV-3 失败不外溢）──
    await expect(newPreview.locator(DOC_BUILTIN_MARKDOWN), '[J1-G5] 正文零退化').toContainText('MMP-NEW-BODY')
    expect(pageErrors, `[J1-G5] renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @blitz md-mermaid 双信号混合页：门控拒/引擎败 DOM 同形安全降级 + validateDocFences 判决面双信号互斥 + 同页对照面出图', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = writeFixtureWorkspaceExtended()
  const wsDir = join(fixtureRoot, 'mmp-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mmp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── 双信号判决面先行（契约 §1 O2/O3 互斥判据——J1-B3/J1-CT-02，不依赖宿主运行）：
    // zenuml fence 判 ok:false + unsupported:true（门控拒信号，键在场）；flowchart 非法源
    // fence 判 ok:false 且 unsupported 键缺席（引擎败信号）；对照面判 ok:true。──
    const doc = await validateDocFences(MIXED_SIGNALS_DOC)
    expect(doc.fences, '[J1-B3] 混合页恰 3 枚 fence 判决').toHaveLength(3)
    expect(doc.fences[0], '[J1-B3/O3] flowchart 非法源 = 引擎败：ok:false 且 unsupported 键缺席（键缺席是判别性证据）').toEqual(
      expect.objectContaining({ ok: false, format: 'mermaid' }),
    )
    expect('unsupported' in doc.fences[0], '[J1-B3/O3] 引擎败 fence unsupported 键缺席').toBe(false)
    expect(doc.fences[0]?.message, '[J1-B3/O3] 引擎败 message 承载引擎判决').toContain('Parse error')
    expect(doc.fences[1], '[J1-B3/O2] zenuml = 门控拒：ok:false + unsupported:true（键在场）+ 消息含头词').toEqual({
      line: expect.any(Number),
      format: 'zenuml',
      ok: false,
      unsupported: true,
      message: expect.stringContaining('zenuml'),
    })
    expect(doc.fences[2], '[J1-B4] 对照面合法 flowchart = ok:true（O1）').toEqual({
      line: expect.any(Number),
      format: 'mermaid',
      ok: true,
    })

    // ── 打开动线 → J1-B1/B2 DOM 黑盒面：门控拒与引擎败同形安全降级 ──
    await openFilesTab(page, wsDir)
    await openFileFromFilesTab(page, 'mixed-signals.md')
    const mixPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(mixPreview, '[J1-B1] builtin Markdown 渲染器默认接管').toBeVisible({ timeout: 30_000 })

    // 降级块（引擎败 fence1 + 门控拒 fence2）：原块保留可见、内容逐字在场（O2/O3 DOM 同形——
    // 契约声明 DOM 面不承担双信号分辨，分辨判据唯一落在上方 validateDocFences 判决面）
    const engineFailBlock = mixPreview.locator(DOC_CODE_BLOCK).filter({ hasText: 'not <valid mermaid>' }).first()
    await expect(engineFailBlock, '[J1-B2/O3] 引擎败 fence 原块保留可见').toBeVisible({ timeout: 30_000 })
    const gateRejectBlock = mixPreview.locator(DOC_CODE_BLOCK).filter({ hasText: 'zenuml' }).first()
    await expect(gateRejectBlock, '[J1-B1/O2] 门控拒 fence 原块保留可见').toBeVisible({ timeout: 30_000 })
    await expect(gateRejectBlock, '[J1-B1/O2] 门控拒 fence 内容逐字在场（alice -> bob）').toContainText('alice -> bob')

    // 降级零痕迹 + 对照面出图守恒：figure/enhanced 总数恰 1（仅 fence3）[J1-B4 对照面 + O2/O3 零 figure]
    await expect(mixPreview.locator(MD_MERMAID_FIGURE), '[J1-B4] figure 总数 = 1（仅合法对照 fence 出图）').toHaveCount(1)
    await expect(mixPreview.locator(`${DOC_CODE_BLOCK}${MD_MERMAID_ENHANCED_BLOCK}`), '[J1-B4] enhanced 标记总数 = 1').toHaveCount(1)
    const mixFigure = mixPreview.locator(MD_MERMAID_FIGURE).first()
    await expect(mixFigure.locator('svg'), '[J1-B4/O1] 对照面 SVG 在场').toBeVisible({ timeout: 30_000 })
    const mixFigureValue = await mixFigure.getAttribute(FIGURE_VALUE_ATTR)
    const mixMarkerValue = await mixPreview.locator(`${DOC_CODE_BLOCK}${MD_MERMAID_ENHANCED_BLOCK}`).first().getAttribute(MARKER_VALUE_ATTR)
    expect(mixFigureValue, '[J1-B4/O1] 对照面 figure 值非空').toBeTruthy()
    expect(mixFigureValue, '[J1-B4/O1] 对照面 figure 值 = 标记值（同源 hash）').toBe(mixMarkerValue)
    await expect(mixPreview.locator(DOC_BUILTIN_MARKDOWN), '[INV-3] 正文零退化').toContainText('MMP-MIX-BODY')
    expect(pageErrors, `[INV-3/J1-B5] renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @blitz md-mermaid enhancer 单实例不变量：多 fence 混合页四终态逐 fence 恰一份 + 重建复扫零增殖 + 零 pageErrors', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = writeFixtureWorkspaceExtended()
  const wsDir = join(fixtureRoot, 'mmp-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mmp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await openFilesTab(page, wsDir)

    /** INV-A/B/C/D 复核（J2-G2~G5）：合法 fence 恰一份接管 + 降级块零痕迹 + 总数守恒 */
    async function expectSingleInstanceInvariants(label: string): Promise<void> {
      const preview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
      // INV-A 接管恰一份：figure 总数 = 2（erDiagram + venn-beta），enhanced 标记总数 = 2
      await expect(preview.locator(MD_MERMAID_FIGURE), `[INV-A/${label}] figure 总数 = 2（恰等合法 fence 数——多即双挂载证）`).toHaveCount(2)
      const enhanced = preview.locator(`${DOC_CODE_BLOCK}${MD_MERMAID_ENHANCED_BLOCK}`)
      await expect(enhanced, `[INV-A/${label}] enhanced 标记总数 = 2（恰一份接管）`).toHaveCount(2)
      await expect(preview.locator(DOC_CODE_BLOCK), `[INV-C/${label}] 代码块总数 = 4（零吞块）`).toHaveCount(4)
      // 逐 fence 值同源配对（INV-A 三件套判据——figure 值 = 标记值，逐位相等非裸真值）
      const figureValues = await preview.locator(MD_MERMAID_FIGURE).evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr)), FIGURE_VALUE_ATTR)
      const markerValues = await enhanced.evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr)), MARKER_VALUE_ATTR)
      expect(figureValues.every((v) => typeof v === 'string' && v.length > 0), `[INV-A/${label}] figure 值逐个非空`).toBe(true)
      expect(figureValues, `[INV-A/${label}] figure 值 = 标记值（同源 hash 逐位配对）`).toEqual(markerValues)
      // INV-C 降级块零痕迹：两枚降级原块保留可见（门控拒 zenuml / 引擎败 flowchart 非法源）
      const gateRejectBlock = preview.locator(DOC_CODE_BLOCK).filter({ hasText: 'zenuml' }).first()
      await expect(gateRejectBlock, `[INV-C/${label}] 门控拒块保留可见`).toBeVisible({ timeout: 30_000 })
      const engineFailBlock = preview.locator(DOC_CODE_BLOCK).filter({ hasText: 'not <valid mermaid>' }).first()
      await expect(engineFailBlock, `[INV-C/${label}] 引擎败块保留可见`).toBeVisible({ timeout: 30_000 })
      // 出图终点锚：figure 内 svg 在场（两枚）
      for (let i = 0; i < 2; i++) {
        const kind = i === 0 ? '存量图' : '新图'
        await expect(preview.locator(MD_MERMAID_FIGURE).nth(i).locator('svg'), `[INV-A/${label}] ${kind} figure SVG 在场`).toBeVisible({ timeout: 30_000 })
      }
      // INV-D 零 pageErrors
      expect(pageErrors, `[INV-D/${label}] renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    }

    // ── J2-G1 打开混合页：builtin 预览接管 + 一次交互后效 ──
    await openFileFromFilesTab(page, 'single-instance.md')
    const siPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(siPreview, '[J2-G1] builtin Markdown 渲染器默认接管').toBeVisible({ timeout: 30_000 })
    await expect(siPreview.locator(DOC_BUILTIN_MARKDOWN), '[J2-G1] 内建正文锚在场').toBeVisible({ timeout: 30_000 })

    // ── J2-G2~G5 首开复核（INV-B 一次交互恰一次后效）──
    await expectSingleInstanceInvariants('首开')
    await expect(siPreview.locator(DOC_BUILTIN_MARKDOWN), '[INV-3] 正文零退化').toContainText('MMP-SI-BODY')

    // ── J2-B2 跨文档切换 + 重建复扫（非激活即卸载→回切重建重渲）：INV-A/B/C/D 全部复立、
    // 无叠插无跨文档残留——双实例必然计数翻倍，此处恰一即单实例分辨面 ──
    await openFileFromFilesTab(page, 'plain-notes.md')
    const plainPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(plainPreview.locator(DOC_BUILTIN_MARKDOWN), '[J2-B2] 第二文档正文正常渲染').toContainText('MMP-PLAIN-BODY', { timeout: 30_000 })
    await openFileFromFilesTab(page, 'single-instance.md')
    await expectSingleInstanceInvariants('重建复扫')
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
