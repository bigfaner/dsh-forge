// Electron glue for the protocol carriage: protocol.handle registration and
// the boot IPC pair consumed by the upstream web entry through the
// `dshDesktopBoot` preload verb (carrier injection).
//
// Contract inherited from the upstream desktop shell (apps/desktop/src/main.ts,
// DESKTOP_IPC.boot / bootFailed): the renderer asks for { injections,
// streamBaseUrl } after document start; the response is gated on the Host
// handshake so the SPA never observes a half-bound carriage. The upstream web
// entry then sets `__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }`
// itself (apps/web/src/main.ts) — the shell never touches the page global.

import { ipcMain, protocol, type IpcMainInvokeEvent } from 'electron'
import { SCHEME, SHELL_APP_ORIGIN } from './constants.ts'
import type { ProtocolCarriage } from './carriage.ts'
import { shellLog } from '../log.ts'

export const SHELL_BOOT_IPC = {
  boot: 'dsh-forge:boot',
  bootFailed: 'dsh-forge:boot-failed',
} as const

/** Reject IPC from any frame that is not the dsh-app://app/ main document. */
export function assertBootSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url ?? ''
  if (!frameUrl.startsWith(`${SHELL_APP_ORIGIN}/`)) {
    throw new Error('dsh-forge: rejected boot IPC from an unowned frame')
  }
}

export interface CarriageBootstrapDeps {
  /** Resolves once the Host carriage is bound (or definitively failed). */
  readonly waitForHost: () => Promise<void>
}

export function installProtocolCarriage(carriage: ProtocolCarriage, deps: CarriageBootstrapDeps): void {
  protocol.handle(SCHEME, request => carriage.handle(request))
  ipcMain.handle(SHELL_BOOT_IPC.boot, async (event) => {
    assertBootSender(event)
    await deps.waitForHost()
    const payload = carriage.bootPayload()
    if (payload === undefined) throw new Error('dsh-forge: Desktop Host is unavailable')
    return payload
  })
  ipcMain.handle(SHELL_BOOT_IPC.bootFailed, (event, message: unknown) => {
    assertBootSender(event)
    if (typeof message !== 'string') throw new Error('dsh-forge: startup failure must be text')
    shellLog.error({ code: 'ERR_RENDERER_BOOT', message: 'renderer reported startup failure', data: { detail: message } })
  })
}
