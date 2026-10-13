// 跑批就绪硬门（proposal worker-exec-evidence-replay Solution② / SC2）——
// "就绪探测通过才进 journey"：探测判据覆盖 journey 实际前置（构建产物形态 +
// 环境进程存活 + 端口/锁残留），未过即 fail-fast 明确报错。
//
// 载体无关：门逻辑不锚定任何命令载体（just 退役约束）——
//  - 强制面：e2e/global-setup.ts 首位消费 readinessGate（Playwright globalSetup
//    失败 = 全部 spec 零起跑，`pnpm test:e2e` / `just test` / 任意直调同受门）；
//  - 探针面：本文件即 CLI（`node --experimental-strip-types e2e/support/readiness.ts`，
//    exit 0/1），编排器可在 journey 前独立调用。
// 纯 Node 面（零本地 import、不启 Electron）——e2e-support 单测池承载行为钉。
//
// 判据口径（与 journey 实际前置对齐，e2e/support/launch.ts 启动链）：
//  - 产物形态：apps/host/dist/main.js + apps/web/dist/index.html 在场且非空
//    （electron.launch 载 host main、主窗口载壳 dist）；DSH_FORGE_E2E_SKIP_WEB_BUILD=1
//    跑批形态下 dist 新鲜度由调用方担保——本门即该担保的机械校验。
//  - 进程存活：.forge/web.pid 在场 → 记录进程必须存活（死 pid = 锁残留，fail 并指向
//    清理面）；缺席 = 独立跑批形态（journey 自带 electron 实例），不判失败。
//  - 端口残留：本进程分配器切片采样口可绑定（与 e2e/support/ports.ts 同 pid 切片口径；
//    被占 = 上轮残留实例，fail 并指明端口）。
import { createRequire } from 'node:module'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 仓库根（与 e2e/support/launch.ts ROOT 同口径：本文件面 → 上三级） */
export const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')

/** 单条探测结果 */
export interface ReadinessCheck {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

export interface ReadinessReport {
  readonly ok: boolean
  readonly checks: readonly ReadinessCheck[]
  readonly failed: readonly ReadinessCheck[]
}

export interface ReadinessOptions {
  /** 仓库根（缺省本文件推导） */
  readonly root?: string
  /** dev 环境 pid 锁文件（缺省 {root}/.forge/web.pid） */
  readonly pidFile?: string
  /** pid 缺席也必须存在 dev 进程（watch 形态编排器置位） */
  readonly requireDevProcess?: boolean
  /** 产物形态判据（label + 路径 + 最小字节数）；缺省 = host main + web index */
  readonly requiredArtifacts?: readonly { readonly label: string; readonly path: string; readonly minBytes: number }[]
  /** 端口残留采样口；缺省 = 本进程分配器切片三采样点（ports.ts 同公式） */
  readonly ports?: readonly number[]
  /** electron 依赖闭包判据开关（缺省开；单测对临时根置否） */
  readonly electronCheck?: boolean
}

// ─── 缺省判据（与 ports.ts 常量同口径——该文件为单源，此处为探测镜像，勿改值） ───

const PORT_BASE = 19_500
const PORT_SPAN = 90
const PID_SLICES = 280

export function defaultArtifacts(root: string): { label: string; path: string; minBytes: number }[] {
  return [
    { label: 'host-main', path: join(root, 'apps', 'host', 'dist', 'main.js'), minBytes: 1 },
    { label: 'web-index', path: join(root, 'apps', 'web', 'dist', 'index.html'), minBytes: 1 },
  ]
}

function defaultPorts(): number[] {
  const base = PORT_BASE + (process.pid % PID_SLICES) * PORT_SPAN
  return [base, base + 1, base + PORT_SPAN - 1]
}

// ─── 探测判据 ───

function checkArtifact(label: string, path: string, minBytes: number): ReadinessCheck {
  if (!existsSync(path)) {
    return { name: `artifact ${label}`, ok: false, detail: `构建产物缺失：${path}（先构建/起 dev watch）` }
  }
  if (statSync(path).size < minBytes) {
    return { name: `artifact ${label}`, ok: false, detail: `构建产物空壳（<${minBytes} 字节）：${path}` }
  }
  return { name: `artifact ${label}`, ok: true, detail: path }
}

/** pid 存活判据（POSIX kill 0；Windows kill 0 不校验存在性——tasklist 兜底） */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    // EPERM 等 = 进程在场（他者属主），视作存活
    return true
  }
  if (process.platform !== 'win32') return true
  const out = spawnSync('tasklist', ['/FI', `PID eq ${String(pid)}`, '/NH'], {
    encoding: 'utf8',
    timeout: 15_000,
  })
  return out.status === 0 && out.stdout.includes(` ${String(pid)} `)
}

