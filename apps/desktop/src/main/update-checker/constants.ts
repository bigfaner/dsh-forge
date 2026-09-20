// Pure (Electron-free) build-time constants for the update checker (Interface 3).
// SC6 hardening (tech-design Security Considerations): the openExternal
// allowlist is NOT feed input — it is frozen at build time from the fixed
// GitHub owner/repo. Task 6.3 (CI release channel) is the owner of these
// literals; GH naming is already settled to bigfaner/dsh-forge, and 6.3
// updates them here if the publishing target changes.

/** Host allowlist for `openRelease` openExternal validation (build-time constant). */
export const RELEASE_HOST = 'github.com'

/**
 * Path-prefix allowlist for `openRelease` (build-time constant, NOT feed
 * input). Only release pages under /<owner>/<repo>/releases may be opened.
 */
export const RELEASE_PATH_PREFIX = '/bigfaner/dsh-forge/releases'

/**
 * GitHub Releases atom feed URL (HTTPS read-only; the only network call).
 * `DSH_FORGE_RELEASE_FEED_URL` is the SC6 e2e fake-feed seam (task 6.1: 假
 * feed 60s 提示+跳转): it swaps only the feed source, never the openRelease
 * allowlist (build-time frozen above — a fake feed still cannot redirect the
 * release-page jump anywhere but the allowlisted GH release pages).
 */
export const RELEASE_FEED_URL = process.env.DSH_FORGE_RELEASE_FEED_URL
  ?? `https://${RELEASE_HOST}${RELEASE_PATH_PREFIX}.atom`

/**
 * Per-attempt fetch timeout. Kept well under the SC6 startup budget so the
 * check always resolves (success or silent unavailable) within 60s.
 */
export const UPDATE_CHECK_TIMEOUT_MS = 15_000

/**
 * SC6 timing budget: the startup update check must complete within 60s of
 * process start. The checker starts at app-ready and its fetch aborts at
 * UPDATE_CHECK_TIMEOUT_MS, so completion is bounded far below this budget.
 */
export const UPDATE_CHECK_STARTUP_BUDGET_MS = 60_000
