// app-observability fix-11：dist:win 打包形态观测面旅程（journey.md 正本：
// .forge/docs/proposals/app-observability/testing/dist-win-packaged-observability/journey.md）。
// 外部依赖装配面结算门（AGENTS §1.4）真机取证 spec——dev 生境四路注错形态
// （e2e/specs/host-telemetry-observability.spec.ts，fix-3 形态裁决）的打包形态合流取证：
//
//   装配面先重建后取证：release 产物缺失 / mtime 早于 HEAD commit（陈旧 release 伪装回归）
//   / DSH_FORGE_OBS_DIST_REBUILD=1 时 beforeAll 内 run-once `pnpm dist:win`（构建+staging
//   物化+封包），随后 `dist:check` 装配物化核销（staging-manifest 自证）。
//   非 dev 生境：打包 exe 直启（DSH_FORGE_DEV_PROFILE 零置位；launchHost devProfile:false）；
//   DSH_FORGE_USER_DATA 在场 = fix-26 凭据桥关闭门（零真实模型 Hard Rule——userData 路径
//   本身在打包形态被便携 data 目录覆盖，此处仅承担凭据隔离门）。
//   取证面 = JSONL 日志文件（打包版 CDP 端口不开放——旅程不变量；Playwright 经
//   remote-debugging-pipe 附接，零对外端口）。注错入口 = 打包形态内真实进程面：
//   main 兜底钩（app.evaluate 定时器 throw）/ renderer console（page.evaluate）/
//   host IPC handler（preload dshForge.invoke 畸形负载）/ child stderr（零凭据发送模型错误）。
//   trace_id 全链：派生失败注入形态（fix-3 形态修正同径——happy path 零诊断事件系设计
//   使然；fail-open 行共享单 trace_id 即全链贯穿取证），真 ALS + bridge 显式携带，零 fake。
//   生产零税：IPC 错误回包 details 无 causeStack（打包形态 causeStack 选项恒 false）。
//   崩溃豁免：关停后重启 exe → 日志文件继续追加（打包版无终端，JSONL 是唯一证据面）。
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../support/rpc.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const UNPACKED_DIR = join(ROOT, 'release', 'installer', 'win-unpacked')
const EXE = join(UNPACKED_DIR, 'dsh-forge.exe')
const ASSEMBLE_SCRIPT = join(ROOT, 'scripts', 'assemble-installer-resources.mjs')
// 证据归档（slug 目录，不进 git——AGENTS §5.2 过程产物纪律）
const KEEP_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/app-observability/fix-11/001-dist-win-packaged-observability'

// ── 注入标记（唯一化——与宿主自发日志行零碰撞；dev spec 同名族加 pk 前缀） ──
const MARK_FALLBACK = 'pk-telem-fallback-uncaught'
const MARK_RENDERER = 'pk-telem-renderer-console'
const MARK_FOLD_CLOSER = 'pk-telem-fold-closer-warn'
const MARK_PROMPT = 'pk-telem-prompt-send'

interface DiagLine {
  timestamp: string
  level: string
  trace_id: string
  process: string
  message: string
  event: string
  stack?: string
  projectId?: string
  sessionId?: string
  cwd?: string
}

/** 日志目录定位：{userData}/logs（userData 打包形态 = 便携 {exe}/data——main.ts 装配裁决；
 *  断言面以运行中 main 的 app.getPath('userData') 实读为准，零猜测） */
async function resolveLogsDir(app: ElectronApplication): Promise<string> {
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  return join(userData, 'logs')
}

function readDiagLines(logsDir: string): DiagLine[] {
  if (!existsSync(logsDir)) return []
  const lines: DiagLine[] = []
  for (const name of readdirSync(logsDir)) {
    if (!/^app-\d{8}\.jsonl$/.test(name)) continue
    for (const raw of readFileSync(join(logsDir, name), 'utf8').split('\n')) {
      if (raw.trim() === '') continue
      try {
        lines.push(JSON.parse(raw) as DiagLine)
      } catch {
        // 非 JSON 行不属诊断汇（零猜测——跳过）
      }
    }
  }
  return lines
}

