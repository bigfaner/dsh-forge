// app-observability fix-3 观测面 e2e（1.4 取证债重跑——断言锚 apps/host/src/telemetry/host-wiring.ts，
// 日志落点 {userData}/logs/app-YYYYMMDD.jsonl）。真实多进程取证，零 fake：宿主真机 boot（dev
// profile）→ 错误源真实注入 → 统一日志汇断言。
//   ① dev:debug 终端回显：**撤自动化断言**（fix-3 形态裁决——Windows Electron GUI main stdout
//     在 pipe/文件重定向承载下结构性丢失，fix-2 三载体实证 out=0B；e2e 无 pty 不可测）。child
//     stderr→JSONL 自动断言保留（本文件 ②d——child-stdio 行经 stderr pipe → main 转译落盘）；
//     dev:debug 真实附接控制台人工走查一次留档（.forge/docs/proposals/app-observability/walkthrough/，
//     不进 git）。
//   ② 四路错误源注入 → app-*.jsonl 各含错误行（含栈面按源本性断言）：
//        main 兜底钩（真 uncaughtException——setTimeout throw，appendCrashLine 同步写）
//        host IPC handler（preload allowlist 通道畸形负载 → handler 抛错 → rpc-envelope 单点埋点）
//        renderer console（console.error/warn 官方 console-message 事件 → 转发，同文折叠窗
//          需异文行收口）
//        child（零凭据 prompt 发送 → child 侧模型错误 → stderr/console + gateway-fold relay）
//   ③ 链 B 全链 trace_id：**派生失败注入形态**（fix-3 形态修正——零凭据 happy path 无诊断事件
//     系设计使然，非缺陷）：夹具仓库 checkout --detach → 重路由派生 sessionCreate 抛错
//     （主树行 detached → 分支解析 null → 预铸 requireNonEmpty 拒绝）→ 拦截层显式拒绝前
//     emit fail-open 诊断事件（ALS 上下文内——行带链 B trace_id）→ 断言注入窗口内 fail-open
//     行共享同 trace_id；随后恢复分支重发（happy path）走完发送落盘 + ②d child 证据。
// 载体纪律：launchHost/closeApp 单源（e2e/support）；隔离 userData（e2e 单实例纪律）；零凭据
// 发送（Hard Rule 零真实模型——user 消息落账不受模型失败影响，1-29 同口径）。
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../support/rpc.js'

// ── 注入标记（唯一化——与宿主自发日志行零碰撞） ──
const MARK_FALLBACK = 'e2e-telem-fallback-uncaught'
const MARK_RENDERER = 'e2e-telem-renderer-console'
const MARK_FOLD_CLOSER = 'e2e-telem-fold-closer-warn'
const MARK_PROMPT = 'e2e-telem-prompt-send'

// ── 诊断行窄面（apps/host DiagLine 结构子集——固定字段恒在、可选缺席省略） ──
interface DiagLine {
  timestamp: string
  level: string
  trace_id: string
  process: string
  message: string
  event: string
  stack?: string
}

/** {userData}/logs/app-*.jsonl 全量读回（JSONL 逐行解析——坏行跳过不藏错） */
function readDiagLines(userData: string): DiagLine[] {
  const logsDir = join(userData, 'logs')
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

/** 轮询诊断行直至谓词命中（appender 异步落盘时序——fire-and-forget 队列排空非瞬时） */
async function pollDiagLines(
  userData: string,
  predicate: (lines: readonly DiagLine[]) => boolean,
  timeoutMs: number,
): Promise<readonly DiagLine[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const lines = readDiagLines(userData)
    if (predicate(lines)) return lines
    if (Date.now() > deadline) throw new Error(`诊断行等待超时（${String(timeoutMs)}ms）：现有 ${String(lines.length)} 行`)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
}

/** composer 键入（Lexical 配方：contenteditable 收敛门 + insertText + 回显重试——1-29 同款） */
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

/** 会话日志落盘定位（发送成功唯一证据——{dshHome}/sessions 下 mtime ≥ since，1-29 同口径） */
function findSessionDir(userData: string, dirFragment: string, since: number): string | undefined {
  const root = join(userData, 'dsh-home', 'sessions')
  if (!existsSync(root)) return undefined
  let hit: string | undefined
  const visit = (dir: string, depth: number): void => {
    if (hit !== undefined || depth > 6) return
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
      if (stat.isDirectory()) {
        visit(full, depth + 1)
        if (hit !== undefined) return
        continue
      }
      if (row.endsWith('.jsonl.zstd') && stat.mtimeMs >= since && dir.replaceAll('\\', '/').toLowerCase().includes(dirFragment)) {
        hit = dir
        return
      }
    }
  }
  visit(root, 0)
  return hit
}