function checkDevProcess(pidFile: string, requireDevProcess: boolean): ReadinessCheck {
  if (!existsSync(pidFile)) {
    if (requireDevProcess) {
      return { name: 'dev-process', ok: false, detail: `环境进程未起（pidfile 缺席：${pidFile}）` }
    }
    return { name: 'dev-process', ok: true, detail: `pidfile 缺席——独立跑批形态（journey 自带 electron）` }
  }
  const raw = readFileSync(pidFile, 'utf8').trim()
  const pid = Number.parseInt(raw, 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    return { name: 'dev-process', ok: false, detail: `锁残留：pidfile 内容非法（${JSON.stringify(raw)}）：${pidFile}` }
  }
  if (!pidAlive(pid)) {
    return { name: 'dev-process', ok: false, detail: `锁残留：pidfile 记录的进程已死（PID ${String(pid)}）——清理 ${pidFile} 后重跑` }
  }
  return { name: 'dev-process', ok: true, detail: `dev 进程存活（PID ${String(pid)}）` }
}

function checkPort(port: number): Promise<ReadinessCheck> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (cause: NodeJS.ErrnoException) => {
      resolve({
        name: `port ${port}`,
        ok: false,
        detail: `端口残留/被占：${port}（${String(cause.code)}）——清理上轮实例后重跑`,
      })
    })
    server.once('listening', () => {
      server.close(() => resolve({ name: `port ${port}`, ok: true, detail: `可绑定` }))
    })
    server.listen(port, '127.0.0.1')
  })
}

/** electron 二进制可解析性（launch.ts 启动链同口径——依赖闭包缺失即 journey 秒败前置） */
export function checkElectron(root: string): ReadinessCheck {
  try {
    const bin = electronBinaryPath(root)
    if (!existsSync(bin)) {
      return { name: 'electron', ok: false, detail: `electron 二进制缺失：${bin}（先 pnpm install / build）` }
    }
    return { name: 'electron', ok: true, detail: bin }
  } catch (cause) {
    return { name: 'electron', ok: false, detail: `electron 不可解析（apps/host 依赖闭包）：${String(cause)}` }
  }
}

/** 执行就绪探测（全判据逐条跑完汇总——报文一次列全失败项） */
export async function runReadiness(opts: ReadinessOptions = {}): Promise<ReadinessReport> {
  const root = opts.root ?? ROOT
  const pidFile = opts.pidFile ?? join(root, '.forge', 'web.pid')
  const artifacts = opts.requiredArtifacts ?? defaultArtifacts(root)
  const ports = opts.ports ?? defaultPorts()

  const checks: ReadinessCheck[] = [
    ...artifacts.map((a) => checkArtifact(a.label, a.path, a.minBytes)),
    ...(opts.electronCheck === false ? [] : [checkElectron(root)]),
    checkDevProcess(pidFile, opts.requireDevProcess ?? false),
    ...(await Promise.all(ports.map(checkPort))),
  ]
  const failed = checks.filter((c) => !c.ok)
  return { ok: failed.length === 0, checks, failed }
}

/** 失败报文（门错误信息单源） */
export function formatFailure(report: ReadinessReport): string {
  const lines = report.failed.map((c) => `  ✗ ${c.name}: ${c.detail}`)
  return `就绪门未通过（${String(report.failed.length)} 项）——journey 不起跑：\n${lines.join('\n')}`
}

/** 就绪硬门：未过即抛错（fail-fast；调用点 = globalSetup / 编排器探针） */
export async function readinessGate(opts: ReadinessOptions = {}): Promise<void> {
  const report = await runReadiness(opts)
  if (!report.ok) throw new Error(formatFailure(report))
}

// ─── CLI 探针面（载体无关：任意编排器 journey 前独立调用） ───

async function cli(): Promise<number> {
  const requireDevProcess = process.argv.includes('--require-dev-process')
  try {
    await readinessGate({ requireDevProcess })
    return 0
  } catch (cause) {
    console.error(String(cause instanceof Error ? cause.message : cause))
    return 1
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void cli().then((code) => {
    process.exitCode = code
  })
}

// electron 二进制可解析性属 journey 前置之一（launch.ts 同口径）——保持依赖闭包校验
export function electronBinaryPath(root: string = ROOT): string {
  return createRequire(join(root, 'apps', 'host', 'package.json'))('electron') as string
}
