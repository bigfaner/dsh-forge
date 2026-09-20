import type { WebPreferences } from 'electron'
import { join } from 'node:path'

// Security baseline for every shell window (design: Security Considerations /
// shell-ui 注入面). Values are explicit and aligned with the upstream desktop
// configuration (apps/desktop/src/main.ts of deepseek-harness): contextIsolation
// on, nodeIntegration off, sandbox on, webSecurity on.
export const SHELL_WEB_PREFERENCES: Readonly<WebPreferences> = Object.freeze({
  preload: join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
})
