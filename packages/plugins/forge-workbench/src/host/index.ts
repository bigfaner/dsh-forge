/**
 * forge-workbench plugin, host half (dsh host process). Task 3.2 shipped this
 * scaffold deliberately EMPTY; task 4.1 filled the first face — the
 * ForgeBridge cordis service (forge CLI resolution + task-prompt retrieval,
 * Interface 2). Task 4.2 filled the second face — the SessionLaunch cordis
 * service (DF004 channel + FORGE_ACTOR passthrough, Interface 2/5/6). M3 task
 * 2.1 added the third face — the agent-native dsh tool base (ForgeToolBridge
 * reverse-stream service + the forge_task_* family on the base ToolRuntime).
 * M3 task 3.5 added the orchestration channel pair — dispatch-launch (the
 * subagent-creation face over sessionController; the plugin's ONLY M3 session
 * creator — kernel dispatch orchestrates, host launches) + approval-bridge
 * (the prepend `approval/request` waterfall listener routing dispatch-session
 * approvals into the kernel via the T2 bridge; decideApproval answers ride the
 * approvalBridge/answer rpc).
 * The browser half ships via exports['./client'] and is discovered through the
 * package.json dsh.client declaration.
 *
 * Cross-process dependency seams (fail closed; the workbench data kernel is
 * the single source of truth, this process never keeps its own copy):
 *
 * - `DSH_FORGE_PROJECT_ROOTS` — the registered-project allowlist, a JSON
 *   array of normalized code_root strings, refreshed by the shell at host
 *   spawn from the workbench projects table (2.2 repos / 2.7 wiring task).
 *   Absent/invalid → empty allowlist → every spawn request is rejected
 *   (secure default; the UI degrades to "no prompt", never to an unguarded
 *   spawn).
 * - `DSH_FORGE_CLI_PATH` — the workbench 设置显式路径 override for the forge
 *   binary. Absent → the PATH chain applies.
 * - `DSH_FORGE_SESSION_STUB_DIR` — TEST-ONLY (task 6.1): when set, the
 *   session-launch channel is the file-backed e2e stub instead of the real
 *   upstream sessionController (control.json orchestration + journal.jsonl
 *   observation; see session-channel-stub.ts).
 *
 * Both names follow the host-spawn env precedent (DSH_FORGE_PRIMARY_RUNTIME).
 *
 * SessionLaunch needs NO shell-side env feed: its channel (the upstream
 * `sessionController`) lives in the SAME cordis app as this plugin (spike-1
 * §0: 插件 host 半身与宿主服务同进程同一 cordis 应用), resolved per call
 * (session-launch-rpc.sessionChannelOf) so the web-app bundle row may
 * register before or after this plugin. Absence is not an error — the
 * service answers ERR_HOST_NOT_READY and the client entry walks the
 * Interface 5 degradation chain (tier 2 ctx.remote.session → tier 3 frozen
 * fallback; those legs are 5.10/5.11 work).
 */

import type { Context } from '@deepseek-ai/cordis'
import { ForgeBridgeService } from './forge-bridge-rpc'
import { SessionLaunchService, sessionChannelOf } from './session-launch-rpc'
import { createStubSessionChannel, resolveSessionStubDir } from './session-channel-stub'
import { registerForgeTools } from './forge-tools/index'
import { DispatchLaunchService } from './dispatch-launch/rpc'
import { createDispatchSessionRegistry } from './dispatch-launch/registry'
import { ApprovalBridgeService, attachApprovalBridge } from './approval-bridge/rpc'
import { createApprovalBridgeCore, createPreExecuteCapture, type ApprovalKernelPort } from './approval-bridge/bridge'

const PROJECT_ROOTS_ENV = 'DSH_FORGE_PROJECT_ROOTS'
const CLI_PATH_ENV = 'DSH_FORGE_CLI_PATH'

/**
 * Parse the allowlist transport on each call (a small JSON array; prompt
 * requests are user-click-scale, so per-call parsing beats a cache that could
 * pin a stale list across tests/process-lifetime surprises). Invalid or absent
 * → empty list → fail closed.
 */
