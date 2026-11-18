// 旅程 1：dsh-desktop solo 逐件安装 forge → 共库装载 → 卸载三段（真机 e2e spec，收口批 1.15）。
// journey = .forge/docs/proposals/plugin-forge-combo/testing/forge-desktop-install-minchain/journey.md
// contract = 同目录 contracts/contract.md（behavior_baseline v2——断言-契约溯源：每条断言标注 CT-DISK-* 条目 id）
//
// G3 实锚回填（1.11 核销结论）：desktop profile 落点 = {userData}/profile
// （paths.ts resolveHostPaths），{DSH_HOME}/profiles/desktop 恒不产生（反向锚）——
// 旧锚 profiles/desktop/** 全部作废，本 spec 全部清单/物化断言走 desktopProfile* 读面。
// 安装形态（CT-DISK-09 三路裁定）：desktop 通道唯一可行形态 = 路 C solo 逐件——
// 五件逐件 solo add + forge solo 变体（零 file: 兄弟依赖，1.12 发布树 <tree>/solo/forge）
// add；原样包（聚合 file: 依赖）add 断裂 ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND（CT-DISK-05 实锚分支）。
// CT-DISK-07 缺席降级构造（solo 形态适配）：缺件不装（knowledge 不逐件 add）而 forge
// patch 插行仍声明 knowledge → 装载缺席——缺席诊断留痕（forge-bundle-absent，fix-1 实锚；
// 诊断落盘面 = {userData}/logs/app-YYYYMMDD.jsonl，host-wiring.ts）+ 降级不扩散。
// CT-DISK-08 对照取证构造：solo 变体副本 patch 中 project dbFile 改回单装缺省路径。
//
// 环境面（e2e/support/forge-combo.ts 头注正本）：FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME
// + FORGE_COMBO_DESKTOP_EXE + FORGE_COMBO_RELEASE_TREE（1.12 发布树）+ FORGE_COMBO_DESKTOP_DSH。
// 执行序纪律（AGENTS 1.8）：先廉价校验装载版本/代际（版本双校验 + M-3 代际探针）再做大取证。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；宿主串行启停（closeApp 后复启）。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { closeApp, launchElectron } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
import { realCredentials, seedDshHome } from '../../../e2e/support/dogfood.js'
import { COMPOSER_INPUT } from '../../../e2e/support/anchors.js'
import { forgeBundleAbsenceClues } from '../../../e2e/support/bundle-absence.js'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  clientBundleFiles,
  comboDbPath,
  comboEnv,
  comboGateOn,
  defaultProjectDb,
  desktopAbsenceEvents,
  desktopInstalledBundles,
  desktopPkgEntryDir,
  desktopProfileNodeModules,
  findDispatchLogs,
  generationDriftViolations,
  insertEntryPattern,
  runDsh,
  sqliteTables,
  versionPairs,
} from '../../../e2e/support/forge-combo.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md §8 留痕）——常规跑批跳过')

const KNOWLEDGE = '@dsh-forge/knowledge'
const DESKTOP_PLUGIN = ['plugin', '--profile', 'desktop'] as const

/** 最小链派发 = agent 会话驱动（add_task/dispatch_task 为 agent 工具——唯一门），需真实模型凭据（flywheel 口径） */
const hasCredentials = (): boolean => realCredentials() !== undefined

/** desktop 通道 CLI 执行（隔离 home + 隔离 userData——desktop profile 落 {userData}/profile，G3 实锚） */
function runDesktopDsh(env: ReturnType<typeof comboEnv>, args: readonly string[], userData?: string) {
  return runDsh(env.desktopDshBin, args, env.dshHome, userData === undefined ? {} : { DSH_FORGE_USER_DATA: userData })
}

/** 只读计数（共库/单装库域表行数——WAL 并发读口径，用后即闭） */
function scalarCount(file: string, sql: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare(sql).get() as { n: number }).n
  } finally {
    db.close()
  }
}

