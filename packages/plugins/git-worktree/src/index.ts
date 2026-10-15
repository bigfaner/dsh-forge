// @dsh-forge/git-worktree —— 插件入口（Node，cordis loader 装载面）。
// 形态：Cordis Plugin.Function（loader 只认 default 导出，md-mermaid/core 同型）。
// 启动检测：插件激活时经 `git --version` 探测 git 在场性——
//   未在场 → fail-soft 不生效：不抛断宿主、零注入（UI/RPC 面、扩展点消费方均不装配）；
//   在场 → 扩展点就绪（调用方可注入覆写，未注入走默认实现 = 独立 worktree 模式）。
// 零 dsh-forge 依赖：不 import @dsh-forge/*，只碰 git CLI 与注入缝。
import { checkGitPresence } from './git-presence.js'
import {
  createDefaultExtensionPoints,
  type GitWorktreeExtensionPointOverrides,
  type GitWorktreeExtensionPoints,
} from './extension-points.js'

export const GIT_WORKTREE_PLUGIN_NAME = 'git-worktree' as const

export { checkGitPresence, type GitCommandRunner, type GitCommandResult } from './git-presence.js'
export {
  createDefaultExtensionPoints,
  defaultGetWorktreeDir,
  defaultResolveProject,
  type GitWorktreeExtensionPoints,
  type GitWorktreeExtensionPointOverrides,
  type ProjectResolution,
} from './extension-points.js'

/** 插件配置（扩展点覆写 + 检测注入缝） */
export interface GitWorktreePluginConfig extends GitWorktreeExtensionPointOverrides {
  /** git 在场性检测注入缝（默认真机 `git --version`；单测/嵌入方可覆写） */
  checkGit?: () => Promise<boolean>
}

/**
 * 函数插件形状（Plugin.Function + inject 元数据）。
 * 激活同步返回 disposer；在场性探测在后台收口——探测完成前零注入（探测失败即永零注入），
 * 后续任务（UI/RPC/管理域）的装配面以在场性结果为门。
 */
export interface GitWorktreePlugin {
  (ctx: unknown, config?: GitWorktreePluginConfig): () => void
  /** 依赖声明：骨架期零宿主服务消费面 */
  readonly inject: readonly string[]
}

const gitWorktreePlugin: GitWorktreePlugin = Object.assign(
  (ctx: unknown, config: GitWorktreePluginConfig = {}): (() => void) => {
    const extensionPoints: GitWorktreeExtensionPoints = createDefaultExtensionPoints(config)
    const presence: Promise<boolean> = (config.checkGit ?? (() => checkGitPresence()))()
    // 检测本身 fail-soft（checkGitPresence 不抛）；此处兜底防注入缝实现带异常上浮宿主。
    presence.then((present) => {
      if (!present) return // fail-soft：不生效、零注入退出
      void extensionPoints // 就绪——后续任务（管理域/UI/RPC）以此为门装配
    }, () => {})
    return () => {}
  },
  { inject: [] as const },
)

export default gitWorktreePlugin
