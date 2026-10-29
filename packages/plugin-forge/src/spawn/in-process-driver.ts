// in-process driver 真绑定（任务 3.4；tech-design 边界 1——plugin-forge deps 增
// @deepseek-ai/dsh-subagent-in-process-driver：dispatchTask 依赖的 spawn 通道 /
// childCtx.tools.restrict / 组合继承只在 child 进程内可达，「派发面 = plugin-forge」
// 由可达性决定）。本文件 = 全包唯一 @deepseek-ai import 面（boundaries 白名单单点）。
// 适配：SpawnWorkerRequest（结构化最小面）→ startInProcessRun 请求——prompt 全文 =
// worker 首条用户消息；toolFilter = 子作用域 tools.restrict（driver 在 child 创建窗口
// 施加——可见性与执行同拒）；agentOptions 覆盖父继承；descriptor = 一次性子描述符
// （version 3 / provider 'forge-dispatch'——绕过 ctx.subagents 服务直驱共享驱动器）。
// 子代理发布后向父会话日志追加 subagent/catalog 目录事实（官方 establishCatalogChild
// 同式——ctx.subagents 职责由本缝承担，chat-view 子智能体 chip 由此可见 forge worker）。
// 动态 import：driver 缺席的环境（极简 profile）以 ERR_SPAWN_FAILED 形态失败而非拖垮
// 插件加载（五 tool 面不受影响）。
// 进程树守卫（dispatch-loop-hardening 改进 4）：per-worker Job Object 整树回收——
// 任意终态（completed/interrupted/killed/异常拒绝）与 dispose 双径触发 reclaim（幂等），
// worker 的孙进程（pwsh/node/git）在有限时间内整树退出；真机装配由 index.ts 注入
// defaultWorkerTreeGuard，缺省 no-op（单测面零 pwsh 依赖）。
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'
import { noopWorkerTreeGuard } from './job-tree.js'
import type { WorkerTreeGuard } from './job-tree.js'

/** 上游描述符格式版本（SUBAGENT_DESCRIPTOR_VERSION——0.2.0-rc.2 值 3；驱动器类型面不透出常量，
 *  升级上游 = 此处同步（精确 pin 0.2.0-rc.2，升级即契约面变更） */
const SUBAGENT_DESCRIPTOR_VERSION = 3

/** 子会话描述符 provider 名（事件/日志面可判「forge 派发建立的子会话」） */
const FORGE_DISPATCH_PROVIDER = 'forge-dispatch'

/** 上游 catalog 事件格式版本（SUBAGENT_CATALOG_VERSION——0.2.0-rc.2 值 0；驱动器类型面不透出常量，
 *  升级上游 = 此处同步（精确 pin 0.2.0-rc.2，升级即契约面变更） */
const SUBAGENT_CATALOG_VERSION = 0

/** 子会话目录事实的合法 mode（官方 KnownCatalogMode：one-shot label 可选 / continuable label 必填） */
type SubagentCatalogMode = 'one-shot' | 'continuable'

/**
 * 向父会话持久日志追加子代理目录事实（官方同式——establishCatalogChild 的缝内等价：
 * {version, childId, childCreatedAt, mode, label?}）。官方 ctx.subagents
 * 运行时在子代理发布后承担此追加；forge 派发绕过 ctx.subagents 直驱共享驱动器，故由本缝
 * 承担——追加后父会话 subagentCatalog 投影即含本 worker（chat-view 子智能体 chip 可见）。
 * mode 不在此写死：取自本缝构造并传给驱动器的 descriptor（子代理实际类型的单一事实源），
 * 两处永远同值。官方不变式就地核销：continuable 无 label = 拒绝（该形状会拒还原）。
 * 单写者合规：追加发生在父会话自身工具调用上下文、写自身日志（与官方运行时同位）。
 * 追加失败 = 官方同语义处置：dispose 该 run、错误上抛（调用方收到 catalog 错误，
 * 即使 dispose 也失败——dispose 错误就地吞掉不遮蔽主因）。
 */
