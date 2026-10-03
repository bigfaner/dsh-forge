// 任务 4.3 e2e —— MVP 门第二步：Windows 安装包 4 步冒烟（PRD Goals「安装包冒烟 4 步全过」：
// 安装 → 启动 → 主界面可达 → 会话面板可用）。非 smoke 迁移组（SMOKE-LEDGER §2 台账不涉；
// §6 G2 门接入收录本套件）——断言面 = 安装形态可用性下限（Story 2），载体 = 对「安装后应用」
// 跑 Playwright `_electron`（4.1 实证 GUI exe 探测法：executablePath 直指安装产物 exe）。
//
// 四步口径（对 installer-pipeline.spec 的差异：彼 = staged resources 形态（dev electron +
// env 掌舵），本 = 真安装链路——NSIS 静默安装 → 安装后 exe 直启（app.isPackaged 自证））：
//   ① 安装零错：NSIS `/S /D=` 静默装到隔离目录。退出码 0 + 收尾件（Uninstall exe +
//      resources 清单）+ `--check` 关键文件同口径自证（4.1 留挂点：assemble-installer-
//      resources.mjs --check <dir>）——中途失败/回滚的 NSIS 落不下完整文件集（实测 exit 2 +
//      残缺树），check 必红。**环境前置（实测坑）**：NSIS 将 206MB app-64.7z 载荷物化到
//      $PLUGINSDIR（%TEMP% 下）再解压——%TEMP% 所在盘须余量 ~500MB+，否则静默中止 exit 2
//      且无任何报错输出；本套件统一将 TEMP/TMP 重定向到数据盘隔离目录（SMOKE_ROOT 下）。
//   ② 启动零错：安装后 exe 启动无崩溃/白屏——壳 boot 就绪链 + boot manifest 注入 +
//      pageerror 空（白屏 = 工作台不可达，被 ③ 结构断言拦截）。
//   ③ 主界面可达：三区结构最简断言（左 rail = 官方 sidebar 壳 + 产品面板 / 中区 zones /
//      右 dock 轨道收起）——smoke-skeleton 组一 L41/L44/L46 同语义最简集。
//   ④ 会话面板可用：面板渲染（3 tab）+ 新建会话入口可操作（官方 composer 会话面 = 新会话
//      入口：工作区芯片 → 菜单列注册工作区 → 选定 → 会话面接管——flywheel 步 2 同径，首装态
//      真实新会话路径；官方 rail 钮的锚跟随回跳 = UF-5 机制面归单测 pin，台账 L474 口径）。
//      项目注册走 RPC 直注（packaged 形态 core 双服务 + registry.create + SQLite 全链证明；
//      向导 UI 走查归 smoke-skeleton 组二/三）。
//
// Hard Rule（干净环境口径）：每跑全新 userData（无既有 {app-data} 依赖）；首启落地 profile
// 路径被真实覆盖（四文件 + 产品插件行 + state.db 在安装形态断言——1.4/4.1 行为在真安装链路回归）。
//
// 可重复性（AC5）：安装 → 断言 → 静默卸载全链脚本化；残留兜底 rmSync（卸载器收注册表/快捷方式，
// 目录双保险）。e2e 单实例纪律：隔离 userData（Electron 单实例锁键于 userData 路径）+ 独立端口。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const INSTALLER_DIR = join(ROOT, 'release', 'installer')
const ASSEMBLE_SCRIPT = join(ROOT, 'scripts', 'assemble-installer-resources.mjs')
/**
 * 冒烟隔离根 = 仓库所在盘的盘根短路径（`<drive>:\dsh-forge-smoke`）。约束（4.3 实测）：
 * - **盘容量/TEMP 重定向**：安装载荷解压走 %TEMP%（206MB 物化 + 解压暂存），TEMP 所在盘
 *   余量不足时 NSIS 静默中止（exit 2 零输出）——全部隔离产物（安装目录/userData/TEMP）
 *   统一落本根（仓库盘 = 数据盘）。
 * - **MAX_PATH 260**：staging 最深相对路径 174 字符 + 安装目录前缀须 < 260——盘根短前缀
 *   （≈31 字符）最深 208 字符，余量 50+（仓库内深路径会吃满 260 上限）。
 */
