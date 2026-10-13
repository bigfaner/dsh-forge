// spawn 替换缝 + 回放计划驱动器（worker-exec-evidence-replay/fix-1——B 层 dogfood-sc-m3
// 回放化：proposal 附录路径 B 的装配消费面）。两成员：
//   · 进程内一次性替换缝（setForgeSpawnOverride/takeForgeSpawnOverride）——单测/嵌入
//     装配的程序化注入位；take 即摘（一次性，防跨装配泄漏）。
//   · 回放计划驱动器（createPlanReplaySpawn）——数据驱动的 e2e 注入位：env
//     DSH_FORGE_REPLAY_PLAN 指向计划 JSON（e2e spec 启动前落盘），按
//     （taskKey, occurrence）键回放录制的 worker 行为；零模型、零真实 LLM 调用。
// 行为词汇（回放面封闭，fail-loud）：
//   · abort —— spawn 成功（句柄即回）而 worker 无结算死亡（result 拒绝）——异常终止
//     阶梯（SC-M3 ① halted 分支）的产品行为面，非 spawn 机制故障（ERR_SPAWN_FAILED 不在）；
//   · script —— 依序执行动作：tool（forge 工具经 runTool 真执行——submitTask/addTask
//     落账 actor/session 链与录制轮同产品写路径）、fs-write（工作区内文件写入——工件
//     代位）、git-commit（夹具仓提交——commit_hash 代位，'$commit' 哨兵替换进后续
//     tool args）。键漂移（无匹配条目）= spawn 拒绝面，绝不回落真实模型 spawn。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'

/** 回放计划 env 键（e2e 启动 env——值 = 计划 JSON 绝对路径；缺席 = 缝不生效） */
export const REPLAY_PLAN_ENV = 'DSH_FORGE_REPLAY_PLAN'

// ─────────────────────────── 进程内一次性替换缝 ───────────────────────────

let override: SpawnWorker | undefined

/** 装配前挂替换 spawn（返回摘除器——测试隔离用） */
export function setForgeSpawnOverride(spawn: SpawnWorker): () => void {
  override = spawn
  return () => {
    if (override === spawn) override = undefined
  }
}

/** 取走替换 spawn（一次性——取后即清；缺席 = undefined 回落默认装配） */
export function takeForgeSpawnOverride(): SpawnWorker | undefined {
  const taken = override
  override = undefined
  return taken
}

// ─────────────────────────── 回放计划（数据面） ───────────────────────────

/** 回放动作：forge 工具调用（经 runTool 真执行——产品写路径） */
export interface PlanToolAction {
  readonly kind: 'tool'
  readonly name: string
  readonly args: Record<string, unknown>
}

/** 回放动作：工作区内文件写入（工件代位——路径必须落在工作区内，逃逸即拒绝） */
export interface PlanFsWriteAction {
  readonly kind: 'fs-write'
  readonly relPath: string
  readonly content: string
}

/** 回放动作：夹具仓 git 提交（commit_hash 代位——'$commit' 哨兵可替换进后续 tool args） */
export interface PlanGitCommitAction {
  readonly kind: 'git-commit'
  readonly message: string
  readonly paths: readonly string[]
}

export type PlanAction = PlanToolAction | PlanFsWriteAction | PlanGitCommitAction

/** 单条回放条目：abort（无结算死亡）或 script（动作序列 → 成功终态） */
export interface PlanEntry {
  /** 任务键（`slug/localId`——spawn 请求 label 前缀匹配） */
  readonly taskKey: string
  /** 第几次 spawn（1 起——同任务 halted 连环/复位二轮/fix 链二轮靠 occurrence 区分） */
  readonly occurrence: number
  readonly behavior: 'abort' | 'script'
  /** abort 专用：result 拒绝消息（须含 'worker run ended without a settlement'——事件夹归因断言锚） */
  readonly message?: string
  /** script 专用：依序执行的动作 */
  readonly actions?: readonly PlanAction[]
}

/** 回放计划（e2e spec 启动前落盘的 JSON） */
export interface ReplayPlan {
  readonly version: 1
  /** worker 会话工作区根（fs-write/git-commit 的作用域 + forge 工具 cwd 路由源） */
  readonly workspaceDir: string
  readonly entries: readonly PlanEntry[]
}

/** 计划载入（缺席 = undefined；在场但不可读/形状违例 = fail-loud——回放源不可带伤） */
export function loadReplayPlanFromEnv(env: { readonly DSH_FORGE_REPLAY_PLAN?: string } = process.env): ReplayPlan | undefined {
  const path = env[REPLAY_PLAN_ENV]
  if (path === undefined || path === '') return undefined
  if (!existsSync(path)) throw new Error(`[replay-plan] DSH_FORGE_REPLAY_PLAN 指向的计划文件不存在：${path}`)
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ReplayPlan
  if (parsed.version !== 1 || typeof parsed.workspaceDir !== 'string' || !Array.isArray(parsed.entries)) {
    throw new Error(`[replay-plan] 计划形状违例：{version:1, workspaceDir, entries[]} 必填（${path}）`)
  }
  for (const e of parsed.entries) {
    if (typeof e.taskKey !== 'string' || typeof e.occurrence !== 'number' || (e.behavior !== 'abort' && e.behavior !== 'script')) {
      throw new Error(`[replay-plan] 条目形状违例：taskKey/occurrence/behavior 必填且 behavior ∈ abort|script（${JSON.stringify(e).slice(0, 80)}）`)
    }
    if (e.behavior === 'script' && (!Array.isArray(e.actions) || e.actions.length === 0)) {
      throw new Error(`[replay-plan] script 条目动作列不可为空（taskKey=${e.taskKey}#${e.occurrence}——录制源不可带伤）`)
    }
  }
  return parsed
}

