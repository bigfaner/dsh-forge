// 旅程 1：dsh-desktop 单件安装 forge 携依赖装载 → 最小链走通（真机 e2e spec）。
// journey = .forge/docs/proposals/plugin-forge-combo/testing/forge-desktop-install-minchain/journey.md
// contract = 同目录 contracts/contract.md（断言-契约溯源：每条断言标注 CT-DISK-* 条目 id）
//
// 环境面（支撑层 e2e/support/forge-combo.ts 头注正本）：
//   FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME=<隔离 home> + FORGE_COMBO_DESKTOP_EXE=<安装产物 exe>
//   （缺省整组 skip——台账 e2e/SMOKE-LEDGER.md §8）
// 执行序纪律（AGENTS 1.8）：先廉价校验装载版本（版本双校验）再做大取证；版本不符立即停。
// 通道注记：desktop profile 为 npm CLI 保留名（CT-NPM-02），旅程 1 Input 的
// `dsh plugin --profile desktop add` 经 Desktop 内置命令环境执行——spec 以
// FORGE_COMBO_DESKTOP_DSH 指向该通道 CLI，命令形态与契约逐字同形。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；宿主串行启停（closeApp 后复启）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { closeApp, launchElectron } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
import { realCredentials, seedDshHome } from '../../../e2e/support/dogfood.js'
import { COMPOSER_INPUT } from '../../../e2e/support/anchors.js'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  closureGaps,
  clientBundleFiles,
  comboDbPath,
  comboEnv,
  comboGateOn,
  defaultProjectDb,
  findDispatchLogs,
  generationDriftViolations,
  installedBundles,
  profileNodeModules,
  runDsh,
  sqliteTables,
  versionPairs,
} from '../../../e2e/support/forge-combo.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md §8 留痕）——常规跑批跳过')

/** 最小链派发 = agent 会话驱动（add_task/dispatch_task 为 agent 工具——唯一门），需真实模型凭据（flywheel 口径） */
const hasCredentials = (): boolean => realCredentials() !== undefined

