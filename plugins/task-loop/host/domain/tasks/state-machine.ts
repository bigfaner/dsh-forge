// 任务状态机 transitionTargets——唯一目标态计算源（core forge/tasks/state-machine.ts 直迁——
// plugin-task-loop 1.7 内联）。Hard Rule：UI 菜单（taskDetail.allowedTransitions → 转移对话框
// 选项集）与服务端校验（transitionTask 先验 toStatus ∈ transitionTargets(current,'human)）共用
// 本纯函数，禁复制第二实现（零漂移）。定位铁律：纯函数禁 IO。
import { TASK_STATUSES, type TaskStatus } from "@dsh-forge/lib-api/labels";
import { InvalidTransitionError, type TransitionFace } from "./errors.js";

export type { TransitionFace };

/**
 * agent 面转移矩阵（SC7 单测对象，只含动词与钩子拥有的边）：
 * - pending → in_progress（claimTask）
 * - in_progress → completed（仅经 submitTask，gate ✓）/ blocked（submitTask result=blocked）/
 *   interrupted（reconcileInterrupted——启动对账/循环主动终态的状态真化）
 * - blocked → completed（blocked verdict restore——裁决改判结算）/ in_progress（claimTask 重派）/
 *   pending（auto-restore——submit 钩子）
 * - interrupted → in_progress（claimTask adopt——循环定向恢复领取）
 * - suspended → pending（resume 序批量恢复——「仅 resume 时点触发」守卫由调用方承担）
 * - completed / skipped / rejected：无出边（agent 面不可达）
 */
export const AGENT_TRANSITION_MATRIX: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ["in_progress"],
  in_progress: ["completed", "blocked", "interrupted"],
  blocked: ["completed", "in_progress", "pending"],
  suspended: ["pending"],
  interrupted: ["in_progress"],
  completed: [],
  skipped: [],
  rejected: [],
};

/**
 * 前置满足集（prerequisite ∈ {completed, skipped} ⟺ 满足；rejected 不满足——依赖路径死锁信号）。
 * 消费侧：恢复钩子全满足判据（transitionTask C3 + submitTask 同族）/ validate liveness / claim 守卫。
 */
export const SATISFYING_TASK_STATUSES: readonly TaskStatus[] = ["completed", "skipped"];

/**
 * 目标态计算：
 * - human = 八态 − 当前态（菜单全列机械排除自身；行序 = TASK_STATUSES 序）
 * - agent = 转移矩阵推导（claim/submit/reconcile 拥有的边）
 * 返回全新数组（纯函数——调用方改写不污染矩阵与后续计算）。
 */
export function transitionTargets(current: TaskStatus, face: TransitionFace): TaskStatus[] {
  if (face === "agent") return [...AGENT_TRANSITION_MATRIX[current]];
  return TASK_STATUSES.filter((s) => s !== current);
}

/**
 * 提前校验拒绝面（三形归一）：to ∉ transitionTargets(current, face) → ERR_INVALID_TRANSITION。
 * 消费侧：transitionTask 先验（human）/ submitTask·claimTask 转移边（agent）。
 */
export function assertTransitionAllowed(current: TaskStatus, to: TaskStatus, face: TransitionFace): void {
  const allowed = transitionTargets(current, face);
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError({ current, to, face, allowed });
  }
}
