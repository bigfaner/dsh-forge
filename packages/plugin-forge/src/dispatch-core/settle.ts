// dispatch-core · 结算核（S1a 可拆卸壳分层；async-dispatch §4.2 ②③——前台阻塞径与后台
// done continuation 同源消费的共用体，保证「结算块 = spawned 分支原样投影」）：
// await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
// queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
// run 拒绝/无结算同归防线径，kill 由调用方 taxonomy 判定）。
// 改进7（e2e 取证债）：success 结算 submit record 携带 evidenceDebt = 实现态部分结算——
// 本核自动生成独立 test-run 欠账任务（dependsOn 实现卡），实现卡不再因取证欠账 blocked。
import { execFile } from 'node:child_process'
import { isAbsolute, relative, resolve } from 'node:path'
import { noteHostOwnedChild } from '../spawn/job-tree.js'
import type { ContainerRef, ForgeTasksService, TaskRecordEntry, TaskSnapshot, TaskRef } from '@dsh-forge/contracts'
import { forgetWorkerSourceTask } from './assemble.js'
import type { SpawnWorkerHandle } from './spawn.js'
import { poolOf, type PoolSnapshot } from './pool.js'
import type { DispatchSpawnedResult } from './result.js'

// ─────────────────────────── review-wave-N 修正波标记（机械④） ───────────────────────────
// 提案 forge-verification-hardening M5「标记体系」：每轮 review/走查修正波结算落
// review-wave-N 检查点（Blocker 返工批 / fix 链收口），附标记时刻四列累计计数快照
// （tasks_total / commits_total / fixes_total / evidence_debts_total——提案统计口径）。
// fail-soft：标记失败 console.warn 留痕，不回滚已定结算；依赖缺席（checkpoints 面 /
// proposalId 映射）= 机制惰性不判，行为零变化。

/** checkpoints 域服务的结算侧结构化消费面（结构兼容 core createCheckpointsService——插件禁 import core） */
export interface SettleCheckpointsFace {
  appendCheckpoint(input: {
    readonly projectId: string
    readonly proposalId: string
    readonly mark: 'review-wave-N'
    readonly baseCommitHash: string
    readonly snapshots: {
      readonly tasksTotal: number
      readonly commitsTotal: number
      readonly fixesTotal: number
      readonly evidenceDebtsTotal: number
    }
  }): Promise<unknown>
}

/** 容器分支 HEAD 解析器（标记时点 base_commit_hash 来源——单测注入桩） */
export type HeadCommitResolver = (worktreeDir: string) => Promise<string | undefined>

/** git 真解析：容器检出当前 HEAD（rev-parse HEAD；故障 = undefined——fail-soft 跳过标记） */
export const gitHeadCommit: HeadCommitResolver = async (worktreeDir) => {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const git = execFile('git', ['-C', worktreeDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }, (error, out) =>
        error == null ? resolve(out) : reject(error),
      )
      noteHostOwnedChild(git) // 结算期 git 子进程 = 宿主自有（job-tree 防误收编——1.14 同口径）
    })
    const hash = stdout.trim()
    return hash === '' ? undefined : hash
  } catch {
    return undefined
  }
}

