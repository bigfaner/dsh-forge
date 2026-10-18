// e2e 取证债机制 · 红灯基线门（dispatch-loop-hardening 改进7）——e2e 套件入场前跑基线，
// 红灯清单随任务简报（E2E_BASELINE_RED 行）递达 worker：基线红灯 ≠ 本任务回归，可机械判定；
// 红灯自动生成归因卡（环境 / 陈旧断言 / 真回归 三分流）。定位：循环面基建（loop/）——
// 套件执行命令由装配方经 runSuite 注入，本模块只做解析与载荷合成（纯逻辑可单测）。
import { execFile, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AddTaskInput, ContainerRef, TaskPriority } from '@dsh-forge/contracts'
import { noteHostOwnedChild } from '../spawn/job-tree.js'

/** 基线跑批产物（ranAt = 跑批起点 ISO；error 在场 = 套件执行失败——fail-soft 空清单，不阻循环） */
export interface E2eBaselineRedList {
  readonly ranAt: string
  readonly redSpecs: readonly string[]
  readonly error?: string
}

/**
 * 套件输出 → 红灯 spec 清单（逐行解析——行首红灯标记 + 行内首个 spec 路径）：
 * - vitest/jest reporter：`FAIL <path> > suite`；
 * - playwright list reporter（本仓 e2e 正道）：`✘ 1 [chromium] › <path>:12:5 › title`
 *   （✕/×/✗ 变体一并收录——各 runner 红灯字形）；
 * - vitest default reporter stdout 汇总行：`❯ |project| <path> (1 test | 1 failed)`——
 *   ❯ 行须带 failed 字样才计红（❯ 亦作套件运行指示符，防绿套件误报）。
 * 路径限定 .spec/.test 后缀滤除噪音；去重 + 字母序——同输出恒同清单。
 */
export function parseE2eRedSpecs(output: string): string[] {
  const specs = new Set<string>()
  const redLineRe = /^\s*(?:FAIL\b|[✕×✘✗❯]).*$/gm
  const specPathRe = /[A-Za-z0-9_.\\/-]+\.(?:spec|test)\.[cm]?[jt]s\b/
  for (const m of output.matchAll(redLineRe)) {
    const line = m[0]
    // ❯ 双义（红灯汇总行 / 运行指示行）：仅 failed 字样在场才计红
    if (/^\s*❯/.test(line) && !/\bfailed\b/i.test(line)) continue
    const path = specPathRe.exec(line)?.[0]
    if (path !== undefined) specs.add(path)
  }
  return [...specs].sort()
}

/** 基线套件执行超时缺省（10min——全量 e2e 套件上界；挂死 fail-soft 不拖循环入场） */
export const E2E_BASELINE_SUITE_TIMEOUT_MS = 600_000

/**
 * 基线跑批（e2e 套件入场前调用一次）：执行注入的 runSuite 取全量输出 → 解析红灯清单。
 * runSuite 以超时包裹（挂死 = reject——fail-soft 空清单 + error 留痕，不拖循环入场；
 * 进程级整树回收由装配方 timeout killTree 承担）。套件执行故障 fail-soft：空清单 + error
 * 留痕——基线不可得时机制静默关闭（简报零行），循环派发不受阻（取证债可后补，循环不死锁）。
 */
