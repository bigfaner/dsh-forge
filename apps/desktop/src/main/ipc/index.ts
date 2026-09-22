// Interface 6: preload 语义动词 — main-process side (IPC 白名单 + sender
// frame 校验). Every dshForge.* verb exposed by the preload maps to exactly
// one whitelisted ipcMain.handle channel; channels outside the whitelist are
// never registered (Electron then rejects off-whitelist invokes with "No
// handler registered"), and every registered handler re-validates the sender
// frame before doing work — any frame that is not the dsh-app://app/ main
// document is rejected AND logged (ERR_IPC_SENDER_REJECTED).
//
// restartApp ordering (tech-design Interface 6): shutdown 宿主子进程 →
// 释放单实例锁 → app.relaunch → 旧进程退出 — no orphan host (SC3-preserving:
// the relaunching child never contends the profile with the dying parent).

import { shellLog } from '../log.ts'
import { SHELL_APP_ORIGIN } from '../protocol/constants.ts'
import type { RecoveryState } from '../crash-recovery/index.ts'

/** The complete IPC verb whitelist. Nothing else may be invoked from the renderer. */
export const SHELL_VERB_CHANNELS = {
  updateDismiss: 'dsh-forge:update-dismiss',
  updateOpenRelease: 'dsh-forge:update-open-release',
  updateGetState: 'dsh-forge:update-get-state',
  recoveryRestartApp: 'dsh-forge:recovery-restart-app',
  recoveryGetState: 'dsh-forge:recovery-get-state',
} as const

/**
 * Main → renderer push channels (task 5.3 integration). Not invokable verbs:
 * the renderer only subscribes (preload onState); the main process is the sole
 * sender and pushes only to the dsh-app:// main document's webContents.
 */
export const SHELL_PUSH_CHANNELS = {
  updateState: 'dsh-forge:update-state',
  recoveryState: 'dsh-forge:recovery-state',
} as const

export type ShellVerbChannel = (typeof SHELL_VERB_CHANNELS)[keyof typeof SHELL_VERB_CHANNELS]

/** Whitelist guard: only these channels may carry a shell verb. */
export function isWhitelistedVerbChannel(channel: string): channel is ShellVerbChannel {
  return (Object.values(SHELL_VERB_CHANNELS) as string[]).includes(channel)
}

/** Minimal sender-frame shape (Electron IpcMainInvokeEvent subset for tests). */
export interface VerbSenderEvent {
  readonly senderFrame?: { readonly url: string } | undefined
}

/**
 * Sender frame validation shared by every verb handler. Rejects (throw) AND
 * logs any frame that is not the dsh-app://app/ main document.
 */
export function assertVerbSender(channel: ShellVerbChannel, event: VerbSenderEvent): void {
  const frameUrl = event.senderFrame?.url ?? ''
  if (!frameUrl.startsWith(`${SHELL_APP_ORIGIN}/`)) {
    shellLog.error({
      code: 'ERR_IPC_SENDER_REJECTED',
      message: 'rejected shell verb IPC from an unowned frame',
      data: { channel, frameUrl },
    })
    throw new Error(`dsh-forge: rejected ${channel} IPC from an unowned frame`)
  }
}

/** Deps for the update verbs (banner-state machine task 5.3 supplies state). */
export interface ShellUpdateVerbs {
  /** UF3 banner dismissed (UpdateBannerState → 'dismissed', run-level latch). */
  readonly dismiss: () => void
  /** Open the release page via the allowlisted openExternal path. */
  readonly openRelease: () => Promise<void> | void
  /** Current UpdateBannerState pull (renderer late-mount catch-up). */
  readonly getState: () => unknown
}

export interface ShellRecoveryVerbs {
  readonly restartApp: () => Promise<void> | void
  readonly getState: () => RecoveryState
}

/** ipcMain.handle seam (Electron ipcMain in production; fake in tests). */
export type VerbHandleRegistrar = (
  channel: ShellVerbChannel,
  listener: (event: VerbSenderEvent) => unknown,
) => void

/** Register all four verbs. Only whitelisted channels are ever registered. */
export function installShellVerbs(
  handle: VerbHandleRegistrar,
  update: ShellUpdateVerbs,
  recovery: ShellRecoveryVerbs,
): void {
  handle(SHELL_VERB_CHANNELS.updateDismiss, (event) => {
    assertVerbSender(SHELL_VERB_CHANNELS.updateDismiss, event)
    update.dismiss()
  })
  handle(SHELL_VERB_CHANNELS.updateOpenRelease, (event) => {
    assertVerbSender(SHELL_VERB_CHANNELS.updateOpenRelease, event)
    return update.openRelease()
  })
  handle(SHELL_VERB_CHANNELS.updateGetState, (event) => {
    assertVerbSender(SHELL_VERB_CHANNELS.updateGetState, event)
    return update.getState()
  })
  handle(SHELL_VERB_CHANNELS.recoveryRestartApp, (event) => {
    assertVerbSender(SHELL_VERB_CHANNELS.recoveryRestartApp, event)
    return recovery.restartApp()
  })
  handle(SHELL_VERB_CHANNELS.recoveryGetState, (event) => {
    assertVerbSender(SHELL_VERB_CHANNELS.recoveryGetState, event)
    return recovery.getState()
  })
}

/**
 * restartApp ordering, dependency-injected for unit tests. Sequence per the
 * Interface 6 contract: shutdown host subprocess → release the single-instance
 * lock → relaunch → exit the old process. The lock is released only AFTER the
 * host has settled, so the relaunched instance can never contend the shared
 * profile with a still-dying host (SC3).
 */
export interface RestartSequenceDeps {
  /** Cancel recovery backoff timers before teardown (no post-exit callbacks). */
  readonly disposeRecovery: () => void
  /** Shutdown the host subprocess and resolve once it settled (no orphan). */
  readonly shutdownHost: () => Promise<void> | void
  /** app.releaseSingleInstanceLock() seam. */
  readonly releaseSingleInstanceLock: () => void
  /** app.relaunch() seam. */
  readonly relaunch: () => void
  /** Old-process exit seam (app.exit(0) — immediate, skips before-quit). */
  readonly exit: () => void
}

export function createRestartSequence(deps: RestartSequenceDeps): () => Promise<void> {
  return async () => {
    deps.disposeRecovery()
    await deps.shutdownHost()
    deps.releaseSingleInstanceLock()
    deps.relaunch()
    deps.exit()
  }
}
