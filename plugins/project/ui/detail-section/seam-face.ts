// detail-section · forge.worktrees 缝消费面（1.32——WorktreeServicePort 契约，
// type-only 出 @dsh-forge/lib-api 单源）。劣形三形态判定复用 host/assembly/seams.ts
// injectProjectSeam 既有机制（语义同型镜像——bundle 自含纪律：client bundle 零 host
// 运行时 import，同 official-seams.ts「官方面结构同型镜像」先例）：
//   ① 注册值非函数（含缺席 undefined）→ undefined（无面板）；
//   ② 工厂实例化抛错 / 产出非对象 → undefined（无面板）；
//   ③ 首调抛错 → 由组件消费面收口（list rejection → 恒无面板——劣形即退默认终态）。
// 检测永不缓存：face 逐次取法现查 reflect.get（AGENTS 1.6 同径）。
import type { WorktreeServicePort } from '@dsh-forge/lib-api'

/** forge.worktrees 缝服务键（client 消费侧锚——与 host PROJECT_SEAM_KEYS.worktrees 字面同源，测试 pin 锁定） */
export const WORKTREE_SEAM_KEY = 'forge.worktrees'

/** cordis ctx 消费切片（reflect 只读反射——缺席/异常 = undefined fail-soft） */
export interface WorktreeSeamCtx {
  readonly reflect?: {
    readonly get?: (name: string) => unknown
  }
}

/**
 * forge.worktrees 缝 face 取法（劣形①②在此收口，返回 undefined = 无面板 fail-soft；
 * 劣形③首调抛错由消费组件 list rejection 收口——见 detail-section/index.tsx）。
 */
export function worktreePortOf(ctx: WorktreeSeamCtx): WorktreeServicePort | undefined {
  let raw: unknown
  try {
    raw = ctx.reflect?.get?.(WORKTREE_SEAM_KEY)
  } catch {
    return undefined // 读取异常（scope 缺席）视同缺席——劣形①
  }
  if (typeof raw !== 'function') return undefined // 劣形①（含缺席）
  let instance: unknown
  try {
    instance = (raw as () => unknown)()
  } catch {
    return undefined // 劣形②实例化抛错
  }
  if (instance === undefined || instance === null || typeof instance !== 'object') {
    return undefined // 劣形②产出非对象
  }
  return instance as WorktreeServicePort
}
