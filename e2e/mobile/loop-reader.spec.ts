// @feature:mobile-ui
// 1.19 循环卡与文档阅读 e2e（mobile project——390×844 触摸移动 UA）：
// 真组件 createChatView + createReader（loop-reader-entry.ts 探针入口）。
// AC：verb 全集色条（claim/claim-resume/settle/stop）· forge-loop 叙述卡非蓝气泡 +
// 同 runId 非最新退化 chip（时间线不重排）· 文档卡五类识别 + 文件名 + size 右对齐 › 前 ·
// 全屏阅读页（渲染|文本胶囊、md/csv/html 渲染可切纯文本、表格居中、txt 恒纯文本、← 退出、
// mermaid 动态 import 增强）。屏⑨⑩⑪走查截图归档。
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const WORKTREE = join(fileURLToPath(import.meta.url), '..', '..', '..')
const OUT_DIR = join(fileURLToPath(import.meta.url), '..', 'test-artifacts')
const WALKTHROUGH_DIR = join(
  WORKTREE,
  '.forge',
  'docs',
  'proposals',
  'mobile-ui',
  'walkthrough',
  '1-19-loop-reader',
)

declare global {
  interface Window {
    __probe: {
      openDoc(path: string): void
      closeReader(): void
      readonly readerOpen: boolean
    }
  }
}

