// workbench/projection/lifecycle-hooks — 生命周期动词 × 投影 push 的单一
// 接线点(任务 3.4;tech-design §Interface 1 v3·生命周期动词投影语义 +
// §Overview 交付线 3「四操作同步」)。
//
// 四操作映射矩阵(本文件 = 内核侧唯一装配处,ipc/services.ts 消费):
//
//   生命周期动词      投影动作                                通道事件
//   ──────────────── ────────────────────────────────────── ──────────────────────
//   registerProject  pushForRegistration(期望占位 + ensure  projection_push_required
//                     plan;3.2 接线,1.3 hook 原名               (plan)
//                     onProjectionExpectation 沿用)
//   renameProject    pushForRename(自包含 plan 含 rename    projection_push_required
//                     op;归档项目零 op 不推送)                  (plan)
//   archiveProject   零投影 op —— dsh 侧 workspace 保留      (无;仅 project_list_
//   restoreProject   (必答⑤:归档 ≠ 删除,会话仍按项目分组)      changed)
//   removeProject    buildRemovalPlan(行删除【前】组装)→    projection_push_required
//                     行删除后 emitRemovalPush(delete op;        (delete plan)
//                     FK cascade 清期望快照/布局记忆随行)
//
// Hard Rules(tech-design §Hard Rules / PRD 必答④⑤):
//   - 单向投影:本接线只产出自内核期望状态派生的 plan(relay 执行);
//     偏差(dsh 侧手改)仅呈现,永不在此触发任何反向写;
//   - 归档 ≠ 删除:archive/restore 不产生任何投影动作(无 hook 挂接);
//   - 动词不因投影失败 reject(Propagation Strategy):removal plan 组装
//     失败仅 log + 返回 null(ERR_PROJECT_NOT_FOUND 由 removeProjectRow
//     保持唯一权威);注册/改名 hook 的同款防线在 lifecycle-service。
//
// removeProject 的「拆出窗关闭」hook 留 TODO 注记于 ipc/services.ts 的动词
// 装配处(任务 4.2 壳层窗口注册表落地后接线;本文件不提前引入跨相位实现)。

import { shellLog } from '../../log.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import type { ProjectionPlan } from './plan.ts'

/** lifecycle-hooks 消费的投影 service 面(3.2 createProjectionReconcileService 的结构子集)。 */
export interface ProjectionLifecycleFace {
  /** 注册成功:期望占位 + ensure plan push。 */
  readonly pushForRegistration: (projectId: string) => void
  /** 改名成功:自包含 plan push(rename op;归档零 op 不推送)。 */
  readonly pushForRename: (projectId: string) => void
  /** 移除 plan 组装(必须在项目行删除之前调用)。 */
  readonly buildRemovalPlan: (projectId: string) => ProjectionPlan
}

/** 装配入参:投影 service 面 + 事件批推送端(sink;单批直发形态)。 */
export interface ProjectionLifecycleHooksDeps {
  readonly projection: ProjectionLifecycleFace
  readonly onEvents: (events: readonly WorkbenchEvent[]) => void
}

/** 生命周期动词 × 投影的接线产物(ipc/services.ts 的唯一消费面)。 */
export interface LifecycleProjectionHooks {
  /** registerProject 成功 hook(注入 lifecycle-service.onProjectionExpectation)。 */
  readonly onRegistered: (projectId: string) => void
  /** renameProject 成功 hook(注入 lifecycle-service.onProjectionRenamed)。 */
  readonly onRenamed: (projectId: string) => void
  /**
   * removeProject 第一步:delete plan 组装 —— 必须在项目行删除【之前】调用。
   * 失败(含未知项目)仅 log + null:ERR_PROJECT_NOT_FOUND 的唯一权威 =
   * removeProjectRow,动词语义不受投影面影响。
   */
  readonly removalPlanBeforeDelete: (projectId: string) => ProjectionPlan | null
  /**
   * removeProject 第二步:行删除之后发 delete plan push(ops 空 = dsh 侧
   * 本无物可删,零 op 不推送)。relay 缺席世界 = 事件无人消费,dsh 侧可能
   * 残留 workspace(孤儿 = 用户自有数据,原生可删;期望行已 cascade 清除,
   * 无重试面 —— 删除动词不被阻断,降级语义由 PRD 必答④承载)。
   */
  readonly emitRemovalPush: (plan: ProjectionPlan) => void
}

export function createLifecycleProjectionHooks(deps: ProjectionLifecycleHooksDeps): LifecycleProjectionHooks {
  return {
    onRegistered(projectId: string): void {
      deps.projection.pushForRegistration(projectId)
    },

    onRenamed(projectId: string): void {
      deps.projection.pushForRename(projectId)
    },

    removalPlanBeforeDelete(projectId: string): ProjectionPlan | null {
      try {
        return deps.projection.buildRemovalPlan(projectId)
      } catch (error) {
        // 组装失败(未知项目/读库异常)不阻断删除:removeProjectRow 保持
        // ERR_PROJECT_NOT_FOUND 唯一权威,投影面仅结构化 log。
        shellLog.error({
          code: 'ERR_PROJECTION_OP_FAILED',
          message: 'removal plan assembly failed (removal proceeds; dsh-side workspace may linger)',
          data: { projectId, detail: error instanceof Error ? error.message : String(error) },
        })
        return null
      }
    },

    emitRemovalPush(plan: ProjectionPlan): void {
      if (plan.ops.length === 0) return
      deps.onEvents([{ type: 'projection_push_required', projectId: plan.projectId, plan }])
    },
  }
}
