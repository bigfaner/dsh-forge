// @web-e2e @probe
// 过程件（不进 git——worker-lean-execution/fix-7 取证）：mermaid 预览「element stable
// 30s 不收敛」定性探针——openDoc('theme.md') 后 20s 内逐 rAF 采样预览容器与 svg 盒，
// 记录盒变化时间线 + 快照 body 内持续动画/重排源（动效元素清单）。零产品源码改动。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { revealRightbar } from '../../support/navigation.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  DOCKKIT_STRIP_TAB,
  FILES_BODY,
  FILES_FILE_ROW,
  DOC_MERMAID_SVG,
  MD_MERMAID_RENDERER_ID,
  documentPreviewOf,
  guideEntryOf,
} from '../../support/anchors.js'

const WALKTHROUGH = join('.forge', 'docs', 'proposals', 'worker-lean-execution', 'walkthrough', 'fix7')

const THEME_DOC = ['```mermaid', 'flowchart TD', '  A[探针节点] --> B[第二节点]', '  B --> C{判定}', '```', ''].join('\n')

test('@web-e2e @probe mermaid 预览盒稳定性定性探针', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-probe-mermaid-st-'))
  const wsDir = join(fixtureRoot, 'mermaid-stability-probe')
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'theme.md'), THEME_DOC, 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-probe-mermaid-st-ud-'))
  const launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page } = launched
  const result: Record<string, unknown> = { at: new Date().toISOString() }
  try {
    await registerProject(page, wsDir, 'mermaid-stability-probe')
    await selectWorkspaceViaChip(page, 'mermaid-stability-probe')
    await ensureNoBlockingDialog(page)
    await revealRightbar(page)
    const filesCard = page.locator(guideEntryOf('files')).first()
    await expect(filesCard).toBeVisible({ timeout: 30_000 })
    await filesCard.click()
    await expect(page.locator(FILES_BODY).first()).toBeVisible({ timeout: 30_000 })
    const filesStripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '文件' }).first()
    if ((await filesStripTab.isVisible().catch(() => false)) === true) await filesStripTab.click()
    const row = page.locator(FILES_FILE_ROW).filter({ hasText: 'theme.md' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.locator('button').click()
    const preview = page.locator(documentPreviewOf(MD_MERMAID_RENDERER_ID)).first()
    await expect(preview).toBeVisible({ timeout: 30_000 })
    const svg = preview.locator(DOC_MERMAID_SVG).first()
    await expect(svg).toBeVisible({ timeout: 30_000 })

    // 20s 盒时间线：每帧记 preview/svg 盒（四舍五入 px），变化帧标注
    const timeline = await page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          const target = document.querySelector('[data-path-label]')?.closest('div') ?? undefined
          const previewEl =
            document.querySelector('[data-dswf-md-preview-body]')?.parentElement ??
            target ??
            document.body
          const svgEl = previewEl.querySelector('svg')
          const box = (el: Element | null | undefined): string => {
            if (!el) return 'absent'
            const r = el.getBoundingClientRect()
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`
          }
          const frames: { t: number; preview: string; svg: string }[] = []
          const t0 = performance.now()
          const tick = (): void => {
            const t = Math.round(performance.now() - t0)
            const p = box(previewEl)
            const s = box(svgEl)
            const last = frames[frames.length - 1]
            if (!last || last.preview !== p || last.svg !== s) frames.push({ t, preview: p, svg: s })
            if (t < 20_000) requestAnimationFrame(tick)
            else resolve({ frames: frames.slice(-80), frameCount: frames.length })
          }
          requestAnimationFrame(tick)
        }),
    )
    result.timeline = timeline

    // 持续动画/重排源清单：preview 子树内 animation/transition 元素
    result.animated = await preview.evaluate((el) => {
      const out: { cls: string; anim: string; trans: string }[] = []
      for (const node of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
        const cs = getComputedStyle(node)
        const anim = cs.animationName + '/' + cs.animationDuration
        const trans = cs.transitionProperty + '/' + cs.transitionDuration
        if ((cs.animationName !== 'none' || cs.transitionProperty !== 'all') && out.length < 40) {
          out.push({ cls: (node.className || '').toString().slice(0, 80), anim, trans })
        }
      }
      return out
    })
    result.verdict = 'DONE'
  } catch (error) {
    result.verdict = 'FAIL'
    result.error = String(error instanceof Error ? error.message : error)
    throw error
  } finally {
    writeFileSync(join(WALKTHROUGH, 'probe-mermaid-stability-result.json'), JSON.stringify(result, null, 2), 'utf8')
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
