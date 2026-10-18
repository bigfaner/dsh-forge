// dispatch-core · 结算核（S1a 可拆卸壳分层；async-dispatch §4.2 ②③——前台阻塞径与后台
// done continuation 同源消费的共用体，保证「结算块 = spawned 分支原样投影」）：
// await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
// queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
// run 拒绝/无结算同归防线径，kill 由调用方 taxonomy 判定）。
// 改进7（e2e 取证债）：success 结算 submit record 携带 evidenceDebt = 实现态部分结算——
// 本核自动生成独立 test-run 欠账任务（dependsOn 实现卡），实现卡不再因取证欠账 blocked。
import { execFile } from 'node:child_process'
import { noteHostOwnedChild } from '../spawn/job-tree.js'
import type { ContainerRef, ForgeTasksService, TaskRecordEntry, TaskSnapshot, TaskRef } from '@dsh-forge/contracts'
import { forgetWorkerSourceTask } from './assemble.js'
import type { SpawnWorkerHandle } from './spawn.js'
import { poolOf, type PoolSnapshot } from './pool.js'
import type { DispatchSpawnedResult } from './result.js'

/** 末条 submit record（结算摘要/commit 来源） */
function lastSubmitRecordOf(records: readonly TaskRecordEntry[] | undefined): TaskRecordEntry | undefined {
  if (records === undefined) return undefined
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i]?.verb === 'submit') return records[i]
  }
  return undefined
}

/** blocked 任务的新建修复任务（listTasks created 降序——首个 sourceTask 命中 = 最新 fix） */
async function findFixTaskRef(
  tasks: ForgeTasksService,
  projectId: string,
  task: TaskSnapshot,
): Promise<TaskRef | undefined> {
  const cards = await tasks.listTasks({ projectId, source: task.source, sort: 'created' })
  for (const card of cards) {
    if (card.sourceTask !== undefined && card.sourceTask.slug === task.slug && card.sourceTask.localId === task.localId) {
      return { slug: card.slug, localId: card.localId }
    }
  }
  return undefined
}

/** dispose 静默收尾（result 已定后的资源释放——异常不并进失败面） */
export async function disposeQuietly(handle: SpawnWorkerHandle): Promise<void> {
  try {
    await handle.dispose()
  } catch {
    // 收尾异常吞没：结算/失败面已定
  }
}

// ─────────────────────────── 提交落点核验（1.14 判例修复——cwd 钉定收口） ───────────────────────────

/** 提交落点核验结论（判据：commit 所属分支集 ⊇ 容器检出分支） */
export type CommitLandingVerdict =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly branch: string; readonly commitBranches: readonly string[] }

/** 提交落点核验器（容器检出目录 + commit hash → 落点结论；单测注入桩） */
export type CommitLandingVerifier = (
  worktreeDir: string,
  commitHash: string,
) => Promise<CommitLandingVerdict>

/**
 * git 真核验：容器检出当前分支 vs 提交可达分支集（git branch --show-current /
 * branch --contains）。detached HEAD（无检出分支）= 故障抛出——落点判据不成立。
 */
export const gitCommitLanding: CommitLandingVerifier = async (worktreeDir, commitHash) => {
  const run = (args: readonly string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const git = execFile('git', ['-C', worktreeDir, ...args], { encoding: 'utf8' }, (error, stdout) =>
        error == null ? resolve(stdout) : reject(error),
      )
      // 结算期 git 核验 = 宿主自有子进程（worker 守卫已 reclaim）——显式登记防并发循环 keeper 误收编误杀
      noteHostOwnedChild(git)
    })
  const branch = (await run(['branch', '--show-current'])).trim()
  if (branch === '') throw new Error(`容器检出不在分支上（detached HEAD）：${worktreeDir}`)
  const commitBranches = (await run(['branch', '--contains', commitHash, '--format=%(refname:short)']))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return commitBranches.includes(branch) ? { ok: true, branch } : { ok: false, branch, commitBranches }
}

/**
 * e2e 取证债欠账任务（改进7）：success 结算 submit record 携带 evidenceDebt = 实现态
 * 部分结算——同容器自动生成独立 test-run 欠账任务（dependsOn 实现卡 localId，不阻塞
 * 源卡——实现卡已 completed）。落库失败 fail-soft（console.warn——取证欠账丢失留痕，
 * 不回滚已定结算）。
 */
