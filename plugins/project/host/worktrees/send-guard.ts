// 发送拦截编排（plugin-project 1.13 单体拆解——自 session-send-wrap 迁入，R5 判据承载件）：
// sessionController.prompt / updateQueue wrap——assertSendable 前置封存校验。
// R5（拦截回调内现查）：sealOf 回调执行时点经 service.seal → listPresent() 实时在场清单
// 判定——不消费切换时点快照；回调执行前删树（git worktree remove）发送仍被拒（TOCTOU
// 窗口不存在的判据面，send-guard.test.ts 临时 git 仓 fixture 锚）。
// 依赖方向红线：零 apps/host/* import，官方控制器一律经 SessionControllerFace 注入。
import type { WorktreeSealResult } from '@dsh-forge/contracts'
import { assertSendable } from './seal-guard.js'
import { consoleDiagFallback } from './diag-fallback.js'
import type { SessionControllerFace } from './service.js'

/**
 * 发送拦截接线（child 侧——「不可发送」的硬保证）：sessionController.prompt / updateQueue
 * 前置 assertSendable（挂靠 worktree 不在场 → SessionSealedError——host 拒绝 + 明确错误
 * 提示经官方 Remote 错误面回传 composer）。无绑定会话 / 封存判读失败 = 放行（fail-open
 * ——拦截面只对「确认封存」的会话生效，判定异常不阻断正常发送）。返回补撤销面（wrap
 * 替换官方实例方法——装配级恢复原方法引用）。
 */
export function interceptSessionSends(
  controller: SessionControllerFace,
  sealOf: (sessionId: string) => Promise<WorktreeSealResult>,
  warn: (message: string) => void = consoleDiagFallback,
): () => void {
  const originals: Array<[string, unknown]> = []
  const wrap = (methodName: 'prompt' | 'updateQueue'): void => {
    const original = (controller as unknown as Record<string, unknown>)[methodName]
    if (typeof original !== 'function') return
    const bound = (original as (...args: unknown[]) => unknown).bind(controller)
    const wrapped = async (...args: unknown[]): Promise<unknown> => {
      const request = args[0] as { sessionId?: unknown } | undefined
      const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : undefined
      if (sessionId !== undefined) {
        try {
          const state = await sealOf(sessionId)
          assertSendable({ sealed: state.sealed })
        } catch (cause) {
          // SessionSealedError 原样上抛（明确错误提示）；其余判读链异常 fail-open 放行。
          const name = (cause as Error)?.name
          if (name === 'SessionSealedError') {
            // bug bc81f4b8 可观测性：封存拒发是正确性拦截，必须留痕（不静默）——
            // 非 git 误封存拒发的现场排查面（seal 判定链入参/结果随 bindDiag 对账）。
            warn(`[git-worktree] 发送拦截拒绝（会话封存）：sessionId=${sessionId} method=${methodName}`)
            throw cause
          }
          warn(`[git-worktree] 发送拦截判读失败（fail-open 放行）：${String(cause)}`)
        }
      }
      return bound(...args)
    }
    ;(controller as unknown as Record<string, unknown>)[methodName] = wrapped
    originals.push([methodName, original])
  }
  wrap('prompt')
  wrap('updateQueue')
  return () => {
    for (const [name, original] of originals) {
      ;(controller as unknown as Record<string, unknown>)[name] = original
    }
  }
}