/** 库文件快照（size + mtimeMs——卸载/回落对照面 CT-DISK-04/10「只读保留零丢行」机械锚） */
function fileStat(file: string): { size: number; mtimeMs: number } {
  const st = statSync(file)
  return { size: st.size, mtimeMs: st.mtimeMs }
}

/** 夹具工作区（真实目录——注册链 project_key = f(main ws_path)） */
function makeWorkspace(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-combo-ws-${label}-`))
  mkdirSync(join(dir, '.forge'), { recursive: true })
  return dir
}

/** desktop 宿主启动（安装产物 exe——installed 形态，无 dev profile 掌舵；隔离 userData + DSH_HOME） */
async function launchDesktop(env: ReturnType<typeof comboEnv>, userData: string): Promise<{ app: ElectronApplication; page: Page; clientUrls: string[]; stderr: string }> {
  if (env.desktopExe === undefined) throw new Error('FORGE_COMBO_DESKTOP_EXE 未置位（desktop 安装产物 exe 必填）')
  const clientUrls: string[] = []
  let stderr = ''
  const app = await launchElectron({
    executablePath: env.desktopExe,
    env: { DSH_FORGE_USER_DATA: userData, DSH_HOME: env.dshHome },
  })
  // 宿主进程 stderr 收集（官方 reportSkippedBundles 直落面——forgeBundleAbsenceClues 判据源）
  app.process().stderr?.on('data', (chunk: Buffer) => {
    stderr += String(chunk)
  })
  const page = await app.firstWindow({ timeout: 120_000 })
  // client 半侧装载观察面：client bundle 经宿主 client 注入通道取件——响应 URL 收集（行为锚）
  page.on('response', (res) => {
    const url = res.url()
    if (url.includes('@dsh-forge/')) clientUrls.push(url)
  })
  return { app, page, clientUrls, stderr }
}

async function waitBootReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 120_000 },
  )
}

/** 版本双校验 + M-3 五件代际漂移探针（AGENTS 1.8 取证顺序纪律——大取证前廉价校验，不符即停） */
function cheapGenerationGate(nodeModules: string): void {
  for (const { pkg, installed, source } of versionPairs(nodeModules)) {
    expect(installed, `版本双校验 ${pkg}（安装 manifest == 仓内源）`).toBe(source)
  }
  expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿（manifest + 服务面标记双校验）').toEqual([])
}

test.describe('forge-desktop-install-minchain（旅程 1——CT-DISK-*，solo 终态 + 卸载三段）', () => {
  const env = comboEnv()
  const requireTree = (): string => {
    if (env.releaseTree === undefined || env.releaseTree === '') {
      throw new Error('FORGE_COMBO_RELEASE_TREE 未置位（1.12 发布树——CT-DISK-09 路 C solo 安装物必填）')
    }
    return env.releaseTree
  }
  const soloForgeDir = (): string => join(requireTree(), 'solo', 'forge')
  const memberDir = (bare: string): string => join(requireTree(), bare.slice('@dsh-forge/'.length))
  let userData = ''

  test.afterAll(async () => {
    // 卸载收尾（幂等 best-effort——隔离 home 内零真机污染）
    if (userData !== '') rmSync(userData, { recursive: true, force: true })
    await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG], userData === undefined ? undefined : userData)
  })

  test('CT-DISK-09 #路A/#路B/#原样包 O1：父目录/原样包 add 拒绝——零清单变化 + 零 profile 写入', async () => {
    const tree = requireTree()
    expect(existsSync(soloForgeDir()), '1.12 发布树 solo 变体在盘（solo/forge）').toBe(true)
    const bundlesBefore = JSON.stringify(desktopInstalledBundles(userData))

    // 路 A/B（Input：发布树父目录 = 六包共置布局，两路输入同形——结构性排除判定面相同）
    const routeAB = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', tree], userData)
    expect(routeAB.code, '路 A/B 父目录 add 被拒（非零退出）').not.toBe(0)
    expect(routeAB.stderr.length + routeAB.stdout.length, '路 A/B 错误信息可读（非空）').toBeGreaterThan(0)

    // 对照（原样包实锚分支——staging 单目录拷贝断裂，CT-DISK-05 实锚自证）
    const aggregate = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${join(tree, 'forge')}`], userData)
    expect(aggregate.code, '原样包 add 非零退出（staging 断裂）').not.toBe(0)
    expect(
      aggregate.stderr + aggregate.stdout,
      '错误含 pnpm 断裂实锚 ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND（兄弟 file: 依赖在 staging 内结构性缺席）',
    ).toContain('ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND')

    // State（CT-DISK-09 O1/O3 反向锚）：已装清单零变化 + profile 侧零 forge 写入
    expect(JSON.stringify(desktopInstalledBundles(userData)), '路 A/B/原样包全 rejection 后已装清单零变化').toBe(bundlesBefore)
    expect(existsSync(desktopPkgEntryDir(userData, FORGE_PKG)), 'profile 侧零 forge 条目物化（O3 误接纳即红）').toBe(false)
  })

  test('CT-DISK-07 #B2 O1：缺件不装 + patch 行在场——缺席降级可观察（诊断留痕 + 降级不扩散）', async () => {
    const four = BARE_BUNDLES.filter((b) => b !== KNOWLEDGE)
    userData = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-ud-'))
    // 构造（CT-DISK-07 Preconditions，solo 形态适配）：knowledge 不逐件 add、forge solo 变体
    // patch 插行仍声明 knowledge——装载缺席可观察构造（旅程 3 #B2 同判据 desktop 通道承载）
    for (const bare of four) {
      const add = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${memberDir(bare)}`], userData)
      expect(add.code, `四件逐件 solo add 成功 ${bare}（exit=${String(add.code)}）`).toBe(0)
    }
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`], userData)
    expect(addForge.code, `forge solo 变体 add 成功（exit=${String(addForge.code)}）`).toBe(0)

    const { app, page, clientUrls } = await launchDesktop(env, userData)
    try {
      // Output（CT-DISK-07）：宿主正常启动（降级不扩散——O2 回归面：任一在场件不装载即红）
      await waitBootReady(page)
      await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 120_000 })
      // State：在场四件 client 半侧取件；缺席件（knowledge）零取件（负向精确——禁 OR 稀释）
      for (const bare of four) {
        expect(clientUrls.some((u) => u.includes(bare)), `在场件 client 取件 ${bare}`).toBe(true)
      }
      expect(clientUrls.some((u) => u.includes(KNOWLEDGE)), '缺席件 knowledge client 零取件').toBe(false)
    } finally {
      await closeApp(app)
    }
    // State（CT-DISK-07 锚点·已回填实锚）：缺席诊断留痕含缺席包名（O3 静默缺席 = 红；
    // 落盘面 = {userData}/logs app-*.jsonl——异步队列，poll 等待落盘）
    await expect
      .poll(() => desktopAbsenceEvents(userData).filter((e) => e.message.includes(KNOWLEDGE)).length, { timeout: 30_000, interval: 2_000 })
      .toBeGreaterThanOrEqual(1)
    // 复位：卸 forge（四件条目保留），后续用例重建完整六条目
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG], userData)
    expect(remove.code, `复位卸 forge（exit=${String(remove.code)}）`).toBe(0)
  })

  test('CT-DISK-01 #step-1/#step-3（路 C 终态）O1：五件逐件 + forge solo add → dump-config 五条 insert 条目 + 反向锚', async () => {
    const forgePkgBefore = readFileSync(join(soloForgeDir(), 'package.json'))
    // Input（CT-DISK-01，路 C 终态安装形态）：knowledge 补装 → 五件齐 → forge solo 变体 add
    const addKn = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${memberDir(KNOWLEDGE)}`], userData)
    expect(addKn.code, `knowledge 逐件 solo add 成功（exit=${String(addKn.code)}）`).toBe(0)
    const addForge = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`], userData)
    expect(addForge.code, `forge solo 变体 add 成功（exit=${String(addForge.code)}）stderr=${addForge.stderr.slice(-400)}`).toBe(0)

    // State（CT-DISK-01 机械锚）：{userData}/profile 侧 forge 条目物化在场且非空（add 目标直挂）
    const forgeEntry = desktopPkgEntryDir(userData, FORGE_PKG)
    expect(existsSync(forgeEntry), `forge 条目物化在场 ${forgeEntry}`).toBe(true)
    expect(readdirSync(forgeEntry).length, 'forge 条目目录非空').toBeGreaterThan(0)

    // State（CT-DISK-01）：已装清单含 forge 条目 + 五条裸名条目（solo 逐件独立条目，逐条精确）
    const bundles = desktopInstalledBundles(userData)
    expect(bundles, '已装清单含 forge 条目').toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `已装清单含裸名条目 ${bare}`).toContain(bare)

    // State（CT-DISK-01 机械锚）：dump-config 组合实况五条 insert 条目（`- id:` + 缩进 `name:` 形态）
    // + 共库 config 全量在场（dbFile 表达式 ≥4 处——project/spec/task-loop/knowledge）
    const dump = await runDesktopDsh(env, ['--profile', 'desktop', '--dump-config'], env.dshHome)
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）stderr=${dump.stderr.slice(-400)}`).toBe(0)
    expect(dump.stdout, 'dump-config 含 forge patch 段标记').toContain('# == @dsh-forge/forge')
    for (const bare of BARE_BUNDLES) {
      expect(dump.stdout, `dump-config 含 insert 条目 ${bare}（insertEntryPattern fix-7 序列化形状）`).toMatch(insertEntryPattern(bare))
    }
    const dbFileHits = dump.stdout.match(/forge\/db\/forge\/forge\.db/g)?.length ?? 0
    expect(dbFileHits, '共库 config 全量在场（四件持库件 dbFile 表达式）').toBeGreaterThanOrEqual(4)

    // Invariants（CT-DISK-01）：solo 变体零 file: 兄弟依赖（路 C 终态安装物形状自证）
    const soloPkg = JSON.parse(readFileSync(join(soloForgeDir(), 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    expect(
      Object.values(soloPkg.dependencies ?? {}).filter((spec) => spec.startsWith('file:')),
      'solo 变体零 file: 兄弟依赖声明（CT-DISK-09 路 C 形状）',
    ).toEqual([])

    // Side-effect（CT-DISK-01）：安装物源目录零改写（forge solo 变体 package.json 字节不变）
    expect(readFileSync(join(soloForgeDir(), 'package.json'))).toEqual(forgePkgBefore)

    // 锚点·反向（G3 正反两向）：{DSH_HOME}/profiles/desktop 恒不产生
    expect(existsSync(join(env.dshHome, 'profiles', 'desktop')), '反向锚：{DSH_HOME}/profiles/desktop 恒缺席').toBe(false)
  })

  test('CT-DISK-06 #B3 O1/O2：重复 add 幂等或显式冲突——清单唯一，禁止第三态', async () => {
    const bundlesBefore = desktopInstalledBundles(userData)
    // Input（CT-DISK-06）：再次执行同一 add
    const again = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`], userData)
    if (again.code === 0) {
      // O1（幂等）：exit 0 且清单仍唯一
      expect(again.code, 'O1 幂等成功（exit 0）').toBe(0)
    } else {
      // O2（显式冲突）：非零退出且错误含「已安装」语义——禁止第三态（无语义裸失败即红）
      expect(again.stderr + again.stdout, 'O2 显式冲突错误含已安装语义').toMatch(/已安装|already/u)
    }
    const bundlesAfter = desktopInstalledBundles(userData)
    expect(bundlesAfter.filter((b) => b === FORGE_PKG).length, '已装清单 forge 条目唯一（无双份装载）').toBe(1)
    expect(JSON.stringify(bundlesAfter), '对账清单除幂等允许面外零漂移').toBe(JSON.stringify(bundlesBefore))
  })

  test('CT-DISK-02 #step-2/#step-4 O1：五件装载——版本双校验 + 代际探针 + client 半侧实际取件 + 工作台在场', async () => {
    const nodeModules = desktopProfileNodeModules(userData)
    // 版本双校验 + 代际漂移探针（CT-DISK-02 Invariants / AGENTS 1.8）：不符即停，零后续取证
    cheapGenerationGate(nodeModules)
    // client 半侧文件锚（CT-DISK-02 State）：五件 dsh.client.platform 指向物在 profile 侧在场
    for (const { pkg, file, exists } of clientBundleFiles(nodeModules)) {
      expect(exists, `client bundle 指向物在场 ${pkg} → ${file}`).toBe(true)
    }

    const { app, page, clientUrls } = await launchDesktop(env, userData)
    try {
      // Output（CT-DISK-02）：宿主启动成功——boot 就绪 + 产品工作台可见
      await waitBootReady(page)
      await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 120_000 })
      // State 观察点 B：五件 client bundle 被宿主 client 注入通道实际取件（行为证据，非仅文件在场）
      for (const bare of BARE_BUNDLES) {
        expect(clientUrls.some((u) => u.includes(bare)), `client 注入通道实际取件 ${bare}`).toBe(true)
      }
    } finally {
      await closeApp(app)
    }
  })

  test('CT-DISK-03 #step-5 O1：共库落点——project_* 域表写入、单装库不存在', async () => {
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

      // State（CT-DISK-03）：单装库不存在（共库接管）
      expect(existsSync(defaultProjectDb(env.dshHome)), '单装库 project/project.db 不存在（共库接管）').toBe(false)
    } finally {
      await closeApp(app)
    }
  })

  test('CT-DISK-03 #step-6/#step-7 O1/O3：拆任务 + 派发——task_* 同库分表 + 派发日志落盘（真实模型门）', async () => {
    test.skip(!hasCredentials(), '真实模型凭据缺席（flywheel 口径留痕 skip——SMOKE-LEDGER §8）')
    const nodeModules = desktopProfileNodeModules(userData)
    // 版本双校验 + 代际探针复检（AGENTS 1.8 取证顺序纪律）
    cheapGenerationGate(nodeModules)
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

  test('CT-DISK-08 #B4 O1：共库未生效对照取证——patch dbFile 改回单装缺省 → 数据落单装库、共库零新行', async () => {
    const comboDb = comboDbPath(env.dshHome)
    const projectCountBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // 构造（CT-DISK-08 Preconditions）：solo 变体仓外副本，patch 中 project 条目 dbFile 改回单装缺省路径
    const variant = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-variant-'))
    const variantForge = join(variant, 'forge')
    cpSync(soloForgeDir(), variantForge, { recursive: true })
    const patchRel = (JSON.parse(readFileSync(join(variantForge, 'package.json'), 'utf8')) as { dsh?: { bundle?: { patch?: string } } }).dsh?.bundle?.patch
    expect(patchRel, 'solo 变体 patch 声明在场（构造前置）').toBeTruthy()
    const patchFile = join(variantForge, patchRel as string)
    const patched = patchProjectDbFileToDefault(readFileSync(patchFile, 'utf8'))
    expect(patched, '构造生效：project 条目 dbFile 已改写为单装缺省段').toContain('forge/db/project/project.db')
    writeFileSync(patchFile, patched)

    // Input（CT-DISK-08）：换装对照变体后添加项目
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG], userData)
    expect(remove.code, `卸 forge（exit=${String(remove.code)}）`).toBe(0)
    const addVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${variantForge}`], userData)
    expect(addVariant.code, `对照变体 add 成功（exit=${String(addVariant.code)}）stderr=${addVariant.stderr.slice(-400)}`).toBe(0)
    const { app, page } = await launchDesktop(env, userData)
    try {
      await waitBootReady(page)
      const ws = makeWorkspace('contrast')
      const row = await registerProject(page, ws, 'combo-contrast')
      expect(row.id, '对照轮项目注册成功').toBeTruthy()
    } finally {
      await closeApp(app)
    }

    // State（CT-DISK-08 O1）：单装库文件存在且含新行、共库零新行（O2 仍落共库 = patch 替换语义失效信号即红）
    const singleDb = defaultProjectDb(env.dshHome)
    expect(existsSync(singleDb), '单装库 project/project.db 出现（对照取证：落点确由 patch config 下发驱动）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有新注册行').toBeGreaterThanOrEqual(1)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库零新行（对照面）').toBe(projectCountBefore)

    // 复位：卸对照变体 → 重装 solo 正本（后续卸载三段 Preconditions 恢复）
    const removeVariant = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG], userData)
    expect(removeVariant.code, `卸对照变体（exit=${String(removeVariant.code)}）`).toBe(0)
    const addSolo = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'add', `link:${soloForgeDir()}`], userData)
    expect(addSolo.code, `重装 solo 正本（exit=${String(addSolo.code)}）`).toBe(0)
    rmSync(variant, { recursive: true, force: true })
  })

  test('CT-DISK-10（卸载三段·一）O1：卸 forge——条目移除 + 五件条目完好 + 数据快照零变化', async () => {
    const comboDb = comboDbPath(env.dshHome)
    // State 快照（锚点：共库/单装库文件快照卸载前后不变）
    const comboStatBefore = fileStat(comboDb)
    const comboRowsBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // Input（CT-DISK-10）：remove forge
    const remove = await runDesktopDsh(env, [...DESKTOP_PLUGIN, 'remove', FORGE_PKG], userData)
    expect(remove.code, `卸载成功退出（exit=${String(remove.code)}）stderr=${remove.stderr.slice(-400)}`).toBe(0)

    // State（锚点）：已装清单 forge 条目缺席 + 五件条目各自仍在场（O2 级联误删 = 红——solo 独立性）
    const bundles = desktopInstalledBundles(userData)
    expect(bundles, '清单 forge 条目缺席').not.toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `五件条目不受级联影响 ${bare}`).toContain(bare)
    // 五件 profile 侧包条目本体仍在场（零误删）
    for (const bare of BARE_BUNDLES) {
      expect(existsSync(desktopPkgEntryDir(userData, bare)), `五件条目物化在场 ${bare}`).toBe(true)
    }

    // State（锚点）：共库快照零变化（O3 数据丢失 = 红）
    expect(fileStat(comboDb), '共库文件快照卸载前后不变（size + mtime）').toEqual(comboStatBefore)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库行数零变化').toBe(comboRowsBefore)
  })

  test('CT-DISK-11（卸载三段·二）O1：残留件独立装载——五件双查在场 + 零真缺席 + forge-bundle-absent 零发射', async () => {
    const nodeModules = desktopProfileNodeModules(userData)
    // 版本双校验 + 代际探针（残留件逐件成立——CT-DISK-11 Invariants）
    cheapGenerationGate(nodeModules)

    // Input：冷启动宿主（无额外参数）
    const { app, page, clientUrls, stderr } = await launchDesktop(env, userData)
    try {
      // Output：宿主正常启动（O2 残留件被拖垮 = 红）
      await waitBootReady(page)
      await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 120_000 })
      // State（锚点）：五件残留条目服务/client 双查——client 半侧逐件实际取件
      for (const bare of BARE_BUNDLES) {
        expect(clientUrls.some((u) => u.includes(bare)), `残留件 client 取件 ${bare}`).toBe(true)
      }
      // State（反锚）：零真缺席装配（stderr 判据——forgeBundleAbsenceClues fix-8 收窄形态）
      expect(forgeBundleAbsenceClues(stderr), `零真缺席装配 stderr=${stderr.slice(-600)}`).toEqual([])
    } finally {
      await closeApp(app)
    }
    // State（锚点）：forge-bundle-absent 零真缺席发射（任一残留件缺席告警即红）
    expect(desktopAbsenceEvents(userData), 'forge-bundle-absent 零发射（O3 静默缺席反义面：缺席且零诊断才双红）').toEqual([])
  })

  test('CT-DISK-04（卸载三段·三）O1：卸下回落缺省 config 单装语义——新数据落单装库 + 共库只读保留 + 零孤儿 patch 行', async () => {
    const comboDb = comboDbPath(env.dshHome)
    const comboStatBefore = fileStat(comboDb)
    const comboRowsBefore = scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects')

    // Input（CT-DISK-04）：宿主冷启动（forge 已卸、五件残留）→ 添加新项目
    const { app, page } = await launchDesktop(env, userData)
    try {
      await waitBootReady(page)
      const ws = makeWorkspace('fallback')
      const row = await registerProject(page, ws, 'combo-fallback')
      expect(row.id, '回落轮项目注册成功').toBeTruthy()
    } finally {
      await closeApp(app)
    }

    // State（锚点）：回落新数据落单装库路径（文件出现且有新行）
    const singleDb = defaultProjectDb(env.dshHome)
    expect(existsSync(singleDb), '回落单装库 project/project.db 出现（回落缺省 config 单装语义）').toBe(true)
    expect(sqliteTables(singleDb), '单装库含 project_* 前缀域表').toContain('project_projects')
    expect(scalarCount(singleDb, 'SELECT COUNT(*) AS n FROM project_projects'), '单装库有回落新行').toBeGreaterThanOrEqual(1)

    // State（锚点）：存量共库只读保留零丢行（O3 卸载丢数据 = 红）
    expect(fileStat(comboDb), '共库文件快照零变化（size + mtime——只读保留）').toEqual(comboStatBefore)
    expect(scalarCount(comboDb, 'SELECT COUNT(*) AS n FROM project_projects'), '共库行数零变化').toBe(comboRowsBefore)

    // State（锚点）：卸载后对账无 forge 条目、无孤儿 patch 行（dump-config 零 forge insert 条目）
    const bundles = desktopInstalledBundles(userData)
    expect(bundles, '已装清单无 forge 条目（对账零残留）').not.toContain(FORGE_PKG)
    const dump = await runDesktopDsh(env, ['--profile', 'desktop', '--dump-config'], env.dshHome)
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）`).toBe(0)
    for (const bare of BARE_BUNDLES) {
      expect(dump.stdout, `无孤儿 patch insert 条目 ${bare}（组合器卸载零残留）`).not.toMatch(insertEntryPattern(bare))
    }
  })
})

/**
 * CT-DISK-08 构造器：patch 文本中 project 条目（`- id: project` 块）dbFile 表达式的
 * 共库段 `forge/db/forge/forge.db` → 单装缺省段 `forge/db/project/project.db`。
 * 只动 project 块内首处 dbFile 行——其余条目（spec/task-loop/knowledge）原样保留。
 */
function patchProjectDbFileToDefault(patchText: string): string {
  const lines = patchText.split(/\r?\n/)
  const blockStart = lines.findIndex((l) => l.trim() === '- id: project')
  if (blockStart === -1) throw new Error('构造失败：patch 文本无 project insert 条目')
  for (let i = blockStart; i < Math.min(blockStart + 6, lines.length); i++) {
    const line = lines[i] ?? ''
    if (line.includes('dbFile:') && line.includes('forge/db/forge/forge.db')) {
      lines[i] = line.replace('forge/db/forge/forge.db', 'forge/db/project/project.db')
      return lines.join('\n')
    }
  }
  throw new Error('构造失败：project 条目块内 dbFile 共库行缺席')
}
