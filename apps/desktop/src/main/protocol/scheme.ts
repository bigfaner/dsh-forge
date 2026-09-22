import { protocol } from 'electron'
import { SCHEME } from './constants.ts'

// dsh-app:// scheme registration (SC7 foundation). Privileges are inherited
// verbatim from the upstream desktop shell (apps/desktop/src/main.ts of
// deepseek-harness at the pinned SHA): the scheme must behave like a standard
// secure origin so the upstream client UI can fetch, stream, and cache inside
// it without any listening port.

/**
 * Register dsh-app:// as a privileged scheme.
 * MUST run before the Electron app is ready (module scope of the main entry).
 */
export function registerShellScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  }])
}
