// submitTask——任务域结算动词（任务 2.4；tech-design §Interface 1「动词内聚不变量」submitTask 行
// + db-schema §4 动词矩阵 submitTask 行 + C4 gate 失败走 blocked + C5 RecordData 瘦身 +
// 交互一派发链 executor 结算位）。定位：业务（forge/tasks 子域）。import 边：→ forge/workspace/
// （共享句柄/事件）与同域 errors/phase-deriver/query/state-machine/transition（恢复钩子单一实现
// ——C3 与 transitionTask 同族）；四域互禁 import 彼此（Hard Rule）。actor 由通道推断：
// submitTask = tool 专属动词（Interface 7——submit 不上 RPC），submit 记录 actor 恒 'plugin-tool'。
//
// 单事务全成全败（Hard Rule）：行解析 → 输入面校验（blocked reason 必带 / success summary 必带
// ——先于转移校验，与 transitionTask 同序）→ 双门（M3 2.6 图 8·SC7：gate 摘要门 → AC 证据门
// ——均仅挂 success 结算）→ agent 面矩阵先验（in_progress → completed|blocked
// 唯一入口；pending/blocked/终态提交即 ERR_INVALID_TRANSITION）→ 写前相位增量断言 → 转移
// UPDATE → submit 记录（files/gate/commit 结构化负载）→ 恢复钩子（completed 挂——反查
// idx_edges_prerequisite，前置**全**满足才 auto-restore，边不删）→ 相位重算；闭包尾部（提交后）
// emitTasksChanged。一律 prepared statements（Hard Rule）。
//
// 双门边界（M3 2.6）：type='gate' ∧ gate 缺席 → ERR_GATE_SUMMARY_REQUIRED（数字摘要
// {compile,fmt,lint,test[,coverage]} 必带落 gate_json）；ac_json 非空 ∧ gate.test !== true →
// ERR_TEST_EVIDENCE_REQUIRED（data/错误信息逐行含 AC 清单——SC7 机械判据，Hard Rule 禁裸
// 错误码）。blocked submit 不经双门（C4 失败分诊走 fix 链——Go 先例 validateRecordData 非
// completed 早退；受阻提交可带失败 gate 载荷原样落账沿「不服务内判红」注记）。
//
// 边界注记：gate 载荷原样落账不服务内判红（gate 执行归 executor 技能纪律——失败分诊 = blocked
// 走 fix 链，C4）；blocked_reason 列不在本动词写面（reason 落 append-only 记录为审计单源——
// 与 transitionTask 2.5 同裁决）；files/gate 缺省 = 列 NULL（files 回填归读面 git 查找）。
import type { SubmitTaskInput, SubmitTaskResult } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { readPhaseInput, type TasksVerbDeps } from './add.js'
import { GateSummaryRequiredError, ReasonRequiredError, SummaryRequiredError, TestEvidenceRequiredError } from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { resolvePhaseGuardFeature, resolveTaskRef } from './query.js'
import { SATISFYING_TASK_STATUSES, assertTransitionAllowed } from './state-machine.js'
import { runRestoreHook } from './transition.js'

export type { TasksVerbDeps }

/**
 * Interface 1 submitTask：executor 结算（转移 + record files/gate/commit + 恢复钩子 + 相位重算）。
 * result=success → in_progress→completed（summary 必带）；result=blocked → in_progress→blocked
 * （reason 必带——fix 链承接）。
 */
