// Interface 3: update-checker (UF3; feed = GitHub Releases atom, HTTPS
// read-only). Key flow F4: check() → update-available | up-to-date |
// unavailable; every failure degrades silently per SC2 (ERR_UPDATE_FEED_
// UNREACHABLE logged, no dialog). openRelease() enforces the build-time
// RELEASE_HOST/RELEASE_PATH_PREFIX allowlist before any openExternal
// (tech-design Security Considerations) and refuses + logs on mismatch.
//
// Dependency-injected (same pattern as tray/index.ts) so unit tests drive
// it with fakes; only the app entry wires real Electron `shell`.

import { shellLog } from '../log.ts'
import {
  RELEASE_FEED_URL,
  RELEASE_HOST,
  RELEASE_PATH_PREFIX,
  UPDATE_CHECK_TIMEOUT_MS,
} from './constants.ts'
import { parseReleaseFeed } from './feed.ts'
import { compareSemver, parseSemver } from './semver.ts'

export interface UpdateCheck {
  readonly status: 'update-available' | 'up-to-date' | 'unavailable'
  readonly latestVersion?: string
  readonly releaseUrl?: string
  readonly checkedAt: number
}

export interface UpdateCheckerDeps {
  /** HTTPS-only feed fetch (Node global fetch shape; injected for tests). */
  fetchText: (url: string) => Promise<string>
  /** openExternal seam (Electron shell in production; fake in tests). */
  openExternal: (url: string) => Promise<void>
}

function unavailable(): UpdateCheck {
  return { status: 'unavailable', checkedAt: Date.now() }
}

function logUnreachable(detail: string): void {
  shellLog.warn({
    code: 'ERR_UPDATE_FEED_UNREACHABLE',
    message: 'update feed unreachable; degrading silently to unavailable (SC2)',
    data: { detail },
  })
}

function latestEntry(entries: readonly { version: string; releaseUrl: string }[]) {
  return entries.reduce((best, entry) =>
    compareSemver(entry.version, best.version) > 0 ? entry : best,
  )
}

/**
 * Create the update checker (Interface 3). `check` never throws: every
 * failure path (offline, unreachable, bad feed, non-https) returns
 * `{ status: 'unavailable' }` after logging ERR_UPDATE_FEED_UNREACHABLE.
 */
export function createUpdateChecker(deps: UpdateCheckerDeps) {
  return {
    async check(currentVersion: string): Promise<UpdateCheck> {
      const checkedAt = Date.now()
      try {
        const xml = await deps.fetchText(RELEASE_FEED_URL)
        const feed = parseReleaseFeed(xml)
        if (!feed.ok) {
          logUnreachable('feed parsed to zero valid release entries')
          return unavailable()
        }
        const latest = latestEntry(feed.entries)
        const current = parseSemver(currentVersion)
        if (current === undefined) {
          logUnreachable(`current version is not semver: ${currentVersion}`)
          return unavailable()
        }
        if (compareSemver(latest.version, currentVersion) > 0) {
          return {
            status: 'update-available',
            latestVersion: latest.version,
            releaseUrl: latest.releaseUrl,
            checkedAt,
          }
        }
        return { status: 'up-to-date', checkedAt }
      } catch (error: unknown) {
        logUnreachable(error instanceof Error ? error.message : String(error))
        return unavailable()
      }
    },

    /**
     * Open the release page in the system browser, but only when the URL is
     * https and matches the build-time RELEASE_HOST/RELEASE_PATH_PREFIX
     * allowlist. Any mismatch (including feed-supplied URLs pointing
     * elsewhere) is refused and logged — no openExternal call happens.
     * Returns true when the external open was attempted.
     */
    async openRelease(releaseUrl: string): Promise<boolean> {
      let url: URL
      try {
        url = new URL(releaseUrl)
      } catch {
        shellLog.error({
          code: 'ERR_UPDATE_URL_REJECTED',
          message: 'refusing openExternal: release URL is not a valid URL',
          data: { releaseUrl },
        })
        return false
      }
      const allowed =
        url.protocol === 'https:' &&
        url.hostname === RELEASE_HOST &&
        (url.pathname === RELEASE_PATH_PREFIX || url.pathname.startsWith(`${RELEASE_PATH_PREFIX}/`))
      if (!allowed) {
        shellLog.error({
          code: 'ERR_UPDATE_URL_REJECTED',
          message: 'refusing openExternal: release URL outside the build-time allowlist',
          data: { releaseUrl, allowedHost: RELEASE_HOST, allowedPathPrefix: RELEASE_PATH_PREFIX },
        })
        return false
      }
      await deps.openExternal(url.toString())
      return true
    },
  }
}

/**
 * Production fetch: HTTPS-only GitHub Releases atom read with a hard abort
 * timeout (UPDATE_CHECK_TIMEOUT_MS), keeping the SC6 startup budget of 60s.
 */
export function fetchReleaseFeed(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS)
  return fetch(url, {
    method: 'GET',
    signal: controller.signal,
    headers: { accept: 'application/atom+xml' },
  }).then((response) => {
    if (!response.ok) throw new Error(`feed HTTP status ${response.status}`)
    return response.text()
  }).finally(() => clearTimeout(timer))
}

export type UpdateChecker = ReturnType<typeof createUpdateChecker>