export async function runE2eBaseline(
  runSuite: () => Promise<string>,
  opts: { readonly timeoutMs?: number } = {},
): Promise<E2eBaselineRedList> {
  const ranAt = new Date().toISOString()
  const timeoutMs = opts.timeoutMs ?? E2E_BASELINE_SUITE_TIMEOUT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const output = await Promise.race([
      runSuite(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`e2e 基线套件执行超时（${timeoutMs}ms）——fail-soft 关闭`)), timeoutMs)
        timer.unref?.()
      }),
    ])
    return { ranAt, redSpecs: parseE2eRedSpecs(output) }
  } catch (cause) {
    return { ranAt, redSpecs: [], error: cause instanceof Error ? cause.message : String(cause) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HEAD 键控基线缓存记录（disc-2——基线不随循环实例固化）：{commit, reds} 缓存键——
 * commit = 取基线时点的 worktree HEAD；undefined = HEAD 不可得（无 worktree/readHead 面）。
 */
export interface E2eBaselineCache {
  readonly commit?: string
  readonly redSpecs: readonly string[]
  readonly error?: string
}

/**
 * 按 HEAD 键控取基线（disc-2 设计裁决：claim 时与循环 worktree 当前 HEAD 比对——
 * 一致复用缓存（稳定 HEAD 下零额外套件执行，摊销 ≈ 现状）、漂移重算（fix 中途落地后
 * 简报反映新基线，不再烤死于循环启动时点）。HEAD 不可得（两侧 undefined）= 无漂移可判，
 * 首算一次后恒复用。重算故障 fail-soft（runE2eBaseline 语义保持：空清单 + error 留痕）。
 */
export async function baselineForHead(
  currentHead: string | undefined,
  cache: E2eBaselineCache | undefined,
  runSuite: () => Promise<string>,
): Promise<E2eBaselineCache> {
  if (cache !== undefined && cache.commit === currentHead) return cache
  const baseline = await runE2eBaseline(runSuite)
  return {
    commit: currentHead,
    redSpecs: baseline.redSpecs,
    ...(baseline.error !== undefined ? { error: baseline.error } : {}),
  }
}

// ─────────────────────────── 基线持久化缓存（bug 006d8bfe 后续） ───────────────────────────
//
// 实例域缓存（挂 ActiveLoop）随宿主重启即丢——同 HEAD 重启循环也全量重跑套件（真机判例：
// 启动税 24 分钟）。本节 = HEAD 键控缓存的项目级持久化：落盘 {head, redSpecs}，同 HEAD 直接
// 复用（跨实例/跨重启），HEAD 变化即失效重跑。落点由装配方裁决（cacheFile 路径提供器——
// 语言/生态无关：TypeScript/Java/Golang 项目通用，本模块只认文件不认生态）。

/**
 * 读持久化基线缓存（head 键匹配才命中；文件缺席/损坏/键不匹配/字段形状漂移 = undefined
 * ——fail-soft 缺席语义，调用方回落全量跑批）。error 形态永不落盘（637fcb9e：不可得 ≠ 全绿），
 * 故命中结果恒无 error 字段。
 */
export function loadPersistedBaseline(path: string, head: string): E2eBaselineCache | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { head?: unknown; redSpecs?: unknown }
    if (parsed.head !== head || !Array.isArray(parsed.redSpecs)) return undefined
    const redSpecs = parsed.redSpecs.filter((s): s is string => typeof s === 'string')
    return { commit: head, redSpecs }
  } catch {
    return undefined
  }
}

/** 写持久化基线缓存（成功解析结果才落盘——error 形态由调用方跳过；目录递归建；IO 故障上抛由调用方 fail-soft） */
export function persistBaseline(path: string, head: string, redSpecs: readonly string[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ head, redSpecs }))
}

/** 归因卡载荷（改进7 三分流）：基线红灯 spec 逐一生成 test-run 归因卡——结论三分流
 *  （环境 / 陈旧断言 / 真回归），真回归经 recordBug 落台账，修复或钉基线后新取证才可信。 */
export function attributionTaskInput(
  source: ContainerRef,
  spec: string,
  extra: { readonly projectId: string },
): AddTaskInput {
  return {
    projectId: extra.projectId,
    source,
    title: `e2e 基线红灯归因：${spec}`,
    type: 'test-run',
    priority: 'P1' as TaskPriority,
    taskDesc: [
      `本 spec 在 e2e 红灯基线（循环入场跑批）中已失败——先于本容器当前任务存在，不得归因为当前任务回归。`,
      '执行该 spec 并按三分流给出归因结论（结论写进结算 summary，附证据路径）：',
      '1. 环境——环境/依赖/时序问题：记录复现条件与证据，交由主会话裁决环境修复；',
      '2. 陈旧断言——spec 断言与现状脱节：给出断言更新建议（不直接改断言，交主会话裁决）；',
      '3. 真回归——既有行为破坏：recordBug 登记缺陷（trigger/expected/actual 全带），由主会话派修复。',
      '结论分流前禁止顺手修复 spec 或产品代码。',
    ].join('\n'),
    vars: { BASELINE_SPEC: spec },
  }
}

// ─────────────────────────── 生产装配面（宿主 wiring——bug ca061ef6 接线收口） ───────────────────────────

/** e2e 基线装配面参数（宿主 index.ts 消费；probe 真机取证可注入轻量真命令） */
export interface E2eBaselineFaceDeps {
  /** 套件执行目录回落（runSuite 未传 worktree 时使用——驱动器恒传循环 worktree 同源锚定） */
  readonly cwd: string
  /** 套件命令（缺省 pnpm；Windows shell 解析 pnpm.cmd） */
  readonly command?: string
  /** 套件命令参数（缺省 ['test:e2e']——根 package.json playwright 正道） */
  readonly args?: readonly string[]
  /** 套件超时 ms（挂死 kill——缺省 E2E_BASELINE_SUITE_TIMEOUT_MS） */
  readonly timeoutMs?: number
  /** shell 解析（缺省 win32 = true——pnpm 需 shell 解析 pnpm.cmd；直连 exe 可显式关） */
  readonly shell?: boolean
}