export function appendCatalogChild(
  parent: unknown,
  run: { readonly id: string; readonly localAgent?: unknown },
  descriptor: { readonly mode: SubagentCatalogMode; readonly label?: string },
): void {
  const session = (parent as { session?: unknown } | undefined)?.session
  if (typeof session !== 'object' || session === null) {
    throw new Error('[spawn-catalog] 父会话不可读——无法追加 subagent/catalog 目录事实')
  }
  const header = (run.localAgent as { session?: { header?: unknown } } | undefined)?.session?.header
  const childCreatedAt = (header as { createdAt?: unknown } | undefined)?.createdAt
  if (typeof childCreatedAt !== 'number') {
    throw new Error(`[spawn-catalog] 子会话 header.createdAt 不可读——目录事实缺 childCreatedAt（还原拒绝面），拒绝追加`)
  }
  if (descriptor.mode === 'continuable' && descriptor.label === undefined) {
    throw new Error(`[spawn-catalog] continuable 目录事实缺 label（官方 KnownCatalogMode 不变式），拒绝追加`)
  }
  ;(session as { append(type: string, data: unknown): void }).append('subagent/catalog', {
    version: SUBAGENT_CATALOG_VERSION,
    childId: run.id,
    childCreatedAt,
    mode: descriptor.mode,
    ...(descriptor.label !== undefined ? { label: descriptor.label } : {}),
  })
}

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
 * spawn parent 会话 cwd 读取位（官方 sessionCwd 同型：parent.session.header.cwd，
 * 顶层 cwd 兼容位）——in-process provider 即从 parent 会话持久态派生 worker 工作目录
 * （官方源码核销：SubagentStartRequest 无 cwd 覆盖位），故钉定 = 校验本读取位。
 */
function parentCwdOf(parent: unknown): string | undefined {
  if (typeof parent !== 'object' || parent === null) return undefined
  const session = (parent as { session?: unknown }).session
  if (typeof session !== 'object' || session === null) return undefined
  const header = (session as { header?: unknown }).header
  const headerCwd =
    typeof header === 'object' && header !== null ? (header as { cwd?: unknown }).cwd : undefined
  const cwd = typeof headerCwd === 'string' ? headerCwd : (session as { cwd?: unknown }).cwd
  return typeof cwd === 'string' ? cwd : undefined
}

/**
 * cwd 钉定核销（1.14 判例修复——worker 会话未钉定 worktree、提交落 main）：请求携带
 * 钉定检出（loopSourced 径）时，parent 会话 cwd 必须等于钉定值——不一致（主检出发起等
 * 异常场景）= spawn 拒绝并自解释（重定向指引：在钉定检出的会话重新发起循环）。
 * 缺席 = 不核销（工具壳行为零变化）。
 */
function assertPinnedWorkspaceCwd(request: { readonly workspaceCwd?: string; readonly parent: unknown }): void {
  if (request.workspaceCwd === undefined) return
  const parentCwd = parentCwdOf(request.parent)
  if (parentCwd === undefined || normalizeFsPath(parentCwd) !== normalizeFsPath(request.workspaceCwd)) {
    throw new Error(
      `[spawn-cwd-pin] worker 会话 cwd 钉定失败：发起循环的检出 = ${request.workspaceCwd}，spawn 时点 parent 会话 cwd = ${parentCwd ?? '（不可读）'}。请在钉定检出的会话（worktree 分支检出）中重新发起循环——拒绝在本检出发起（worker 提交将落错分支）`,
    )
  }
}

/**
 * spawn 真绑定工厂（装配注入 dispatchTask deps.spawn）。
 * 契约：start 发布后返回句柄（task-spawned 事件先行）；result 阻塞至 worker 终态
 * （拒绝 = 基建故障→dispatchTask 失败防线）；dispose 幂等收尾由调用方在结算后执行。
 */