const SMOKE_ROOT = join(`${ROOT.split('\\')[0]}\\`, 'dsh-forge-smoke')
const PROFILE_FILES = ['cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml', 'cordis.yml'] as const

/** NSIS 安装包定位（artifactName = dsh-forge-<version>-win-x64.exe；未构建即整套留痕 skip） */
function locateInstaller(): string | undefined {
  if (!existsSync(INSTALLER_DIR)) return undefined
  return readdirSync(INSTALLER_DIR).find((f) => /^dsh-forge-.+-win-x64\.exe$/.test(f))
}
const installerExe = locateInstaller()
test.skip(installerExe === undefined, 'NSIS 安装包未构建——先执行 pnpm dist:win（4.1 管线产物，本套件对其消费）')

// 官方首启「预览版说明」预免 = 产品 boot overlay 内置等值确认（fix-12）——安装形态裸跑
// （无 DSH_FORGE_PATCH_FILES）即 fresh 真实路径验证（fix-12 Implementation Notes 口径）。

/** 运行期模态收起（API Key onboarding「稍后配置」本地收起；窗口期轮询沿 4.2 实证载体） */
async function dismissOnboardingModals(page: Page): Promise<void> {
  const deadline = Date.now() + 15_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page
      .locator('[role="dialog"] button', { hasText: /^稍后配置$/ })
      .first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return // 窗口期内无模态 = 无 API Key onboarding（凭据在场面）
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

/** 壳 boot 就绪链（沿 smoke-skeleton.spec 同径：就绪门 → 模块系统 live → 产品插件激活） */
async function waitShellReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 90_000 },
  )
}

/** forge RPC 调用（preload 面信封解包——沿 flywheel.spec forgeInvoke 同径） */
async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(
    async ({ ch, args }) => {
      const forge = (
        globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }
      ).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      const envelope = await forge.invoke(ch, args)
      if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
      return envelope.data
    },
    { ch: channel, args: payload },
  )
  return data as T
}

/** ④ 步项目夹具：{root}/demo-proj/.knowledge（名称对齐 flywheel/knowledge-integration 走查目录语义） */
function makeProjectFixture(parent: string): string {
  const root = mkdtempSync(join(parent, 'fixture-'))
  mkdirSync(join(root, 'demo-proj', '.knowledge'), { recursive: true })
  return root
}

/** 卸载器定位（electron-builder NSIS 收尾件：Uninstall <productName>.exe） */
function locateUninstaller(installDir: string): string | undefined {
  if (!existsSync(installDir)) return undefined
  const name = readdirSync(installDir).find((f) => f.startsWith('Uninstall') && f.endsWith('.exe'))
  return name === undefined ? undefined : join(installDir, name)
}

