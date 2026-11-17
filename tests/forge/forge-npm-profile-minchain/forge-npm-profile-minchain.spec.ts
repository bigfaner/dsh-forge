// 旅程 2：npm dsh 自定义 profile 安装 forge → patch config 共库逐项生效 → 最小链走通。
// journey = .forge/docs/proposals/plugin-forge-combo/testing/forge-npm-profile-minchain/journey.md
// contract = 同目录 contracts/contract.md（断言-契约溯源：每条断言标注 CT-NPM-* 条目 id）
//
// 环境面（e2e/support/forge-combo.ts 头注正本）：FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME。
// 观察面注记：profile forge = dsh-base 背板（无 web UI——CT-NPM-01 State）——
// CT-NPM-03 client 半侧的全量双查在 desktop 通道（CT-DISK-02，同安装物同机械）承载；
// 本 spec 以（a）闭包文件锚 +（b）CLI 冷启动零缺席装配两条机械锚取证 server 侧，
// web 校准轮（FORGE_COMBO_WEB_LOOP=1）补 HTTP 取件观察（journey 环境锚：校准轮 = dsh --profile web）。
// 最小链交互段（CT-NPM-04 步 5/6）= 真机 agent 会话驱动——收口执行体完成交互后，spec 经
// FORGE_COMBO_NPM_PROJECT_KEY 指认已注册项目键，机械断言共库双前缀分表与 config 落点。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  closureGaps,
  clientBundleFiles,
  comboDbPath,
  comboEnv,
  comboGateOn,
  defaultProjectDb,
  defaultTaskLoopDb,
  findDispatchLogs,
  installedBundles,
  profileNodeModules,
  runDsh,
  sqliteTables,
  versionPairs,
} from '../../../e2e/support/forge-combo.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md §8 留痕）——常规跑批跳过')

/** 进程树回收（Windows taskkill /T /F——closeApp 同径口径） */
function killTree(pid: number | undefined, child: ReturnType<typeof spawn>): void {
  if (pid !== undefined && process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

/** CLI 宿主冷启动（run-once 观察窗：alive 窗口 + stderr 收集 → 进程树回收） */
async function bootWindow(dshBin: string, profile: string, dshHome: string, args: readonly string[], windowMs: number): Promise<{ alive: boolean; stderr: string }> {
  const child = spawn(dshBin, ['--profile', profile, ...args], {
    env: { ...process.env, DSH_HOME: dshHome },
    cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-combo-cli-')),
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += String(chunk)
  })
  const alive = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), windowMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
  killTree(child.pid, child)
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once('exit', () => resolve())
  })
  return { alive, stderr }
}

