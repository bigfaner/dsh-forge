// @feature:mobile-ui
// 1.12 抽屉双级未读 e2e（mobile project——390×844 触摸移动 UA）：
// 真组件 createDrawerView + fake rpc grouped 载荷，Chrome 设备模拟。
// AC：双级未读徽标最终一致（打开拉取 + 15s 轮询路径 [pollMs 缩短驱动同一刷新链]
// + 触底本地归零对账）；底部连接状态弹层可断开（disconnect 通道）。
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const WORKTREE = join(fileURLToPath(import.meta.url), '..', '..', '..')
const OUT_DIR = join(fileURLToPath(import.meta.url), '..', 'test-artifacts')

interface ProbeHooks {
  readonly payload: unknown
  setPayload(next: unknown): void
  writeCursor(sessionId: string, seq: number): void
}

declare global {
  interface Window {
    __probe: ProbeHooks
  }
}

const getPayload = (page: Page): Promise<unknown> => page.evaluate(() => window.__probe.payload)
const setPayload = (page: Page, payload: unknown): Promise<void> =>
  page.evaluate((next) => window.__probe.setPayload(next), payload)
const writeCursor = (page: Page, sessionId: string, seq: number): Promise<void> =>
  page.evaluate(([id, value]) => window.__probe.writeCursor(id!, value!), [sessionId, seq] as const)

/** 探针页面构建（esbuild 内联单文件——run-once，无 watch）。 */
async function buildProbePage(): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true })
  const { build } = createRequire(join(WORKTREE, 'apps', 'mobile', 'package.json'))('esbuild')
  const result = await build({
    entryPoints: [join(WORKTREE, 'e2e', 'mobile', 'drawer-probe-entry.ts')],
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
  const htmlPath = join(OUT_DIR, 'drawer-probe.html')
  writeFileSync(htmlPath, html, 'utf8')
  return htmlPath
}

test('drawer 双级未读最终一致 + 断开连接通道', async ({ page }) => {
  const htmlPath = await buildProbePage()
  await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}?pollMs=300`)

  const groupChip = (name: string) =>
    page.locator('.grp', { hasText: name }).locator('.unread-chip')
  const rowChip = (title: string) =>
    page.locator('.sess', { hasText: title }).locator('.unread-chip')

  // ── ① 打开拉取：项目级 + 会话级徽标一次到位（未读 = asOfSeq − localStorage 游标）──
  await expect(groupChip('dsh-forge')).toHaveText('22') // 12 + 5 + 3 + 2（含窗外/worker 成员求和）
  await expect(groupChip('dispatch-loop-hardening')).toHaveText('7')
  await expect(groupChip('未归属')).toHaveText('6')
  await expect(rowChip('手机远程审批')).toHaveText('12')
  await expect(rowChip('Job Object 进程树回收')).toHaveText('7')

  // worker 会话折叠子组（origin:'subagent' 出主列表，折叠态只报计数）
  const workerHeader = page.locator('.grp.sub', { hasText: 'Worker 会话' })
  await expect(workerHeader).toHaveText(/1/)
  await expect(page.locator('.sess', { hasText: 'worker-1' })).toHaveCount(0)
  await workerHeader.click()
  await expect(page.locator('.sess', { hasText: 'worker-1' })).toHaveCount(1)

  // 24h 窗外会话不出行；置顶可用（置顶豁免窗口、组内居首）
  await expect(page.locator('.sess', { hasText: '窗外旧会话' })).toHaveCount(0)
  await page.locator('.sess', { hasText: 'DSH 手机连接原理' }).locator('.pin-toggle').click()
  await expect(page.locator('.sess', { hasText: 'DSH 手机连接原理' }).locator('.pin')).toHaveCount(1)
  const order = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('#app .sess')]
    return rows.map((row) => row.textContent ?? '')
  })
  expect(order.findIndex((text) => text.includes('DSH 手机连接原理'))).toBeLessThan(
    order.findIndex((text) => text.includes('另一条未归属')),
  )

  // ── ② 轮询兜底刷新链：载荷 asOfSeq 前进 → 徽标跟随（15s 轮询同链，pollMs 缩短驱动）──
  const payload = (await getPayload(page)) as {
    projects: Array<{ id: string; sessions: Array<{ sessionId: string; projections: { asOfSeq: number } }> }>
  }
  const p1 = payload.projects[0]!
  p1.sessions.find((s) => s.sessionId === 's-1')!.projections.asOfSeq = 13
  await setPayload(page, payload)
  await expect(rowChip('手机远程审批')).toHaveText('13')
  await expect(groupChip('dsh-forge')).toHaveText('23')

  // ── ③ 触底本地归零对账：chat 触底写同一 localStorage 游标键 → 下次拉取徽标归零 ──
  await writeCursor(page, 's-1', 13)
  await expect(rowChip('手机远程审批')).toHaveCount(0, { timeout: 5000 })
  await expect(groupChip('dsh-forge')).toHaveText('10') // 5 + 3 + 2

  // ── ④ 底部连接状态弹层可断开（forge:remote/disconnect 通道 → revoked）──
  await page.locator('.foot').click()
  await expect(page.locator('.conn-pop .row', { hasText: '状态' })).toContainText('已连接')
  await page.locator('.conn-pop .disconnect').click()
  await expect(page.locator('.conn-pop .row', { hasText: '状态' })).toContainText('已断开')
  await expect(page.locator('.foot')).toContainText('已断开')

  await page.screenshot({ path: join(OUT_DIR, 'drawer-unread-final-390x844.png') })
})
