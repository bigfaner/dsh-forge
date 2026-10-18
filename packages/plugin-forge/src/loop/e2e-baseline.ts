// e2e 取证债机制 · 红灯基线门（dispatch-loop-hardening 改进7）——e2e 套件入场前跑基线，
// 红灯清单随任务简报（E2E_BASELINE_RED 行）递达 worker：基线红灯 ≠ 本任务回归，可机械判定；
// 红灯自动生成归因卡（环境 / 陈旧断言 / 真回归 三分流）。定位：循环面基建（loop/）——
// 套件执行命令由装配方经 runSuite 注入，本模块只做解析与载荷合成（纯逻辑可单测）。
import { execFile } from 'node:child_process'
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
 * 进程级 kill 由装配方 execFile timeout 承担）。套件执行故障 fail-soft：空清单 + error
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
  /** 套件执行目录（宿主工作区根——e2e 正本所在地） */
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

/**
 * 宿主装配面（LoopDriverDeps.e2eBaseline 生产形态）：runSuite = 真实子进程执行 e2e 套件
 * 全量（execFile timeout 包裹——套件挂死 kill + 非零退出 reporter 输出照常解析；子进程
 * noteHostOwnedChild 登记——宿主自有子进程不并发循环 keeper 误收编）+ readHead = git
 * rev-parse HEAD（故障/非 git 目录 = undefined——键不可得，驱动器回落启动时基线）。
 * 套件故障 fail-soft（空清单 + warn——机制静默关闭，循环不阻，简报零行）。
 */
export function createE2eBaselineFace(deps: E2eBaselineFaceDeps): {
  readonly runSuite: () => Promise<string>
  readonly readHead: (worktree: string) => Promise<string | undefined>
} {
  const command = deps.command ?? 'pnpm'
  const args = deps.args ?? ['test:e2e']
  const timeoutMs = deps.timeoutMs ?? E2E_BASELINE_SUITE_TIMEOUT_MS
  const runSuite = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = execFile(
        command,
        [...args],
        { cwd: deps.cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs, windowsHide: true, shell: deps.shell ?? process.platform === 'win32' },
        (error, stdout, stderr) => {
          // 非零退出（有红灯）≠ 取数失败——reporter 输出在场即解析（vitest 失败详单走
          // stderr、playwright 全走 stdout——双流拼接喂解析器）；双流全空 = 执行故障 fail-soft
          const combined = `${stdout}\n${stderr}`
          if (combined.trim() !== '') resolve(combined)
          else reject(error ?? new Error('e2e 基线套件零输出'))
        },
      )
      noteHostOwnedChild(child)
    })
  const readHead = (worktree: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      execFile('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }, (error, stdout) =>
        resolve(error == null && stdout.trim() !== '' ? stdout.trim() : undefined),
      )
    })
  return { runSuite, readHead }
}
