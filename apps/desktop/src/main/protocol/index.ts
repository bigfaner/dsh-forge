// dsh-app:// protocol carrier (task 3.3, SC7 foundation).
export { SCHEME, SHELL_APP_ORIGIN, SHELL_APP_URL, SHELL_UI_SCRIPT_PATH, SHELL_UI_SCRIPT_URL } from './constants.ts'
export { registerShellScheme } from './scheme.ts'
export {
  authenticateWebHost,
  forwardWebRequest,
  serveStaticFile,
  serveWebDocument,
  type ServeWebDocumentOptions,
} from './web-document.ts'
export { createProtocolCarriage, isWebAssetPathname, type ProtocolCarriage, type ProtocolCarriageDeps, type ShellBootPayload } from './carriage.ts'
export { installProtocolCarriage, assertBootSender, SHELL_BOOT_IPC, type CarriageBootstrapDeps } from './bootstrap.ts'
