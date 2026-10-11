// @proposal:md-preview-mermaid @web-e2e
// blitz 1.2 e2e 锚——md 预览扩展渲染器四断言实跑（官方文件入口全径，零产品源码改动）。
//
// 打开动线（与「会话内文件引用」同径 `dsh-resource://file/session/…`，同一 documentpreview
// 管线）：夹具工作区预置 3 份 md（erDiagram 正常源 / 非法源 / 纯文无 mermaid）→ RPC 注册
// 项目 → composer 工作区芯片流开空白会话（绑定夹具工作区——files tab cwd 源；零模型往返
// 零凭据依赖，sw Step2b 同径）→ 右栏 reveal → 官方 guide 入口卡「工作区文件」→ files tab
// 点开文件行 → `dsh-resource://file/session/…` → 官方 text 文档 tab → TextPreview chrome +
// keyed 'dswf-md-mermaid' 扩展 body（extension 带默认选中）。
//
// Fact Table（上游 0.2.0-rc.2 client.js 源码核实，e2e/勘面口径）：
//   - 官方 files 面（ui-sidebar-files）：guide 卡 [data-sidebar-right-guide-entry="files"]
//     （onPick = openTab('files', {replaceTab:true})——guide 页签原位替换）；body 根
//     [data-files-root]（值 = 会话 cwd）；文件行 li[data-files-entry="file"]
//     [data-files-path=<绝对路径>] > button（点击 = openResource(fileAddressFor(...))——
//     root 下绝对路径归一为 session 相对地址 → text kind canOpen(scope=session) 放行）；
//   - 官方文档预览 chrome（ui-sidebar-documentpreview TextPreview）：容器
//     div[data-document-preview=<选中渲染器id>][data-textpreview-url=<地址>]；渲染器下拉钮
//     [data-document-viewer-menu]（aria=打开方式；候选 >1 才渲染；菜单行 = 官方 Menu portal
//     `[role="menu"] button[role="menuitem"]`）；换行钮 [data-textpreview-tool="wrap"]
//     （aria-pressed = 偏好态；选中渲染器声明 wrap=true 才渲染——1.3 起扩展注册 wrap:false
//     对齐内建 md[官方 markdownDefinition 同值]，文档级钮两径均不出；块级 wrap 需求 =
//     代码块 CodeToolbar 块内承接[预览径 labels 递达 code.toolbarLabels]）；
//   - 渲染器候选序（registry rank）：extension 带 > builtin（.md → dswf-md-mermaid 首位、
//     内建 Markdown 次位）；md 非 binary → 官方恒追加「纯文本」fallback 候选（官方 owner
//     语义）——本套件断言「含产品渲染器与内建 Markdown 两项」，不锁官方第三项数量；
//   - 内建 Markdown body 锚 [data-document-markdown]（id =
//     @deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown——mermaid fence 按官方
//     代码块原样呈现）；扩展 body 根 [data-dswf-md-preview-body]（md 段经产品 MarkdownDoc →
//     data-dswf-markdown="body"；mermaid 段经 MermaidDiagram 懒加载/strict/失败回退全既有）。
//
// Hard Rules：零产品源码改动（断言失败 → 判定归属：实现缺陷回 1.1 语义、锚面缺陷本任务
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
  DOC_MERMAID_FALLBACK,
  DOC_MERMAID_SVG,
  DOC_PREVIEW_ANY,
  DOC_VIEWER_MENU,
  DOC_VIEWER_MENU_ITEM,
  DOC_WRAP_TOOL,
  DOCKKIT_STRIP_TAB,
  FILES_BODY,
  FILES_FILE_ROW,
  MD_DOC_BODY,
  MD_MERMAID_RENDERER_ID,
  MD_PREVIEW_BODY,
  documentPreviewOf,
  guideEntryOf,
} from '../../support/anchors.js'

/** 合法 erDiagram 源文档（验收锚①——SC4 同源内容形态，仓外 files 径） */
const ER_DOC = [
  '# erDiagram 渲染演示',
  '',
  '正文段（扩展渲染器 MarkdownDoc 渲染）——锚文本 MDP-ER-BODY。',
  '',
  '```mermaid',
  'erDiagram',
  '    PROJECT ||--o{ FEATURE : has',
  '    FEATURE ||--o{ TASK : contains',
  '    TASK ||--o{ RECORD : logs',
  '```',
  '',
].join('\n')