export function createInProcessDriverSpawn(deps: { readonly treeGuard?: () => WorkerTreeGuard } = {}): SpawnWorker {
  const treeGuard = deps.treeGuard ?? noopWorkerTreeGuard
  return async (request) => {
    assertPinnedWorkspaceCwd(request) // cwd 钉定核销（1.14——拒绝在守卫前，零资源留下）
    const guard = treeGuard()
    try {
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
      // 子代理类型单一事实源：descriptor 同时驱动上游请求与 catalog 目录事实（mode 不两处写死）
      const descriptor = {
        version: SUBAGENT_DESCRIPTOR_VERSION,
        mode: 'one-shot' as SubagentCatalogMode,
        provider: FORGE_DISPATCH_PROVIDER,
        ...(request.label !== undefined ? { label: request.label } : {}),
      }
      const run = await startInProcessRun(
        {
          prompt: textPrompt(request.prompt),
          parent: request.parent, // 派发 agent 透传（真 Agent——lineage/工作目录/深度派生源）
          signal: relay.signal,
          ...(request.label !== undefined ? { label: request.label } : {}),
          // 官方完整 ToolRestriction 原样透传（expert-squad-forge 1.4——allow=keep-only /
          // deny=remove 语义与未知名 loud 校验归上游 child 创建窗口，本缝零过滤零改写）
          toolFilter: {
            ...(request.toolFilter.allow !== undefined ? { allow: [...request.toolFilter.allow] } : {}),
            ...(request.toolFilter.deny !== undefined ? { deny: [...request.toolFilter.deny] } : {}),
          },
          ...(request.agentOptions !== undefined ? { agentOptions: { ...request.agentOptions } } : {}),
          // persona 透传（S2 分层承载）：上游 applyChildComposition 落子会话 scoped
          // 'deployment:persona-prefix' 段；缺席 = 不携带键（直传 undefined 会被上游视为显式覆盖）
          ...(request.persona !== undefined ? { persona: request.persona } : {}),
          descriptor,
        } as unknown as Parameters<typeof startInProcessRun>[0],
        {},
      )
      // 路由装配落日志（bug 14984d4f instrumentation——生产派发链最后一环逐次留痕：
      // agentOptions 到达/缺席即在此可判，装配丢失位定罪不再依赖会话日志反推；
      // inherit = 显式路由缺席（装配面 settings/档案双缺——回落父会话继承））
      console.warn(
        `[forge-spawn-routing] label=${request.label ?? '-'} route=${
          request.agentOptions !== undefined
            ? `${request.agentOptions.provider}/${request.agentOptions.model}${
                request.agentOptions.reasoningEffort !== undefined ? `/${request.agentOptions.reasoningEffort}` : ''
              }`
            : 'inherit'
        } persona=${request.persona !== undefined ? 'yes' : 'no'} toolFilter=allow:${
          request.toolFilter.allow?.length ?? 0
        }/deny:${request.toolFilter.deny?.length ?? 0}`,
      )
      child = run.localAgent // 驱动器发布的子代理（abort 转发的 cancel 直调目标）
      // 官方同式：发布后落父会话目录（mode 取 descriptor）；追加失败 = dispose 该 run 后错误上抛
      try {
        appendCatalogChild(request.parent, run, descriptor)
      } catch (error) {
        try {
          await run.dispose()
        } catch {
          // dispose 失败就地吞掉——catalog 错误照旧上抛（官方同语义）
        }
        throw error
      }
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
          const disposed = run.dispose()
          void guard.reclaim() // dispose 径整树回收（fire-and-forget——不拖结算收尾）
          return disposed
        },
      }
      void handle.result.then(
        () => void guard.reclaim(), // 终态径（completed/interrupted/killed）整树回收
        () => void guard.reclaim(), // 异常拒绝径（异常终止）同达
      )
      return handle
    } catch (error) {
      await guard.reclaim() // start 失败径：守卫先行复位，spawn 拒绝面照旧上抛
      throw error
    }
  }
}
