import { t } from '../i18n/index.ts'
import { shellLog } from '../log.ts'

// Session focus — Interface 5 of the M1 tech design.
//
// Spike 3 (docs/features/dsh-forge-m1/design/spike-3-findings.md, §1/§2)
// audited all three channel candidates against upstream `c36ba648` and
// rejected them: URL hash (no router anywhere in the client tree),
// postMessage (no message listeners), deep-link (no protocol client /
// second-instance carries no payload). There is therefore NO zero-intrusion
// runtime channel into the upstream SPA (TECH-ui-reuse-001 forbids touching
// upstream GUI files), and M1 ships the frozen fallback:
//
//   focusSession() ≡ bring the main window to front + toast
//   `toast.manualSwitch` ("请手动切换到会话 {title}") and return false.
//
// The boot-time localStorage poke (`dsh.sessions.current`) documented in
// spike-3 §1.2 is an M2 candidate enhancement, deliberately NOT wired here.

/** Main-process side effects the fallback needs (injected for testability). */
export interface SessionFocusDeps {
  /** Bring the primary window to front (restore + show + focus). */
  focusMainWindow: () => void
  /** Display a shell-ui toast with the already-localized message. */
  showToast: (message: string) => void
}

export interface SessionFocus {
  /**
   * Attempt to focus (switch to) a session in the upstream client UI.
   * M1: the channel is unavailable by frozen decision, so this always
   * performs the fallback (front window + manual-switch toast) and
   * resolves `false`.
   *
   * @param sessionId - non-empty session identifier (SessionTable key).
   * @param options.title - display title for the toast; defaults to the id.
   * @returns false — the session was NOT focused programmatically.
   */
  focusSession(sessionId: string, options?: { title?: string }): Promise<boolean>
}

export function createSessionFocus(deps: SessionFocusDeps): SessionFocus {
  return {
    async focusSession(sessionId, options) {
      if (typeof sessionId !== 'string' || sessionId === '') {
        shellLog.warn({
          code: 'WARN_SESSION_FOCUS_INVALID_ID',
          message: 'session focus requested without a usable session id; fallback skipped',
        })
        return false
      }
      const title = options?.title !== undefined && options.title !== '' ? options.title : sessionId
      shellLog.info({
        code: 'SESSION_FOCUS_FALLBACK',
        message: 'no session-focus channel (spike-3); falling back to front window + manual-switch toast',
        data: { sessionId },
      })
      deps.focusMainWindow()
      deps.showToast(t('toast.manualSwitch', { title }))
      return false
    },
  }
}
