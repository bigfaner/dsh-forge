// @dsh-forge/expert-squad —— host 入口（Node，cordis loader 装载面）。
// 1.1 骨架：loader 只认 default 导出（Plugin.Function，git-worktree/input-history
// 同型），落最小空载体——零副作用、零注入。完整 host 半（三层扫描 store/*、
// 服务键 `experts` registry、tool 面、fetch 路由、ctx.storage 状态）由后续任务
// 按 tech-design §5 填充。

export const EXPERT_SQUAD_PLUGIN_NAME = 'expert-squad' as const

/** host face（Plugin.Function）：骨架空载，功能面由后续任务填充。 */
export default function expertSquadPlugin(): void {}