// ─────────────────────────── 回放计划驱动器 ───────────────────────────

/** forge 工具执行缝（装配注入——闭包持六 tool 定义组，按名执行；sessionId = 回放 worker 会话） */
export type PlanToolRunner = (name: string, args: Record<string, unknown>, sessionId: string) => Promise<unknown>

/** label → taskKey（dispatch-core spawnClaimed label 形 = `${taskKey} · ${title}`） */
function taskKeyOfLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  const idx = label.indexOf(' · ')
  return idx > 0 ? label.slice(0, idx) : undefined
}

/**
 * 回放计划驱动器工厂（SpawnWorker 同型——可整替装配 spawn 位）。
 * 匹配 = （label 前缀 taskKey, occurrence 递增计数）——键漂移（无匹配条目）= spawn 拒绝
 * （回放面只认计划过的 dispatch，绝不静默回落真实模型）。abort：句柄即回 + result 拒绝
 * （无结算死亡——异常终止阶梯行为面）；script：动作依序执行 → completed 终态（文本回合
 * 缺省 = output 空串——结算以任务终态为准）。workerSessionId = 裸 uuid（对账锚形态与
 * in-process worker 一致）。
 */
export function createPlanReplaySpawn(plan: ReplayPlan, runTool: PlanToolRunner): SpawnWorker {
  const counts = new Map<string, number>()
  return async (request) => {
    const taskKey = taskKeyOfLabel(request.label)
    if (taskKey === undefined) {
      throw new Error(`[replay-plan] spawn 请求无 label（taskKey 不可判——回放面拒绝）：${JSON.stringify(request.label)}`)
    }
    const occurrence = (counts.get(taskKey) ?? 0) + 1
    counts.set(taskKey, occurrence)
    const entry = plan.entries.find((e) => e.taskKey === taskKey && e.occurrence === occurrence)
    if (entry === undefined) {
      throw new Error(
        `[replay-plan] 回放键漂移：taskKey=${taskKey} 第 ${occurrence} 次派发无计划条目（回放面只认计划过的 dispatch——绝不回落真实模型）`,
      )
    }
    const workerSessionId = randomUUID()
    if (entry.behavior === 'abort') {
      const message = entry.message ?? 'worker run ended without a settlement'
      const result = Promise.reject(new Error(message))
      result.catch(() => {}) // 句柄发布与 await 之间的窗口防 unhandled rejection
      const handle: SpawnWorkerHandle = {
        workerSessionId,
        result,
        dispose: async () => {},
      }
      return handle
    }
    let disposed = false
    const result = (async (): Promise<{ readonly stopReason: string; readonly output: string }> => {
      let lastCommit = ''
      const texts: string[] = []
      for (const action of entry.actions ?? []) {
        if (disposed) throw new Error(`[replay-plan] disposed：taskKey=${taskKey}#${entry.occurrence}（回放被收尾中止）`)
        if (request.signal.aborted) throw new Error(`[replay-plan] 回放中止：taskKey=${taskKey}#${entry.occurrence}（signal 已中止）`)
        if (action.kind === 'tool') {
          await runTool(action.name, substituteCommit(action.args, lastCommit), workerSessionId)
          if (disposed) throw new Error(`[replay-plan] disposed：taskKey=${taskKey}#${entry.occurrence}（回放被收尾中止）`)
        } else if (action.kind === 'fs-write') {
          const full = resolve(plan.workspaceDir, action.relPath)
          if (!full.startsWith(resolve(plan.workspaceDir) + sep)) {
            throw new Error(`[replay-plan] fs-write 路径逃逸工作区：${action.relPath}（taskKey=${taskKey}#${entry.occurrence}）`)
          }
          mkdirSync(dirname(full), { recursive: true })
          writeFileSync(full, action.content, 'utf8')
        } else {
          execFileSync('git', ['add', ...action.paths], { cwd: plan.workspaceDir, stdio: 'pipe' })
          execFileSync('git', ['commit', '-m', action.message], { cwd: plan.workspaceDir, stdio: 'pipe' })
          lastCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: plan.workspaceDir, encoding: 'utf8' }).trim()
        }
      }
      return { stopReason: 'completed', output: texts.join('\n') }
    })()
    const handle: SpawnWorkerHandle = {
      workerSessionId,
      result,
      dispose: async () => {
        disposed = true
      },
    }
    return handle
  }
}

/** '$commit' 哨兵替换（深遍历——git-commit 产出的哈希代位进 tool args 的字符串位） */
function substituteCommit(args: Record<string, unknown>, commit: string): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return value === '$commit' ? commit : value
    if (Array.isArray(value)) return value.map(walk)
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = walk(v)
      return out
    }
    return value
  }
  return walk(args) as Record<string, unknown>
}

/** 计划文件落盘（e2e spec 启动前写——launchHost env 指向） */
export function writeReplayPlan(path: string, plan: ReplayPlan): void {
  writeFileSync(path, JSON.stringify(plan, null, 2), 'utf8')
}
