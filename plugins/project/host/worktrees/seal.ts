// 封存判定快照通道（plugin-project 1.13 单体拆解——binding-derivation §2.1/§2.3 推导制读侧）。
// 绑定 = header.cwd——实时 branch + 盘上在场性（evaluateSeal）+ aheadBehind 现算；
// G7② 判序：request.cwd 在场时先查项目能力缓存——判非 git 直接返回（零会话日志读）。
// 依赖方向：service 单向（type-only import 协作面）；留痕惰性补写经 bind-events 注入实例。
import type { WorktreeSealRequest, WorktreeSealResult } from '@dsh-forge/lib-api/dto/worktree'
import { aheadBehind } from './worktree-ops.js'
import { evaluateSeal, normalizePathForCompare } from './seal-guard.js'
import { readLatestWorktreeBind } from './session-attach.js'
import { worktreeNameOf } from './git-client.js'
import type { WorktreeServiceContext } from './service.js'
import type { BindEvents } from './bind-events.js'

export type SealChannel = (request: WorktreeSealRequest) => Promise<WorktreeSealResult>

export function createSealChannel(ctx: WorktreeServiceContext, bind: BindEvents): SealChannel {
  const { deps } = ctx
  // 留痕校验记忆（性能钉：seal 通道高频——每 (session, cwd) 只做一次「缺留痕」读+补写判定；
  // 值 = 留痕 branch（'' = 读失败按「有留痕=当前」降级），留痕一旦落定不再重读）。
  const bindBranchMemo = new Map<string, string>()
  // 漂移态记忆（边沿源：每会话上一 seal 的漂移态；触发/消除跳变才 emit——埋点与推送各一条）
  const driftMemo = new Map<string, boolean>()
  const readFactory = {
    openRead: async (sessionId: string) => deps.sessionPersistence?.open(sessionId, 'read') as never,
  }

  return async function sealStateOf(request) {
    if (request.cwd !== undefined && (await ctx.cachedResolve(request.cwd)) === null) {
      return { isGit: false, sealed: false, binding: null }
    }
    const header = await ctx.headerOf(request.sessionId)
    const cwd = header.cwd ?? request.cwd
    if (cwd === undefined || cwd === '') return { isGit: false, sealed: false, binding: null }
    const resolution = await ctx.cachedResolve(cwd)
    if (resolution === null) return { isGit: false, sealed: false, binding: null }
    const branch = await ctx.resolveBranch(cwd)
    // R5：在场性拦截回调内现查（listPresent 实时 git worktree list——不消费切换时点快照）。
    // P0-1：listPresent 失败 = 在场性不可判定 ≠ 树已删——禁止静默折叠空集（空集会被
    // seal-guard 恒判 sealed → git 瞬时故障即误封存）。warn 留痕 + presentUnknown=true
    // 显式降级（fail-open 于瞬时 IO，fail-loud 于诊断；seal 判定本次不封存）。
    let presentUnknown = false
    let present: readonly string[] = []
    try {
      present = await ctx.listPresent(resolution.projectRoot)
    } catch (cause) {
      presentUnknown = true
      ctx.warn(
        `[git-worktree] worktree-seal-degraded：在场清单现查失败（presentUnknown 显式降级——seal 判定本次不封存）：` +
          `projectRoot=${resolution.projectRoot}：${String(cause)}`,
      )
    }
    const decision = presentUnknown ? { sealed: false } : evaluateSeal({ worktreePath: cwd, branch }, present)
    // aheadBehind = 树级操作（cwd 纪律同 aheadBehind 通道）——host 解析面单点，随 seal 通道
    // 一次带回（chip §2.3.1 内联展示数据源）；branch 落空（detached/unborn）= null 零注入
    const counts = branch === '' ? null : await aheadBehind(cwd, branch).catch(() => null)
    // 漂移判定（binding-derivation §2.2/§2.6）：实时 branch ≠ 留痕 branch → branchDrift
    // （banner 数据源，判定随 seal 现算）+ 触发/消除边沿 bind-drift 埋点（info）与
    // forge/binding-mismatch 推送。留痕缺读：缺留痕时首次校验以实时 branch 惰性补写
    // （补写值 ≈ 创建时刻快照，语义不失真）；读失败按「有留痕=当前」降级（fail-soft，
    // 不补写不警示）。branch 落空（detached/unborn）= 不判漂移。
    let branchDrift: { readonly bindBranch: string; readonly branch: string } | null = null
    if (branch !== '') {
      const memoKey = normalizePathForCompare(cwd) + '|' + request.sessionId
      let bindBranch = bindBranchMemo.get(memoKey)
      if (bindBranch === undefined) {
        let found: string | null = null
        try {
          found = (await readLatestWorktreeBind(request.sessionId, readFactory))?.branch ?? null
        } catch (cause) {
          // 补点（diag-milestone-coverage）：留痕读失败按「有留痕=当前」降级——漂移校验本次
          // 跳过（路由不受影响但漂移不警示），非零影响 → warn 不静默（memo 钉单会话单条）。
          ctx.warn(`[git-worktree] 留痕读失败（按有留痕=当前降级，漂移校验本次跳过）：sessionId=${request.sessionId} cwd=${cwd}：${String(cause)}`)
          found = branch // 读失败降级（不补写——漂移校验按无漂移走，路由不受影响）
        }
        if (found === null) {
          await bind.appendBindMarker(request.sessionId, cwd) // 惰性补写（失败 fail-soft + warn）
          found = branch
        }
        bindBranch = found
        bindBranchMemo.set(memoKey, bindBranch)
      }
      if (bindBranch !== '' && bindBranch !== branch) branchDrift = { bindBranch, branch }
      const drifted = branchDrift !== null
      const prev = driftMemo.get(request.sessionId)
      if (prev !== undefined && prev !== drifted) {
        const line =
          `[git-worktree] bind-drift ${drifted ? '触发' : '消除'}：sessionId=${request.sessionId} cwd=${cwd} ` +
          `留痕=${bindBranch} 实时=${branch}`
        deps.bindDriftDiag?.(line)
        try {
          deps.bindingMismatchEmit?.({ sessionId: request.sessionId, cwd, bindBranch, branch, drifted })
        } catch (cause) {
          // 豁免补点（diag-milestone-coverage）：推送失败不反压 seal 判定链（fail-soft），
          // 判定结果仍随响应返回、bindDriftDiag 已留痕——行为零影响 → debug 级留痕。
          deps.debugDiag?.(`[git-worktree] binding-mismatch 推送失败（不反压判定链，fail-soft）：sessionId=${request.sessionId}：${String(cause)}`)
        }
      }
      driftMemo.set(request.sessionId, drifted)
    }
    deps.bindDiag?.(
      `[git-worktree] session-bind 推导判定：sessionId=${request.sessionId} cwd=${cwd} branch=${branch || '(落空)'} ` +
        `sealed=${decision.sealed} aheadBehind=${counts === null ? 'null' : `${counts.ahead}/${counts.behind}`}`,
    )
    return {
      isGit: true,
      sealed: decision.sealed,
      binding: { worktreePath: cwd, branch },
      projectRoot: resolution.projectRoot,
      worktreeName: worktreeNameOf(cwd),
      aheadBehind: counts,
      branchDrift,
      ...(presentUnknown ? { presentUnknown: true } : {}),
    }
  }
}
