// Pure (Electron-free) constants for the dsh-app:// scheme, shared by the
// protocol carriage, the web-document transforms, and tests.

/** Custom application scheme (inherited from the upstream desktop shell). */
export const SCHEME = 'dsh-app'

/** Origin of the application window document served over the scheme. */
export const SHELL_APP_ORIGIN = `${SCHEME}://app`

/** Default application document URL loaded by the main window. */
export const SHELL_APP_URL = `${SHELL_APP_ORIGIN}/`

/**
 * Pathname under the application origin that serves the shell-ui overlay
 * bootstrap script (the only shell-owned asset inside the dsh-app:// origin).
 */
export const SHELL_UI_SCRIPT_PATH = '/__dsh_forge_shell__.js'

/** Absolute URL of the shell-ui bootstrap script injected into index.html. */
export const SHELL_UI_SCRIPT_URL = `${SHELL_APP_ORIGIN}${SHELL_UI_SCRIPT_PATH}`
