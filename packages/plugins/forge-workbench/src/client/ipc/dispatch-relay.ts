/**
 * client/ipc/dispatch-relay — 两段式派发链的 renderer 驱动腿(任务 6.3;SC1)。
 *
 * tech-design §Interface 3 的两段式链(3.5 deviation「two-stage launch chain」
 * 定形):内核 dispatchTasks 落 starting 行 + 应答随行 launch payload(预合成
 * 组合首条消息不落库,仅 prompt_hash)→ **本模块**(renderer relay)把载荷转交
 * host dispatch-launch rpc(N 次独立 create)→ 按 launch 结局回填内核动词
 * (ok+sessionId → notifySessionStarted → running;失败 → notifyLaunchFailed →
 * failed+原因)。3.5 把本腿指派给 3.9,装配时失落;SC1 的全链验收(注册迁移 →
 * 派发 → stub subagent 执行 → 回流)暴露该缺口,本任务补齐 —— 内核「未接线行
 * 留 starting」语义保持(relay 缺席时行为与补齐前一致,jsdom/hostless 世界
 * 不受影响)。
 *
 * 形态(删除的 M2 client/launch-rpc.ts 先例 + tool-bridge 同款纪律):
 *   1. NAMESPACE — `dispatchLaunch/launch` 描述符并入工具桥的**共享贡献**
 *      (tool-bridge.ts FORGE_TOOL_BRIDGE_REMOTE_CONTRIBUTION;typert 按
 *      package 键登记远端贡献,同包二次 $mount 即「already registered」拒绝
 *      —— M2 先例本就是单贡献多描述符);本模块不自挂,等共享挂载完成;
 *   2. THE RELAY — `relayDispatched(rows)`:DispatchedRow.launch 载荷映射
 *      DispatchLaunchRequest → `ctx.remote.dispatchLaunch.launch` → 逐行
 *      notify 回填。transport/gateway 失败 = launch 未发生 → notifyLaunchFailed
 *      (显式 failed 态 + 原因,禁静默 —— 3.5 降级链口径);notify 动词自身的
 *      拒绝不再上抛(relay 是 fire-and-forget 面,失败行由重派发链兜底);
 *   3. 安装位 — client apply 经 installDispatchLaunchRelay(ctx)(plugin
 *      lifetime,与 tool-bridge 泵同款守卫:无 remote/无 preload 桥 = no-op);
 *      createIpcDispatchFace 的 dispatchTasks/redispatch 腿经模块槽消费
 *      (dispatch face 是看板全部派发链的单一过点 —— 工具栏多选链与详情
 *      单任务链共用)。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { DispatchedRow } from '../ipc-types'
import type { WorkbenchIpcBridge } from './workbench'

// ---------------------------------------------------------------------------
// 1. The namespace face (mounted by the shared tool-bridge contribution)
// ---------------------------------------------------------------------------

/** host DispatchLaunchRpcInput.launches[] 单请求的宽松读取面(形态由 host 复验)。 */
interface LaunchRequestShape {
  readonly dispatchId: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  readonly taskType: string | null
  readonly prompt: string
  readonly promptHash: string
  readonly sessionId: string | null
  readonly cwd: string
}

/** The mounted dispatchLaunch namespace's structural face (duck-checked at read). */
interface DispatchLaunchNamespace {
  launch(input: { launches: readonly LaunchRequestShape[] }): Promise<RemoteResult<{ results: readonly unknown[] }>>
}

// ---------------------------------------------------------------------------
// 2. The relay (DispatchedRow[] → host launch → notify backfill)
// ---------------------------------------------------------------------------

/** One launch outcome row aligned with the request order (host union twin). */
interface LaunchOutcomeShape {
  readonly ok: boolean
  readonly sessionId?: string
  readonly code?: string
  readonly error?: string
}

function describeFailure(failure: unknown): string {
  if (failure !== null && typeof failure === 'object' && 'code' in failure && 'message' in failure) {
    const code = String((failure as { code: unknown }).code ?? 'unknown')
    const message = String((failure as { message: unknown }).message ?? '')
    return `${code}: ${message}`
  }
  return String(failure)
}

/** DispatchedRow → host launch 请求(行字段 + launch 载荷合流;字段名 = rpc 面)。 */
export function launchRequestOf(row: DispatchedRow): LaunchRequestShape {
  return {
    dispatchId: row.id,
    batchId: row.batchId,
    projectId: row.projectId,
    featureSlug: row.featureSlug,
    taskKey: row.taskKey,
    taskType: row.launch.taskType,
    prompt: row.launch.prompt,
    promptHash: row.launch.promptHash,
    sessionId: row.launch.sessionId,
    cwd: row.launch.cwd,
  }
}

/**
 * 一次派发应答的 relay 腿:launch 全批 → 逐行 notify 回填。
 *
 * fire-and-forget 语义(调用方不等待):派发应答已在手,行态迁移由
 * notify 动词 + dispatch_updated 事件回流承载;本函数自身的 Promise 仅作
 * 测试观测面。notify 动词拒绝不上抛(failed 行由重派发链兜底,禁静默的
 * 呈现面 = failed 态本身)。
 */
