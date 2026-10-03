// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: installer-smoke（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/installer-smoke/contracts/step-{1..4}-*.md
// （eval-contract 1072/1150 通过）。
//
// 载体：NSIS 静默安装一次（beforeAll，文件级共享——四 Outcome 互斥环境态按 contract
// 「机器复位纪律」以测试序 + 破坏-恢复承载）→ 对安装产物跑 Playwright `_electron`。
// 与既有 e2e/specs/installer-smoke.spec.ts（任务 4.3 产物）覆盖面重叠——本套件为
// contract 溯源版（每 Outcome 独立断言 + second-launch / fail-fast / offline 边界）。
//
// 已知环境坑（4.1/4.3 实测，沿既有 spec 同径）：NSIS 载荷物化走 %TEMP%（盘余量不足 =
// 静默 exit 2 零输出）→ TEMP/TMP 统一重定向数据盘短路径根；MAX_PATH 260 → 盘根短前缀。
//
// 留痕 skip：Step 2b offline-launch-self-sufficient——断网观察通道 UNKNOWN（contract
// fact E2E_INFRA：无网络请求记录器设施，落地前不臆断通道）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const INSTALLER_DIR = join(ROOT, 'release', 'installer')
const ASSEMBLE_SCRIPT = join(ROOT, 'scripts', 'assemble-installer-resources.mjs')
const SMOKE_ROOT = join(`${ROOT.split('\\')[0]}\\`, 'dsh-forge-smoke')
const PROFILE_FILES = ['cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'cordis.yml'] as const

/** NSIS 安装包定位（未构建即整套留痕 skip） */
function locateInstaller(): string | undefined {
  if (!existsSync(INSTALLER_DIR)) return undefined
  return readdirSync(INSTALLER_DIR).find((f) => /^dsh-forge-.+-win-x64\.exe$/.test(f))
}

/** 文件级安装态（beforeAll 建立——单 worker 串行消费） */
const installState: { exe?: string; installDir?: string; tmp?: string } = {}

test.beforeAll(async () => {
  // NSIS 安装分钟级——扩本 hook 所属 test 的超时预算（beforeAll 计入首 test 时限）
  test.setTimeout(900_000)
  const installerExe = locateInstaller()
  if (installerExe === undefined) return // 各 test 以 installState 判 skip
  const base = join(SMOKE_ROOT, `p1mvp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
  const installDir = join(base, 'app')
  const zTmp = join(base, 'tmp')
  mkdirSync(zTmp, { recursive: true })
  // Step 1 success：运行安装包——静默安装退出码 0 + 收尾件齐全 + --check 关键文件自证
  const install = spawnSync(join(INSTALLER_DIR, installerExe), ['/S', `/D=${installDir}`], {
    timeout: 600_000,
    env: { ...process.env, TEMP: zTmp, TMP: zTmp },
  })
  expect(
    install.status,
    `NSIS 静默安装退出码非 0（失败/回滚面）：stderr=${String(install.stderr)}`,
  ).toBe(0)
  await expect
    .poll(
      () => {
        const uninstaller =
          existsSync(installDir) &&
          readdirSync(installDir).some((f) => f.startsWith('Uninstall') && f.endsWith('.exe'))
        return existsSync(join(installDir, 'resources', 'staging-manifest.json')) && uninstaller
      },
      { timeout: 480_000, intervals: [3_000] },
    )
    .toBe(true)
  expect(existsSync(join(installDir, 'dsh-forge.exe')), '应用启动入口就位（主 exe——Step 2 行使）').toBe(true)
  const check = spawnSync('node', [ASSEMBLE_SCRIPT, '--check', join(installDir, 'resources')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  expect(check.status, `安装后 resources --check 失败：${check.stdout}${check.stderr}`).toBe(0)
  expect(check.stdout).toContain('STAGING_CHECK_OK')
  installState.exe = join(installDir, 'dsh-forge.exe')
  installState.installDir = installDir
  installState.tmp = zTmp
})

test.afterAll(async () => {
  const installDir = installState.installDir
  const zTmp = installState.tmp
  if (installDir === undefined) return
  const uninstaller = existsSync(installDir)
    ? readdirSync(installDir).find((f) => f.startsWith('Uninstall') && f.endsWith('.exe'))
    : undefined
  if (uninstaller !== undefined) {
    spawnSync(join(installDir, uninstaller), ['/S'], { timeout: 120_000, env: { ...process.env, TEMP: zTmp, TMP: zTmp } })
    const deadline = Date.now() + 240_000
    while (existsSync(installDir) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 3_000))
  }
  rmSync(join(installDir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
})

// 官方首启「预览版说明」预免 = 产品 boot overlay 内置等值确认（fix-12）——安装形态裸跑。

async function dismissOnboardingModals(page: Page): Promise<void> {
  const deadline = Date.now() + 15_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

async function launchInstalled(
  exe: string,
  userData: string,
  tmp: string,
  options?: { readonly dismiss?: boolean },
): Promise<{ app: ElectronApplication; page: Page; pageErrors: string[] }> {
  const dismiss = options?.dismiss ?? true
  const { _electron } = await import('@playwright/test')
  const app = await _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DSH_FORGE_USER_DATA: userData,
      DSH_FORGE_PORT: String(19910 + (process.pid % 200)),
      TEMP: tmp,
      TMP: tmp,
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  if (dismiss) await dismissOnboardingModals(page) // 零 UI boot 传 dismiss=false（毒化面防护）
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 120_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 120_000 },
  )
  return { app, page, pageErrors }
}


// ─── dsh 会话文件面（空提交零往返断言载体——flywheel.spec 解码器同源精简版） ───

interface InstallerSessionEvent {
  readonly type: string
}

function decodeSessionFile(path: string): readonly InstallerSessionEvent[] {
  const buf = readFileSync(path)
  const frames: number[] = []
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) frames.push(i)
  }
  frames.push(buf.length)
  const events: InstallerSessionEvent[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    try {
      const text = zstdDecompressSync(buf.subarray(frames[i]!, frames[i + 1]!)).toString('utf8')
      for (const line of text.split('\n')) {
        if (line === '') continue
        try {
          events.push(JSON.parse(line) as InstallerSessionEvent)
        } catch {
          // 非 JSON 行跳过
        }
      }
    } catch {
      // magic 误报帧跳过
    }
  }
  return events
}

/** 夹具工作区会话事件集（无会话文件 = 空数组——两态皆零消息口径） */
function fixtureSessionEvents(dshHome: string, segment: string): readonly InstallerSessionEvent[] {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return []
  let best: { dir: string; mtime: number } | undefined
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory() || !wsDir.name.includes(segment)) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const dir = join(sessionsDir, wsDir.name, sDir.name)
      const log = readdirSync(dir).find((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
      const mtime = log !== undefined ? statSync(join(dir, log)).mtimeMs : 0
      if (best === undefined || mtime >= best.mtime) best = { dir, mtime }
    }
  }
  if (best === undefined) return []
  const log = readdirSync(best.dir)
    .filter((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
    .sort((a, b) => Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(b)?.[1] ?? 0) - Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(a)?.[1] ?? 0))[0]
  return log !== undefined ? decodeSessionFile(join(best.dir, log)) : []
}

async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(async ({ ch, args }) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke(ch, args)
    if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
    return envelope.data
  }, { ch: channel, args: payload })
  return data as T
}

/** 首次安装冒烟的 userData（second-launch 复用——冷重启前置） */
const smokeUserData: { dir?: string } = {}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟·前半（Step 1 beforeAll + Step 2 启动零错 + Step 3 主界面可达）：
// 零 UI 交互（不收首启模态——收起动作写 dsh 侧客户态，同 userData 后续 boot 存在
// 工作台挂载竞态，实测坑；模态在场不影响 DOM 断言）。Step 4 面板走查 = 后续测试
// （同 userData 链路末位 UI boot），second-launch 冷重启插在其间（零 UI boot）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp installer-smoke·冒烟前半：安装→启动零错→主界面可达（零 UI 交互）', async () => {
  const exe = installState.exe
  const tmp = installState.tmp
  test.skip(exe === undefined, 'NSIS 安装包未构建——先执行 pnpm dist:win（beforeAll 定位失败，整套留痕 skip）')
  test.setTimeout(420_000)
  const userData = mkdtempSync(join(SMOKE_ROOT, 'p1mvp-ud-'))
  smokeUserData.dir = userData
  const pageErrors: string[] = []
  let app: ElectronApplication | undefined
  try {
    // ── Step 2 success：安装后 exe 直启——装载在等待窗口内完成、无报错弹窗、无白屏 ──
    const launched = await launchInstalled(exe as string, userData, tmp as string, { dismiss: false })
    app = launched.app
    pageErrors.push(...launched.pageErrors)
    const page = launched.page
    // 白屏拦截面：boot manifest 注入（壳掌舵）+ 工作台可见
    const manifest = (await page.evaluate(() =>
      (window as unknown as { dshForge: { getBootManifest(): Promise<{ url: string; injections: unknown[] }> } })
        .dshForge.getBootManifest(),
    )) as { url: string; injections: unknown[] }
    expect(manifest.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(manifest.injections.length).toBeGreaterThan(0)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    // 首启落地 profile（安装形态真实落地链回归）
    for (const f of PROFILE_FILES) {
      expect(existsSync(join(userData, 'profile', f)), `首启落地 profile/${f}`).toBe(true)
    }
    expect(existsSync(join(userData, 'state.db')), 'state.db 落盘（SQLite 句柄已开）').toBe(true)

    // ── Step 3 success：主界面可达——三区工作台骨架（零项目 hero 确定相位） ──
    await expect(page.locator('#root nav[aria-label]').first(), '左栏导航 rail 入口在位').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-sidebar]').first(), '产品工作区面板').toBeVisible()
    await expect(page.locator('[data-dswf-nav="knowledge"]').first(), '知识库入口').toBeVisible()
    await expect(page.locator('[data-dswf-project]'), '零项目态：项目树空').toHaveCount(0)
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first(), '中区结构位').toBeAttached()
    await expect(page.locator('[data-dswf-hero]').first(), 'hero 空态 + CTA（零项目确定相位）').toBeVisible()
    await expect(page.locator('[data-dswf-cta="add-project"]')).toBeVisible()
    await expect(page.locator('[data-dswf-dock="collapsed"]').first(), '右栏默认收起（轨道归零）').toBeAttached()
    expect(pageErrors, '全程无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app?.close().catch(() => undefined)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟·后半（Step 4 会话面板可用 + blank-send-blocked-min）——链路末位 UI boot
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp installer-smoke·Step2d second-launch-consistent：冷重启同相位', async () => {
  const exe = installState.exe
  const tmp = installState.tmp
  test.skip(exe === undefined, 'NSIS 安装包未构建——留痕 skip（beforeAll 定位失败）')
  test.skip(smokeUserData.dir === undefined, '冒烟未执行（安装态缺失）——冷重启依赖首启终态')
  test.setTimeout(300_000)
  let app: ElectronApplication | undefined
  try {
    // 同一安装入口 + 同一 userData（已初始化）冷重启——单实例锁无竞争（零 UI boot：
    // 本测试位于任何收模态 boot 之前——毒化面防护，见文件头注）
    const launched = await launchInstalled(exe as string, smokeUserData.dir as string, tmp as string, { dismiss: false })
    app = launched.app
    await expect(launched.page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    // 与首次启动同相位（零项目 hero 确定相位——fact HERO_PHASE；注册走查在后续测试）
    await expect(launched.page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'hero', { timeout: 30_000 })
    // 用户数据目录持久（无一次性首启依赖）：profile 四文件 + state.db 复在场
    for (const f of PROFILE_FILES) {
      expect(existsSync(join(smokeUserData.dir as string, 'profile', f)), `冷重启 profile/${f} 持久`).toBe(true)
    }
    expect(existsSync(join(smokeUserData.dir as string, 'state.db')), '冷重启 state.db 持久').toBe(true)
    expect(launched.pageErrors, '冷重启无首启异常回归（pageerror 面）').toEqual([])
  } finally {
    await app?.close().catch(() => undefined)
  }
})

test('@web-e2e @p1mvp installer-smoke·冒烟后半：会话面板可用（composer 回显 + 空提交拦截）', async () => {
  const exe = installState.exe
  const tmp = installState.tmp
  test.skip(exe === undefined, 'NSIS 安装包未构建——留痕 skip（beforeAll 定位失败）')
  test.skip(smokeUserData.dir === undefined, '冒烟前半未执行（安装态缺失）')
  test.setTimeout(600_000)
  const userData = smokeUserData.dir as string
  const pageErrors: string[] = []
  let app: ElectronApplication | undefined
  try {
    const launched = await launchInstalled(exe as string, userData, tmp as string)
    app = launched.app
    pageErrors.push(...launched.pageErrors)
    const page = launched.page
    // ── Step 4 success：会话面板可用（输入区可聚焦、键入即回显——发送不走查） ──
    // 工作区夹具（userData 本体含 dsh-home——注册 dsh-home 父目录实体不进官方账本菜单，
    // 实测坑；沿既有 installer-smoke.spec 同径：独立 fixture 目录）
    const projDir = join(userData, '..', 'smoke-proj-fixture')
    mkdirSync(projDir, { recursive: true })
    const registered = await forgeInvoke<{ projectId: string; workspaceId: string }>(page, 'forge:projects/register', {
      workspaceDir: projDir,
      name: 'smoke-proj',
      forgeDir: join(projDir, '.forge'),
      knowledgeDir: join(projDir, '.knowledge'),
    })
    expect(registered.projectId, '安装形态注册落库（IPC → core 双服务 → registry → SQLite 全链）').toBeTruthy()
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 60_000 })
    await expect(page.locator('.dswf-session-panel').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-session-panel [role="tab"]'), '会话面板三页签').toHaveCount(3)
    // 新会话入口：composer 工作区芯片流（首装真实路径——rail 钮锚跟随回跳归单测 pin）
    const composer = page
      .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
      .last()
    await expect(composer).toBeVisible({ timeout: 30_000 })
    const chip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
    await expect(chip).toBeVisible({ timeout: 30_000 })
    // 菜单 = 开启瞬间的账本快照——注册实体经官方订阅传播有滞后，重开轮询（≤45s）
    const menu = page.locator('[role="menu"]').first()
    const wsItem = menu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: 'smoke-proj' })
      .first()
    let listed = false
    for (let i = 0; i < 9 && !listed; i++) {
      await chip.click()
      await expect(menu).toBeVisible({ timeout: 15_000 })
      listed = await wsItem.isVisible().catch(() => false)
      if (!listed) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(4_000)
      }
    }
    expect(listed, '注册工作区在列（安装形态 dsh create 实体——账本传播收敛）').toBe(true)
    await wsItem.click()
    await expect(page.locator('[data-conversation-content]').first(), '会话面接管（新会话就绪）').toBeAttached({ timeout: 30_000 })
    // 可用判据：输入区可聚焦、键入字符即回显
    await composer.click()
    await page.keyboard.insertText('回显探针')
    const echoed = await composer.evaluate((el) => (el as HTMLTextAreaElement).value ?? el.textContent ?? '')
    expect(echoed, '键入字符即回显（会话面板可用）').toContain('回显探针')

    // ── Step 4 Outcome "blank-send-blocked-min"（冒烟最小口径空提交拦截） ──
    // 账本级断言（空提交零消息零往返——官方 composer 占位/草稿文案随输入态显隐，
    // 转录文本等值断言不可用——载体适配，session-workbench 同径）
    await composer.fill('')
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('   ')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2_000)
    const events = fixtureSessionEvents(join(userData, 'dsh-home'), 'smoke-proj-fixture')
    const nonSystem = events.filter((e) => e.type !== 'system/message')
    expect(nonSystem.filter((e) => /message/i.test(e.type)), '空提交零用户/助手消息（冒烟最小口径）').toHaveLength(0)
    expect(nonSystem.filter((e) => e.type === 'tool/call'), '空提交零 agent 往返').toHaveLength(0)
    expect(pageErrors, '全程无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app?.close().catch(() => undefined)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "launch-failure-fail-fast"（启动路径破坏 → 冒烟即判失败可检出）
// 破坏预置 = 文件级（rename resources 目录）；结束还原（contract 机器复位纪律）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp installer-smoke·Step2c launch-failure-fail-fast：破坏启动路径失败可检出', async () => {
  const exe = installState.exe
  const installDir = installState.installDir
  const tmp = installState.tmp
  test.skip(exe === undefined, 'NSIS 安装包未构建——留痕 skip（beforeAll 定位失败）')
  test.setTimeout(300_000)
  const resourcesDir = join(installDir as string, 'resources')
  const resourcesBackup = `${resourcesDir}.bak-p1mvp`
  renameSync(resourcesDir, resourcesBackup)
  let app: ElectronApplication | undefined
  try {
    const { _electron } = await import('@playwright/test')
    // 运行时树缺失（resources 改名）→ 启动异常：进程退出 / 白屏无首屏——失败可检出即冒烟失败口径
    let failDetected = false
    try {
      app = await _electron.launch({
        executablePath: exe as string,
        env: {
          ...process.env,
          DSH_FORGE_USER_DATA: mkdtempSync(join(SMOKE_ROOT, 'p1mvp-ud-')),
          DSH_FORGE_PORT: String(19930 + (process.pid % 200)),
          TEMP: tmp,
          TMP: tmp,
        } as Record<string, string>,
      })
      const page = await Promise.race([
        app.firstWindow(),
        new Promise<Page>((_, reject) => setTimeout(() => reject(new Error('no-window')), 60_000)),
      ]).catch(() => undefined)
      if (page === undefined) {
        failDetected = true // 进程级失败（无主窗口）
      } else {
        // 窗口在场则首屏必不在等待窗口内呈现（工作台不可达 = 冒烟失败判定成立）
        const visible = await page
          .locator('[data-dswf-workbench]')
          .first()
          .isVisible({ timeout: 60_000 })
          .catch(() => false)
        failDetected = !visible
      }
    } catch {
      failDetected = true // launch 即失败（运行时缺失硬失败——可见失败呈现 = OS 级进程退出）
    }
    expect(failDetected, '启动路径破坏 → 冒烟即判失败（首屏未在等待窗口内呈现/进程退出）').toBe(true)
  } finally {
    await app?.close().catch(() => undefined)
    // 机器复位：还原破坏预置（second-launch 等后续场景不受污染——contract 复位纪律）
    if (existsSync(resourcesBackup)) renameSync(resourcesBackup, resourcesDir)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 留痕 skip：Step 2b offline-launch-self-sufficient（观察通道 UNKNOWN）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp installer-smoke·Step2b offline-launch-self-sufficient（留痕 skip）', async () => {
  test.skip(
    true,
    '断网观察通道 UNKNOWN（contract fact E2E_INFRA：既有探针 = boot ready / RPC / UI / session log，无网络请求记录器；断网实现通道 OS 级/拦截桩均需 harness 提供）——留痕 skip，转正 = 请求监听设施落地；安装产物侧离线自足由 --check（Step 1 beforeAll）承载',
  )
})