/** 非法 mermaid 源文档（验收锚②——渲染失败回退占位卡，异常不外溢） */
const BAD_DOC = [
  '# 非法源回退',
  '',
  '正文段——锚文本 MDP-BAD-BODY。',
  '',
  '```mermaid',
  'this is :: not <valid mermaid> at all',
  '```',
  '',
].join('\n')

/** 纯文 md（验收锚③——零 mermaid 段：懒加载零触发，正文零退化；普通 ts fence = 代码块
 * CodeToolbar 在场锚[wrap:false 后文档级 wrap 钮退役的替代观察面]） */
const PLAIN_DOC = [
  '# 纯文演示',
  '',
  '正文段——锚文本 MDP-PLAIN-BODY。',
  '',
  '- 列表项甲',
  '- 列表项乙',
  '',
  '```ts',
  'const mdp = 1',
  '```',
  '',
].join('\n')

/** 官方代码块卡（PR 稳定全局类 .md-code-block——零哈希类引用纪律允许面） */
const DOC_CODE_BLOCK = '.md-code-block'
/** 代码块 CodeToolbar 横幅（PR 稳定 data 锚——toolbarLabels 递达 = CodeToolbar 臂） */
const DOC_CODE_TOOLBAR = '.md-code-block [data-code-block-banner]'
/** 代码块块级 wrap 钮（CodeToolbar 动作行——aria-label = toolbarLabels.wrapLabel 中文文案） */
const DOC_CODE_TOOLBAR_WRAP = '.md-code-block [data-code-block-banner] button[aria-label="换行"]'

/** 夹具工作区（仓外 tmp——3 份 md 置根目录，files tab 首层直达） */
function writeFixtureWorkspace(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mdp-'))
  const wsDir = join(fixtureRoot, 'mdp-demo')
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'er-demo.md'), ER_DOC, 'utf8')
  writeFileSync(join(wsDir, 'bad-mermaid.md'), BAD_DOC, 'utf8')
  writeFileSync(join(wsDir, 'plain-notes.md'), PLAIN_DOC, 'utf8')
  return fixtureRoot
}

