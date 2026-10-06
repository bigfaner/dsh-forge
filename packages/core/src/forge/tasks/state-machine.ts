// 任务状态机 transitionTargets——唯一目标态计算源（任务 2.1；tech-design §Interface 10
// 「提前校验 + 所见即所得」+ db-schema §3.1 agent 面转移矩阵）。Hard Rule：UI 菜单
// （taskDetail.allowedTransitions → 转移对话框选项集）与服务端校验（transitionTask 先验
// toStatus ∈ transitionTargets(current,'human')）共用本纯函数，禁复制第二实现（零漂移）。
// 定位铁律：纯函数禁 IO（实现注记——消费侧接线在 2.4/2.5）。
import { TASK_STATUSES, type TaskStatus } from '@dsh-forge/contracts'
import { InvalidTransitionError, type TransitionFace } from './errors.js'

export type { TransitionFace }

/**
 * agent 面转移矩阵（db-schema §3.1——SC7 单测对象，只含动词与钩子拥有的边）。
 * Record<TaskStatus, …> = 编译期穷尽（七态加值即编译红——AC5）：
 * - pending → in_progress（claimTask）
 * - in_progress → completed（仅经 submitTask，gate ✓）/ blocked（submitTask result=blocked）
 * - blocked → in_progress（claimTask 重派）/ pending（auto-restore——submit 钩子）
 * - suspended / completed / skipped / rejected：无出边（agent 面不可达）
 * 注：in_progress 幂等重入（C1）无状态转移，不出现在矩阵；auto-block（addTask --block-source
 * 单事务置源 blocked）是写路径内聚效果，同样不经转移校验面。
 */
export const AGENT_TRANSITION_MATRIX: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['in_progress'],
  in_progress: ['completed', 'blocked'],
  blocked: ['in_progress', 'pending'],
  suspended: [],
  completed: [],
  skipped: [],
  rejected: [],
}

/**
 * 目标态计算（Interface 10 签名逐字）：
 * - human = 七态 − 当前态（from≠to 任意通道——菜单全列机械排除自身；行序 = TASK_STATUSES 序）
 * - agent = 转移矩阵推导（claim/submit 拥有的边）
 * 返回全新数组（纯函数——调用方改写不污染矩阵与后续计算）。
 */
export function transitionTargets(current: TaskStatus, face: TransitionFace): TaskStatus[] {
  if (face === 'agent') return [...AGENT_TRANSITION_MATRIX[current]]
  return TASK_STATUSES.filter((s) => s !== current)
}

/**
 * 提前校验拒绝面（SC7 三形归一）：to ∉ transitionTargets(current, face) → ERR_INVALID_TRANSITION。
 * - 「目标 ∉ transitionTargets」human/agent 通形（含 to === current——两 face 目标集均不含自身）；
 * - 「from 不匹配」：动词期望的 from 态不符（如对 pending 任务 submitTask success）经 agent 面
 *   目标集不命中自然覆盖（pending 的 agent 目标仅 in_progress，completed 不在集）；
 * - 「agent 面矩阵非法格」：矩阵空行/非格（in_progress→pending、blocked→completed 等）同路拒绝。
 * 消费侧：transitionTask 先验（2.5，human）/ submitTask·claimTask 转移边（2.4，agent）。
 */
export function assertTransitionAllowed(current: TaskStatus, to: TaskStatus, face: TransitionFace): void {
  const allowed = transitionTargets(current, face)
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError({ current, to, face, allowed })
  }
}
