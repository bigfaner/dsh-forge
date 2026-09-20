import { contextBridge, ipcRenderer } from 'electron'

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
})

// Keep the ipcRenderer import exercised for the whitelist pattern above; the
// sender-validated verb surface grows in later tasks.
void ipcRenderer
