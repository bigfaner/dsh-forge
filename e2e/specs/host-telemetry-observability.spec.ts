// app-observability fix-2 观测面 e2e（1.4 取证债前置——断言锚 apps/host/src/telemetry/host-wiring.ts，
// 日志落点 {userData}/logs/app-YYYYMMDD.jsonl）。真实多进程取证，零 fake：宿主真机 boot（dev
// profile）→ 四路错误源真实注入 → 统一日志汇断言。
//   ① dev:debug 终端回显可见性：child 诊断行（stdio pipe 消费侧 process 直写回显——run.ts
//     wireChildPipes Note-2 双写）在宿主终端输出（main process stdout/stderr 捕获）出现；
//   ② 四路错误源注入 → app-*.jsonl 各含错误行（含栈面按源本性断言）：
//        main 兜底钩（真 uncaughtException——setTimeout throw，appendCrashLine 同步写）
//        host IPC handler（preload allowlist 通道畸形负载 → handler 抛错 → rpc-envelope 单点埋点）
//        renderer console（console.error/warn 官方 console-message 事件 → 转发，同文折叠窗
//          需异文行收口）
//        child（零凭据 prompt 发送 → child 侧模型错误 → stderr/console + gateway-fold relay）
//   ③ 一次 prompt 发送全链同 trace_id：发送窗口内全部 trace_id ≠ '-' 的日志行共享单值
//     （链 B——child.ts prompt dispatch 入口 newTraceIdChild + ALS 包裹整链；链 A preload
//     invoke 的 trace 行全部落在发送窗口之外，不入窗口判定）。
// 载体纪律：launchHost/closeApp 单源（e2e/support）；隔离 userData（e2e 单实例纪律）；零凭据
// 发送（Hard Rule 零真实模型——user 消息落账不受模型失败影响，1-29 同口径）。
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
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

/** 发送重试环（发送钮/键盘双手势 + 会话日志落盘为唯一发送成功证据——1-29 同款） */
async function sendUntilLanded(page: Page, userData: string, dirFragment: string, since: number): Promise<string> {
  const composer = page.locator('[data-composer-input]').first()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await composer.click()
    const enabled = await sendButton.isEnabled().catch(() => false)
    if (enabled) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const hit = findSessionDir(userData, dirFragment, since)
      if (hit !== undefined) return hit
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（dirFragment=${dirFragment}）——发送链路证据缺席`)
}

test('观测面 e2e：dev:debug 终端回显 + 四路注错落 app-*.jsonl + 一次 prompt 全链同 trace_id', async () => {
  test.setTimeout(420_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-telem-'))
  const wsDir = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-telem-ws-'))
  const launched = await launchHost({ userData })
  const app: ElectronApplication = launched.app
  const page: Page = launched.page
  // 宿主终端捕获（dev:debug 终端可见性断言源——main process stdout/stderr 直读）
  const term = { out: '', err: '' }
  app.process().stdout?.on('data', (chunk: Buffer) => {
    term.out += chunk.toString('utf8')
  })
  app.process().stderr?.on('data', (chunk: Buffer) => {
    term.err += chunk.toString('utf8')
  })
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

    // ── 路②d + ③：一次 prompt 发送（注册 → 芯片选工作区 → 键入 → 发送落盘；零凭据形态
    //    模型失败可接受——user 消息落账不受影响，1-29 同口径） ──
    await registerProject(page, wsDir, 'telem-obs-ws')
    await selectWorkspaceViaChip(page, 'telem-obs-ws')
    await typeDraft(page, MARK_PROMPT)
    const tSend = Date.now() - 1_000 // 发送窗口起点
    await sendUntilLanded(page, userData, 'telem-obs-ws', tSend)
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

    // ① dev:debug 终端回显：child 诊断行文本在宿主终端输出出现（run.ts wireChildPipes
    //    Note-2 process 直写回显——jsonl child 行与终端行同文对齐）
    const childLines = lines.filter((l) => l.process === 'child')
    expect(childLines.length, 'child 进程诊断行在场（stderr pipe / relay 双源任一）').toBeGreaterThan(0)
    const echoTargets = childLines.filter((l) => l.event === 'child-stdio')
    const echoNeedles = (echoTargets.length > 0 ? echoTargets : childLines).map((l) => l.message.slice(0, 60))
    const echoHit = echoNeedles.find((needle) => term.out.includes(needle) || term.err.includes(needle))
    expect(
      echoHit,
      `① dev:debug 终端回显：child 诊断行在宿主终端输出出现（对齐 needle=${echoNeedles[0] ?? '(none)'}）`,
    ).toBeDefined()

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

    // ②d child：child 源错误行（含栈面——relay 结构化行 stack 或 child-stdio error 级）
    const childStacked = childLines.some((l) => typeof l.stack === 'string' && l.stack.length > 0)
    const childStdioError = childLines.some((l) => l.event === 'child-stdio' && l.level === 'error')
    expect(
      childStacked || childStdioError,
      '②d child 源：含栈结构化行（relay/gateway-fold）或 child-stdio error 行在场',
    ).toBe(true)

    // ③ 一次 prompt 全链同 trace_id：发送窗口内全部带 trace 行共享单值（链 B ALS 整链
    //    包裹；链 A invoke 行在窗口外，不入判定）
    const windowTraced = lines.filter((l) => l.trace_id !== '-' && Date.parse(l.timestamp) >= tSend)
    expect(windowTraced.length, '③ 发送窗口内带 trace_id 日志行在场（全链落日志才可串联）').toBeGreaterThan(0)
    const distinctTraces = [...new Set(windowTraced.map((l) => l.trace_id))]
    expect(distinctTraces, `③ 全链同 trace_id（窗口 ${String(windowTraced.length)} 行）`).toHaveLength(1)
    // 结构面：窗口外 trace 行存在即不得混入窗口判定（链 A/renderer 行 trace_id 恒 - 或窗口外）
    const strayInWindow = lines.filter(
      (l) => l.trace_id !== '-' && l.process === 'renderer' && Date.parse(l.timestamp) >= tSend,
    )
    expect(strayInWindow, '③ renderer 行不携带链 B trace（console 转发恒 -——跨链不串味）').toHaveLength(0)
  } finally {
    if (app.process().exitCode === null && !app.process().killed) await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
