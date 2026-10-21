// @dsh-forge/git-worktree —— 插件入口（Node，cordis loader 装载面）。
// 形态：Cordis Plugin.Function（loader 只认 default 导出，md-mermaid/core 同型）。
// 启动检测：插件激活时经 `git --version` 探测 git 在场性——
//   未在场 → fail-soft 不生效：不抛断宿主、零注入（UI/RPC 面、扩展点消费方均不装配）；
//   在场 → 经官方 provide 面 provide 具名能力服务 `gitWorktree`（后续任务装配门 +
//   生效可观测面），扩展点就绪。
// 扩展点解析（1.7 装配缝，惰性逐次求值）：config 覆写优先 → ctx 服务
// `forgeWorktreeIdentity`（集成层注入缝——boot/child.ts 装配方 provide；函数值扩展点
// 不可经 YAML config 承载，cordis 服务面唯一跨插件缝；激活早于 provide 不受阻——
// 惰性读取调用期先取先得）→ 默认实现 = 独立 worktree 模式（resolveProject 恒 null）。
// 零 dsh-forge 依赖：不 import @dsh-forge/*，只碰 git CLI 与注入缝（注入服务经结构化
// 最小面消费——reflect.get 防御读取，缺席/异常/非函数面 = 降级默认，plugin-forge 同配方）。
import { checkGitPresence } from './git-presence.js'
import {
  createDefaultExtensionPoints,
  type GitWorktreeExtensionPointOverrides,
  type GitWorktreeExtensionPoints,
} from './extension-points.js'

export const GIT_WORKTREE_PLUGIN_NAME = 'git-worktree' as const

/** 集成层注入缝服务名（host boot/child.ts provide ↔ 本插件惰性 get——双侧同锚常量） */
export const GIT_WORKTREE_IDENTITY_SERVICE = 'forgeWorktreeIdentity' as const

/** 插件能力服务名（git 在场时 provide——后续任务 UI/RPC/管理域装配门 + 生效可观测面） */
export const GIT_WORKTREE_SERVICE = 'gitWorktree' as const

export { checkGitPresence, type GitCommandRunner, type GitCommandResult } from './git-presence.js'
// fix-2 装配透传面（host ipc/worktree-rpc 消费——ops/绑定/封存三域出口收口包根）
export {
  createWorktree,
  CreateWorktreeError,
  deleteWorktree,
  aheadBehind,
  worktreeStatus,
  listBranches,
  defaultBranch,
  listWorktrees,
  parseWorktreeListPorcelain,
  type AheadBehind,
  type CreateWorktreeOptions,
  type DeleteConfirmationContext,
  type DeleteWorktreeResult,
  type WorktreeEntry,
  type WorktreeStatus,
} from './worktree-ops.js'
export {
  preseedWorktreeSession,
  refreshRecycledAttach,
  latestAttachEvent,
  readLatestAttach,
  isWorktreeAttachEventType,
  WORKTREE_ATTACH_EVENT_TYPE,
  type SessionPersistenceCreateFace,
  type SessionReadHandleFactory,
  type WorktreePreseedOptions,
  type WorktreeAttachData,
  type WorktreeAttachEvent,
} from './session-attach.js'
export {
  assertSendable,
  assertSessionCwdMatches,
  evaluateSeal,
  normalizePathForCompare,
  SessionCwdMismatchError,
  SessionSealedError,
  type SealDecision,
  type SessionBinding,
} from './seal-guard.js'
export {
  createDefaultExtensionPoints,
  defaultGetWorktreeDir,
  defaultResolveProject,
  type GitWorktreeExtensionPoints,
  type GitWorktreeExtensionPointOverrides,
  type ProjectResolution,
} from './extension-points.js'

/** cordis ctx 的结构化最小面（真 Context 结构兼容；注入服务经 reflect 防御读取） */
interface PluginCtxFace {
  reflect?: {
    get?(name: string): unknown
  }
  /** 官方 provide 面（ctx mixin accessor——运行期存在性检查承担 fail-soft） */
  provide?(name: string, value?: unknown): unknown
}

/**
 * 插件能力服务面（cordis 具名服务——declare module 扩充 @deepseek-ai/cordis Context，
 * type-only import 官方包保留全量类型安全；宿主 child 具名消费 ctx.gitWorktree，
 * 运行期存在性检查承担 fail-soft。对齐 AGENTS.md Cordis 具名服务取法裁决，
 * 弃 ctx.reflect 双向配方）。
 */
