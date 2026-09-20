import { contextBridge, ipcRenderer } from 'electron'

// contextBridge semantic verbs (whitelist). The renderer (upstream client UI
// plugin family) talks to the shell exclusively through these verbs; raw
// ipcRenderer / Node APIs never cross the boundary.
contextBridge.exposeInMainWorld('__DSH_FORGE_SHELL__', {
  // Skeleton verb: shell version probe. Real verbs land with their features.
  ping: (): string => 'dsh-forge-shell',
})

// Keep the ipcRenderer import exercised for the whitelist pattern above; the
// sender-validated verb surface grows in later tasks.
void ipcRenderer