export async function relayDispatchedRows(
  namespace: DispatchLaunchNamespace,
  bridge: WorkbenchIpcBridge,
  rows: readonly DispatchedRow[],
): Promise<void> {
  if (rows.length === 0) return
  let outcomes: readonly LaunchOutcomeShape[] | undefined
  try {
    const result = await namespace.launch({ launches: rows.map(launchRequestOf) })
    if (result.ok) {
      const results = (result.value as { results?: unknown }).results
      outcomes = Array.isArray(results) ? results as readonly LaunchOutcomeShape[] : undefined
    } else {
      // gateway/transport 失败 = launch 未发生:整批按 launch 失败回填(显式
      // failed + 原因,禁静默 —— 3.5 降级链)。
      await Promise.all(rows.map(row =>
        bridge.notifyLaunchFailed(row.id, `dispatchLaunch channel failed: ${describeFailure(result.error)}`).catch(() => undefined)))
      return
    }
  } catch (error) {
    await Promise.all(rows.map(row =>
      bridge.notifyLaunchFailed(row.id, `dispatchLaunch channel threw: ${String(error)}`).catch(() => undefined)))
    return
  }
  const backfills = rows.map((row, index) => {
    const outcome = outcomes?.[index]
    if (outcome !== undefined && outcome.ok === true) {
      return bridge.notifySessionStarted(row.id, typeof outcome.sessionId === 'string' && outcome.sessionId !== ''
        ? outcome.sessionId
        : row.launch.sessionId ?? '').catch(() => undefined)
    }
    const reason = outcome === undefined
      ? 'dispatchLaunch answered without an outcome for this row'
      : `${String(outcome.code ?? 'ERR_DISPATCH_LAUNCH_FAILED')}: ${String(outcome.error ?? 'launch failed')}`
    return bridge.notifyLaunchFailed(row.id, reason).catch(() => undefined)
  })
  await Promise.all(backfills)
}

// ---------------------------------------------------------------------------
// 3. The module slot + the installer (client apply 消费)
// ---------------------------------------------------------------------------

/** The relay face createIpcDispatchFace consults (absent = rows stay starting). */
export interface DispatchLaunchRelay {
  relayDispatched(rows: readonly DispatchedRow[]): void
}

let relaySlot: DispatchLaunchRelay | undefined

/** Install the relay face (idempotent; returns the restore-uninstall). */
export function setDispatchLaunchRelay(relay: DispatchLaunchRelay | undefined): () => void {
  const previous = relaySlot
  relaySlot = relay
  return () => { relaySlot = previous }
}

/** The installed relay (undefined = the seam is absent; rows stay starting). */
export function dispatchLaunchRelayOf(): DispatchLaunchRelay | undefined {
  return relaySlot
}

/** 读取已挂载的 dispatchLaunch 命名空间(结构面 duck-checked,缺席 → undefined)。 */
function namespaceOf(ctx: ClientContext): DispatchLaunchNamespace | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get('remote.dispatchLaunch', false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Record<string, unknown>
  return typeof face.launch === 'function' ? candidate as DispatchLaunchNamespace : undefined
}

/**
 * 安装 renderer launch relay(client apply 调用;bridge 由调用方解析传入 ——
 * 本模块不反向依赖 ./workbench,保持单向引用):轮询等待 `remote.dispatchLaunch`
 * 命名空间在场 —— 该命名空间由工具桥安装器的**共享挂载**登记(同一 package
 * 的第二次 $mount 会被 typert 以「already registered」拒绝,故本 relay 不自
 * 挂;dispatchLaunch/launch 描述符已并入工具桥贡献)。命名空间就位即装填
 * 模块槽;缺席/拒绝 = no-op(行留 starting,host 侧无降级需求 —— launch
 * 从未发起)。返回拆卸句柄。
 */
export function installDispatchLaunchRelay(ctx: ClientContext, bridge: WorkbenchIpcBridge): () => void {
  if (typeof (ctx as { inject?: unknown }).inject !== 'function') return () => {}
  const fiber = (ctx as unknown as {
    inject(names: string[], body: (ctx: ClientContext) => void): { dispose(): Promise<void> | void }
  }).inject(['remote'], (remoteCtx: ClientContext) => {
    const RELAY_POLL_MS = 250
    const RELAY_POLL_MAX = 240 // ~60s:the mount lands within any healthy boot
    let tries = 0
    const arm = (): void => {
      const namespace = namespaceOf(remoteCtx)
      if (namespace === undefined) return
      const restore = setDispatchLaunchRelay({
        relayDispatched: (rows) => { void relayDispatchedRows(namespace, bridge, rows) },
      })
      remoteCtx.effect(() => () => { restore() }, 'forge-workbench: dispatch launch relay unmount')
    }
    arm() // already mounted (the usual boot: the tool-bridge fiber ran first)
    const timer = setInterval(() => {
      tries += 1
      if (dispatchLaunchRelayOf() !== undefined || tries > RELAY_POLL_MAX) {
        clearInterval(timer)
        return
      }
      arm()
    }, RELAY_POLL_MS)
    remoteCtx.effect(() => () => { clearInterval(timer) }, 'forge-workbench: dispatch launch relay mount wait')
  })
  return () => {
    setDispatchLaunchRelay(undefined)
    void fiber.dispose()
  }
}
