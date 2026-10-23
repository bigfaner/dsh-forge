// @feature:mobile-ui
// bug 63ee4a3d 回归钉：生产入口装配——dist/index.html headless 加载应渲染真实首屏。
// AC：构建产物含完整应用代码（非 textContent 占位）；lan（127.0.0.1 回环）模式直接进
// hero 视图；无 console error / pageerror。
// 前置：pnpm build:mobile 已产出 apps/mobile/dist/index.html（缺失即失败指明构建命令）。
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const WORKTREE = join(fileURLToPath(import.meta.url), '..', '..', '..')
const DIST_HTML = join(WORKTREE, 'apps', 'mobile', 'dist', 'index.html')
const OUT_DIR = join(fileURLToPath(import.meta.url), '..', 'test-artifacts')

/** 静态服务 dist/index.html（回环 origin——hostnameMode 判 lan，首屏直达 hero）。 */
function serveIndexHtml(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(DIST_HTML))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') reject(new Error('listen 地址异常'))
      else resolve({ server, origin: `http://127.0.0.1:${address.port}` })
    })
  })
}

test('dist/index.html 生产装配：回环加载进 hero 首屏 + 零 console/page error', async ({ page }) => {
  expect(existsSync(DIST_HTML), 'apps/mobile/dist/index.html 在场（先跑 pnpm build:mobile）').toBe(true)
  const { server, origin } = await serveIndexHtml()

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)))

  try {
    await page.goto(origin)
    // 真实视图 DOM（非品牌占位）：hero 首屏（slogan/问候在 .hero 内）
    await expect(page.locator('#app .phone-root .hero .slogan')).toHaveText('知识就是力量')
    await expect(page.locator('#app .phone-root .composer')).toBeVisible()
    // 产物含完整应用代码：占位文本不再裸挂 #app
    const appText = await page.locator('#app').textContent()
    expect(appText).not.toBe('dsh-forge mobile')
    // 无 console/page error（lan 首屏零失败网络请求口径）
    expect(pageErrors, `pageerror：${JSON.stringify(pageErrors)}`).toEqual([])
    expect(consoleErrors, `console error：${JSON.stringify(consoleErrors)}`).toEqual([])

    await page.screenshot({ path: join(OUT_DIR, 'main-assembly-hero-390x844.png') })
  } finally {
    server.close()
  }
})