test.describe('forge-npm-profile-minchain（旅程 2——CT-NPM-*）', () => {
  const env = comboEnv()

  test.afterAll(async () => {
    // 卸载收尾（幂等 best-effort——隔离 home 内零真机污染）
    await runDsh(env.dshBin, ['plugin', '--profile', 'forge', 'remove', FORGE_PKG], env.dshHome)
    rmSync(join(env.dshHome, 'profiles', 'forge-cal'), { recursive: true, force: true })
  })

  test('CT-NPM-01 #step-1/#step-2/#B2 O1：profile forge 创建 + 闭包物化（启动前即就绪）+ desktop 零渗透', async () => {
    // Invariants 基线（CT-NPM-01）：desktop profile 对账面先拍快照
    const desktopBundlesBefore = JSON.stringify(installedBundles(env.dshHome, 'desktop'))

    await runDsh(env.dshBin, ['plugin', '--profile', 'forge', 'remove', FORGE_PKG], env.dshHome)
    // Input（CT-NPM-01）：npm CLI 自定义 profile add
    const add = await runDsh(env.dshBin, ['plugin', '--profile', 'forge', 'add', `link:${env.forgeDir}`], env.dshHome)
    expect(add.code, `add 成功退出（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)

    // State（CT-NPM-01）：profile 目录创建 + 六包闭包物化（Side-effect：add 后未启动宿主即检查——安装期完成，#B2）
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    expect(closureGaps(nodeModules), '六包物化目录全部存在且非空（启动前）').toEqual([])

    // State（CT-NPM-01）：dsh.profile.bundles 对账含 forge + 五条裸名行（逐条精确——禁 OR 稀释）
    const bundles = installedBundles(env.dshHome, 'forge')
    expect(bundles, '对账含 forge 条目').toContain(FORGE_PKG)
    for (const bare of BARE_BUNDLES) expect(bundles, `对账含裸名行 ${bare}`).toContain(bare)

    // Invariants（CT-NPM-01）：desktop profile 零变化（通道不渗透）
    expect(JSON.stringify(installedBundles(env.dshHome, 'desktop')), 'desktop 对账面零变化').toBe(desktopBundlesBefore)
  })

  test('CT-NPM-02 #B1 O1：desktop 保留名拒绝——npm CLI 非零退出 + desktop 零写入', async () => {
    const before = JSON.stringify(installedBundles(env.dshHome, 'desktop'))
    // Input（CT-NPM-02）：npm CLI 对保留 profile 名 desktop 执行插件管理命令
    const res = await runDsh(env.dshBin, ['plugin', '--profile', 'desktop', 'add', `link:${env.forgeDir}`], env.dshHome)

    // Output（CT-NPM-02 O1）：CLI 拒绝——非零退出 + 可读错误（不锁文案字面）
    expect(res.code, 'npm CLI 拒绝 desktop 保留 profile（非零退出）').not.toBe(0)
    expect(res.stderr.length + res.stdout.length, '错误信息可读（非空）').toBeGreaterThan(0)
    // State（CT-NPM-02）：desktop 装载面零变化 + 无 forge 物化残留（Side-effect：无文件写入 desktop）
    expect(JSON.stringify(installedBundles(env.dshHome, 'desktop')), 'desktop 对账面零变化').toBe(before)
    expect(existsSync(join(profileNodeModules(env.dshHome, 'desktop'), '@dsh-forge', 'forge')), 'desktop 闭包无 forge 条目').toBe(false)
  })

  test('CT-NPM-03 #step-3（server 侧）：dsh --profile forge 冷启动——零缺席装配 + 版本双校验', async () => {
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    // 版本双校验前置（CT-NPM-03 Invariants / AGENTS 1.8）：不符即停取证
    for (const { pkg, installed, source } of versionPairs(nodeModules)) {
      expect(installed, `版本双校验 ${pkg}`).toBe(source)
    }
    // client 半侧文件锚（CT-NPM-03 State 前提）：五件 dsh.client.platform 指向物在闭包内在场
    for (const { pkg, file, exists } of clientBundleFiles(nodeModules)) {
      expect(exists, `client bundle 指向物在场 ${pkg} → ${file}`).toBe(true)
    }

    // Input（CT-NPM-03）：`dsh --profile forge` 冷启动——观察窗内存活（装载链无崩溃退出）
    const win = await bootWindow(env.dshBin, 'forge', env.dshHome, [], 20_000)
    expect(win.alive, 'CLI 宿主冷启动观察窗内存活').toBe(true)
    // Side-effect（CT-DISK-07/CT-NPM-06 反向锚——fix-1 forge-bundle-absent 兜底面）：
    // 零缺席装配 = stderr 无 @dsh-forge 缺席线索（缺席时官方 skippedBundles stderr 直落）
    expect(win.stderr.includes('@dsh-forge'), '零缺席装配（stderr 无 @dsh-forge 缺席线索）').toBe(false)
  })

  test('CT-NPM-03 #step-4（web 校准轮，FORGE_COMBO_WEB_LOOP=1）：client 半侧 HTTP 取件观察', async () => {
    test.skip(process.env.FORGE_COMBO_WEB_LOOP !== '1', 'web 校准轮门未置位（journey 环境锚：校准轮 = dsh --profile web）——SMOKE-LEDGER §8')
    // 校准回路：同一安装物装 web 模板 profile → HTTP 直取五件 client bundle（裸名行 client 注入正门）
    const calProfile = 'forge-cal'
    const addBase = await runDsh(env.dshBin, ['plugin', '--profile', calProfile, 'add', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], env.dshHome)
    expect(addBase.code, `web 背板就绪（exit=${String(addBase.code)}）`).toBe(0)
    const add = await runDsh(env.dshBin, ['plugin', '--profile', calProfile, 'add', `link:${env.forgeDir}`], env.dshHome)
    expect(add.code, `校准 profile add 成功（exit=${String(add.code)}）`).toBe(0)

    const { allocatePort } = await import('../../../e2e/support/ports.js')
    const port = allocatePort()
    const child = spawn(env.dshBin, ['--profile', calProfile, '--port', String(port)], {
      env: { ...process.env, DSH_HOME: env.dshHome },
      cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-combo-webloop-')),
      stdio: 'ignore',
      windowsHide: true,
    })
    try {
      // 就绪轮询（HTTP 200 门——web 宿主上线下限）
      let up = false
      for (let i = 0; i < 60 && !up; i++) {
        await new Promise((r) => setTimeout(r, 2_000))
        up = await fetch(`http://127.0.0.1:${String(port)}/`).then((r) => r.ok).catch(() => false)
      }
      expect(up, 'web 校准宿主上线').toBe(true)
      // State 观察点 B（CT-NPM-03）：五件 client bundle 经 client 注入通道可访问（HTTP 200）
      const nodeModules = profileNodeModules(env.dshHome, calProfile)
      for (const { pkg, file } of clientBundleFiles(nodeModules)) {
        const rel = file.slice(nodeModules.length + 1).replaceAll('\\', '/')
        const res = await fetch(`http://127.0.0.1:${String(port)}/node_modules/${rel}`)
        expect(res.ok, `client bundle HTTP 可达 ${pkg}（${rel}）`).toBe(true)
      }
    } finally {
      killTree(child.pid, child)
    }
  })

  test('CT-NPM-04 #step-5/#step-6 O1/O2：共库 config 逐项生效——双前缀分表 + 无单装缺省分叉（真机交互后取证）', async () => {
    const projectKey = process.env.FORGE_COMBO_NPM_PROJECT_KEY
    test.skip(projectKey === undefined || projectKey === '', '最小链交互段（真机 agent 会话 add_task/dispatch_task）未完成——SMOKE-LEDGER §8')
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    // 版本双校验（AGENTS 1.8——取证前廉价校验）
    for (const { pkg, installed, source } of versionPairs(nodeModules)) {
      expect(installed, `版本双校验 ${pkg}`).toBe(source)
    }

    // State（CT-NPM-04）：两域数据均落共库（project_* / task_* 前缀分表——同库互不越界）
    const comboDb = comboDbPath(env.dshHome)
    expect(existsSync(comboDb), '共库在场（patch dbFile = {DSH_HOME}/forge/db/forge/forge.db 物化落点）').toBe(true)
    const tables = sqliteTables(comboDb)
    expect(tables, 'project 域前缀表在场').toContain('project_projects')
    expect(tables, 'task 域前缀表在场').toContain('task_tasks')
    const db = new Database(comboDb, { readonly: true })
    try {
      const projects = (db.prepare('SELECT COUNT(*) AS n FROM project_projects').get() as { n: number }).n
      const tasks = (db.prepare('SELECT COUNT(*) AS n FROM task_tasks WHERE project_key = ?').get(projectKey) as { n: number }).n
      expect(projects, 'project 域有行').toBeGreaterThanOrEqual(1)
      expect(tasks, 'task 域有行（最小链拆任务落同库）').toBeGreaterThanOrEqual(1)
    } finally {
      db.close()
    }

    // Invariants（CT-NPM-04 O2 回归面）：无残留单装缺省分叉——patch config 整体替换非合并的
    // 落盘行为面（生效 dbFile 无任何一项等于单装缺省路径 = 单装缺省库文件不存在）
    expect(existsSync(defaultProjectDb(env.dshHome)), 'project 单装缺省库不存在（无合并分叉）').toBe(false)
    expect(existsSync(defaultTaskLoopDb(env.dshHome)), 'task-loop 单装缺省库不存在（无合并分叉）').toBe(false)

    // State（CT-NPM-04）：派发运营日志落 slug 单元（logs/<slug>.jsonl）
    const logs = findDispatchLogs(env.dshHome)
    expect(logs.length, '派发运营日志（logs/<slug>.jsonl）落盘').toBeGreaterThanOrEqual(1)
  })
})