/** 套件输出体量上限（256MB——reporter 疯狂输出防内存打爆；超限截断，解析以在场内容为准） */
const E2E_BASELINE_MAX_OUTPUT_BYTES = 256 * 1024 * 1024

/**
 * timeout 整树回收：shell:true 下子进程 pid = shell 层，kill 只及 shell——pnpm/node 孙进程
 * 成孤儿（与 windows commit 纪律相悖）。win32 = taskkill /T /F 整树；posix = spawn 直启
 * detached（独立进程组），负 pid 组杀。回收工具自身经 noteHostOwnedChild 登记（不被 keeper 收编）。
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    const taskkill = execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {})
    taskkill.once('error', () => {}) // taskkill 缺席/进程已退——回收尽力而为 fail-soft
    noteHostOwnedChild(taskkill)
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // 进程已退——零动作
      }
    }
  }
}

/**
 * 宿主装配面（LoopDriverDeps.e2eBaseline 生产形态）：runSuite = 真实子进程执行 e2e 套件
 * 全量（spawn 直启 + 自管 timeout——timeout 整树回收孙进程 + 非零退出 reporter 输出照常
 * 解析；子进程 noteHostOwnedChild 登记——宿主自有子进程不并发循环 keeper 误收编）+
 * readHead = git rev-parse HEAD（故障/非 git 目录 = undefined——键不可得，驱动器回落启动时基线）。
 * runSuite 的 worktree 入参与 readHead 同源锚定（disc-2 多 worktree 并行循环基线取数点
 * 与缓存键不错位；缺席回落 deps.cwd）。套件崩溃形态（执行故障 ∧ 解析零红灯行）以 error
 * 上抛——基线记「不可得」，与「基线全绿」不同形（bug 637fcb9e：resolve 空清单 = 漏报，
 * worker 真 e2e 失败被误归因到实现任务）。
 */
export function createE2eBaselineFace(deps: E2eBaselineFaceDeps): {
  readonly runSuite: (worktree?: string) => Promise<string>
  readonly readHead: (worktree: string) => Promise<string | undefined>
} {
  const command = deps.command ?? 'pnpm'
  const args = deps.args ?? ['test:e2e']
  const timeoutMs = deps.timeoutMs ?? E2E_BASELINE_SUITE_TIMEOUT_MS
  const runSuite = (worktree?: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const cwd = worktree ?? deps.cwd
      const shell = deps.shell ?? process.platform === 'win32'
      const child = spawn(command, [...args], {
        cwd,
        windowsHide: true,
        shell,
        // posix 直启（shell 缺省 false）独立进程组——timeout 负 pid 组杀可达整树
        detached: !shell && process.platform !== 'win32',
      })
      const chunks: Buffer[] = []
      let bytes = 0
      let timedOut = false
      let settled = false
      const onChunk = (chunk: Buffer): void => {
        if (bytes >= E2E_BASELINE_MAX_OUTPUT_BYTES) return
        bytes += chunk.length
        chunks.push(chunk)
      }
      child.stdout?.on('data', onChunk)
      child.stderr?.on('data', onChunk)
      const timer = setTimeout(() => {
        timedOut = true
        killTree(child.pid)
      }, timeoutMs)
      timer.unref?.()
      const finish = (err: Error | null, combined: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // 崩溃形态收口（bug 637fcb9e）：执行故障 ∧ 解析零红灯行 → reject（error 留痕、
        // 基线不可得）；有红灯行 = 非零退出但 reporter 输出在场，照常解析（非取数失败）
        const redCount = parseE2eRedSpecs(combined).length
        if (err !== null && redCount === 0) {
          reject(err)
          return
        }
        if (combined.trim() === '') {
          reject(err ?? new Error('e2e 基线套件零输出'))
          return
        }
        resolve(combined)
      }
      child.once('error', (err) => finish(err, ''))
      child.once('close', (code) => {
        finish(
          timedOut
            ? new Error(`e2e 基线套件执行超时（${timeoutMs}ms）——整树回收后 fail-soft 关闭`)
            : code !== 0
              ? new Error(`e2e 基线套件执行失败（exit ${code}）`)
              : null,
          `${Buffer.concat(chunks).toString('utf8')}`,
        )
      })
      noteHostOwnedChild(child)
    })
  const readHead = (worktree: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      // 出生即登记：readHead git 子进程恰跑在 claim 轮次在世 keeper 旁——宿主自有子进程
      // 不被任何在世 keeper 误收编（与 killTree taskkill、settle git 核验同口径）
      const child = execFile('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }, (error, stdout) =>
        resolve(error == null && stdout.trim() !== '' ? stdout.trim() : undefined),
      )
      noteHostOwnedChild(child)
    })
  return { runSuite, readHead }
}
