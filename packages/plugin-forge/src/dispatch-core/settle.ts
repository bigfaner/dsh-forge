// dispatch-core · 结算核（S1a 可拆卸壳分层；async-dispatch §4.2 ②③——前台阻塞径与后台
// done continuation 同源消费的共用体，保证「结算块 = spawned 分支原样投影」）：
// await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
// queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
// run 拒绝/无结算同归防线径，kill 由调用方 taxonomy 判定）。
// 改进7（e2e 取证债）：success 结算 submit record 携带 evidenceDebt = 实现态部分结算——
// 本核自动生成独立 test-run 欠账任务（dependsOn 实现卡），实现卡不再因取证欠账 blocked。
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
        '执行 e2e 并断言上述 spec；如遇失败先比对任务简报 E2E_BASELINE_RED 行——基线红灯 = 入场前既有失败，非本实现回归，按归因流程上报（不归因到实现卡）。',
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

/** worker 终态结算判定（settleWorkerRun 产物——失败支合并 run 拒绝与无结算，kill 由调用方 taxonomy 判定） */
export type WorkerSettlement =
  | { readonly case: 'settled'; readonly result: Omit<DispatchSpawnedResult, 'kind'>; readonly durationMs: number }
  | { readonly case: 'failed'; readonly cause: unknown }

/**
 * worker 终态结算核（async-dispatch §4.2 ②③——前台 execute 第 4~5 步原样搬迁的共用体，
 * 前台阻塞径与后台 done continuation 同源消费，保证「结算块 = spawned 分支原样投影」）：
 * await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
 * queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
 * run 拒绝/无结算同归防线径）。
 */
export async function settleWorkerRun(
  deps: { readonly tasks: ForgeTasksService },
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    /** claim 简报指纹（spawned 分支 digest 字段同源——task_records.claim 行双记同值） */
    readonly digest: string
    /** 池快照口径（1.10：scoped 派发 = 该容器 source——结算 spawned 分支快照四计数同口径；
     *  缺席 = 全池，非 scoped 调用零变化。注意与 ctx.task.source 相异：非 scoped 调用
     *  不得借任务容器收窄——全池口径保持） */
    readonly poolSource?: ContainerRef
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
  const followUp = outcome === 'blocked' ? await findFixTaskRef(deps.tasks, ctx.projectId, ctx.task) : undefined
  // 改进7：实现态部分结算（evidenceDebt 在场）→ 自动生成欠账 test-run 任务（fail-soft）
  const evidenceDebt =
    outcome === 'success' && submitRecord?.evidenceDebt !== undefined
      ? await createE2eDebtTask(deps.tasks, ctx, submitRecord.evidenceDebt)
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
