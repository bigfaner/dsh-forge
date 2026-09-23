/**
 * The ForgeBridge remote face, client-side declaration (task 4.1, tech-design
 * Interface 2). PURE TYPES: the browser half carries no runtime code for this
 * service — every call crosses the process boundary as a Typert remote
 * invocation on the `forgeBridge` namespace (the host implementation lives at
 * src/host/forge-bridge.ts and imports these very shapes, so the two halves
 * cannot drift). The namespace mount for `ctx.remote.forgeBridge` is wired by
 * the 5.10/5.11 entry tasks; this file is the declaration they mount.
 *
 * Error convention (Interface 2 / Error Handling §Propagation): host-half
 * services return `reasonCode` — NOT the IPC `{code,message,detail}` envelope
 * (that form belongs to the preload verb face) and NOT thrown rejections.
 */

/** resolveCli() success: the resolved forge binary and its reported version. */
export interface ForgeCliResolved {
  available: true
  path: string
  version: string
}

/**
 * resolveCli() failure: neither the workbench-configured explicit path nor a
 * PATH lookup yielded a runnable CLI. `detail` carries the diagnostics of
 * EVERY stage that was attempted (explicit-path stage and PATH stage).
 */
export interface ForgeCliUnavailable {
  available: false
  reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE'
  detail: string
}

/** resolveCli() result (设置显式路径 → PATH → ERR_FORGE_CLI_UNAVAILABLE). */
export type ResolveCliResult = ForgeCliResolved | ForgeCliUnavailable

/**
 * getTaskPrompt input. `projectRoot` must be one of the registered project
 * code_roots (the allowlist — the host half re-validates; the renderer is not
 * trusted with this). `taskKey` is the workbench dialect key: qualified
 * `<featureSlug>/<localId>` (e.g. `dsh-forge-m2/4.1`, task 2.5) or already
 * local (`4.1`) — the bridge translates to the local forge id before spawn.
 */
export interface GetTaskPromptInput {
  projectRoot: string
  taskKey: string
}

/**
 * getTaskPrompt success: `promptText` is the COMPLETE
 * `forge prompt get-by-task-id <id>` stdout — no trimming, no framing, no
 * interpretation (spike-1 §4.3: raw markdown, exit 0). SC3 injects it
 * character-for-character as the session's first user message.
 */
export interface TaskPromptAvailable {
  available: true
  promptText: string
}

/**
 * getTaskPrompt failure. `ERR_NO_PROMPT` = this task yields no execution
 * prompt here (unknown/rejected task key, unregistered project root, CLI
 * exit != 0, empty/oversized/late output); `ERR_FORGE_CLI_UNAVAILABLE` = the
 * binary could not be resolved/executed at all.
 */
export interface TaskPromptUnavailable {
  available: false
  reasonCode: 'ERR_NO_PROMPT' | 'ERR_FORGE_CLI_UNAVAILABLE'
  detail?: string
}

export type GetTaskPromptResult = TaskPromptAvailable | TaskPromptUnavailable

/**
 * The remote namespace face served by the host half (implementation:
 * src/host/forge-bridge.ts, service key + wire namespace `forgeBridge`).
 */
export interface ForgeBridgeRemoteFace {
  resolveCli(): Promise<ResolveCliResult>
  getTaskPrompt(input: GetTaskPromptInput): Promise<GetTaskPromptResult>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    /** forge CLI bridge (task 4.1): `ctx.remote.forgeBridge.*` after mount. */
    forgeBridge: ForgeBridgeRemoteFace
  }
}