/** 只读计数（共库域表行数——WAL 并发读口径，用后即闭） */
function scalarCount(file: string, sql: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(sql).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** 夹具工作区（真实目录——注册链 project_key = f(main ws_path)） */
function makeWorkspace(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-combo-ws-${label}-`))
  mkdirSync(join(dir, '.forge'), { recursive: true })
  return dir
}

/** desktop 宿主启动（安装产物 exe——installed 形态，无 dev profile 掌舵；隔离 userData + DSH_HOME） */
async function launchDesktop(env: ReturnType<typeof comboEnv>, userData: string): Promise<{ app: ElectronApplication; page: Page; clientUrls: string[] }> {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（desktop 安装产物 exe 必填）')
  const clientUrls: string[] = []
  const app = await launchElectron({
    executablePath: env.desktopExe,
    env: { DSH_FORGE_USER_DATA: userData, DSH_HOME: env.dshHome },
  })
  const page = await app.firstWindow({ timeout: 120_000 })
  // client 半侧装载观察面：client bundle 经宿主 client 注入通道取件——响应 URL 收集（行为锚）
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('@dsh-forge/')) clientUrls.push(url)
  })
  return { app, page, clientUrls }
}

async function waitBootReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 120_000 },
  )
}

test.describe('forge-desktop-install-minchain（旅程 1——CT-DISK-*）', () => {
  const env = comboEnv()
  let userData = ''

  test.afterAll(async () => {
    // 卸载收尾（幂等 best-effort——隔离 home 内零真机污染）
    if (userData !== '') rmSync(userData, { recursive: true, force: true })
    await runDsh(env.desktopDshBin, ['plugin', '--profile', 'desktop', 'remove', FORGE_PKG], env.dshHome)
  })

  test('CT-DISK-01 #step-1/#step-3 O1：单件 add → 六包闭包物化 + 对账五裸名行 + 源目录零改写', async () => {
    // 前置幂等清理（重复装由 remove 兜底——CT-DISK-06 判据另行取证，此处只求未装态）
    await runDsh(env.desktopDshBin, ['plugin', '--profile', 'desktop', 'remove', FORGE_PKG], env.dshHome)
    const forgePkgBefore = readFileSync(join(env.forgeDir, 'package.json'))

    // Input（CT-DISK-01）：desktop 通道 add（link: 形 = docs/reference/dsh-plugin-cli.md 本地安装形态）
    const add = await runDsh(env.desktopDshBin, ['plugin', '--profile', 'desktop', 'add', `link:${env.forgeDir}`], env.dshHome)
    expect(add.code, `add 成功退出（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)

    // State（CT-DISK-01）：六包闭包目录存在且非空（pnpm 嵌套相对 file: 解析物化——观察点 A）
    const nodeModules = profileNodeModules(env.dshHome, 'desktop')
    expect(closureGaps(nodeModules), '六包物化目录全部存在且非空').toEqual([])

    // State（CT-DISK-01 Side-effect）：dsh.profile.bundles 对账含 forge + 五条裸名行（逐条精确——禁 OR 稀释）
    const bundles = installedBundles(env.dshHome, 'desktop')
    expect(bundles, '对账含 forge 条目').toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `对账含裸名行 ${bare}`).toContain(bare)

    // Invariants（CT-DISK-01）：forge 目录内容不被安装过程改写（package.json 字节不变）
    expect(readFileSync(join(env.forgeDir, 'package.json'))).toEqual(forgePkgBefore)
  })

  test('CT-DISK-02 #step-2/#step-4 O1：五件装载——版本双校验 + client 半侧实际取件 + 工作台在场', async () => {
    const nodeModules = profileNodeModules(env.dshHome, 'desktop')
    // 版本双校验前置（CT-DISK-02 Invariants / AGENTS 1.8）：不符即停，零后续取证
    for (const { pkg, installed, source } of versionPairs(nodeModules)) {
      expect(installed, `版本双校验 ${pkg}（安装 manifest == 仓内源）`).toBe(source)
    }
    // 五件裸包代际漂移探针（M-3——AGENTS 1.8 程序化锚）：逐件 manifest + 服务面标记
    // 双校验，任一件代际陈旧即 fail-loud（1.8 轮 stale bundle 误测教训固化）
    expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿（manifest + 服务面标记双校验）').toEqual([])
    // client 半侧文件锚（CT-DISK-02 State）：五件 dsh.client.platform 指向物在闭包内在场
    for (const { pkg, file, exists } of clientBundleFiles(nodeModules)) {
      expect(exists, `client bundle 指向物在场 ${pkg} → ${file}`).toBe(true)
    }

    userData = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-ud-'))
    const { app, page, clientUrls } = await launchDesktop(env, userData)
    try {
      // Output（CT-DISK-02）：宿主启动成功——boot 就绪 + 产品工作台可见
      await waitBootReady(page)
      await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 120_000 })

      // State 观察点 B（前置取证 2）：五件 client bundle 被宿主 client 注入通道实际取件
      // （响应 URL 含各包名——装载行为证据，非仅文件在场）
      for (const bare of BARE_BUNDLES) {
        expect(clientUrls.some((u) => u.includes(bare)), `client 注入通道实际取件 ${bare}`).toBe(true)
      }
    } finally {
      await closeApp(app)
    }
  })

  test('CT-DISK-03 #step-5 O1：共库落点——project_* 域表写入、单装库不存在', async () => {
    if (userData === '') userData = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-ud-'))
    const { app, page } = await launchDesktop(env, userData)
    try {
      await waitBootReady(page)

      // Input（CT-DISK-03）：添加项目（注册链经 RPC 项目面——workspaceDir = 真实目录夹具）
      const ws = makeWorkspace('proj')
      const row = await registerProject(page, ws, 'combo-minchain')
      expect(row.id, '项目注册成功（注册返回 projectId）').toBeTruthy()

      // State（CT-DISK-03）：共库 forge/forge.db 出现并写入 project 域（project_* 前缀表 + 注册行）
      const comboDb = comboDbPath(env.dshHome)
      expect(sqliteTables(comboDb), '共库含 project_* 前缀域表（project_projects）').toContain('project_projects')
      expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), 'project 域表有注册行（共库被写入）').toBeGreaterThanOrEqual(1)

      // State（CT-DISK-03）：单装库不存在（共库替代）
      expect(existsSync(defaultProjectDb(env.dshHome)), '单装库 project/project.db 不存在（共库接管）').toBe(false)
    } finally {
      await closeApp(app)
    }
  })

  test('CT-DISK-03 #step-6/#step-7 O1/O3：拆任务 + 派发——task_* 同库分表 + 派发日志落盘（真实模型门）', async () => {
    test.skip(!hasCredentials(), '真实模型凭据缺席（flywheel 口径留痕 skip——SMOKE-LEDGER §8）')
    const nodeModules = profileNodeModules(env.dshHome, 'desktop')
    // 版本双校验复检（AGENTS 1.8——每轮取证前廉价校验）
    for (const { pkg, installed, source } of versionPairs(nodeModules)) {
      expect(installed, `版本双校验 ${pkg}`).toBe(source)
    }
    // 五件裸包代际漂移探针（M-3）——复检同口径
    expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿').toEqual([])
    if (userData === '') userData = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-ud-'))
    seedDshHome(env.dshHome, realCredentials() as string)
    const { app, page } = await launchDesktop(env, userData)
    try {
      await waitBootReady(page)
      const ws = makeWorkspace('task')
      await registerProject(page, ws, 'combo-dispatch')

      // Input（CT-DISK-03 步 6/7）：拆任务 + 派发 = agent 会话驱动（官方 composer 发指令；
      // add_task / dispatch_task 为 agent 工具唯一门——RPC 面无写动词）
      const composer = page.locator(COMPOSER_INPUT).last()
      await expect(composer, '官方 composer 在场').toBeVisible({ timeout: 60_000 })
      await composer.fill('用 add_task 在容器 combo-dispatch 拆一个任务（title: combo-e2e-probe），然后用 dispatch_task 派发该任务。')
      await composer.press('Enter')

      // State（CT-DISK-03）：task 域行写入同一共库（task_* 前缀分表——与 project 域同库互不越界）
      const comboDb = comboDbPath(env.dshHome)
      await expect
        .poll(() => (existsSync(comboDb) ? scalarCount(comboDb, `SELECT COUNT(*) AS n FROM task_tasks WHERE slug = 'combo-dispatch'`) : 0), {
          timeout: 300_000,
          interval: 5_000,
        })
        .toBeGreaterThanOrEqual(1)

      // State（CT-DISK-03）：派发运营日志落 slug 单元（logs/<slug>.jsonl 非空行）
      const logs = findDispatchLogs(env.dshHome)
      expect(logs.length, '派发运营日志（logs/<slug>.jsonl）落盘').toBeGreaterThanOrEqual(1)
      expect(readFileSync(logs[0] ?? '', 'utf8').trim().length, '日志非空').toBeGreaterThan(0)

      // O3 边界（契约允许失败态取证）：状态已离开 pending 即合规（失败留痕亦合规——不虚报派发成功）
      const db = new Database(comboDb, { readonly: true })
      try {
        const st = db
          .prepare(`SELECT task_status FROM task_tasks WHERE slug = 'combo-dispatch' ORDER BY created_at DESC LIMIT 1`)
          .get() as { task_status: string }
        expect(st.task_status, '任务状态离开 pending（O1 派发成功 / O3 失败留痕均合规）').not.toBe('pending')
      } finally {
        db.close()
      }
    } finally {
      await closeApp(app)
    }
  })
})
