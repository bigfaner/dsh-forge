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
//   - mermaid 能力走 DOM 增强单径（packages/plugins/md-mermaid ./web enhancer——凡
//     .md-code-block 即扫描）：门控 + parse 确认通过 → 旁插 figure[data-dswf-md-mermaid]
//     （内含 .dswf-doc-mermaid-canvas → svg）并隐藏原块（原块打
//     data-dswf-md-mermaid-enhanced 标记）；失败 / 门控不过 = 原官方代码块现状（安全降级，
//     原块内容保留可见、零 figure）；
//   - 超宽图：canvas overflow-x = auto（横滚机制）+ mermaid inline max-width 自适应收窄；
//   - 官方 files 面锚与文档预览 chrome 锚经 anchors.ts 单源（guideEntryOf/FILES_BODY/
//     FILES_FILE_ROW/DOCKKIT_STRIP_TAB/documentPreviewOf/DOC_PREVIEW_ANY/
//     DOC_BUILTIN_MARKDOWN[_ID]）。
//
// Hard Rules：零产品源码改动（断言失败 → 判定归属：实现缺陷回本提案语义、锚面缺陷本任务
// 修锚）；夹具 = 仓外 tmp（AGENTS.md 过程件纪律——零 git 面）；实跑前 tasklist 预检无活跃
// dsh-forge Electron 实例（单实例锁坑——m3 gate 先例）。

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

/** 官方代码块卡（PR 稳定全局类 .md-code-block——零哈希类引用纪律允许面） */
const DOC_CODE_BLOCK = '.md-code-block'
/** 增强器画布（增强器 figure 内定值类——enhancer.ts CANVAS_SELECTOR 同源字面量） */
const MD_MERMAID_CANVAS = '.dswf-doc-mermaid-canvas'

/** 夹具工作区（仓外 tmp——4 份 md 置根目录，files tab 首层直达） */
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