/** 探针页面构建（esbuild 内联单文件——run-once，无 watch）。 */
async function buildProbePage(): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(WALKTHROUGH_DIR, { recursive: true })
  const { build } = createRequire(join(WORKTREE, 'apps', 'mobile', 'package.json'))('esbuild')
  const result = await build({
    entryPoints: [join(WORKTREE, 'e2e', 'mobile', 'loop-reader-entry.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  })
  const css = readFileSync(join(WORKTREE, 'apps', 'mobile', 'src', 'style.css'), 'utf8')
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<style>${css}</style>`,
    '</head>',
    '<body><div id="app"></div>',
    `<script>${result.outputFiles[0]!.text}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
  const htmlPath = join(OUT_DIR, 'loop-reader-probe.html')
  writeFileSync(htmlPath, html, 'utf8')
  return htmlPath
}

test('循环卡家族 + 文档卡 + 全屏阅读页（屏⑨⑩⑪ + runId 聚合）', async ({ page }) => {
  const htmlPath = await buildProbePage()
  await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}`)

  // ── 屏⑨：循环卡家族 verb 全集色条 ──
  const progress = page.locator('.loop').filter({ hasText: '任务循环 · mobile-ui' })
  await expect(progress.filter({ hasText: /claim \d/ })).toHaveClass(/dispatch/)
  await expect(progress.filter({ hasText: 'claim-resume' })).toHaveClass(/followup/)
  await expect(progress.filter({ hasText: /settle \d/ })).toHaveClass(/done/)
  await expect(page.locator('.loop').filter({ hasText: /stop \d/ })).toHaveClass(/state/)
  // 运行中徽标（claim running）
  await expect(progress.filter({ hasText: /claim \d/ }).locator('.st')).toHaveText('运行中')
  // 派发叙述卡（forge-loop 非蓝气泡）——同 runId 最新
  const narrative = page.locator('.loop.narrative')
  await expect(narrative).toHaveCount(1)
  await expect(narrative).toHaveClass(/dispatch/)
  await expect(narrative.locator('.bd')).toContainText('派发任务：1.19')

  // ── 同 runId 非最新退化 chip：原位在叙述卡之前（时间线不重排）──
  const chip = page.locator('.loop-chip').filter({ hasText: '接续未完成任务' })
  await expect(chip).toHaveCount(1)
  await expect(chip).toContainText('循环')
  const chipBox = await chip.boundingBox()
  const narrativeBox = await narrative.boundingBox()
  expect(chipBox).not.toBeNull()
  expect(narrativeBox).not.toBeNull()
  expect(chipBox!.y).toBeLessThan(narrativeBox!.y)
  // 旧叙述不在蓝气泡（.msg.user）中
  await expect(page.locator('.msg.user')).toHaveCount(0)

  // ── 屏⑨：文档卡五类识别 + 文件名 + size 右对齐 › 前 ──
  const cards = page.locator('.fcard')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(0).locator('.fic')).toHaveText('MD')
  await expect(cards.nth(0).locator('.fc-name')).toHaveText('walkthrough-report.md')
  await expect(cards.nth(0).locator('.fc-size')).toHaveText('6.2 KB')
  await expect(cards.nth(1).locator('.fic')).toHaveText('CSV')
  await expect(cards.nth(1).locator('.fc-size')).toHaveText('18 KB')
  await expect(cards.nth(2).locator('.fic')).toHaveText('TXT')
  await expect(cards.nth(3).locator('.fic')).toHaveText('WWW')
  // chev 在 size 之后（› 前 size 右对齐）
  const sizeBox = await cards.nth(0).locator('.fc-size').boundingBox()
  const chevBox = await cards.nth(0).locator('.chev-r').boundingBox()
  expect(sizeBox!.x + sizeBox!.width).toBeLessThanOrEqual(chevBox!.x + 1)
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-screen-9-docs.png'), fullPage: false })

  // ── 屏⑩：全屏阅读页（md 默认渲染态：表格居中 + mermaid 动态 import 增强）──
  await cards.nth(0).click()
  const reader = page.locator('.reader')
  await expect(reader).toBeVisible()
  await expect(reader.locator('.rt .t')).toHaveText('walkthrough-report.md')
  await expect(reader.locator('.rtog span.on')).toHaveText('渲染')
  const table = reader.locator('table.md-table')
  await expect(table).toBeVisible()
  const bodyBox = await reader.locator('.body').boundingBox()
  const tableBox = await table.boundingBox()
  const tableCenter = tableBox!.x + tableBox!.width / 2
  const bodyCenter = bodyBox!.x + bodyBox!.width / 2
  expect(Math.abs(tableCenter - bodyCenter)).toBeLessThan(8)
  // mermaid 动态 import：fence 旁插 figure（失败安全降级 = 代码块保留，此处应成功出图）
  await expect(reader.locator('figure[data-dswf-md-mermaid] svg')).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-screen-10-reader-render.png') })

  // ── 渲染|文本胶囊切换 → 纯文本态 ──
  await reader.locator('.rtog span', { hasText: '文本' }).click()
  await expect(reader.locator('.rtog span.on')).toHaveText('文本')
  await expect(reader.locator('pre.plain')).toBeVisible()
  await expect(reader.locator('pre.plain')).toContainText('| 阶段 | 状态 |')
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-screen-11-reader-plain.png') })
  // 屏⑪ 深色同构（双主题同源令牌）
  await page.evaluate(() => document.querySelector('.phone-root')?.classList.add('dark'))
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-screen-11-reader-plain-dark.png') })
  await page.evaluate(() => document.querySelector('.phone-root')?.classList.remove('dark'))

  // ── csv 默认渲染（居中表）→ 切文本；txt 恒纯文本（无胶囊）──
  await reader.locator('.rt-bk').click()
  await expect(reader).toHaveCount(0)
  await cards.nth(1).click()
  await expect(reader.locator('table')).toBeVisible()
  await expect(reader.locator('.rtog span.on')).toHaveText('渲染')
  await reader.locator('.rtog span', { hasText: '文本' }).click()
  await expect(reader.locator('pre.plain')).toContainText('阶段,状态')
  await reader.locator('.rt-bk').click()
  await cards.nth(2).click()
  await expect(reader.locator('pre.plain')).toContainText('纯文本样例行一')
  await expect(reader.locator('.rtog')).toHaveCount(0)
  // ← 退出
  await reader.locator('.rt-bk').click()
  expect(await page.evaluate(() => window.__probe.readerOpen)).toBe(false)
})