function registeredProjectRootsFromEnv(): readonly string[] {
  const raw = process.env[PROJECT_ROOTS_ENV]
  if (raw === undefined || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(entry => typeof entry === 'string')) {
      return parsed as readonly string[]
    }
  } catch {
    // fall through to the closed-list warning below
  }
  console.warn(`[forge-workbench] ${PROJECT_ROOTS_ENV} is not a JSON string array — allowlist stays closed`)
  return []
}

/**
 * Host plugin body: register the two remote services (service keys and wire
 * namespaces `forgeBridge` and `sessionLaunch`; the Gateway discovers the
 * bindings and routes `ctx.remote.forgeBridge.*` / `ctx.remote.sessionLaunch.*`
 * from the browser half).
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  new ForgeBridgeService(ctx, {
    listProjectRoots: registeredProjectRootsFromEnv,
    getCliPath: () => {
      const value = process.env[CLI_PATH_ENV]?.trim()
      return value === undefined || value === '' ? undefined : value
    },
  })
  // Task 6.1: the e2e session-channel stub seam. Unset (every production
  // boot) resolves the REAL upstream sessionController per call; a stub dir
  // swaps in the file-backed orchestration channel (see
  // session-channel-stub.ts for why an env seam is the only in-host
  // injection point — cordis provide() refuses duplicate service names).
  // M3 task 3.5: dispatch-launch rides the SAME seam (SC3's hash-oracle e2e
  // legs drive the subagent creates through the stub journal).
  const sessionStubDir = resolveSessionStubDir()
  const launchChannel = sessionStubDir === undefined
    ? () => sessionChannelOf(ctx)
    : () => createStubSessionChannel(sessionStubDir)
  new SessionLaunchService(ctx, sessionStubDir === undefined
    ? undefined
    : { getSessionChannel: () => createStubSessionChannel(sessionStubDir) })
  // M3 task 2.1: the dsh tool face base — the ForgeToolBridge remote service
  // (calls stream + answer, T2) and the forge_task_* tool family on the base
  // ToolRuntime (global tools, spike-1 §1.1). Later tool families (knowledge /
  // feature / proposal / pref / stage) append onto this base, no new channel.
  // 3.5 consumes its bridge core as the approval-bridge's kernel port below.
  const forgeTools = registerForgeTools(ctx)

  // M3 task 3.5: the orchestration channel pair —
  //   dispatch-launch (subagent creation; the ONLY session-creation holder in
  //   this plugin's M3 face) + approval-bridge (the `approval/request`
  //   waterfall listener routing dispatch-session approvals to the kernel).
  // The session registry is the shared claim filter: launch registers the
  // pre-minted session ids, the approval bridge claims only those.
  const dispatchSessions = createDispatchSessionRegistry()
  new DispatchLaunchService(ctx, dispatchSessions, { getSessionChannel: launchChannel })

  const kernelPort: ApprovalKernelPort = {
    receiveApproval(input) {
      // T2 桥上行:approval_receive 帧 → client 泵 → I1 receiveApproval 动词 →
      // 内核插 pending + awaiting 联动(transport 级失败由桥的重试一次承载)。
      return forgeTools.core.callWithRetry('approval_receive', { ...input }, `session:${input.sessionId}`)
        .then((outcome) => {
          if (outcome.ok) {
            const id = (outcome.value as { readonly id?: unknown } | null)?.id
            if (typeof id === 'string' && id !== '') return { approvalId: id }
            throw Object.assign(new Error('approval_receive: kernel answer carried no approval id'), { code: 'ERR_WORKBENCH_DB' })
          }
          throw Object.assign(new Error(outcome.message), { code: outcome.code })
        })
    },
    rejectApproval(input, actor) {
      // cancelled 核销腿:decideApproval(approve=false) 形态,actor='kernel'。
      return forgeTools.core.callWithRetry('approval_decide', { ...input, approve: false }, actor)
        .then((outcome) => {
          if (outcome.ok) return outcome.value
          throw Object.assign(new Error(outcome.message), { code: outcome.code })
        })
    },
  }
  const capture = createPreExecuteCapture()
  const approvalCore = createApprovalBridgeCore({
    resolveDispatch: dispatchSessions.lookup,
    kernel: kernelPort,
    argumentsOf: callId => capture.argumentsOf(callId),
    dropCapture: callId => capture.drop(callId),
  })
  new ApprovalBridgeService(ctx, approvalCore)
  attachApprovalBridge(ctx, approvalCore, capture)
}
