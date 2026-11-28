// list 通道顺带 healing 域（plugin-project 1.13 单体拆解——自 rpc-service 平移零语义改动）：
//   · healWorkspaceTitles：存量树工作区 title 对齐（attach 只在编排新建会话时触发，修复前
//     建的树工作区若只被打开/选择将永无回写时机；list = hero 挂载/刷新必经之路）；
//   · attachedSessionsOf：挂靠会话计数（checks 通道——官方 workspace record sessionIds
//     durable 挂账，推导制读面）；
//   · resolveWorkspaceId：present 行 resolveByPath 只读解析（workspaceId 随行）。
// 依赖方向：service 单向（type-only import 协作面）。
import type { WorktreeEntryDto } from '@dsh-forge/lib-api/dto/worktree'
import type { WorktreeServiceContext } from './service.js'

export interface Healing {
  healWorkspaceTitles(resolution: { projectRoot: string; projectName?: string }, dtos: readonly WorktreeEntryDto[]): void
  attachedSessionsOf(path: string): Promise<number>
  resolveWorkspaceId(path: string): Promise<string | undefined>
}

export function createHealing(ctx: WorktreeServiceContext): Healing {
  const { deps } = ctx
  const resolveWorkspaceRegistry = ctx.resolveWorkspaceRegistry
  return {
    /**
     * 存量树工作区 title 对齐（list 通道顺带 healing）。幂等：title 已等于项目名即零写；
     * 主行跳过（用户命名面）；失败 fail-soft 零扰清单。
     */
    healWorkspaceTitles(resolution, dtos) {
      const registry = resolveWorkspaceRegistry()
      const projectName = resolution.projectName
      if (registry === undefined || projectName === undefined || projectName === '') return
      for (const entry of dtos) {
        // bug 63180253：盘上缺席陈旧行（git prune 前残留）跳过——resolveByPath realpath
        // ENOENT warn 空转（现场 26 次/天）。树重建后 list 自然重新对齐，自愈语义零损失。
        if (entry.isMain || !entry.present) continue
        void (async (): Promise<void> => {
          try {
            const workspace = await registry.resolveByPath?.(entry.path)
            if (workspace === undefined || workspace.title === projectName) return
            await workspace.setTitle?.(projectName)
          } catch (cause) {
            ctx.warn(`[git-worktree] 树工作区 title 对齐失败（fail-soft）：${entry.worktreeName}：${String(cause)}`)
          }
        })()
      }
    },

    /** 挂靠会话计数：registry 缺席/解析 miss = 0（降级零计数）；读失败 fail-soft 0。 */
    async attachedSessionsOf(path) {
      const registry = resolveWorkspaceRegistry()
      if (registry?.resolveByPath === undefined) return 0
      try {
        return (await registry.resolveByPath(path))?.sessionIds.length ?? 0
      } catch (cause) {
        ctx.warn(`[git-worktree] 挂靠会话计数失败（workspace record 读降级 0）：${String(cause)}`)
        return 0
      }
    },

    /** workspaceId 随行解析：缺席/失败 = undefined 零注入（fail-soft）。 */
    async resolveWorkspaceId(path) {
      const registry = resolveWorkspaceRegistry()
      if (registry === undefined) return undefined
      try {
        return (await registry.resolveByPath?.(path))?.id
      } catch (cause) {
        // 豁免补点（diag-milestone-coverage）：resolveByPath 失败 = undefined 零注入（盘上
        // 缺席陈旧行跳过——bug 63180253 同径零 ENOENT 空转），行为零影响 → debug 级留痕
        // （高频 ENOENT 面，warn 会成噪音）。
        deps.debugDiag?.(`[git-worktree] workspaceId 解析失败（undefined 零注入，fail-soft）：${path}：${String(cause)}`)
        return undefined
      }
    },
  }
}