/** 发送手势单击（发送钮/键盘双手势——不等待落盘；落盘等待由调用方按旅程语义自行编排） */
async function clickSend(page: Page): Promise<void> {
  const composer = page.locator('[data-composer-input]').first()
  await composer.click()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  const enabled = await sendButton.isEnabled().catch(() => false)
  if (enabled) await sendButton.click().catch(() => {})
  else await page.keyboard.press('Enter')
}

/** 发送重试环（发送钮/键盘双手势 + 会话日志落盘为唯一发送成功证据——1-29 同款） */
async function sendUntilLanded(page: Page, userData: string, dirFragment: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await clickSend(page)
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const hit = findSessionDir(userData, dirFragment, since)
      if (hit !== undefined) return hit
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（dirFragment=${dirFragment}）——发送链路证据缺席`)
}

test('观测面 e2e：四路注错落 app-*.jsonl + 派生失败注入全链同 trace_id', async () => {
  test.setTimeout(420_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-telem-'))
  // 真 git 仓库夹具（链 B prompt 拦截器仅对 git 项目激活——非 git 探针 null 走官方原流
  // 零差异，trace 包裹不生效；git init -b main + 首提交，k5 makeGitRepo 同配方）
  const wsDir = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-telem-ws-'))
  execFileSync(
    'git',
    ['-c', 'user.email=telem@test', '-c', 'user.name=telem', 'init', '-b', 'main'],
    { cwd: wsDir, stdio: 'pipe' },
  )
  writeFileSync(join(wsDir, 'README.md'), 'telemetry obs fixture\n')
  execFileSync('git', ['add', '.'], { cwd: wsDir, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.email=telem@test', '-c', 'user.name=telem', 'commit', '-m', 'init'], {
    cwd: wsDir,
    stdio: 'pipe',
  })
  const launched = await launchHost({ userData })
  const app: ElectronApplication = launched.app
  const page: Page = launched.page
  try {
    const t0 = Date.now() - 2_000 // 注入窗口起点（时钟同机零偏差，留 2s 余量）

    // ── 路②c：renderer console 注入（error 标记行 + 异文 warn 收口折叠组——LineFolder
    //    同文窗内折叠、键切换即收口；closer 行自身退出 flush 落盘） ──
    await page.evaluate(([marker, closer]) => {
      console.error(marker)
      console.warn(closer)
    }, [MARK_RENDERER, MARK_FOLD_CLOSER] as const)

    // ── 路②a：main 兜底钩注入（真 uncaughtException——定时器回调 throw，主进程真实
    //    异常面；fallback.ts installMainFallbackHooks 订阅链 appendCrashLine 同步写） ──
    await app.evaluate(() => {
      setTimeout(() => {
        throw new Error('e2e-telem-fallback-uncaught')
      }, 0)
    })

    // ── 路②b：host IPC handler 注入（allowlist 通道畸形负载 → 域 handler 抛错 →
    //    rpc-envelope 单点埋点 emit；带内信封或 fail-loud 拒绝两路均可——埋点在两路之前） ──
    await page.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge
      try {
        await forge?.invoke('forge:projects/register', {})
      } catch {
        // 非 typed 错误 fail-loud 上抛（renderer 拒绝面）——诊断行两路均已落
      }
    })

    // ── 路②d + ③：prompt 旅程（注册 → 芯片选工作区 → 键入；零凭据形态模型失败可接受
    //    ——user 消息落账不受影响，1-29 同口径） ──
    await registerProject(page, wsDir, 'telem-obs-ws')
    // ── ③ 派生失败注入：夹具仓库 checkout --detach——必须在芯片点选**之前**（bug 7b9463df
    //    根因修订：W3 sessions.create wrap 在点选时点预铸采纳会话——detach 晚于点选时预铸
    //    已带 attach 绑定，judge 读到 binding ≠ null 短路 'pass'，重路由径结构性零触发）。
    //    detach 前置 → 预铸 sessionCreate 派生失败（分支解析 '' → requireNonEmpty 拒绝）→
    //    client wrap ④ fail-open 回官方原流（无绑定 blank 会话）→ 发送 → 必绑 judge 'route'
    //    （git 项目 × blank × 无绑定）→ reroute 派生 sessionCreate 同因抛错 → 拦截层 catch 补
    //    fail-open 取证 emit（ALS 上下文内——行带链 B trace_id）。发送被拒（composer 错误面）
    //    属预期——注入旅程不要求落盘，fail-open 行即取证。 ──
    execFileSync('git', ['checkout', '--detach'], { cwd: wsDir, stdio: 'pipe' })
    await selectWorkspaceViaChip(page, 'telem-obs-ws')

    //    fail-open（ALS 上下文内——行带链 B trace_id）——detach 前置见上方 ③ 注入块；发送 →
    //    必绑 judge 'route' → reroute 派生失败 → fail-open 行即取证。 ──
    await typeDraft(page, MARK_PROMPT)
    const tInject = Date.now() - 1_000 // 注入发送窗口起点
    await clickSend(page)
    await pollDiagLines(
      userData,
      (lines) => lines.some((l) => l.event === 'fail-open' && l.trace_id !== '-' && Date.parse(l.timestamp) >= tInject),
      90_000,
    )

    // ── 恢复分支（happy path 重发：重路由产物会话落盘 + ②d child 证据） ──
    const tHealthyStart = Date.now() // 注入窗口终点（其后行归 happy path 窗口）
    execFileSync('git', ['checkout', 'main'], { cwd: wsDir, stdio: 'pipe' })
    await typeDraft(page, `${MARK_PROMPT}-ok`)
    const tSend = Date.now() - 1_000 // 发送窗口起点
    // 落盘证据 fragment = 工作区临时目录名段（会话 cwd 分组目录——与注册名无关）
    await sendUntilLanded(page, userData, 'telem-ws', tSend)
    // child 侧证据就位等待：模型错误（零凭据）在 child 产生 stderr/console 输出与
    // gateway-fold relay 行——轮询统一日志汇出现 child 进程行
    await pollDiagLines(userData, (lines) => lines.some((l) => l.process === 'child'), 90_000)

    // 关停（before-quit：consoleForward.flush 折叠收口 + appender.flushSync 队列残留确定落盘）
    await closeApp(app)

    // ══ 断言面（关停后终读——quit flush 之后 jsonl 终态） ══
    const lines = readDiagLines(userData)
    expect(lines.length, '统一日志汇 app-*.jsonl 有行（诊断事件域 → appender 落盘链通）').toBeGreaterThan(0)
    // 结构 pin：固定字段恒在（proposal 日志行定版）
    for (const line of lines) {
      expect(typeof line.timestamp, `固定字段 timestamp 恒在：${JSON.stringify(line).slice(0, 120)}`).toBe('string')
      expect(line.level, '固定字段 level 恒在').toBeDefined()
      expect(line.trace_id, '固定字段 trace_id 恒在（无则 -）').toBeDefined()
      expect(line.process, '固定字段 process 恒在').toBeDefined()
      expect(line.message, '固定字段 message 恒在').toBeDefined()
      expect(line.event, '固定字段 event 恒在').toBeDefined()
    }

    // ① dev:debug 终端回显 → 已撤自动化断言（fix-3 形态裁决——文件头注记）；child stderr→
    //    JSONL 自动断言保留于 ②d；真实附接控制台人工走查留档 walkthrough/（不进 git）

    // ②a main 兜底钩：真 uncaughtException → 同步崩溃行含完整栈
    const fallbackLine = lines.find(
      (l) => l.event === 'fallback-uncaught' && Date.parse(l.timestamp) >= t0 && (l.stack ?? '').includes(MARK_FALLBACK),
    )
    expect(fallbackLine, '②a main 兜底钩：fallback-uncaught 行含注入标记栈（同步写红线③）').toBeDefined()
    expect(fallbackLine?.process, '②a 兜底行 process=main').toBe('main')

    // ②b host IPC handler：rpc-envelope 单点埋点行含栈
    const ipcLine = lines.find(
      (l) => l.event === 'ipc-handler' && l.level === 'error' && Date.parse(l.timestamp) >= t0 && typeof l.stack === 'string' && l.stack.length > 0,
    )
    expect(ipcLine, '②b host IPC handler：ipc-handler 错误行含栈（捕获即静默面消除）').toBeDefined()

    // ②c renderer console：标记行落盘（error 级 + process=renderer + event=console）
    const rendererLine = lines.find(
      (l) => l.process === 'renderer' && l.event === 'console' && l.message.includes(MARK_RENDERER),
    )
    expect(rendererLine, '②c renderer console：console.error 标记行落盘（console-message 转发链通）').toBeDefined()
    expect(rendererLine?.level, '②c renderer 标记行 error 级（warn/error 过滤口径）').toBe('error')

    // ②d child（child stderr→JSONL 自动断言——① 撤 echo 断言后的保留承载面）：child 源
    //    错误行（含栈面——relay 结构化行 stack 或 child-stdio error 级）
    const childLines = lines.filter((l) => l.process === 'child')
    expect(childLines.length, 'child 进程诊断行在场（stderr pipe / relay 双源任一）').toBeGreaterThan(0)
    const childStacked = childLines.some((l) => typeof l.stack === 'string' && l.stack.length > 0)
    const childStdioError = childLines.some((l) => l.event === 'child-stdio' && l.level === 'error')
    expect(
      childStacked || childStdioError,
      '②d child 源：含栈结构化行（relay/gateway-fold）或 child-stdio error 行在场',
    ).toBe(true)

    // ③ 派生失败注入全链同 trace_id：注入窗口内带 trace_id 行在场且共享单值（链 B ALS
    //    整链包裹——拦截层派生失败 emit 落在 judge/reroute 链内）
    const injectTraced = lines.filter(
      (l) => l.trace_id !== '-' && Date.parse(l.timestamp) >= tInject && Date.parse(l.timestamp) < tHealthyStart,
    )
    expect(injectTraced.length, '③ 注入窗口带 trace_id 日志行在场（派生失败取证 emit——bug ba763219 修复面）').toBeGreaterThan(0)
    expect(
      injectTraced.some((l) => l.event === 'fail-open' && l.process === 'child'),
      '③ 注入窗口 fail-open 行（process=child——拦截层派生失败 emit）在场',
    ).toBe(true)
    expect(
      [...new Set(injectTraced.map((l) => l.trace_id))],
      `③ 注入窗口全链同 trace_id（${String(injectTraced.length)} 行）`,
    ).toHaveLength(1)
    // happy path 重发（设计使然零诊断事件）：发送窗口内带 trace 行（如有）共享单值；
    // renderer 行恒不携带链 B trace（console 转发跨链不串味）
    const happyTraced = lines.filter((l) => l.trace_id !== '-' && Date.parse(l.timestamp) >= tSend)
    expect([...new Set(happyTraced.map((l) => l.trace_id))], '③ happy path 窗口 trace 单值（零诊断行为设计使然）').toHaveLength(happyTraced.length > 0 ? 1 : 0)
    const strayAfterInject = lines.filter(
      (l) => l.trace_id !== '-' && l.process === 'renderer' && Date.parse(l.timestamp) >= tInject,
    )
    expect(strayAfterInject, '③ renderer 行不携带链 B trace（console 转发恒 -——跨链不串味）').toHaveLength(0)
  } finally {
    try {
      if (!app.process().killed) await closeApp(app)
    } catch {
      // 进程已退出/通道已闭——关停幂等跳过
    }
    // 取证保留：失败轮 userData 留盘（task_logs 取证目录——成功/失败证据均归档，不静默清理）
    const keepDir = 'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/app-observability/fix-2/001-observability-e2e'
    try {
      execSync(`robocopy "${userData}" "${keepDir}/userdata-last" /E /NFL /NDL /NJH /NJS`, { stdio: 'ignore' })
    } catch {
      // robocopy 非 0 码 = 有复制行——证据已在盘，忽略
    }
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
