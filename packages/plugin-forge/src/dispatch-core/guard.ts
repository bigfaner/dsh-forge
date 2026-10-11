// dispatch-core · halted guard 机械（S1a 可拆卸壳分层——「guard 机械」迁入共享核心面；
// decisions #18：guardKey = 参数槽，工具壳填会话 id、循环填 LoopInstanceId——guard 粘性
// 载体随键而变，两消费者互不污染）。插件模块级·易失——冷启动重置；无重置参数：
// 复位 = 新 guard 键（原「新会话复位」语义的键参数化形态）。

/** 连续 spawn 失败粘住阈值（第 3 次失败起本键 halted） */
export const HALT_THRESHOLD = 3

export const HALTED_REASON =
  '3 consecutive worker spawn failures in this dispatch session — the guard is sticky with no self-unlock; check the environment and start a new dispatch session to reset'

/** 键作用域连续失败计数器（模块级·易失）。成功结算即清零（spawn 机制面恢复）；
 * spawn 失败任务留 in_progress 走幂等重入径。 */
const SPAWN_FAILURES = new Map<string, number>()

/** 入口粘住检查（≥ 阈值 = 本键 halted——不再 claim：防再领任务弃置 in_progress） */
export function spawnFailureStuck(guardKey: string): boolean {
  return (SPAWN_FAILURES.get(guardKey) ?? 0) >= HALT_THRESHOLD
}

/** 防线计数共享核（前台 spawnFailed / 后台 job 回灌共用——「连续」= 结算序 streak） */
export function bumpSpawnFailures(guardKey: string, taskKey: string, cause: unknown): { message: string; stuck: boolean } {
  const count = (SPAWN_FAILURES.get(guardKey) ?? 0) + 1
  SPAWN_FAILURES.set(guardKey, count)
  return {
    message: `worker spawn failed for ${taskKey}: ${cause instanceof Error ? cause.message : String(cause)}`,
    stuck: count >= HALT_THRESHOLD,
  }
}

/** 成功结算即清零（结算序 streak——spawn 机制面恢复） */
export function clearSpawnFailures(guardKey: string): void {
  SPAWN_FAILURES.delete(guardKey)
}