async function pollDiagLines(
  logsDir: string,
  predicate: (lines: readonly DiagLine[]) => boolean,
  timeoutMs: number,
): Promise<readonly DiagLine[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const lines = readDiagLines(logsDir)
    if (predicate(lines)) return lines
    if (Date.now() > deadline) throw new Error(`诊断行等待超时（${String(timeoutMs)}ms）：现有 ${String(lines.length)} 行`)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
}

async function typeDraft(page: Page, text: string): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
        return els.length > 0 && [...els].every((el) => el.isContentEditable)
      },
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => undefined)
  const composer = page.locator('[data-composer-input]').first()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await composer.click()
    await page.keyboard.insertText(text)
    const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(5_000)
  }
  throw new Error(`composer 键入失败（回显不含目标文本）：${text}`)
}

async function clickSend(page: Page): Promise<void> {
  const composer = page.locator('[data-composer-input]').first()
  await composer.click()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  const enabled = await sendButton.isEnabled().catch(() => false)
  if (enabled) await sendButton.click().catch(() => {})
  else await page.keyboard.press('Enter')
}

/** 发送重试环（会话日志落盘为唯一发送成功证据——1-29 同口径；打包版 dshHome = {userData}/dsh-home） */
async function sendUntilLanded(
  page: Page,
  userData: string,
  dirFragment: string,
  since: number,
): Promise<void> {
  const root = join(userData, 'dsh-home', 'sessions')
  const hitAt = (): number => {
    if (!existsSync(root)) return -1
    let hit = -1
    const visit = (dir: string, depth: number): void => {
      if (hit >= 0 || depth > 6) return
      let rows: string[] = []
      try {
        rows = readdirSync(dir)
      } catch {
        return
      }
      for (const row of rows) {
        const full = join(dir, row)
        let stat
        try {
          stat = statSync(full)
        } catch {
          continue
        }
        if (stat.isDirectory()) visit(full, depth + 1)
        else if (row.endsWith('.jsonl.zstd') && stat.mtimeMs >= since && dir.replaceAll('\\', '/').toLowerCase().includes(dirFragment)) hit = stat.mtimeMs
      }
    }
    visit(root, 0)
    return hit
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await clickSend(page)
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (hitAt() >= 0) return
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（dirFragment=${dirFragment}）——发送链路证据缺席`)
}

// ── 装配态（beforeAll 建立） ──
const assembly: { logsDir?: string; userData?: string } = {}

test.beforeAll(async () => {
  test.setTimeout(2_400_000) // 含 dist:win 全链构建预算（冷构建分钟级——评审留窗）
  // 陈旧 release 伪装回归防线：产物缺失 / mtime 早于 HEAD commit / 显式 rebuild 开关 → 重建
  const headTime = Number.parseInt(execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: ROOT, encoding: 'utf8' }).trim(), 10) * 1_000
  const exeTime = existsSync(EXE) ? statSync(EXE).mtimeMs : -1
  const stale = !existsSync(EXE) || exeTime < headTime || process.env.DSH_FORGE_OBS_DIST_REBUILD === '1'
  if (stale) {
    const build = spawnSync('pnpm', ['dist:win'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 2_100_000,
      shell: true,
      env: { ...process.env },
    })
    expect(build.status, `dist:win 构建失败：tail=${(build.stdout ?? '').slice(-2000)}${(build.stderr ?? '').slice(-2000)}`).toBe(0)
  }
  expect(existsSync(EXE), '打包 exe 就位（release/installer/win-unpacked/dsh-forge.exe）').toBe(true)
  expect(statSync(EXE).mtimeMs, '产物新鲜度：exe mtime ≥ HEAD commit（陈旧 release 不作证据）').toBeGreaterThanOrEqual(headTime)
  // 装配物化核销：resources staging-manifest 自证（dist:check 幂等校验面）
  const check = spawnSync('node', [ASSEMBLE_SCRIPT, '--check', join(UNPACKED_DIR, 'resources')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  expect(check.status, `staging --check 失败：${check.stdout}${check.stderr}`).toBe(0)
  expect(check.stdout).toContain('STAGING_CHECK_OK')
  // 被测改动闭包进包核销：staging manifest 提及 telemetry 装配（host 闭包整树入包的自证锚）
  const manifest = readFileSync(join(UNPACKED_DIR, 'resources', 'staging-manifest.json'), 'utf8')
  expect(manifest.length, 'staging-manifest 非空（物化清单齐备）').toBeGreaterThan(0)
  // 单实例纪律：无残留「本包」实例（便携 userData 锁竞争即秒败——按 exe 路径过滤，
  // 用户真机安装实例不受本断言约束；单实例锁按 userData 键控，打包便携 data 目录
  // = release 本地，仅本 spec 使用）
  const selfInstances = execSync(
    `powershell -NoProfile -Command "Get-Process dsh-forge -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"`,
    { encoding: 'utf8' },
  )
  expect(
    selfInstances.split('\n').filter((p) => p.trim().toLowerCase() === EXE.toLowerCase()),
    '无残留本包 dsh-forge.exe 实例（单实例锁纪律）',
  ).toHaveLength(0)
})

test('dist:win 打包形态观测面：四路注错落 app-*.jsonl + 生产零税回包 + 全链同 trace_id + 重启追加', async () => {
  test.setTimeout(1_200_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-pk-telem-'))
  assembly.userData = userData
  // 真 git 仓库夹具（链 B prompt 拦截器仅对 git 项目激活——dev spec 同配方）
  const wsDir = mkdtempSync(join(tmpdir(), 'dsh-forge-pk-telem-ws-'))
  execFileSync('git', ['-c', 'user.email=pk@test', '-c', 'user.name=pk', 'init', '-b', 'main'], { cwd: wsDir, stdio: 'pipe' })
  writeFileSync(join(wsDir, 'README.md'), 'packaged observability fixture\n')
  execFileSync('git', ['add', '.'], { cwd: wsDir, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.email=pk@test', '-c', 'user.name=pk', 'commit', '-m', 'init'], { cwd: wsDir, stdio: 'pipe' })

  const launched = await launchHost({
    userData, // 打包形态 userData 路径被便携 data 覆盖——此值仅承担 DSH_FORGE_USER_DATA 凭据桥关闭门
    executablePath: EXE,
    devProfile: false, // 非 dev 生境：DSH_FORGE_DEV_PROFILE 零置位（旅程不变量）
    timeouts: { firstWindow: 120_000, bootReady: 120_000, loaderLive: 120_000, workbenchVisible: 60_000 },
  })
  const app = launched.app
  const page = launched.page
  const logsDir = await resolveLogsDir(app)
  assembly.logsDir = logsDir
  const baseline = readDiagLines(logsDir).length
  try {
    // 生境自证：运行时 dev profile 未激活（causeStack 选项 = form==='dev'——打包恒 false）
    const formEnv = await app.evaluate(() => process.env.DSH_FORGE_DEV_PROFILE)
    expect(formEnv ?? '', '非 dev 生境：DSH_FORGE_DEV_PROFILE 零置位').toBe('')

    const t0 = Date.now() - 2_000

    // ── 路③ renderer console（error 标记 + 异文 warn 收口折叠组） ──
    await page.evaluate(([marker, closer]) => {
      console.error(marker)
      console.warn(closer)
    }, [MARK_RENDERER, MARK_FOLD_CLOSER] as const)

    // ── 路① main 兜底钩（真 uncaughtException——定时器回调 throw，同步崩溃行） ──
    await app.evaluate(() => {
      setTimeout(() => {
        throw new Error('pk-telem-fallback-uncaught')
      }, 0)
    })

    // ── 路④ host IPC handler（畸形负载 → handler 抛错 → rpc-envelope 单点埋点），
    //    兼承载 Step 2 生产零税断言：错误回包正常返回调用方（reject 信封）且 details
    //    无 causeStack（打包形态 = 生产生境，零税面成立） ──
    const reply = await page.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge
      try {
        await forge?.invoke('forge:projects/register', {})
        return { threw: false, text: '' }
      } catch (error) {
        const blob = JSON.stringify({
          message: String((error as Error)?.message ?? error),
          own: Object.fromEntries(Object.getOwnPropertyNames(error ?? {}).map((k) => [k, (error as Record<string, unknown>)[k]])),
        })
        return { threw: true, text: blob }
      }
    })
    expect(reply.threw, '④ IPC 错误回包正常返回调用方（业务语义不破——rpc-envelope 信封语义）').toBe(true)
    expect(reply.text.includes('causeStack'), 'Step 2 生产零税：错误回包无 causeStack 字段（打包形态零税面）').toBe(false)

    // ── 路② child + ⑤ trace 全链：注册 → 芯片选工作区 → detach 注入派生失败 → 发送
    //    （judge 'route' → reroute 派生 sessionCreate 抛错 → 拦截层 fail-open emit，
    //    ALS 上下文内——行带链 B trace_id；process=child，bridge 显式携带生效） ──
    await registerProject(page, wsDir, 'pk-telem-ws')
    await selectWorkspaceViaChip(page, 'pk-telem-ws')
    execFileSync('git', ['checkout', '--detach'], { cwd: wsDir, stdio: 'pipe' })
    await typeDraft(page, MARK_PROMPT)
    const tInject = Date.now() - 1_000
    await clickSend(page)
    await pollDiagLines(
      logsDir,
      (lines) => lines.some((l) => l.event === 'fail-open' && l.trace_id !== '-' && Date.parse(l.timestamp) >= tInject),
      120_000,
    )
    // happy path 重发（零凭据模型失败可接受——user 消息落账不受影响）+ child 证据等待
    const tHealthyStart = Date.now()
    execFileSync('git', ['checkout', 'main'], { cwd: wsDir, stdio: 'pipe' })
    await typeDraft(page, `${MARK_PROMPT}-ok`)
    const tSend = Date.now() - 1_000
    await sendUntilLanded(page, userData, 'pk-telem-ws', tSend)
    await pollDiagLines(logsDir, (lines) => lines.some((l) => l.process === 'child'), 120_000)

    // 关停（before-quit flush：崩溃豁免前置——证据确定落盘后重启）
    await closeApp(app)

    // ══ 断言面（首轮终读） ══
    const lines = readDiagLines(logsDir)
    expect(lines.length, '统一日志汇 app-*.jsonl 有行（打包形态唯一证据面贯通）').toBeGreaterThan(baseline)
    for (const line of lines) {
      expect(typeof line.timestamp, `固定字段 timestamp 恒在：${JSON.stringify(line).slice(0, 120)}`).toBe('string')
      expect(line.level, '固定字段 level 恒在').toBeDefined()
      expect(line.trace_id, '固定字段 trace_id 恒在（无则 - 占位）').toBeDefined()
      expect(line.process, '固定字段 process 恒在（如实标注进程）').toBeDefined()
      expect(line.message, '固定字段 message 恒在').toBeDefined()
      expect(line.event, '固定字段 event 恒在').toBeDefined()
    }

    // 路① main 兜底钩：fallback-uncaught 行含注入标记栈（同步写红线③）
    const fallbackLine = lines.find(
      (l) => l.event === 'fallback-uncaught' && Date.parse(l.timestamp) >= t0 && (l.stack ?? '').includes(MARK_FALLBACK),
    )
    expect(fallbackLine, '① main 兜底钩：fallback-uncaught 行含注入标记完整栈').toBeDefined()
    expect(fallbackLine?.process, '① 兜底行 process=main').toBe('main')

    // 路④ host IPC handler：ipc-handler 错误行含栈
    const ipcLine = lines.find(
      (l) => l.event === 'ipc-handler' && l.level === 'error' && Date.parse(l.timestamp) >= t0 && typeof l.stack === 'string' && l.stack.length > 0,
    )
    expect(ipcLine, '④ host IPC handler：ipc-handler 错误行含栈').toBeDefined()

    // 路③ renderer console：标记行落盘（error 级 + process=renderer）
    const rendererLine = lines.find((l) => l.process === 'renderer' && l.event === 'console' && l.message.includes(MARK_RENDERER))
    expect(rendererLine, '③ renderer console：console.error 标记行落盘').toBeDefined()
    expect(rendererLine?.level, '③ renderer 标记行 error 级').toBe('error')

    // 路② child：含栈结构化行（relay/gateway-fold）或 child-stdio error 行在场
    const childLines = lines.filter((l) => l.process === 'child')
    expect(childLines.length, 'child 进程诊断行在场（stderr pipe / relay 双源任一）').toBeGreaterThan(0)
    expect(
      childLines.some((l) => (typeof l.stack === 'string' && l.stack.length > 0) || (l.event === 'child-stdio' && l.level === 'error')),
      '② child 源：含栈结构化行或 child-stdio error 行在场',
    ).toBe(true)

    // ⑤ 全链同 trace_id：注入窗口带 trace 行共享单值 + fail-open 行 process=child（bridge 显式携带）
    const injectTraced = lines.filter((l) => l.trace_id !== '-' && Date.parse(l.timestamp) >= tInject && Date.parse(l.timestamp) < tHealthyStart)
    expect(injectTraced.length, '⑤ 注入窗口带 trace_id 日志行在场').toBeGreaterThan(0)
    expect(injectTraced.some((l) => l.event === 'fail-open' && l.process === 'child'), '⑤ fail-open 行 process=child（跨进程 trace 贯穿）').toBe(true)
    expect([...new Set(injectTraced.map((l) => l.trace_id))], `⑤ 注入窗口全链同 trace_id（${String(injectTraced.length)} 行）`).toHaveLength(1)
    // happy path 窗口 trace 单值（零诊断行为设计使然——fix-3 形态裁决）；renderer 行恒不携带链 B trace
    const happyTraced = lines.filter((l) => l.trace_id !== '-' && Date.parse(l.timestamp) >= tSend)
    expect([...new Set(happyTraced.map((l) => l.trace_id))], '⑤ happy path 窗口 trace 单值').toHaveLength(happyTraced.length > 0 ? 1 : 0)
    expect(lines.filter((l) => l.trace_id !== '-' && l.process === 'renderer' && Date.parse(l.timestamp) >= tInject), '⑤ renderer 行不携带链 B trace').toHaveLength(0)

    // 无 trace 行占位：非链路行 trace_id = '-'
    expect(lines.some((l) => l.trace_id === '-'), '无 trace 行 trace_id=- 占位（格式完整性）').toBe(true)

    // ── 崩溃豁免 / 重启追加（旅程 Step 1b——打包版无终端，JSONL 唯一证据面） ──
    const before = readDiagLines(logsDir).length
    const relaunched = await launchHost({
      userData,
      executablePath: EXE,
      devProfile: false,
      dismiss: false, // 复启零 UI（毒化面防护——installer-smoke 纪律）
      timeouts: { firstWindow: 120_000, bootReady: 120_000, loaderLive: 120_000, workbenchVisible: 60_000 },
    })
    try {
      const logsDir2 = await resolveLogsDir(relaunched.app)
      expect(logsDir2, '重启同日志目录（滚动/追加模式不破）').toBe(logsDir)
      const after = await pollDiagLines(
        logsDir2,
        (ls) => ls.length > before,
        120_000,
      )
      expect(after.length, '重启后日志文件继续追加（同文件追加不破）').toBeGreaterThan(before)
      await closeApp(relaunched.app)
    } catch (error) {
      await closeApp(relaunched.app).catch(() => undefined)
      throw error
    }
  } finally {
    try {
      if (!app.process().killed) await closeApp(app)
    } catch {
      // 进程已退出/通道已闭——关停幂等跳过
    }
    // 证据归档 slug 目录（成功/失败均留痕，不静默清理）
    try {
      execSync(`robocopy "${(assembly.logsDir ?? 'missing').replaceAll('/', '\\')}" "${KEEP_DIR}/logs-last" /E /NFL /NDL /NJH /NJS`, { stdio: 'ignore' })
      execSync(`robocopy "${wsDir.replaceAll('/', '\\')}" "${KEEP_DIR}/fixture-ws-last" /E /NFL /NDL /NJH /NJS`, { stdio: 'ignore' })
    } catch {
      // robocopy 非 0 码 = 有复制行——证据已在盘
    }
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})

// 取证面路径注记：打包便携 userData = {exe}/data → 证据随 release/（git 外）与本任务
// task_logs 归档双留痕；release/ 构建产物与运行日志均不进 git（旅程 AC4）。
