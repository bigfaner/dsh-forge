// @web-e2e @probe
// 1.8 实机探针（过程件——不进 git，跑毕迁 .forge/docs/proposals/md-preview-mermaid/walkthrough/，
// AGENTS.md 过程件纪律）：方案 A 主题化实机证据——
//   ① 主题化落 SVG：节点 fill = concrete 中性灰（khroma 派生链 mainBkg/nodeBkg）、文字 fill
//      = #0f1115 派生、线条 stroke = var(--dsw-alias-border-l3) 解析值（显示面 var() 解析实证）；
//   ② 字体/字号 var() 解析：svg text computed font-family = 官方栈（--dsw-font-family）、
//      font-size = 14px（--dsw-font-s-14-font-size）；
//   ③ 透明背景 + 内联呈现：svg/canvas computed background 透明 + 渲染态零标题条（figcaption=0）；
//   ④ 自适应宽度：超宽图 svg 盒 ≤ 容器宽（mermaid inline max-width 自适应收窄 + 样式表
//      max-width:100% 兜底）、canvas overflow-x = auto（超宽横滚机制保持）、常规图居中；
//   ⑤ 回退占位卡形制保留（非法源 → fallback 卡 + 回退注记在场——失败语义不降级）。
// 零产品源码改动；夹具 = 仓外 tmp。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { revealRightbar } from '../../support/navigation.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  DOCKKIT_STRIP_TAB,
  FILES_BODY,
  FILES_FILE_ROW,
  DOC_PREVIEW_ANY,
  DOC_MERMAID_SVG,
  DOC_MERMAID_FALLBACK,
  MD_MERMAID_RENDERER_ID,
  documentPreviewOf,
  guideEntryOf,
} from '../../support/anchors.js'

const WALKTHROUGH = join('.forge', 'docs', 'proposals', 'md-preview-mermaid', 'walkthrough')

/** 主题化探针文档（erDiagram 验收锚 + 常规 flowchart） */
const THEME_DOC = ['```mermaid', 'flowchart TD', '  A[探针节点] --> B[第二节点]', '  B --> C{判定}', '```', ''].join('\n')

/** 超宽文档（LR 长链——固有宽必超容器，自适应收窄判定面） */
const WIDE_DOC = [
  '```mermaid',
  'flowchart LR',
  '  ' + Array.from({ length: 14 }, (_, i) => `N${i}`).join(' --> '),
  '```',
  '',
].join('\n')

/** 非法 mermaid 源文档（⑤ 回退占位卡判定面） */
const BAD_DOC = ['```mermaid', 'this is :: not <valid mermaid> at all', '```', ''].join('\n')

interface SvgProbe {
  maxWidth: string
  boundingWidth: number
  containerWidth: number
  canvasOverflowX: string
  canvasClientWidth: number
  canvasScrollWidth: number
  svgBackground: string
  canvasBackground: string
  figureCaptionCount: number
}