/** 四列计数快照（标记时刻累计值——提案「计数基准与起点」节口径） */
export interface WaveSnapshot {
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/**
 * 标记时刻计数快照（容器任务域全集 = source 限定）：
 * - tasks_total：completed 任务数（taskStats 七态分布直读）
 * - fixes_total：completed 且 fix 类（coding-fix 类型 ∨ fix 链派生 sourceTask）数
 * - commits_total：completed 任务结算记录 commit_hash 去重集合大小
 * - evidence_debts_total：结算记录 evidenceDebt 声明次数
 */
export async function computeWaveSnapshot(
  tasks: ForgeTasksService,
  projectId: string,
  source: ContainerRef,
): Promise<WaveSnapshot> {
  const stats = await tasks.taskStats({ projectId, source })
  const cards = await tasks.listTasks({ projectId, source, sort: 'created' })
  const completed = cards.filter((c) => c.taskStatus === 'completed')
  let commitsTotal = 0
  let evidenceDebtsTotal = 0
  const seenCommits = new Set<string>()
  for (const card of completed) {
    const detail = await tasks.queryTask({
      projectId,
      taskRef: { slug: card.slug, localId: card.localId },
      include: { records: true },
    })
    for (const record of detail.records ?? []) {
      if (record.commitHash !== undefined && record.commitHash !== '' && !seenCommits.has(record.commitHash)) {
        seenCommits.add(record.commitHash)
        commitsTotal += 1
      }
      if (record.evidenceDebt !== undefined) evidenceDebtsTotal += 1
    }
  }
  return {
    tasksTotal: stats.byStatus.completed,
    commitsTotal,
    fixesTotal: completed.filter((c) => c.taskType === 'coding-fix' || c.sourceTask !== undefined).length,
    evidenceDebtsTotal,
  }
}

/** 修正波落点判定：blocked 结算 = Blocker 返工批；success 结算的 fix 类任务 = fix 链收口（用户裁决批不经结算核——循环/走查侧另记） */
function isReviewWavePoint(task: TaskSnapshot, outcome: 'success' | 'blocked'): boolean {
  if (outcome === 'blocked') return true
  return task.taskType === 'coding-fix' || task.sourceTaskId !== undefined
}

/** review-wave-N 标记落行（fail-soft——任何失败 console.warn 留痕，不回滚已定结算） */
async function recordWaveCheckpoint(
  deps: {
    readonly tasks: ForgeTasksService
    readonly checkpoints?: SettleCheckpointsFace
    readonly resolveHeadCommit?: HeadCommitResolver
  },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    readonly proposalId?: string
    readonly worktreeCwd?: string
    readonly submitCommitHash?: string
    readonly outcome: 'success' | 'blocked'
  },
): Promise<void> {
  try {
    if (deps.checkpoints === undefined || ctx.proposalId === undefined) return
    if (!isReviewWavePoint(ctx.task, ctx.outcome)) return
    const headCommit =
      (ctx.worktreeCwd !== undefined ? await (deps.resolveHeadCommit ?? gitHeadCommit)(ctx.worktreeCwd) : undefined) ??
      ctx.submitCommitHash
    if (headCommit === undefined) {
      console.warn(`forge settle: review-wave mark skipped (no base commit) for ${ctx.task.slug}/${ctx.task.localId}`)
      return
    }
    const snapshots = await computeWaveSnapshot(deps.tasks, ctx.projectId, ctx.task.source)
    await deps.checkpoints.appendCheckpoint({
      projectId: ctx.projectId,
      proposalId: ctx.proposalId,
      mark: 'review-wave-N', // wave_seq 缺省自动递增（检查点域 max+1——多波标记免记序数）
      baseCommitHash: headCommit,
      snapshots,
    })
  } catch (cause) {
    console.warn(
      `forge settle: review-wave checkpoint failed for ${ctx.task.slug}/${ctx.task.localId}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

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
      title: `e2e 补充验证：${ctx.task.title}`,
      type: 'test-run',
      taskDesc: [
        `任务 ${ctx.task.slug}/${ctx.task.localId} 已完成实现与单元测试；本任务补做它还未完成的真机 e2e 验证。`,
        `e2e 套件：${debt.suite}；待验证 spec：${specsLine}。`,
        ...(debt.note !== undefined ? [`补充说明：${debt.note}`] : []),
        // 文案与简报行真实存在性一致（bug ca061ef6）：简报红灯清单在场才指示比对——
        // 无红灯/基线门未接线时兜底文案，不指示真机不存在的简报行
        e2eBaselineRedCases !== undefined && e2eBaselineRedCases.length > 0
          ? '执行 e2e 并断言上述 spec；如遇失败，先比对任务说明中的 E2E_BASELINE_RED 行——其中列出的失败在本任务开始前就已存在，不是本任务造成的回归；上报结论时注明这一背景。'
          : '执行 e2e 并断言上述 spec；本任务创建时说明中没有 E2E_BASELINE_RED 行（基线未启用，或当时没有已知的既有失败）——遇失败不要默认当作本任务的回归，先区分三类原因（环境问题 / 断言过时 / 真实回归）再上报。',
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
    /** checkpoints 域服务消费面（可选——机械④修正波标记；缺席 = 机制惰性不判，行为零变化） */
    readonly checkpoints?: SettleCheckpointsFace
    /** 容器分支 HEAD 解析器（可选——缺席回落 gitHeadCommit 真解析；单测注入桩） */
    readonly resolveHeadCommit?: HeadCommitResolver
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
    /**
     * 本项目文档根绝对路径（<工作区根>/.forge/docs——跨分支特例归属判据锚）：在场时纯文档
     * 特例按绝对路径归属核验（resolve 后必须落在 docsRoot 内——他项目 .forge/docs 文档不命中）；
     * 缺席 = 回落 '.forge/docs/' 前缀判据（fail-soft——装配未接线时零变化）。
     */
    readonly docsRoot?: string
    /** 本轮 claim 简报红灯清单（改进7——欠账卡文案一致性判据；缺席/空 = 兜底文案） */
    readonly e2eBaselineRedCases?: readonly string[]
    /**
     * 容器 → 提案 id 映射（机械④——review-wave-N 检查点 proposal_id 归属；由装配/循环侧
     * 经提案谱系解析传入。缺席 = 不落修正波标记，行为零变化）。
     */
    readonly proposalId?: string
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
    // 任务留 in_progress 走幂等重入径（不走 submit-blocked）；
    // 输出原文随判词携带（bug 63112ab2——循环侧流控分类的载体；截断防长文进防线面）
    const detail = run.output.trim().slice(0, 500)
    return {
      case: 'failed',
      cause: new Error(`worker run ended without a settlement (stopReason: ${run.stopReason})${detail !== '' ? `: ${detail}` : ''}`),
    }
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
      // 跨分支结算特例（用户裁决 2026-10-24）：纯本项目 .forge/docs/ 文档提交允许落容器分支
      // 之外（文档属工作区留盘产物，不入容器分支交付面）。判据 = files 全量归属于文档根——
      // docsRoot 在场时 resolve 到绝对路径核验包含关系（他项目 .forge/docs 不命中）；缺席
      // 回落 '.forge/docs/' 前缀判据。fail-closed：files 缺席或含任一文档外路径仍拒绝。
      const fileInsideDocsRoot = (f: string): boolean => {
        if (ctx.docsRoot === undefined) return f.replaceAll('\\', '/').startsWith('.forge/docs/')
        const abs = isAbsolute(f) ? f : resolve(resolve(ctx.docsRoot, '..', '..'), f)
        const rel = relative(ctx.docsRoot, abs)
        return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
      }
      const docsOnly =
        submitRecord.files !== undefined && submitRecord.files.length > 0 && submitRecord.files.every(fileInsideDocsRoot)
      if (!verdict.ok && !docsOnly) {
        // 特例未命中原因（申报缺漏 vs 范围越界，一一对应纠正路径①②的前提差异）
        const docsBasis = ctx.docsRoot !== undefined ? `本项目文档根 ${ctx.docsRoot}` : "'.forge/docs/' 前缀"
        const causeHint =
          submitRecord.files === undefined || submitRecord.files.length === 0
            ? `submitTask 未申报 files（特例判据 = files 全量归属于 ${docsBasis}）`
            : `files 含文档外路径：${submitRecord.files.filter((f) => !fileInsideDocsRoot(f)).join('、')}`
        return await rejectLanding(deps, ctx, new Error(
          [
            `[settle-cwd-pin] 提交分支核验未通过：提交 ${submitRecord.commitHash} 不在容器检出分支 ${verdict.branch} 上（所在分支：${verdict.commitBranches.join(', ') || '任一本地分支均不可达'}），结算拒绝`,
            `原因：${causeHint}，不适用纯文档跨分支特例`,
            `纠正（按改动性质二选一）：① 含代码/测试 → git checkout ${verdict.branch} 后按任务范围重新提交，重新 submitTask 附新 commitHash；② 纯文档 → 重新 submitTask，files 逐文件如实列出且全部归属于 .forge/docs/`,
          ].join('\n'),
        ))
      }
    } catch (cause) {
      return await rejectLanding(deps, ctx, new Error(
        `[settle-cwd-pin] 提交落点核验故障（容器检出 ${ctx.worktreeCwd}，提交 ${submitRecord.commitHash}）：${cause instanceof Error ? cause.message : String(cause)}`,
      ))
    }
  }
  // 机械④：修正波结算点落 review-wave-N 检查点（blocked = Blocker 返工批；fix 类任务收口
  // = fix 链收口）——fail-soft，落点核验拒绝径（landing-rejected 提前返回）不落标记
  await recordWaveCheckpoint(
    { tasks: deps.tasks, checkpoints: deps.checkpoints, resolveHeadCommit: deps.resolveHeadCommit },
    {
      projectId: ctx.projectId,
      task: ctx.task,
      proposalId: ctx.proposalId,
      worktreeCwd: ctx.worktreeCwd,
      submitCommitHash: submitRecord?.commitHash,
      outcome,
    },
  )
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