export interface GitWorktreeCapability {
  getExtensionPoints(): GitWorktreeExtensionPoints
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** git-worktree 能力服务（git 在场时由本插件 provide；缺席 = 插件未装载/git 缺席） */
    gitWorktree: GitWorktreeCapability
  }
}

/** 插件配置（扩展点覆写 + 检测注入缝 + 诊断缝） */
export interface GitWorktreePluginConfig extends GitWorktreeExtensionPointOverrides {
  /** git 在场性检测注入缝（默认真机 `git --version`；单测/嵌入方可覆写） */
  checkGit?: () => Promise<boolean>
  /** 诊断缝（fix-4：provide 失败不再静默——host 可注 diag 落 harness.log；缺省 console.warn） */
  diag?: (line: string) => void
}

/**
 * 扩展点解析（惰性——每次消费重求值）：config 覆写 → ctx 注入缝服务 → 默认实现。
 * 注入服务形状残缺（缺法/非函数面）→ 该面退默认，另一面仍可注入（结构化逐面收窄）。
 */
export function resolveExtensionPoints(ctx: PluginCtxFace, config: GitWorktreePluginConfig): GitWorktreeExtensionPoints {
  let injected: Partial<GitWorktreeExtensionPointOverrides> | undefined
  try {
    const raw = ctx.reflect?.get?.(GIT_WORKTREE_IDENTITY_SERVICE) as Partial<GitWorktreeExtensionPointOverrides> | undefined
    if (
      raw !== null &&
      typeof raw === 'object' &&
      (typeof raw.resolveProject === 'function' || typeof raw.getWorktreeDir === 'function')
    ) {
      injected = raw
    }
  } catch {
    // 注入缝缺席/读取异常 → injected 保持 undefined（独立 worktree 模式）——不抛断宿主
  }
  return createDefaultExtensionPoints({
    resolveProject: config.resolveProject ?? injected?.resolveProject,
    getWorktreeDir: config.getWorktreeDir ?? injected?.getWorktreeDir,
  })
}

/**
 * 函数插件形状（Plugin.Function + inject 元数据）。
 * 激活同步返回 disposer；在场性探测在后台收口——探测完成前零注入（探测失败即永零注入）。
 * 在场 → 经官方 provide 面（ctx.provide mixin，cordis 具名服务正道）provide `gitWorktree`
 * 能力服务（getExtensionPoints 惰性求值——集成层注入服务晚于插件激活可达）；
 * provide 失败/官方面缺席 → diag 留痕（fix-4：不再静默），能力面降级不抛断宿主。
 */
export interface GitWorktreePlugin {
  (ctx: unknown, config?: GitWorktreePluginConfig): () => void
  /** 依赖声明：零宿主服务消费面（注入缝走 reflect 防御读取） */
  readonly inject: readonly string[]
}

const gitWorktreePlugin: GitWorktreePlugin = Object.assign(
  (ctx: unknown, config: GitWorktreePluginConfig = {}): (() => void) => {
    const face = ctx as PluginCtxFace
    const diag = config.diag ?? ((line: string) => console.warn(line))
    const getExtensionPoints = (): GitWorktreeExtensionPoints => resolveExtensionPoints(face, config)
    const presence: Promise<boolean> = (config.checkGit ?? (() => checkGitPresence()))()
    let provided: unknown
    // 检测本身 fail-soft（checkGitPresence 不抛）；此处兜底防注入缝实现带异常上浮宿主。
    presence.then((present) => {
      if (!present) return // fail-soft：不生效、零注入退出
      try {
        const provide = face.provide
        if (typeof provide === 'function') {
          provided = provide.call(face, GIT_WORKTREE_SERVICE, {
            getExtensionPoints,
          } satisfies GitWorktreeCapability)
          return
        }
        diag('[git-worktree] ctx.provide 官方面缺席——gitWorktree 能力服务未 provide（宿主侧取法恒独立模式）')
      } catch (cause) {
        provided = undefined // provide 失败 → 能力面降级（宿主不受影响）
        diag(`[git-worktree] gitWorktree 能力服务 provide 失败（能力面降级）：${String(cause)}`)
      }
    }, () => {})
    return () => {
      if (typeof provided === 'function') {
        try {
          ;(provided as () => void)()
        } catch {
          // 注销失败不抛（disposer 面同 fail-soft 口径）
        }
      }
      provided = undefined
    }
  },
  { inject: [] as const },
)

export default gitWorktreePlugin
