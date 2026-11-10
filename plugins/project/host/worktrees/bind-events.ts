// forge/worktree-bind 留痕前台触发源（plugin-project 1.13 单体拆解——binding-derivation §2.2）：
//   · 前台 = 官方 session/created 监听（fork 亦发布 session/created，同径覆盖）；
//   · 兜底 = seal 漂移校验入口发现缺留痕时以实时 branch 惰性补写（seal.ts 消费 appendBindMarker）。
// host 进程内经 Session.append 直写（合法缝：AGENTS 1.1「ignorable 事件直写」——官方
// model/selection 先例）。append 失败 fail-soft + bindWarnDiag(warn)。
// 依赖方向：service 单向（本件 type-only import service 协作面——运行期图 service → bind-events）。
import { appendWorktreeBind, type WorktreeBindData } from './session-attach.js'
import { worktreeNameOf } from './git-client.js'
import type { LiveSessionFace, WorktreeServiceContext } from './service.js'

export interface BindEvents {
  /** 留痕 append（seal 惰性补写共源）：无活根 / 非 git 域 / 分支落空 = 跳过（零介入面） */
  appendBindMarker(sessionId: string, cwd: string, target?: LiveSessionFace): Promise<void>
}

/** 留痕域装配：session/created 监听接线（装配方注入，缺席 = 留痕只靠惰性补写兜底）。 */
export function createBindEvents(ctx: WorktreeServiceContext): BindEvents {
  const { deps } = ctx
  const liveOf = (): { get(id: string): LiveSessionFace | undefined } | undefined => {
    try {
      return typeof deps.liveSessions === 'function' ? deps.liveSessions() : deps.liveSessions
    } catch (cause) {
      // 豁免补点（diag-milestone-coverage）：活根解析缺席 = 留痕降级跳过（fail-soft，主链
      // 零影响）——debug 级留痕不静默（缝缺席零 emit 不兜底）。
      deps.debugDiag?.(`[git-worktree] 活会话解析失败（留痕降级跳过，fail-soft）：${String(cause)}`)
      return undefined
    }
  }
  const appendBindMarker = async (sessionId: string, cwd: string, target?: LiveSessionFace): Promise<void> => {
    const appendTarget = target ?? liveOf()?.get(sessionId)
    if (appendTarget === undefined || typeof appendTarget.append !== 'function') return // 无活根——留痕降级跳过
    if ((await ctx.cachedResolve(cwd).catch(() => null)) === null) return // 非 git 域零介入
    const branch = await ctx.resolveBranch(cwd)
    if (branch === '') return // 分支落空（detached/unborn）——快照无 branch 语义，跳过
    const worktreeName = worktreeNameOf(cwd)
    try {
      appendWorktreeBind(appendTarget, { worktreeName, branch } satisfies WorktreeBindData)
      deps.bindDiag?.(
        `[git-worktree] session-bind 留痕 append：sessionId=${sessionId} worktree=${worktreeName} branch=${branch}`,
      )
    } catch (cause) {
      const message =
        `[git-worktree] session-bind 留痕 append 失败（fail-soft——漂移警示降级不警示）：` +
        `sessionId=${sessionId} worktree=${worktreeName}：${String(cause)}`
      ctx.warn(message)
      deps.bindWarnDiag?.(message)
    }
  }
  // 前台触发：官方 session/created 监听（cwd 取活会话官方只读头——创建时点已定死）。
  // 监听与装配 ctx 同生命周期（撤销面不单独持有——服务即 child 域单例，随 ctx 关停释放）。
  deps.onSessionCreated?.((sessionId) => {
    const target = liveOf()?.get(sessionId)
    const cwd = target?.header?.cwd
    if (typeof cwd !== 'string' || cwd === '') return
    void appendBindMarker(sessionId, cwd, target)
  })
  return { appendBindMarker }
}

