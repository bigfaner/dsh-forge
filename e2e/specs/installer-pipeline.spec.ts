// 任务 4.1 e2e 自证（Playwright _electron；非 smoke 迁移组——SMOKE-LEDGER 台账不涉）：
//  AC2/AC3/AC4 打包形态运行时证明——对 release/staging（assemble-installer-resources.mjs
//  物化的 extraResources 树，与安装后 resources/ 同构同源）跑完整 packaged 形态 boot：
//    · profile 模板首启落地 + 二次启动幂等（AC4——1.4 行为在打包形态回归）
//    · 合成 anchor（{resources}/package.json）驱动 runtime resolution——产品双服务在场
//      （forge:projects/list RPC 走通即 core 插件自 staged 树激活）
//    · better-sqlite3 自 staged 树在 Electron ABI 下加载（AC3 prebuilds 命中——state.db 落盘）
//    · SC-NFR 离线自足（Hard Rule）：renderer 请求零远程（非回环 http/https）
//  前置门：release/staging 存在且 --check 过（未物化即 skip——dist:stage/dists:win 后全量生效；
//  安装后真机 4 步冒烟归 4.3（已并入 p1mvp installer-smoke，fix-37 ④），本文件是其挂点的可重复形态）。
// 载体面（launch/close/端口）经 e2e/support（fix-37 支撑层）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchElectron } from '../support/launch.js'

const STAGING = join(ROOT, 'release', 'staging')
const PROFILE_FILES = ['cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'cordis.yml'] as const

const stagingReady = existsSync(join(STAGING, 'staging-manifest.json'))
test.skip(!stagingReady, 'release/staging 未物化——先执行 pnpm dist:stage（或 dist:win 全链）')

test('打包形态（staged resources）boot：manifest + 双服务 + sqlite + 离线自足', async () => {
  test.setTimeout(150_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-installer-'))
  const remoteRequests: string[] = []
  let app: Awaited<ReturnType<typeof launchElectron>> | undefined
  try {
    app = await launchElectron({
      env: {
        DSH_FORGE_USER_DATA: userData,
        DSH_FORGE_RESOURCES_DIR: STAGING,
      },
    })
    const page: Page = await app.firstWindow()
    // SC-NFR（Hard Rule）：安装包资源自足——renderer 全程零远程请求（回环 webserver 除外）
    page.on('request', (request) => {
      const url = request.url()
      if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:')) remoteRequests.push(url)
    })
    await page.waitForLoadState('domcontentloaded')

    // boot manifest（{url, injections} IPC——壳掌舵面）
    const manifest = (await page.evaluate(() =>
      (window as unknown as { dshForge: { getBootManifest(): Promise<{ url: string; injections: unknown[] }> } })
        .dshForge.getBootManifest(),
    )) as { url: string; injections: unknown[] }
    expect(manifest.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(manifest.injections.length).toBeGreaterThan(0)

    // 产品双服务在场：forge:projects/list 走通（core 插件自 staged 树激活的端到端证明）
    const envelope = (await page.evaluate(async () => {
      const forge = (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
      return forge.invoke('forge:projects/list')
    })) as { ok: boolean; data?: unknown; message?: string }
    expect(envelope.ok, `forge:projects/list 失败：${envelope.message ?? ''}`).toBe(true)
    expect(envelope.data).toEqual([])

    // AC3：better-sqlite3 自 staged 树在 Electron ABI 下加载——state.db 落盘即证
    expect(existsSync(join(userData, 'state.db')), 'state.db 未落盘——core 插件 SQLite 句柄未开').toBe(true)

    // AC4 前半：首启模板落地（四文件 + 产品插件行）
    for (const f of PROFILE_FILES) expect(existsSync(join(userData, 'profile', f)), `profile/${f} 缺席`).toBe(true)
    const patch = readFileSync(join(userData, 'profile', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@dsh-forge/core'")

    expect(remoteRequests, `远程请求泄漏：${remoteRequests.join(', ')}`).toEqual([])
  } finally {
    if (app !== undefined) await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
  }
})

test('AC4 打包形态幂等：二次启动不重写 profile 模板（MATERIALIZE_ONLY 轮询）', async () => {
  test.setTimeout(90_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-installer-idem-'))
  const profileDir = join(userData, 'profile')
  const mtimes = new Map<string, number>()
  try {
    for (let round = 1; round <= 2; round++) {
      const app = await launchElectron({
        env: {
          DSH_FORGE_USER_DATA: userData,
          DSH_FORGE_RESOURCES_DIR: STAGING,
          DSH_FORGE_MATERIALIZE_ONLY: '1',
        },
      })
      try {
        await expect
          .poll(() => PROFILE_FILES.every((f) => existsSync(join(profileDir, f))), { timeout: 20_000 })
          .toBe(true)
      } finally {
        await closeApp(app)
      }
      for (const f of PROFILE_FILES) {
        const mtime = statSync(join(profileDir, f)).mtimeMs
        if (round === 1) mtimes.set(f, mtime)
        else expect(mtime, `round ${String(round)} 重写 ${f}`).toBe(mtimes.get(f))
      }
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('staging --check 门：安装包关键文件自证（4.3 冒烟同口径）', () => {
  const check = spawnSync('node', [join(ROOT, 'scripts', 'assemble-installer-resources.mjs'), '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  expect(check.status, `--check 输出：${check.stdout}${check.stderr}`).toBe(0)
  expect(check.stdout).toContain('STAGING_CHECK_OK')
})