/**
 * files tab 点开文件行（官方文件入口唯一径）：strip 已有「文件」页签（非首开）= 先点回
 * 激活（keyed body 非激活即卸载——官方语义）；行按文件名过滤（data-files-path 值含宿主
 * 分隔符不入选——hasText 命中行内文件名段）。点击后断言官方 text 文档 tab 开出。
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

test('@web-e2e @blitz md 预览扩展渲染器·官方文件入口四断言：erDiagram SVG / 非法源回退 / 纯文零退化+wrap:false 口径 / 下拉切回内建', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = writeFixtureWorkspace()
  const wsDir = join(fixtureRoot, 'mdp-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mdp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── 打开动线：注册 → 芯片流空白会话（files tab cwd 源）→ 右栏 reveal → 官方文件入口 ──
    await registerProject(page, wsDir, 'mdp-demo')
    await selectWorkspaceViaChip(page, 'mdp-demo')
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
    ).toContain('mdp-demo')

    // ── ① erDiagram md → SVG 在场（验收锚①：extension 带默认选中 + 会话文件引用同径）──
    await openFileFromFilesTab(page, 'er-demo.md')
    const erPreview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    await expect(erPreview, '扩展渲染器接管（extension 带默认选中——官方下拉首位）').toBeVisible({ timeout: 30_000 })
    expect(
      await erPreview.getAttribute('data-textpreview-url'),
      '地址 = dsh-resource://file/session/…（与「会话内文件引用」同径）',
    ).toContain('dsh-resource://file/session/')
    await expect(erPreview.locator(DOC_MERMAID_SVG).locator('svg'), 'erDiagram 渲染：SVG 在场（验收锚①）').toBeVisible({ timeout: 30_000 })
    await expect(erPreview.locator(DOC_MERMAID_FALLBACK), '合法源零回退卡').toHaveCount(0)

    // ── ② 非法源 → 回退占位卡在场，tab 不炸（验收锚②）──
    await openFileFromFilesTab(page, 'bad-mermaid.md')
    const badPreview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    await expect(badPreview, '非法源仍走扩展渲染器').toBeVisible({ timeout: 30_000 })
    await expect(badPreview.locator(DOC_MERMAID_FALLBACK), '非法源 → 回退占位卡在场（验收锚②）').toBeVisible({ timeout: 30_000 })
    await expect(badPreview.locator(DOC_MERMAID_FALLBACK), '回退注记文案').toContainText('回退')
    await expect(badPreview.locator(DOC_MERMAID_FALLBACK), '源码纯文本呈现（not <valid mermaid> 在卡内）').toContainText('valid mermaid')
    await expect(badPreview.locator(DOC_MERMAID_SVG), '非法源零 SVG').toHaveCount(0)
    // 异常不外溢：文档其余部分照常渲染（md 段经产品 MarkdownDoc）
    await expect(badPreview.locator(MD_DOC_BODY), '异常不外溢——正文其余部分照常渲染').toContainText('MDP-BAD-BODY')

    // ── ③ 纯文 md → 正文零退化 + wrap:false 口径（文档级钮退役 + 代码块 CodeToolbar 替代锚）──
    await openFileFromFilesTab(page, 'plain-notes.md')
    const plainPreview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    await expect(plainPreview, '纯文 md 同走扩展渲染器').toBeVisible({ timeout: 30_000 })
    await expect(plainPreview.locator(MD_DOC_BODY), '正文按官方 MarkdownText 呈现（零退化）').toContainText('MDP-PLAIN-BODY')
    await expect(plainPreview.locator(DOC_MERMAID_SVG), '零 mermaid 段零 SVG（懒加载零触发面）').toHaveCount(0)
    await expect(plainPreview.locator(DOC_MERMAID_FALLBACK), '零 mermaid 段零回退卡').toHaveCount(0)
    await expect(plainPreview.locator(DOC_WRAP_TOOL), '文档级 wrap 钮退役（1.3 wrap:false 对齐内建 md——官方 L1626）').toHaveCount(0)
    await expect(plainPreview.locator(DOC_CODE_BLOCK), '普通代码 fence 升级官方代码块卡（labels 递达面）').toBeVisible()
    await expect(plainPreview.locator(DOC_CODE_TOOLBAR), '代码块 CodeToolbar 在场（块级 wrap 承接面）').toBeVisible()
    await expect(
      plainPreview.locator(DOC_CODE_TOOLBAR_WRAP),
      '块级 wrap 钮在场（toolbarLabels.wrapLabel 中文文案——文档级钮退役的替代锚）',
    ).toBeVisible()
    await expect(plainPreview.locator('[data-textpreview-body]'), '共享滚动体 overflow:auto（1.3 滚动根因收口探针锚）').toHaveCSS(
      'overflow',
      'auto',
    )

    // ── ④ 渲染器下拉含产品渲染器与内建 Markdown；切回内建 → mermaid 段呈代码块文本（验收锚④）──
    await openFileFromFilesTab(page, 'er-demo.md')
    const erPreview2 = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    await expect(erPreview2, 'er 文档 tab 重开（单 text 页 retarget）').toBeVisible({ timeout: 30_000 })
    await erPreview2.locator(DOC_VIEWER_MENU).click()
    const menuItems = page.locator(DOC_VIEWER_MENU_ITEM)
    await expect(menuItems.filter({ hasText: 'Markdown（mermaid）' }), '下拉含产品渲染器项').toHaveCount(1)
    await expect(menuItems.filter({ hasText: /^Markdown$/ }), '下拉含内建 Markdown 项').toHaveCount(1)
    // 官方第三候选「纯文本」fallback 在场与否属官方 owner 语义——不锁数量（文件头 Fact Table）
    await menuItems.filter({ hasText: /^Markdown$/ }).click()
    const builtinPreview = page.locator(documentPreviewOf(DOC_BUILTIN_MARKDOWN_ID)).first()
    await expect(builtinPreview, '切回内建 Markdown（选择态官方自持）').toBeVisible({ timeout: 30_000 })
    await expect(
      builtinPreview.locator(DOC_VIEWER_MENU),
      '触发钮呈内建 label（选择保持证据面）',
    ).toHaveText(/^Markdown$/, { timeout: 30_000 })
    await expect(builtinPreview.locator(DOC_BUILTIN_MARKDOWN), '内建正文锚在场').toBeVisible({ timeout: 30_000 })
    await expect(
      builtinPreview.locator(DOC_BUILTIN_MARKDOWN),
      'mermaid 段呈代码块文本（erDiagram 源逐字在场——零渲染）',
    ).toContainText('PROJECT ||--o{ FEATURE')
    await expect(builtinPreview.locator(MD_PREVIEW_BODY), '扩展 body 退役').toHaveCount(0)
    await expect(builtinPreview.locator(DOC_MERMAID_SVG), '内建期零 SVG').toHaveCount(0)
    await expect(builtinPreview.locator(DOC_MERMAID_FALLBACK), '内建期零回退卡').toHaveCount(0)

    // tab 不炸总证：renderer 未捕获异常面全空（四断言全径零外溢）
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