export async function submitTask(deps: TasksVerbDeps, input: SubmitTaskInput): Promise<SubmitTaskResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const result = withTransaction(db, (): SubmitTaskResult => {
    // ① 行解析（agent 面 TaskRef UNIQUE(slug, local_id) 查捞——身份双轨自然键侧）
    const row = resolveTaskRef(db, input.projectId, input.taskRef)

    // ② 输入面校验（先于转移校验——transitionTask reason 同序）：blocked 空因 / success 空摘要
    if (input.result === 'blocked' && (input.reason ?? '').trim() === '') {
      throw new ReasonRequiredError({ verb: 'submitTask' })
    }
    if (input.result === 'success' && (input.summary ?? '').trim() === '') {
      throw new SummaryRequiredError({ verb: 'submitTask' })
    }

    // ②b gate 摘要门（图 8 B 节——先于 AC 门/转移校验）：type='gate' ∧ gate 载荷缺席 → 拒
    //    （数字摘要 {compile,fmt,lint,test[,coverage]} 必带落 gate_json）。仅挂 success 结算。
    if (input.result === 'success' && row.task_type === 'gate' && input.gate === undefined) {
      throw new GateSummaryRequiredError({ verb: 'submitTask' })
    }

    // ②c AC 证据门（图 8 C/D 节——SC7 机械判据）：ac_json 非空 ∧ gate.test !== true → 拒
    //    （data/错误信息逐行含 AC 清单）；空清单 [] = 无 AC 任务直通不校验（与 NULL 同形）。
    //    仅挂 success 结算——blocked submit 不经（C4）。
    if (input.result === 'success') {
      const acceptanceCriteria = row.ac_json !== null ? (JSON.parse(row.ac_json) as string[]) : []
      if (acceptanceCriteria.length > 0 && input.gate?.test !== true) {
        throw new TestEvidenceRequiredError({ acceptanceCriteria })
      }
    }

    // ③ agent 面矩阵先验（in_progress 唯一合法 from——pending/blocked/终态提交即拒绝）
    const toStatus = input.result === 'success' ? 'completed' : 'blocked'
    assertTransitionAllowed(row.task_status, toStatus, 'agent')

    // ④ 写前相位增量断言（受影响 feature——漂移即整体回滚，承重防护；律四：proposal 容器
    //    无相位域 → 守卫与重算整体跳过——resolvePhaseGuardFeature 单源判别）
    const feature = resolvePhaseGuardFeature(db, row)
    if (feature !== undefined) {
      const before = readPhaseInput(db, feature.id)
      assertPhaseInvariant({
        featureStatus: feature.feature_status,
        docKinds: before.docKinds,
        taskStatuses: before.taskStatuses,
        featureSlug: feature.slug,
      })
    }

    // ⑤ 转移 + submit 记录（结构化负载：files/gate/commit + reason|summary + 执行会话——
    //    与 claim 的派发会话相异可判，SC6③ 双源）
    db.prepare(`UPDATE tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(toStatus, now, row.id)
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, summary, files_json,
         gate_json, commit_hash, actor, session_id, created_at, updated_at)
       VALUES (?, 'submit', ?, ?, ?, ?, ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(
      row.id,
      row.task_status,
      toStatus,
      input.result === 'blocked' ? (input.reason as string) : null,
      input.result === 'success' ? (input.summary as string) : null,
      input.files === undefined ? null : JSON.stringify(input.files),
      input.gate === undefined ? null : JSON.stringify(input.gate),
      input.commitHash ?? null,
      input.sessionId,
      now,
      now,
    )

    // ⑥ 恢复钩子（C3 与 transitionTask 同族单一实现——completed 挂：反查后继 blocked 且前置
    //    全满足 → auto-restore blocked→pending，边不删；blocked submit 不挂）
    const restored =
      (SATISFYING_TASK_STATUSES as readonly string[]).includes(toStatus)
        ? runRestoreHook(db, { satisfiedTaskId: row.id, now })
        : []

    // ⑦ 相位重算（§6-29：success 全终态 → completed；blocked 活跃集保持 in-progress；
    //    律四：proposal 容器无相位域跳过）
    if (feature !== undefined) {
      const after = readPhaseInput(db, feature.id)
      const derived = deriveFeaturePhase({
        current: feature.feature_status,
        docKinds: after.docKinds,
        taskStatuses: after.taskStatuses,
      })
      if (derived !== feature.feature_status) {
        db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
          derived,
          now,
          feature.id,
        )
      }
    }

    return { taskId: row.id, status: toStatus, restored }
  })

  // 事务提交后 emitTasksChanged（四域写后事件——单写闭包单事件，恢复钩子内聚不另发）
  deps.events.emitTasksChanged(input.projectId)
  return result
}
