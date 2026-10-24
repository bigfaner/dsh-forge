// @feature:mobile-ui
// 1.13/1.15 hero 新会话 e2e（mobile project——390×844 触摸移动 UA）：
// 真组件 createHeroView + fake rpc（hero-probe-entry.ts 探针入口复用）。
// AC：host 建会话守卫拒绝 → 确认框（选回 / 仍要切换双径）+ session.create 守卫回执
// （invalid-state 拒绝 / ok 采纳）+ 意图信封断言（session-create 透传载荷）。
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const WORKTREE = join(fileURLToPath(import.meta.url), '..', '..', '..')
const OUT_DIR = join(fileURLToPath(import.meta.url), '..', 'test-artifacts')

interface ProbeHooks {
  setGuardResult(next: unknown): void
  readonly lastSessionCreate: unknown
}

declare global {
  interface Window {
    __probe: ProbeHooks
    __opened?: string
  }
}

const setGuardResult = (page: Page, next: unknown): Promise<void> =>
  page.evaluate((value) => window.__probe.setGuardResult(value), next)
const lastSessionCreate = (page: Page): Promise<unknown> => page.evaluate(() => window.__probe.lastSessionCreate)

/** 探针页面构建（esbuild 内联单文件——run-once，无 watch）。 */
async function buildProbePage(): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true })
  const { build } = createRequire(join(WORKTREE, 'apps', 'mobile', 'package.json'))('esbuild')
  const result = await build({
    entryPoints: [join(WORKTREE, 'e2e', 'mobile', 'hero-probe-entry.ts')],
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
  const htmlPath = join(OUT_DIR, 'hero-guard-probe.html')
  writeFileSync(htmlPath, html, 'utf8')
  return htmlPath
}

/** 选定非默认 worktree（bw-pop 分支行——乐观切换，零网络）。 */
async function pickBranch(page: Page): Promise<void> {
  await page.locator('.plugin.wt').click()
  await expect(page.locator('.bw-pop .mi', { hasText: 'fix/mobile-rpc' })).toBeVisible()
  await page.locator('.bw-pop .mi', { hasText: 'fix/mobile-rpc' }).click()
  await expect(page.locator('.plugin.wt .wtname')).toHaveText('fix/mobile-rpc')
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator('.composer input').fill(text)
  await page.locator('.send').click()
}

test('hero 确认框双径 + session.create 守卫回执 + 意图信封', async ({ page }) => {
  const htmlPath = await buildProbePage()
  await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}`)

  // ── ① 默认选中 = 当前所在（main · 当前所在分支），零预检调用 ──
  await expect(page.locator('.plugin.wt .wtname')).toHaveText('main · 当前所在分支')

  // ── ② 守卫拒绝回执（invalid-state）→ 确认框 + 意图信封断言 ──
  await pickBranch(page)
  await setGuardResult(page, { ok: false, error: { code: 'invalid-state', reason: 'worktree 不在场' } })
  await send(page, '在 fix/mobile-rpc 上开工')
  const confirmCard = page.locator('.confirm-card')
  await expect(confirmCard.locator('.confirm-title')).toHaveText('无法切换到所选分支')
  await expect(confirmCard.locator('.confirm-body')).toContainText('host 建会话守卫拒绝：worktree 不在场')
  expect(await lastSessionCreate(page)).toEqual({ worktreePath: 'Z:/wt/fix-mobile-rpc' })

  // ── ③ 选回：确认框 cancel → 乐观选中态回退当前所在（默认行）──
  await confirmCard.locator('.confirm-btn:not(.primary)').click()
  await expect(confirmCard).toHaveCount(0)
  await expect(page.locator('.plugin.wt .wtname')).toHaveText('main · 当前所在分支')
  expect(await page.evaluate(() => window.__opened)).toBeUndefined()

  // ── ④ 守卫 ok 回执：透传径直接进入预铸会话（host 建会话守卫采纳单门）──
  await pickBranch(page)
  await setGuardResult(page, { ok: true, data: { sessionId: 's-wt-fix', branch: 'fix/mobile-rpc' } })
  await send(page, '在 fix/mobile-rpc 上开工')
  await expect(page.locator('.confirm-card')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__opened)).toBe('s-wt-fix')
  await expect(page.locator('.plugin.wt .wtname')).toHaveText('fix/mobile-rpc')

  // ── ⑤ 仍要切换：确认框 confirm → 会话经官方面落主树 ──
  await pickBranch(page)
  await setGuardResult(page, { ok: false, error: { code: 'invalid-state', reason: 'worktree 不在场' } })
  await send(page, '仍要切到 fix/mobile-rpc')
  await expect(confirmCard.locator('.confirm-title')).toHaveText('无法切换到所选分支')
  await confirmCard.locator('.confirm-btn.primary').click()
  await expect(page.locator('.confirm-card')).toHaveCount(0)
  await expect(page.locator('.plugin.wt .wtname')).toHaveText('fix/mobile-rpc')

  await page.screenshot({ path: join(OUT_DIR, 'hero-guard-final-390x844.png') })
})