test('@web-e2e @probe mermaid 方案 A 主题化 1.8 实机探针：concrete/var() 解析 + 透明背景 + 内联无头 + 自适应 + 回退卡', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-probe-mermaid-'))
  const wsDir = join(fixtureRoot, 'mermaid-theme-probe')
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'theme.md'), THEME_DOC, 'utf8')
  writeFileSync(join(wsDir, 'wide.md'), WIDE_DOC, 'utf8')
  writeFileSync(join(wsDir, 'bad.md'), BAD_DOC, 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-probe-mermaid-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  const result: Record<string, unknown> = { at: new Date().toISOString(), checks: {} as Record<string, unknown> }
  const checks = result.checks as Record<string, unknown>

  const openDoc = async (name: string): Promise<void> => {
    // 文件列表 tab 在文档 tab 打开后退居背景（行卸载）——先回文件 tab 再找行
    const filesTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '文件' }).first()
    if ((await filesTab.isVisible().catch(() => false)) === true) await filesTab.click()
    const row = page.locator(FILES_FILE_ROW).filter({ hasText: name }).first()
    await expect(row, `${name} 文件行在场`).toBeVisible({ timeout: 30_000 })
    await row.locator('button').click()
    await expect(page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first(), '扩展渲染器接管').toBeVisible({
      timeout: 30_000,
    })
  }

  try {
    await registerProject(page, wsDir, 'mermaid-theme-probe')
    await selectWorkspaceViaChip(page, 'mermaid-theme-probe')
    await ensureNoBlockingDialog(page)
    await revealRightbar(page)
    const filesCard = page.locator(guideEntryOf('files')).first()
    await expect(filesCard, '文件入口卡在场').toBeVisible({ timeout: 30_000 })
    await filesCard.click()
    await expect(page.locator(FILES_BODY).first(), 'files tab body 挂载').toBeVisible({ timeout: 30_000 })
    const filesStripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '文件' }).first()
    if ((await filesStripTab.isVisible().catch(() => false)) === true) await filesStripTab.click()

    // ── ① 常规图主题化落 SVG（theme.md）──
    await openDoc('theme.md')
    const preview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    const svg = preview.locator(DOC_MERMAID_SVG).first()
    await expect(svg, 'mermaid SVG 在场（erDiagram/flowchart 渲染锚）').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(DOC_PREVIEW_ANY).first(), '官方文档 tab 开出').toBeVisible()

    const themeProbe = await preview
      .locator('[data-dswf-doc-mermaid]')
      .first()
      .evaluate((figure: HTMLElement) => {
        const svgEl = figure.querySelector('svg')
        const nodeShape = figure.querySelector('.node rect, .node path, .node circle, .nodes rect') as SVGElement | null
        const nodeTextProbeEl = (figure.querySelector('.node text, .nodes text') ??
          figure.querySelector('.nodeLabel, .node foreignObject div')) as SVGElement | HTMLElement | null
        const edgePath = figure.querySelector('.edgePath path, .flowchart-link') as SVGElement | null
        const cs = (el: Element | null): Record<string, string> | null =>
          el ? { fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke } : null
        const textCs = nodeTextProbeEl
          ? {
              // htmlLabels 形（flowchart 默认）文字色落 color；SVG text 形落 fill
              fill:
                nodeTextProbeEl instanceof SVGElement
                  ? getComputedStyle(nodeTextProbeEl).fill
                  : getComputedStyle(nodeTextProbeEl).color,
              fontFamily: getComputedStyle(nodeTextProbeEl).fontFamily,
              fontSize: getComputedStyle(nodeTextProbeEl).fontSize,
            }
          : null
        const captions = figure.querySelectorAll('figcaption').length
        const svgBg = svgEl ? getComputedStyle(svgEl).backgroundColor : null
        const canvas = figure.querySelector('.dswf-doc-mermaid-canvas') as HTMLElement | null
        return {
          figureTag: figure.tagName,
          captionCount: captions,
          nodeShape: cs(nodeShape),
          nodeText: textCs,
          edgePath: cs(edgePath),
          svgInlineMaxWidth: svgEl ? (svgEl as HTMLElement).style.maxWidth : null,
          svgComputedMaxWidth: svgEl ? getComputedStyle(svgEl).maxWidth : null,
          svgMargin: svgEl ? getComputedStyle(svgEl).marginLeft + '/' + getComputedStyle(svgEl).marginRight : null,
          svgBackground: svgBg,
          canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : null,
          styleVarProbe: svgEl ? getComputedStyle(svgEl).getPropertyValue('--dsw-alias-border-l3').trim() : null,
        }
      })
    checks.theme = themeProbe
    expect(themeProbe.captionCount, '① 渲染态零标题条（figcaption 退役）').toBe(0)
    expect(themeProbe.figureTag, '① figure 直接落文档流').toBe('FIGURE')
    expect(themeProbe.nodeShape?.fill, '① 节点 fill = concrete 中性灰（primaryColor 派生链）').toBe('rgb(241, 243, 245)')
    expect(themeProbe.nodeText?.fill, '① 节点文字 fill = #0f1115 派生').toBe('rgb(15, 17, 21)')
    expect(themeProbe.edgePath?.stroke, '① 线条 stroke = var(--dsw-alias-border-l3) 解析（主题联动）').toBe(
      'rgba(0, 0, 0, 0.12)',
    )
    expect(themeProbe.svgBackground, '③ svg 背景透明').toBe('rgba(0, 0, 0, 0)')
    expect(themeProbe.canvasBackground, '③ 画布背景透明').toBe('rgba(0, 0, 0, 0)')
    // ② 字体/字号 var() 解析（computed = resolved 值）
    const fontOk =
      themeProbe.nodeText && /-apple-system|BlinkMacSystemFont|Segoe UI/i.test(themeProbe.nodeText.fontFamily)
    expect(fontOk, '② 字体栈 var(--dsw-font-family) 解析为官方栈').toBe(true)
    expect(themeProbe.nodeText?.fontSize, '② 字号 var(--dsw-font-s-14-font-size) 解析为 14px').toBe('14px')
    await preview.screenshot({ path: join(WALKTHROUGH, 'probe-mermaid-theme-doc.png') })

    // ── ③ 超宽图自适应（wide.md）──
    await openDoc('wide.md')
    const widePreview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    const wideSvg = widePreview.locator(DOC_MERMAID_SVG).first()
    await expect(wideSvg, '超宽图 SVG 在场').toBeVisible({ timeout: 30_000 })
    const wide: SvgProbe = await widePreview
      .locator('[data-dswf-doc-mermaid]')
      .first()
      .evaluate((figure: HTMLElement) => {
        const svgEl = figure.querySelector('svg') as SVGElement | null
        const canvas = figure.querySelector('.dswf-doc-mermaid-canvas') as HTMLElement | null
        return {
          maxWidth: svgEl ? getComputedStyle(svgEl).maxWidth : '',
          boundingWidth: svgEl ? svgEl.getBoundingClientRect().width : -1,
          containerWidth: canvas ? canvas.clientWidth : -1,
          canvasOverflowX: canvas ? getComputedStyle(canvas).overflowX : '',
          canvasClientWidth: canvas ? canvas.clientWidth : -1,
          canvasScrollWidth: canvas ? canvas.scrollWidth : -1,
          svgBackground: svgEl ? getComputedStyle(svgEl).backgroundColor : '',
          canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : '',
          figureCaptionCount: figure.querySelectorAll('figcaption').length,
        }
      })
    checks.wide = wide
    expect(wide.figureCaptionCount, '③ 超宽图同样零标题条').toBe(0)
    expect(wide.canvasOverflowX, '③ 画布 overflow-x = auto（超宽横滚机制保持）').toBe('auto')
    expect(wide.boundingWidth, '③ 超宽图自适应收窄：svg 盒 ≤ 容器宽').toBeLessThanOrEqual(wide.containerWidth + 1)
    expect(wide.svgBackground, '③ 超宽图背景透明').toBe('rgba(0, 0, 0, 0)')
    await widePreview.screenshot({ path: join(WALKTHROUGH, 'probe-mermaid-theme-wide.png') })

    // ── ④ 回退占位卡形制保留（bad.md）──
    await openDoc('bad.md')
    const badPreview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    const fallback = badPreview.locator(DOC_MERMAID_FALLBACK).first()
    await expect(fallback, '④ 回退占位卡在场（非法源）').toBeVisible({ timeout: 30_000 })
    const fallbackProbe = await fallback.evaluate((figure: HTMLElement) => ({
      caption: figure.querySelector('figcaption')?.textContent ?? '',
      borderStyle: getComputedStyle(figure).borderTopStyle,
      hasSrc: figure.querySelector('.dswf-doc-mermaid-src') !== null,
      note: figure.querySelector('.dswf-doc-mermaid-note')?.textContent ?? '',
    }))
    checks.fallback = fallbackProbe
    expect(fallbackProbe.caption, '④ 回退头保留（图渲染回退——失败语义不降级）').toContain('图渲染回退')
    expect(fallbackProbe.borderStyle, '④ 回退卡边框形制保留').toBe('solid')
    expect(fallbackProbe.hasSrc, '④ 源码面保留').toBe(true)
    expect(fallbackProbe.note, '④ 回退注记保留').toContain('已回退为源码展示')

    checks.pageErrors = pageErrors
    expect(pageErrors, 'renderer 未捕获异常面为空').toEqual([])
    result.verdict = 'PASS'
  } catch (error) {
    result.verdict = 'FAIL'
    result.error = String(error instanceof Error ? error.message : error)
    throw error
  } finally {
    writeFileSync(join(WALKTHROUGH, 'probe-mermaid-theme-result.json'), JSON.stringify(result, null, 2), 'utf8')
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
