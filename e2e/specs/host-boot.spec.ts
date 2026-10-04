// 任务 1.4 e2e 自证（Playwright _electron）：
//  AC5 宿主经 runProfile 直跑拉起 dsh 宿主进程内插件面（S1 裁决形态）
//  AC3 {url, injections} IPC 注入 renderer 成功（preload → window.dshForge.getBootManifest）
//  AC2 packaged 形态首启落地 {userData}/profile 且重复启动幂等不重写（MATERIALIZE_ONLY 钩子）
// 隔离：每用例独立 userData（DSH_FORGE_USER_DATA）→ DSH_HOME/profile/单实例锁全隔离（e2e 单实例纪律）。
// 载体面（launch/close/端口）经 e2e/support（fix-37 支撑层——端口走分配器，closeApp 全员强制）。
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchElectron } from '../support/launch.js'

const PROFILE_FILES = ['cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'cordis.yml'] as const

test('AC5+AC3 dev 形态：runProfile 拉起 dsh 插件面，renderer 收到 boot manifest', async () => {
  test.setTimeout(120_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-dev-'))
  const app = await launchElectron({
    env: {
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_USER_DATA: userData,
    },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const manifest = (await page.evaluate(() =>
      (window as unknown as { dshForge: { getBootManifest(): Promise<{ url: string; injections: unknown[] }> } })
        .dshForge.getBootManifest(),
    )) as { url: string; injections: unknown[] }
    // url = ctx.connection.authenticatedUrl（回环 + 认证参数）；injections = collectIndexInjections 原样
    expect(manifest.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(Array.isArray(manifest.injections)).toBe(true)
    expect(manifest.injections.length).toBeGreaterThan(0)
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('AC2 packaged 形态：首启落地模板且二次启动幂等不重写', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-pkg-'))
  const profileDir = join(userData, 'profile')
  const mtimes = new Map<string, number>()
  try {
    for (let round = 1; round <= 2; round++) {
      const app = await launchElectron({ env: { DSH_FORGE_USER_DATA: userData, DSH_FORGE_MATERIALIZE_ONLY: '1' } })
      try {
        // MATERIALIZE_ONLY 形态不开窗：轮询落地完成信号（四文件齐）
        await expect
          .poll(() => PROFILE_FILES.every((f) => existsSync(join(profileDir, f))), { timeout: 20_000 })
          .toBe(true)
      } finally {
        await closeApp(app)
      }
      // 首启：模板三件（官方行 + @dsh-forge/core / @dsh-forge/knowledge 行）+ cordis.yml 空根
      const patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')
      expect(patch, `round ${String(round)}`).toContain("name: '@dsh-forge/core'")
      expect(patch, `round ${String(round)}`).toContain("name: '@dsh-forge/knowledge'")
      const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
        dsh: { profile: { bundles: string[] } }
      }
      expect(pkg.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
      for (const f of PROFILE_FILES) {
        const mtime = statSync(join(profileDir, f)).mtimeMs
        if (round === 1) mtimes.set(f, mtime)
        else expect(mtime, `round2 重写了 ${f}（违反幂等）`).toBe(mtimes.get(f))
      }
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})