test('MVP 门第二步：安装包 4 步冒烟（安装 → 启动 → 主界面可达 → 会话面板可用）', async () => {
  // 跨盘全量拷贝 ~1.2GB（安装 C:→数据盘）+ 卸载回收——安装/卸载各留足分钟级预算
  test.setTimeout(900_000)
  const base = join(SMOKE_ROOT, `${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
  const installDir = join(base, 'app')
  const zTmp = join(base, 'tmp') // TEMP/TMP 隔离（安装/运行/卸载三步同径——头注实测坑）
  let app: ElectronApplication | undefined
  let userData: string | undefined
  let fixture: string | undefined
  const pageErrors: string[] = []
  try {
    mkdirSync(base, { recursive: true })
    mkdirSync(zTmp, { recursive: true })

    // ── ① 安装零错（NSIS 静默：`/S` + `/D=<dir>`（末参、不引号、无尾分隔符））──
    // NSIS 中途失败/回滚 = 退出码非 0 或文件集残缺——收尾件轮询 + --check 关键文件口径兜住。
    const install = spawnSync(join(INSTALLER_DIR, installerExe as string), ['/S', `/D=${installDir}`], {
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
          const resourcesReady = existsSync(join(installDir, 'resources', 'staging-manifest.json'))
          const uninstallerReady = locateUninstaller(installDir) !== undefined
          return resourcesReady && uninstallerReady
        },
        { timeout: 480_000, intervals: [3_000] },
      )
      .toBe(true)
    expect(existsSync(join(installDir, 'dsh-forge.exe')), '安装产物主 exe 缺席').toBe(true)
    // 关键文件同口径自证（4.1 挂点：--check <resources-dir>——对安装后 resources 断言
    // REQUIRED_KEY_FILES：runtime anchor / host-dist / web-dist / 产品三包 / sqlite prebuild）
    const check = spawnSync('node', [ASSEMBLE_SCRIPT, '--check', join(installDir, 'resources')], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(check.status, `安装后 resources --check 失败：${check.stdout}${check.stderr}`).toBe(0)
    expect(check.stdout).toContain('STAGING_CHECK_OK')

    // ── ② 启动零错（安装后 exe 直启：app.isPackaged → resourcesPath 自掌舵，无 dev 链依赖）──
    userData = mkdtempSync(join(base, 'ud-'))
    fixture = makeProjectFixture(base)
    const { _electron } = await import('@playwright/test')
    app = await _electron.launch({
      executablePath: join(installDir, 'dsh-forge.exe'),
      env: {
        ...process.env,
        DSH_FORGE_USER_DATA: userData, // Hard Rule：干净环境口径——全新 {app-data}，无既有依赖
        DSH_FORGE_PORT: String(19750 + (process.pid % 200)), // e2e 单实例纪律：独立端口
        TEMP: zTmp, // 运行期临时面同隔离（C: 余量防护——沿安装步同径）
        TMP: zTmp,
      } as Record<string, string>,
    })
    const page: Page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.waitForLoadState('domcontentloaded')
    await waitShellReady(page)
    // 白屏拦截面：boot manifest 注入（壳掌舵）+ 工作台可见（产品 client 激活装配面）
    const manifest = (await page.evaluate(() =>
      (window as unknown as { dshForge: { getBootManifest(): Promise<{ url: string; injections: unknown[] }> } })
        .dshForge.getBootManifest(),
    )) as { url: string; injections: unknown[] }
    expect(manifest.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(manifest.injections.length).toBeGreaterThan(0)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    await dismissOnboardingModals(page)

    // Hard Rule 后半：首启落地 profile 路径被真实覆盖（安装形态的 1.4/4.1 行为回归——
    // 四文件 + 产品插件行 + state.db 全走「安装后应用」的真实落地链）
    for (const f of PROFILE_FILES) {
      expect(existsSync(join(userData, 'profile', f)), `首启落地 profile/${f} 缺席`).toBe(true)
    }
    const patch = readFileSync(join(userData, 'profile', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@dsh-forge/core'")
    expect(patch).toContain("name: '@dsh-forge/knowledge'")
    expect(existsSync(join(userData, 'state.db')), 'state.db 未落盘——SQLite 句柄未开（prebuilds 未命中）').toBe(true)

    // ── ③ 主界面可达：三区结构最简断言（左 rail / 中区 / 右 dock 轨道）──
    // 左 rail = 官方 sidebar 壳（nav 折叠/导航白拿）+ 产品工作区面板
    await expect(page.locator('#root nav[aria-label]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-sidebar]').first()).toBeVisible()
    // 中区 = zones 容器（会话视图结构位；首启零项目 = hero 替换呈现，结构位不变）
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    // 右 dock 轨道默认收起
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()

    // ── ④ 会话面板可用：面板渲染 + 新建会话入口可操作 ──
    // 项目注册（RPC 直注——安装形态全链证明：IPC 通道 → core 双服务 → registry.create（隔离
    // DSH_HOME 内 dsh 工作区账本）→ SQLite projects 行）；面板出场以项目数为相位门
    const demoDir = join(fixture, 'demo-proj')
    const registered = await forgeInvoke<{ projectId: string; workspaceId: string }>(page, 'forge:projects/register', {
      workspaceDir: demoDir,
      name: 'demo-proj',
      forgeDir: join(demoDir, '.forge'),
      knowledgeDir: join(demoDir, '.knowledge'),
    })
    expect(registered.projectId, '注册落库：projectId 在场').toBeTruthy()
    expect(registered.workspaceId, '注册落库：workspaceId 在场（dsh 外键链）').toBeTruthy()
    // 相位翻转（hero → session）：外部 dsh create → workspace 快照身份变化 → 项目数重拉
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', {
      timeout: 60_000,
    })
    // 面板渲染：会话面板 + 三 tab（对话/轨迹/知识召回）
    await expect(page.locator('.dswf-session-panel').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-session-panel [role="tab"]')).toHaveCount(3)
    for (const label of ['对话', '轨迹', '知识召回']) {
      await expect(page.locator('.dswf-session-panel [role="tab"]', { hasText: label })).toBeVisible()
    }
    // 收敛窗（安装形态慢盘实测）：注册后 kit/重挂收敛与账本快照链仍在落定——静置后再走
    // 交互断言，防把 boot 期收敛现象误判为产品缺陷（dev 形态无此窗口，probe 实证稳定）
    await page.waitForTimeout(5_000)

    // 新建会话入口可操作：官方会话面 composer = 新会话入口（官方 hero 相位承载空会话引导，
    // flywheel 步 2 同径）。工作区芯片 → role=menu 列注册工作区（安装形态 registry.create
    // 实体经官方账本实时读——注册链端到端）→ 选定 → 会话面接管（新会话就绪）。
    // （官方 rail「新建会话」钮的会话锚跟随回跳 = UF-5 机制面，sessionAnchorEvent 单测 pin
    // （2.12）；e2e 载体适配沿台账 L474 口径——probe 实证无 client 工作区上下文时 startSession
    // 拒绝不导航，composer 芯片流 = 首装态真实新会话路径）
    const composer = page
      .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
      .last()
    await expect(composer, '官方会话面 composer 在场（新会话入口）').toBeVisible({ timeout: 30_000 })
    const workspaceChip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
    await expect(workspaceChip, '工作区芯片在场（composer 绑定面）').toBeVisible({ timeout: 30_000 })
    await workspaceChip.click()
    const workspaceMenu = page.locator('[role="menu"]').first()
    await expect(workspaceMenu).toBeVisible({ timeout: 15_000 })
    const fixtureWorkspaceItem = workspaceMenu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: 'demo-proj' })
      .first()
    await expect(fixtureWorkspaceItem, '注册工作区在列（安装形态 dsh create 实体——账本实时读）').toBeVisible({
      timeout: 15_000,
    })
    await fixtureWorkspaceItem.click()
    // 会话面接管中区：官方会话面嵌入配方在场（工作区已绑定，新会话就绪）
    await expect(page.locator('[data-conversation-content]').first()).toBeAttached({ timeout: 30_000 })

    // ② 的收尾断言面：全程无页面 JS 错误（无崩溃/白屏的 pageerror 口径）
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    // 清理链（可重复性）：关应用 → 删叠层/夹具/userData → 静默卸载（注册表/快捷方式卫生）
    // → 目录兜底 rmSync（卸载器自复制异步收尾，轮询消隐后兜底；失败不掩盖用例本体结论）
    try {
      await app?.close()
    } catch {
      // 关闭竞态不掩盖用例结论（进程随目录兜底一并消隐）
    }
    if (fixture !== undefined) rmSync(fixture, { recursive: true, force: true })
    if (userData !== undefined) rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    const uninstaller = locateUninstaller(installDir)
    if (uninstaller !== undefined) {
      spawnSync(uninstaller, ['/S'], {
        timeout: 120_000,
        env: { ...process.env, TEMP: zTmp, TMP: zTmp }, // 卸载器自复制走 TEMP——同隔离
      }) // NSIS 卸载器自复制异步收尾——轮询目录消隐
      const deadline = Date.now() + 240_000 // 1.2GB 树删除分钟级预算
      while (existsSync(installDir) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 3_000))
    }
    try {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    } catch {
      // 兜底删除竞态（文件占用）不掩盖用例结论——下轮跑前 mkdtemp 新目录不受残留影响
    }
  }
})
