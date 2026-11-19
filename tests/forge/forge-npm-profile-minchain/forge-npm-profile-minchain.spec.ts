// 旅程 2：npm dsh 自定义 profile 安装 forge → patch config 共库逐项生效 → 最小链走通。
// journey = .forge/docs/proposals/plugin-forge-combo/testing/forge-npm-profile-minchain/journey.md
// contract = 同目录 contracts/contract.md（断言-契约溯源：每条断言标注 CT-NPM-* 条目 id）
//
// 环境面（e2e/support/forge-combo.ts 头注正本）：FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME。
// 观察面注记：profile forge = dsh-base 背板（无 web UI——CT-NPM-01 State）——
// CT-NPM-03 client 半侧的全量双查在 desktop 通道（CT-DISK-02，同安装物同机械）承载；
// 本 spec 以（a）forge 组合器条目直挂物化锚 +（b）CLI 冷启动零缺席装配两条机械锚取证
// server 侧（闭包解析锚运行期冷启动装载——bug c26a8c2a fix-4：不锁包管理器物化布局），
// web 校准轮（FORGE_COMBO_WEB_LOOP=1）补 HTTP 取件观察（journey 环境锚：校准轮 = dsh --profile web）。
// 最小链交互段（CT-NPM-04 步 5/6）= 真机 agent 会话驱动——收口执行体完成交互后，spec 经
// FORGE_COMBO_NPM_PROJECT_KEY 指认已注册项目键，机械断言共库双前缀分表与 config 落点。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import { forgeBundleAbsenceClues } from '../../../e2e/support/bundle-absence.js'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  bundleResolutionGaps,
  clientBundleFiles,
  comboDbPath,
  comboEnv,
  comboEntryVersionPair,
  comboGateOn,
  defaultProjectDb,
  defaultTaskLoopDb,
  findDispatchLogs,
  generationDriftViolations,
  ensureRegistryProfile,
  installedBundles,
  installedPkgDir,
  profileBuildApprovalGaps,
  profileNodeModules,
  runDsh,
  sanitizedCliEnv,
  sqliteTables,
} from '../../../e2e/support/forge-combo.js'
import { establishWebAuthSession, extractBootToken, sessionReady } from '../../../e2e/support/web-boot-auth.js'

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
    env: sanitizedCliEnv(dshHome),
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

  test('CT-NPM-01 #step-1/#step-2/#B2 O1：profile forge 创建 + 组合器条目物化（启动前即就绪）+ insert patch 行生效 + desktop 零渗透', async () => {
    // Invariants 基线（CT-NPM-01）：desktop profile 对账面先拍快照
    const desktopBundlesBefore = JSON.stringify(installedBundles(env.dshHome, 'desktop'))

    await runDsh(env.dshBin, ['plugin', '--profile', 'forge', 'remove', FORGE_PKG], env.dshHome)
    // Input（CT-NPM-01）：npm CLI 自定义 profile add
    const add = await runDsh(env.dshBin, ['plugin', '--profile', 'forge', 'add', `link:${env.forgeDir}`], env.dshHome)
    expect(add.code, `add 成功退出（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)

    // State（CT-NPM-01）：profile 目录创建 + forge 组合器条目直挂物化（add 目标，
    // 与依赖物化布局无关——bug c26a8c2a fix-4：闭包解析锚运行期 CT-NPM-03，不锁布局）
    // （Side-effect：add 后未启动宿主即检查——安装期完成，#B2）
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    const forgeEntry = installedPkgDir(nodeModules, FORGE_PKG)
    expect(existsSync(forgeEntry), `forge 组合器条目物化在场 ${forgeEntry}`).toBe(true)
    expect(readdirSync(forgeEntry).length, 'forge 组合器条目目录非空').toBeGreaterThan(0)

    // State（CT-NPM-01）：boot 期 insert patch 行生效证据（fix-6 锚修订——
    // dsh.profile.bundles 为 profile 目录字段，patch 插行不经该面，bundles 对账断言废除；
    // 生效判据 = dump-config 组合实况五条 insert 条目 + 共库 config 全量在场；
    // 断言字面按 dump-config 实际序列化形状（bug 13ffb081 fix-7）：
    // 逐条目 `- id: <bareId>` 行 + 缩进 `  name: '@dsh-forge/<bare>'` 行（\r?\n CRLF 容忍），
    // 实锚样本 = task_logs 1.6/007-fcombo16c/dump-config.txt 与 009-fcombo16d/dump-config2.txt L373-400；
    // 五件冷启动装载运行期锚归 CT-NPM-03）
    const dump = await runDsh(env.dshBin, ['--profile', 'forge', '--dump-config'], env.dshHome)
    expect(dump.code, `dump-config 组合实况成功（exit=${String(dump.code)}）stderr=${dump.stderr.slice(-400)}`).toBe(0)
    expect(dump.stdout, 'dump-config 含 forge patch 段标记').toContain('# == @dsh-forge/forge')
    for (const bare of BARE_BUNDLES) {
      const bareId = bare.slice('@dsh-forge/'.length)
      expect(dump.stdout, `dump-config 含 insert 条目 ${bare}（- id: ${bareId} + 缩进 name: 行——bug 13ffb081 fix-7 序列化形状）`).toMatch(
        new RegExp(`^- id: ${bareId}$\\r?\\n^  name: '${bare}'$`, 'm'),
      )
    }
    const dbFileHits = dump.stdout.match(/forge\/db\/forge\/forge\.db/g)?.length ?? 0
    expect(dbFileHits, '共库 config 全量在场（project/spec/task-loop/knowledge 四件 dbFile 表达式）').toBeGreaterThanOrEqual(4)

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

  test('CT-NPM-03 #step-3（server 侧）：dsh --profile forge 冷启动——五件 bundle 全解析装载 + 零缺席装配 + 版本双校验', async () => {
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    // 版本双校验前置（CT-NPM-03 Invariants / AGENTS 1.8）——收窄至 forge 组合器条目
    // （bug c26a8c2a fix-4：依赖闭包不锁物化布局；不符即停取证）
    const { pkg, installed, source } = comboEntryVersionPair(nodeModules)
    expect(installed, `版本双校验 ${pkg}`).toBe(source)
    // 五件裸包代际漂移探针（M-3——AGENTS 1.8 程序化锚）：逐件 manifest 版本 + 服务面
    // 代际标记双校验，任一件代际陈旧即 fail-loud（1.8 轮 stale bundle 误测教训固化）
    expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿（manifest + 服务面标记双校验）').toEqual([])

    // Input（CT-NPM-03）：`dsh --profile forge` 冷启动——观察窗内存活（装载链无崩溃退出）。
    // 五件 bundle 全解析装载 = 运行期可观测行为锚（c26a8c2a 复跑取证形态：冷启动五件
    // 全解析、装载链通——不预设依赖物化在 profile 侧的布局位置）
    const win = await bootWindow(env.dshBin, 'forge', env.dshHome, [], 20_000)
    expect(win.alive, 'CLI 宿主冷启动观察窗内存活').toBe(true)
    // State（CT-NPM-03）：零缺席装配 = stderr 无真缺席线索（bug 47af0d8c fix-8 锚收窄——
    // 缺席判据 = entries 未解析/装载失败形态；合法 pending 诊断行
    // `did not activate … (@dsh-forge/x): pending (waiting for service …)` 为背板服务缺席的
    // 正常非缺席证据（headless CLI 背板无 webServer/connection 等服务），不判 FAIL。
    // 判据实现与正反双向自证 = e2e/support/bundle-absence.ts + tests/forge/.../bundle-absence 单测；
    // 反锚面 CT-DISK-07/CT-NPM-06 forge-bundle-absent 不变）
    expect(forgeBundleAbsenceClues(win.stderr), `零真缺席装配（合法 pending 除外）stderr=${win.stderr.slice(-600)}`).toEqual([])
  })

  test('CT-NPM-03 #step-4（web 校准轮，FORGE_COMBO_WEB_LOOP=1）：client 半侧 HTTP 取件观察', async () => {
    test.skip(process.env.FORGE_COMBO_WEB_LOOP !== '1', 'web 校准轮门未置位（journey 环境锚：校准轮 = dsh --profile web）——SMOKE-LEDGER §8')
    // 版本门偏斜裁决（bug 3a0467b5/4d1f5038——2026-11-19 npm registry 实态核销）：
    // @deepseek-ai/dsh-base 与 @deepseek-ai/dsh-web-app dist-tags latest=0.0.1-rc.1
    // （偏斜陈旧，低于现行 runtime 兼容带——裸 tag add 被版本门拒「installation rejected
    // … incompatible」）、next=0.2.2-rc.5，0.2.2-rc.2 精确在列。裁决 = spec pin 到
    // 可用版本：缺省 pin 0.2.2-rc.2（== CLI runtime，版本门兼容带内）；runtime 升级
    // 经 FORGE_COMBO_WEB_LOOP_PIN 改 pin，latest tag 修复前不回退裸 tag。
    const pin = process.env.FORGE_COMBO_WEB_LOOP_PIN ?? '0.2.2-rc.2'
    const calProfile = 'forge-cal'
    const registrySpecs = [`@deepseek-ai/dsh-base@${pin}`, `@deepseek-ai/dsh-web-app@${pin}`]
    // 校准 profile 固化（bug a85b6816 / 台账留痕 dff389f6——fix-20，消费侧配置单源）：
    // ①package.json 预物化（spec pins 直挂）——dsh CLI 对缺席 profile 走 initProfile 默认
    //   背板（CLI 安装世代 pin），与 registry pin 混代即触发版本门 reject（Round C 实证）；
    //   package.json 在场 init 整体跳过（Round D 实证 exit 0）。
    // ②构建脚本批准面（PROFILE_ALLOW_BUILDS 单源全键 true）——dsh init 落占位值（未批准）
    //   时 pnpm 11 拦截构建脚本 exit 1（ERR_PNPM_IGNORED_BUILDS，两轮同签名 026-webloop +
    //   fix-20/001-repro Round A）。两者 add 前写入，registry 通道零临场交互。
    ensureRegistryProfile(env.dshHome, calProfile, registrySpecs)
    // 校准回路：同一安装物装 web 模板 profile → HTTP 直取五件 client bundle（裸名行 client 注入正门）。
    // 取件路径经 clientBundleFiles 装载链解析（profile 侧 → 链接包自身 node_modules 回落——c26a8c2a）
    const addBase = await runDsh(env.dshBin, ['plugin', '--profile', calProfile, 'add', ...registrySpecs], env.dshHome)
    expect(addBase.code, `web 背板就绪（exit=${String(addBase.code)}，pin=${pin}）stderr=${addBase.stderr.slice(-400)}`).toBe(0)
    expect(profileBuildApprovalGaps(env.dshHome, calProfile), '构建脚本批准面固化（单源全键批准，安装后零缺口）').toEqual([])
    const add = await runDsh(env.dshBin, ['plugin', '--profile', calProfile, 'add', `link:${env.forgeDir}`], env.dshHome)
    expect(add.code, `校准 profile add 成功（exit=${String(add.code)}）`).toBe(0)

    const { allocatePort } = await import('../../../e2e/support/ports.js')
    const port = allocatePort()
    // web 校准宿主启动（stdio 收 stdout——boot token 认证门形态，ledger 192d4631）：
    // 宿主上线即打印 `dsh web: http://127.0.0.1:<port>/?token=…`（AGENTS 1.8 boot token
    // 既有语义），认证证据单源 = boot stdout。
    let bootStdout = ''
    const child = spawn(env.dshBin, ['--profile', calProfile, '--port', String(port)], {
      env: sanitizedCliEnv(env.dshHome),
      cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-combo-webloop-')),
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      bootStdout += String(chunk)
    })
    try {
      // 就绪轮询（认证形态——stale probe 退役留痕：旧判据 fetch('/') 无 token 恒 401，
      // 031-webloop curl 精查实锚；新判据 = token 提取 → cookie 会话 → 会话 GET / ok）。
      // 031 轮执行级放宽实证：add + boot 流程超缺省 timeout，执行面须 --timeout ≥ 300s。
      let session: Awaited<ReturnType<typeof establishWebAuthSession>>
      let up = false
      for (let i = 0; i < 60 && !up; i++) {
        await new Promise((r) => setTimeout(r, 2_000))
        if (child.exitCode !== null) break
        const token = extractBootToken(bootStdout, port)
        if (token === undefined) continue
        session ??= await establishWebAuthSession(`http://127.0.0.1:${String(port)}`, token)
        if (session !== undefined) up = await sessionReady(`http://127.0.0.1:${String(port)}`, session.cookie)
      }
      // fail-loud 分流：进程提前退出 = 启动失败面（携 stdout 尾），非认证门红
      expect(child.exitCode, `web 校准宿主进程存活（提前退出 = 启动失败）stdout=${bootStdout.slice(-400)}`).toBeNull()
      const token = extractBootToken(bootStdout, port)
      expect(token, 'boot token 自宿主 stdout 提取（`dsh web: …?token=…` 行，端口定向）').toBeTruthy()
      session ??= await establishWebAuthSession(`http://127.0.0.1:${String(port)}`, token as string)
      expect(session, 'token → cookie 会话建立（token query 303 + Set-Cookie；零 Set-Cookie = 认证面漂移即停）').toBeTruthy()
      expect(up, 'web 校准宿主上线（认证会话 GET / ok——192d4631 新判据）').toBe(true)
      // State 观察点 B（CT-NPM-03）：五件 client bundle 经 client 注入通道可访问（HTTP 200）。
      // 静态面走 cookie 会话语义（token query 直取 → 404，031 curl 实锚）——携会话 Cookie 头取件。
      const nodeModules = profileNodeModules(env.dshHome, calProfile)
      for (const { pkg, file } of clientBundleFiles(nodeModules)) {
        const rel = file.slice(nodeModules.length + 1).replaceAll('\\', '/')
        const res = await fetch(`http://127.0.0.1:${String(port)}/node_modules/${rel}`, {
          headers: { cookie: (session as { cookie: string }).cookie },
        })
        expect(res.ok, `client bundle HTTP 可达 ${pkg}（${rel}）`).toBe(true)
      }
    } finally {
      killTree(child.pid, child)
    }
  })

  test('CT-NPM-05 #B3（server 侧干跑）：config 缺失变体（仓外副本 link:）——五件装载 + patch config 缺席 + 回落前提', async () => {
    // 安装物变体 = scripts/build-forge-copy-variant.mjs --strip-config 出树的仓外副本
    // （bug 63a9a2b8 修复面：link: add 不装 link 目标依赖闭包——变体必须物化 Node
    // 解析闭包后方可安装；构造器保证，本用例先行为锚复核再取证）。
    // DB 行级锚（双单装库新行 + 共库零新行）归真机收口轮交互段补做（SMOKE-LEDGER §8）。
    const copyForgeDir = process.env.FORGE_COMBO_COPY_FORGE_DIR
    test.skip(copyForgeDir === undefined || copyForgeDir === '', 'config 缺失变体（仓外副本）未构造——scripts/build-forge-copy-variant.mjs --strip-config 出树后置 FORGE_COMBO_COPY_FORGE_DIR——SMOKE-LEDGER §8')
    const copyProfile = 'forge-copy'

    // 前置行为锚（bug 63a9a2b8）：副本五件 entry 自解析基冷启动可达（闭包断裂即停取证）
    expect(bundleResolutionGaps([copyForgeDir, copyForgeDir.replace(/[\\/]forge$/, '')]), `副本解析闭包在场 copyForgeDir=${copyForgeDir}`).toEqual([])

    await runDsh(env.dshBin, ['plugin', '--profile', copyProfile, 'remove', FORGE_PKG], env.dshHome)
    const add = await runDsh(env.dshBin, ['plugin', '--profile', copyProfile, 'add', `link:${copyForgeDir}`], env.dshHome)
    expect(add.code, `变体 add 成功（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)
    const instForge = join(profileNodeModules(env.dshHome, copyProfile), '@dsh-forge', 'forge')

    // State：patch 五条插行在场；config 段缺席判据锚变体安装物本体（strip 后安装物
    // patch 文件零 config 行——机械锚）。dump-config 仅作插行在场复核：harness 相邻
    // 环境（installation-anchor forge 遮蔽——dsh-app-boot resolveBundleDir 安装锚先行）
    // 可能向 dump 注入携带 config 的装配行，不作为 config 缺席判据面。
    const dump = await runDsh(env.dshBin, ['--profile', copyProfile, '--dump-config'], env.dshHome)
    expect(dump.code, `dump-config 成功（exit=${String(dump.code)}）stderr=${dump.stderr.slice(-400)}`).toBe(0)
    expect(dump.stdout, 'dump-config 含 forge patch 段标记').toContain('# == @dsh-forge/forge')
    for (const bare of BARE_BUNDLES) {
      const bareId = bare.slice('@dsh-forge/'.length)
      expect(dump.stdout, `插行在场 ${bare}`).toMatch(new RegExp(`^- id: ${bareId}$\\r?\\n^  name: '${bare}'$`, 'm'))
    }
    const instPatch = readFileSync(join(instForge, 'cordis.patch.yml'), 'utf8')
    expect(instPatch.includes('config:'), `变体安装物 patch 零 config 段（strip 机械锚）realpath=${realpathSync(instForge)}`).toBe(false)

    // 冷启动装载：五件 bundle 全解析（回落可生效前提）；零真缺席装配
    const win = await bootWindow(env.dshBin, copyProfile, env.dshHome, [], 20_000)
    expect(win.alive, '变体宿主冷启动观察窗内存活').toBe(true)
    expect(forgeBundleAbsenceClues(win.stderr), `零真缺席装配 stderr=${win.stderr.slice(-600)}`).toEqual([])
  })

  test('CT-NPM-04 #step-5/#step-6 O1/O2：共库 config 逐项生效——双前缀分表 + 无单装缺省分叉（真机交互后取证）', async () => {
    const projectKey = process.env.FORGE_COMBO_NPM_PROJECT_KEY
    test.skip(projectKey === undefined || projectKey === '', '最小链交互段（真机 agent 会话 add_task/dispatch_task）未完成——SMOKE-LEDGER §8')
    const nodeModules = profileNodeModules(env.dshHome, 'forge')
    // 版本双校验（AGENTS 1.8——取证前廉价校验；收窄至 forge 组合器条目，c26a8c2a fix-4）
    const { pkg, installed, source } = comboEntryVersionPair(nodeModules)
    expect(installed, `版本双校验 ${pkg}`).toBe(source)
    // 五件裸包代际漂移探针（M-3）——大取证前廉价校验（AGENTS 1.8 取证顺序纪律）
    expect(generationDriftViolations(nodeModules), '五件裸包代际漂移探针全绿').toEqual([])

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
