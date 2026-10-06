// forge/tasks 域 typed error（任务 2.1 起步：ERR_INVALID_TRANSITION——tech-design §Error Handling
// 409 行三形统一拒绝面：from 不匹配 / 目标 ∉ transitionTargets / agent 面矩阵非法格）。
// code 字面量锚定 @dsh-forge/contracts ERROR_CODES，类名/name 手写字面量（contracts 不持
// 运行期名映射——表 Name 列为文档性对照）；RPC 边界（3.1）序列化为 RpcErrorPayload
// { code, message, data }，UI 按 code 映射状态。后续动词动词错误（NOT_FOUND/DEPENDENCIES_*
// 等）随 2.3–2.5 同文件扩池。
import type { TaskStatus } from '@dsh-forge/contracts'

/** 校验面（Interface 10）：human = 七态 − 当前态（UI 菜单与服务端同源）；agent = claim/submit 转移矩阵 */
export type TransitionFace = 'human' | 'agent'

/** ERR_INVALID_TRANSITION 附载（RpcErrorPayload.data 形状：校验基准 + 合法目标全集——零漂移证物） */
export interface InvalidTransitionData {
  /** 实际当前态（校验基准 from——from 不匹配即基于此判定） */
  current: TaskStatus
  /** 请求目标态 */
  to: TaskStatus
  /** 校验面 */
  face: TransitionFace
  /** 该 (current, face) 合法目标全集（transitionTargets 单源计算，非二次实现） */
  allowed: readonly TaskStatus[]
}

/** 非法任务转移：to ∉ transitionTargets(current, face)（三形归一——动词层提前校验共用本拒绝面） */
export class InvalidTransitionError extends Error {
  readonly code = 'ERR_INVALID_TRANSITION' as const
  readonly data: InvalidTransitionData

  constructor(data: InvalidTransitionData) {
    super(
      `非法任务转移：${data.current} → ${data.to}（${data.face} 面）——合法目标 [${data.allowed.join(', ')}]`,
    )
    this.name = 'InvalidTransitionError'
    this.data = data
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isInvalidTransitionError(e: unknown): e is InvalidTransitionError {
  return e instanceof InvalidTransitionError
}
