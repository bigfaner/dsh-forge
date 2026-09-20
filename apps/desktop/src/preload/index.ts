import { contextBridge, ipcRenderer } from 'electron'
import type { RecoveryState } from '../main/crash-recovery/index.ts'

// contextBridge semantic verbs (whitelist). The renderer (upstream client UI
// plugin family) talks to the shell exclusively through these verbs; raw
// ipcRenderer / Node APIs never cross the boundary.

// Carrier-boot verb pair inherited from the upstream desktop shell contract:
// the upstream web entry (apps/web/src/main.ts) probes globalThis.dshDesktopBoot,
// calls ready() to receive { injections, streamBaseUrl }, and then installs
// __DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl } itself. failed()
// reports renderer-side startup errors back to the shell log.
contextBridge.exposeInMainWorld('dshDesktopBoot', {
  ready: (): Promise<{ injections: unknown[]; streamBaseUrl: string }> =>
    ipcRenderer.invoke('dsh-forge:boot') as Promise<{ injections: unknown[]; streamBaseUrl: string }>,
  failed: (message: string): Promise<void> =>
    ipcRenderer.invoke('dsh-forge:boot-failed', message) as Promise<void>,
})

contextBridge.exposeInMainWorld('__DSH_FORGE_SHELL__', {
  // Skeleton verb: shell version probe. Real verbs land with their features.
  ping: (): string => 'dsh-forge-shell',
  // Interface 5 fallback toast: the main process pushes an already-localized
  // manual-switch message; the shell-ui overlay renders it. Returns an
  // unsubscriber (single-listener semantic verb, sender = shell main only).
  onToast: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('dsh-forge:toast', listener)
    return () => ipcRenderer.removeListener('dsh-forge:toast', listener)
  },
})

// Interface 6: dshForge semantic verbs (IPC whitelist + main-side sender frame
// validation). Each verb maps to exactly one whitelisted channel; the main
// process rejects and logs any invoke from an unowned frame.
contextBridge.exposeInMainWorld('dshForge', {
  update: {
    dismiss: (): Promise<void> => ipcRenderer.invoke('dsh-forge:update-dismiss') as Promise<void>,
    openRelease: (): Promise<void> => ipcRenderer.invoke('dsh-forge:update-open-release') as Promise<void>,
    // UF3 banner state pull (late-mount catch-up) + push subscription.
    // Payload: UpdateBannerState = { phase: 'hidden'|'queued'|'shown'|'dismissed'; version? }.
    getState: (): Promise<{ phase: string; version?: string }> =>
      ipcRenderer.invoke('dsh-forge:update-get-state') as Promise<{ phase: string; version?: string }>,
    onState: (callback: (state: { phase: string; version?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { phase: string; version?: string }): void => callback(state)
      ipcRenderer.on('dsh-forge:update-state', listener)
      return () => ipcRenderer.removeListener('dsh-forge:update-state', listener)
    },
  },
  recovery: {
    restartApp: (): Promise<void> => ipcRenderer.invoke('dsh-forge:recovery-restart-app') as Promise<void>,
    getState: (): Promise<RecoveryState> => ipcRenderer.invoke('dsh-forge:recovery-get-state') as Promise<RecoveryState>,
    // UF4 state push subscription (the renderer mirrors the main-side machine).
    // Payload: { state: RecoveryState; reason?: string } — reason present only
    // on 'failed' (failure.detail, ≤120 chars, tech-design Data Models).
    onState: (callback: (state: { state: RecoveryState; reason?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { state: RecoveryState; reason?: string }): void => callback(payload)
      ipcRenderer.on('dsh-forge:recovery-state', listener)
      return () => ipcRenderer.removeListener('dsh-forge:recovery-state', listener)
    },
  },
})

