// in-process driver 真绑定（任务 3.4；tech-design 边界 1——plugin-forge deps 增
// @deepseek-ai/dsh-subagent-in-process-driver：dispatchTask 依赖的 spawn 通道 /
// childCtx.tools.restrict / 组合继承只在 child 进程内可达，「派发面 = plugin-forge」
// 由可达性决定）。本文件 = 全包唯一 @deepseek-ai import 面（boundaries 白名单单点）。
// 适配：SpawnWorkerRequest（结构化最小面）→ startInProcessRun 请求——prompt 全文 =
// worker 首条用户消息；toolFilter = 子作用域 tools.restrict（driver 在 child 创建窗口
// 施加——可见性与执行同拒）；agentOptions 覆盖父继承；descriptor = 一次性子描述符
// （version 3 / provider 'forge-dispatch'——绕过 ctx.subagents 服务直驱共享驱动器）。
// 动态 import：driver 缺席的环境（极简 profile）以 ERR_SPAWN_FAILED 形态失败而非拖垮
// 插件加载（五 tool 面不受影响）。
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'

/** 上游描述符格式版本（SUBAGENT_DESCRIPTOR_VERSION——0.2.0-rc.2 值 3；驱动器类型面不透出常量，
 *  升级上游 = 此处同步（精确 pin 0.2.0-rc.2，升级即契约面变更） */
const SUBAGENT_DESCRIPTOR_VERSION = 3

/** 子会话描述符 provider 名（事件/日志面可判「forge 派发建立的子会话」） */
const FORGE_DISPATCH_PROVIDER = 'forge-dispatch'

/** dispatchPrompt 全文 text 块（worker 首条用户消息——官方 ContentBlock text 子面） */
function textPrompt(prompt: string): unknown {
  return [{ type: 'text', text: prompt }]
}

/** worker 终态 output → 纯文本投影（text 块拼接；无 text 块 = 空串——结算以任务终态为准） */
function outputTextOf(output: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of output) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}

/**
 * spawn 真绑定工厂（装配注入 dispatchTask deps.spawn）。
 * 契约：start 发布后返回句柄（task-spawned 事件先行）；result 阻塞至 worker 终态
 * （拒绝 = 基建故障→dispatchTask 失败防线）；dispose 幂等收尾由调用方在结算后执行。
 */
export function createInProcessDriverSpawn(): SpawnWorker {
  return async (request) => {
    const { startInProcessRun } = await import('@deepseek-ai/dsh-subagent-in-process-driver')
    // Root cause: 驱动器把 onAbort 监听器直挂调用方 signal，abort 送达已处置的子代理时
    // child.cancel 抛「projection registration is not active」，而 Node 的 abort 事件分发
    // 中监听器抛错不可捕获（必上报 uncaughtException）→ 宿主 fatal 白屏（ctrl+r 刷新即
    // 「先处置、后 abort」时序）。上游 pinned 不可改，本缝解法：驱动器挂永不 abort 的
    // 中继信号（仅入口已 abort 时 abort 以保留创建期拒绝语义）；abort 转发 = 同步直调
    // localAgent.cancel 并就地捕获——已处置子代理的取消抛错就地吞掉（此时取消本无意义），
    // 正常路径取消语义与 stopReason 投影（cancelled → 'aborted'）不回退。
    const relay = new AbortController()
    if (request.signal.aborted) relay.abort(request.signal.reason)
    let cancelled = request.signal.aborted
    let child: { cancel(cause: { kind: 'parent' }): void } | undefined
    const forward = (): void => {
      cancelled = true
      try {
        child?.cancel({ kind: 'parent' })
      } catch {
        // 子代理已处置（projection 已注销）——取消无操作，不炸宿主
      }
    }
    if (!request.signal.aborted) request.signal.addEventListener('abort', forward, { once: true })
    const run = await startInProcessRun(
      {
        prompt: textPrompt(request.prompt),
        parent: request.parent, // 派发 agent 透传（真 Agent——lineage/工作目录/深度派生源）
        signal: relay.signal,
        ...(request.label !== undefined ? { label: request.label } : {}),
        toolFilter: { deny: [...request.toolFilter.deny] },
        ...(request.agentOptions !== undefined ? { agentOptions: { ...request.agentOptions } } : {}),
        // persona 透传（S2 分层承载）：上游 applyChildComposition 落子会话 scoped
        // 'deployment:persona-prefix' 段；缺席 = 不携带键（直传 undefined 会被上游视为显式覆盖）
        ...(request.persona !== undefined ? { persona: request.persona } : {}),
        descriptor: {
          version: SUBAGENT_DESCRIPTOR_VERSION,
          mode: 'one-shot',
          provider: FORGE_DISPATCH_PROVIDER,
          ...(request.label !== undefined ? { label: request.label } : {}),
        },
      } as unknown as Parameters<typeof startInProcessRun>[0],
      {},
    )
    child = run.localAgent // 驱动器发布的子代理（abort 转发的 cancel 直调目标）
    if (cancelled) forward() // 创建窗口内已 abort 的补投（子代理现身后立即取消）
    const handle: SpawnWorkerHandle = {
      workerSessionId: run.id,
      result: run.result.then((r) => ({
        // cancelled → 'aborted'（驱动器 flags.cancelled 投影的缝内等价——绕开驱动器
        // signal 通道后由本缝承担；completed 终态不覆写，与上游同式）
        stopReason: cancelled && r.stopReason !== 'completed' ? 'aborted' : r.stopReason,
        output: outputTextOf(r.output),
      })),
      dispose: () => {
        request.signal.removeEventListener('abort', forward) // 中继监听随句柄收尾（未触发的转发不留挂）
        return run.dispose()
      },
    }
    return handle
  }
}