async function createE2eDebtTask(
  tasks: ForgeTasksService,
  ctx: { readonly projectId: string; readonly task: TaskSnapshot },
  debt: NonNullable<TaskRecordEntry['evidenceDebt']>,
  e2eBaselineRedCases?: readonly string[],
): Promise<DispatchSpawnedResult['evidenceDebt']> {
  try {
    const specsLine = debt.specs.join(', ')
    const added = await tasks.addTask({
      projectId: ctx.projectId,
      source: ctx.task.source,
      title: `e2e 取证债：${ctx.task.title}`,
      type: 'test-run',
      taskDesc: [
        `实现卡 ${ctx.task.slug}/${ctx.task.localId} 已按实现态结算（实现+单测绿），本卡承接其真机 e2e 断言取证欠账。`,
        `取证套件：${debt.suite}；欠账 spec：${specsLine}。`,
        ...(debt.note !== undefined ? [`欠账说明：${debt.note}`] : []),
        // 文案与简报行真实存在性一致（bug ca061ef6）：简报红灯清单在场才指示比对——
        // 无红灯/基线门未接线时兜底文案，不指示真机不存在的简报行
        e2eBaselineRedCases !== undefined && e2eBaselineRedCases.length > 0
          ? '执行 e2e 并断言上述 spec；如遇失败先比对任务简报 E2E_BASELINE_RED 行——基线红灯 = 入场前既有失败，非本实现回归，按归因流程上报（不归因到实现卡）。'
          : '执行 e2e 并断言上述 spec；本卡生成时简报无 E2E_BASELINE_RED 行（基线门未接线或入场基线零红灯）——遇失败不默认归因到本实现，按归因流程（环境/陈旧断言/真回归三分流）自行分流上报。',
      ].join('\n'),
      dependsOn: [ctx.task.localId],
      priority: 'P1',
      vars: { E2E_DEBT_SOURCE: `${ctx.task.slug}/${ctx.task.localId}`, E2E_DEBT_SPECS: specsLine },
    })
    return { taskRef: { slug: added.slug, localId: added.localId }, suite: debt.suite, specs: debt.specs }
  } catch (cause) {
    console.warn(
      `forge settle: e2e debt test-run task failed for ${ctx.task.slug}/${ctx.task.localId}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    return undefined
  }
}

/**
 * 落点核验失败显式处置（bug d8029b20）：任务 completed → interrupted 真化（transitionTask
 * 人工转移合法边——可恢复态，非 completed 挂死）；真化失败 fail-loud 注记进判词（任务留
 * completed 需人工转移，绝不静默）。返回 landing-rejected——循环径据此挂起升级，不走
 * worker-abort 失败阶梯。
 */
async function rejectLanding(
  deps: { readonly tasks: ForgeTasksService },
  ctx: { readonly projectId: string; readonly task: TaskSnapshot },
  cause: Error,
): Promise<{ readonly case: 'landing-rejected'; readonly cause: Error }> {
  try {
    await deps.tasks.transitionTask({
      projectId: ctx.projectId,
      taskId: ctx.task.taskId,
      toStatus: 'interrupted',
      reason: cause.message,
      actor: 'core', // 循环自动化纠偏——审计归因不再误记人类通道 'ui'
    })
  } catch (transitionCause) {
    return {
      case: 'landing-rejected',
      cause: new Error(
        `${cause.message}；interrupted 真化失败（任务留 completed 态需人工转移）：${transitionCause instanceof Error ? transitionCause.message : String(transitionCause)}`,
      ),
    }
  }
  return { case: 'landing-rejected', cause }
}

/** worker 终态结算判定（settleWorkerRun 产物——失败支合并 run 拒绝与无结算，kill 由调用方 taxonomy 判定） */
export type WorkerSettlement =
  | { readonly case: 'settled'; readonly result: Omit<DispatchSpawnedResult, 'kind'>; readonly durationMs: number }
  | { readonly case: 'failed'; readonly cause: unknown }
  | { readonly case: 'landing-rejected'; readonly cause: Error }

/**
 * worker 终态结算核（async-dispatch §4.2 ②③——前台 execute 第 4~5 步原样搬迁的共用体，
 * 前台阻塞径与后台 done continuation 同源消费，保证「结算块 = spawned 分支原样投影」）：
 * await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
 * queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
 * run 拒绝/无结算同归防线径）。
 */
export async function settleWorkerRun(
  deps: {
    readonly tasks: ForgeTasksService
    /** 提交落点核验器（可选——缺席回落 gitCommitLanding 真核验；单测注入桩） */
    readonly commitLanding?: CommitLandingVerifier
  },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    /** claim 简报指纹（spawned 分支 digest 字段同源——task_records.claim 行双记同值） */
    readonly digest: string
    /** 池快照口径（1.10：scoped 派发 = 该容器 source——结算 spawned 分支快照四计数同口径；
     *  缺席 = 全池，非 scoped 调用零变化。注意与 ctx.task.source 相异：非 scoped 调用
     *  不得借任务容器收窄——全池口径保持） */
    readonly poolSource?: ContainerRef
    /**
     * 容器检出路径（1.14——LoopRecord.worktree 钉定归属）：success + commitHash 在场时
     * 核验提交落点（commit 所属分支 = 容器检出分支）；缺席 = 不核验（工具壳行为零变化）。
     */
    readonly worktreeCwd?: string
    /** 本轮 claim 简报红灯清单（改进7——欠账卡文案一致性判据；缺席/空 = 兜底文案） */
    readonly e2eBaselineRedCases?: readonly string[]
    readonly handle: SpawnWorkerHandle
    /** spawn 起点（durationMs 基准） */
    readonly spawnStartedAt: number
    /** worker 终态落定后、结算读前的回调（后台径 settled:reading 里程碑投影点；前台径缺席零发射） */
    readonly onReading?: () => void
  },
): Promise<WorkerSettlement> {
  let run: Awaited<SpawnWorkerHandle['result']>
  try {
    run = await ctx.handle.result
  } catch (cause) {
    forgetWorkerSourceTask(ctx.handle.workerSessionId) // 来源任务登记注销（fix-bug 注入源——结算即清）
    await disposeQuietly(ctx.handle)
    return { case: 'failed', cause }
  }
  const durationMs = Date.now() - ctx.spawnStartedAt
  forgetWorkerSourceTask(ctx.handle.workerSessionId) // 结算即清（成功/失败同径）
  await disposeQuietly(ctx.handle)
  ctx.onReading?.()

  // 结算读：worker 自行 submitTask 落账（AC gate 在服务侧）；此处只读终态
  const settled = await deps.tasks.queryTask({
    projectId: ctx.projectId,
    taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
    include: { records: true },
  })
  const status = settled.task.taskStatus
  if (status !== 'completed' && status !== 'blocked') {
    // worker 未产出（完成但无结算——refusal/max-tokens/漏提交同径）：执行受阻语义，
    // 任务留 in_progress 走幂等重入径（不走 submit-blocked）
    return { case: 'failed', cause: new Error(`worker run ended without a settlement (stopReason: ${run.stopReason})`) }
  }

  const outcome: 'success' | 'blocked' = status === 'completed' ? 'success' : 'blocked'
  const submitRecord = lastSubmitRecordOf(settled.records)
  // 提交落点核验（1.14——cwd 钉定收口）：success + commitHash + 容器检出现在场时核验
  // 「commit 所属分支 = 容器检出分支」；不一致/核验故障 = landing-rejected 显式处置
  // （bug d8029b20——submitTask 已落 completed 后再走 worker-abort 阶梯 = 任务终态不可再领、
  // 错分支提交被静默接受。显式处置：任务 completed → interrupted 真化（人工转移合法边，
  // 可恢复态）+ 专案判词交循环挂起升级——提交落错分支（判例 366bec6a 落 main）不得静默通过。
  // Root cause: 核验时点晚于终态落定，失败面必须自带状态纠偏，不能依赖触不到该任务的阶梯。）
  if (outcome === 'success' && submitRecord?.commitHash !== undefined && ctx.worktreeCwd !== undefined) {
    const verify = deps.commitLanding ?? gitCommitLanding
    try {
      const verdict = await verify(ctx.worktreeCwd, submitRecord.commitHash)
      if (!verdict.ok) {
        return await rejectLanding(deps, ctx, new Error(
          `[settle-cwd-pin] 提交落点核验失败：容器检出分支 = ${verdict.branch}，提交 ${submitRecord.commitHash} 所在分支 = ${verdict.commitBranches.join(', ') || '（任一本地分支均不可达）'}——提交落错分支，结算拒绝`,
        ))
      }
    } catch (cause) {
      return await rejectLanding(deps, ctx, new Error(
        `[settle-cwd-pin] 提交落点核验故障（容器检出 ${ctx.worktreeCwd}，提交 ${submitRecord.commitHash}）：${cause instanceof Error ? cause.message : String(cause)}`,
      ))
    }
  }
  const followUp = outcome === 'blocked' ? await findFixTaskRef(deps.tasks, ctx.projectId, ctx.task) : undefined
  // 改进7：实现态部分结算（evidenceDebt 在场）→ 自动生成欠账 test-run 任务（fail-soft）
  const evidenceDebt =
    outcome === 'success' && submitRecord?.evidenceDebt !== undefined
      ? await createE2eDebtTask(deps.tasks, ctx, submitRecord.evidenceDebt, ctx.e2eBaselineRedCases)
      : undefined
  const pool: PoolSnapshot = poolOf(
    await deps.tasks.taskStats({
      projectId: ctx.projectId,
      ...(ctx.poolSource !== undefined ? { source: ctx.poolSource } : {}),
    }),
  )
  return {
    case: 'settled',
    durationMs,
    result: {
      outcome,
      taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
      title: ctx.task.title,
      type: ctx.task.taskType,
      ...(ctx.task.mode !== undefined ? { mode: ctx.task.mode } : {}),
      digest: ctx.digest,
      ...(outcome === 'success' && submitRecord?.summary !== undefined ? { summary: submitRecord.summary } : {}),
      ...(outcome === 'blocked'
        ? { reason: settled.task.blockedReason ?? submitRecord?.reason ?? 'blocking reason not recorded' }
        : {}),
      ...(submitRecord?.commitHash !== undefined ? { commitHash: submitRecord.commitHash } : {}),
      ...(submitRecord?.files !== undefined ? { files: submitRecord.files } : {}),
      ...(followUp !== undefined ? { followUp } : {}),
      ...(evidenceDebt !== undefined ? { evidenceDebt } : {}),
      pool,
    },
  }
}
