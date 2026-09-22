// Interface 3 tests: semver comparison (incl. prereleases), GitHub Releases
// atom feed parsing (healthy / broken / offline → unavailable), and the
// RELEASE_HOST/RELEASE_PATH_PREFIX build-time allowlist refusing
// openExternal on mismatch (tech-design Security Considerations).

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELEASE_HOST,
  RELEASE_PATH_PREFIX,
  RELEASE_FEED_URL,
  UPDATE_CHECK_STARTUP_BUDGET_MS,
} from '../src/main/update-checker/constants.ts'
import { compareSemver, parseSemver } from '../src/main/update-checker/semver.ts'
import { parseReleaseFeed } from '../src/main/update-checker/feed.ts'
import { createUpdateChecker } from '../src/main/update-checker/index.ts'

function atomFeed(entries: ReadonlyArray<{ title: string; href?: string }>): string {
  const body = entries
    .map((entry) => {
      const href = entry.href ?? `https://${RELEASE_HOST}${RELEASE_PATH_PREFIX}/tag/${entry.title}`
      return `  <entry>
    <id>tag:${RELEASE_HOST},2026:${entry.title}</id>
    <updated>2026-09-01T00:00:00Z</updated>
    <title>${entry.title}</title>
    <link rel="alternate" type="text/html" href="${href}"/>
  </entry>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from bigfaner/dsh-forge</title>
${body}
</feed>`
}

describe('semver comparison (parse + compare, incl. prerelease)', () => {
  it('parses plain, v-prefixed, and prerelease versions; rejects garbage', () => {
    expect(parseSemver('0.2.0')).toMatchObject({ major: 0, minor: 2, patch: 0, prerelease: [] })
    expect(parseSemver('v0.2.0-rc.1')).toMatchObject({ minor: 2, patch: 0, prerelease: ['rc', '1'] })
    expect(parseSemver('not-a-version')).toBeUndefined()
    expect(parseSemver('1.2')).toBeUndefined()
    expect(parseSemver('01.2.3')).toBeUndefined()
  })

  it('orders plain releases numerically', () => {
    expect(compareSemver('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareSemver('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('prerelease sorts below its release (0.2.0-rc.1 < 0.2.0)', () => {
    expect(compareSemver('0.2.0-rc.1', '0.2.0')).toBeLessThan(0)
    expect(compareSemver('0.2.0-rc.1', '0.1.9')).toBeGreaterThan(0)
    expect(compareSemver('v1.0.0-alpha', '1.0.0')).toBeLessThan(0)
  })

  it('follows the semver.org prerelease precedence chain', () => {
    const chain = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ]
    for (let i = 0; i < chain.length - 1; i++) {
      expect(compareSemver(chain[i], chain[i + 1])).toBeLessThan(0)
    }
  })

  it('numeric prerelease identifiers compare numerically, not lexically', () => {
    expect(compareSemver('1.0.0-beta.11', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-2', '1.0.0-10')).toBeLessThan(0)
  })
})

describe('GitHub Releases atom feed parsing', () => {
  it('parses a healthy feed into versioned entries', () => {
    const result = parseReleaseFeed(atomFeed([{ title: 'v0.2.0' }, { title: 'v0.1.0' }]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0]).toMatchObject({
        version: '0.2.0',
        releaseUrl: `https://${RELEASE_HOST}${RELEASE_PATH_PREFIX}/tag/v0.2.0`,
      })
    }
  })

  it('keeps prerelease titles and drops non-semver entries', () => {
    const result = parseReleaseFeed(atomFeed([{ title: 'v0.2.0-rc.1' }, { title: 'weird-title' }]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries.map(e => e.version)).toEqual(['0.2.0-rc.1'])
    }
  })

  it('reports ok: false for a structurally broken feed', () => {
    expect(parseReleaseFeed('<html><body>404</body></html>').ok).toBe(false)
    expect(parseReleaseFeed('<feed></feed>').ok).toBe(false)
    expect(parseReleaseFeed('').ok).toBe(false)
  })
})

describe('check(): status resolution and silent degradation', () => {
  afterEach(() => vi.restoreAllMocks())

  function checkerWith(xmlOrError: string | Error) {
    return createUpdateChecker({
      fetchText: vi.fn(async () => {
        if (xmlOrError instanceof Error) throw xmlOrError
        return xmlOrError
      }),
      openExternal: vi.fn(async () => {}),
    })
  }

  it('update-available: newest entry wins even when feed order is scrambled', async () => {
    const checker = checkerWith(atomFeed([{ title: 'v0.1.0' }, { title: 'v0.2.0-rc.1' }, { title: 'v0.2.0' }]))
    const result = await checker.check('0.1.0')
    expect(result.status).toBe('update-available')
    expect(result.latestVersion).toBe('0.2.0')
    expect(result.releaseUrl).toBe(`https://${RELEASE_HOST}${RELEASE_PATH_PREFIX}/tag/v0.2.0`)
    expect(result.checkedAt).toBeGreaterThan(0)
  })

  it('prerelease newer than current counts as update-available', async () => {
    const checker = checkerWith(atomFeed([{ title: 'v0.2.0-rc.1' }]))
    const result = await checker.check('0.1.9')
    expect(result.status).toBe('update-available')
    expect(result.latestVersion).toBe('0.2.0-rc.1')
  })

  it('up-to-date: latest equal to current', async () => {
    const checker = checkerWith(atomFeed([{ title: 'v0.2.0' }, { title: 'v0.1.0' }]))
    const result = await checker.check('0.2.0')
    expect(result.status).toBe('up-to-date')
    expect(result.latestVersion).toBeUndefined()
  })

  it('offline/unreachable → unavailable, no throw (SC2 silent)', async () => {
    const checker = checkerWith(new Error('ENOTFOUND github.com'))
    const result = await checker.check('0.1.0')
    expect(result).toEqual({ status: 'unavailable', checkedAt: result.checkedAt })
    expect(result.checkedAt).toBeGreaterThan(0)
  })

  it('broken feed → unavailable', async () => {
    const checker = checkerWith('<not-xml>')
    const result = await checker.check('0.1.0')
    expect(result.status).toBe('unavailable')
  })
})

describe('openRelease(): build-time allowlist validation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens a matching https release URL via openExternal', async () => {
    const openExternal = vi.fn(async () => {})
    const checker = createUpdateChecker({
      fetchText: vi.fn(async () => atomFeed([{ title: 'v0.2.0' }])),
      openExternal,
    })
    const url = `https://${RELEASE_HOST}${RELEASE_PATH_PREFIX}/tag/v0.2.0`
    await expect(checker.openRelease(url)).resolves.toBe(true)
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('refuses wrong host without calling openExternal', async () => {
    const openExternal = vi.fn(async () => {})
    const checker = createUpdateChecker({ fetchText: vi.fn(), openExternal })
    await expect(checker.openRelease('https://evil.example.com/bigfaner/dsh-forge/releases/tag/v0.2.0')).resolves.toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('refuses a host-matching but path-mismatching URL (prefix spoof)', async () => {
    const openExternal = vi.fn(async () => {})
    const checker = createUpdateChecker({ fetchText: vi.fn(), openExternal })
    await expect(checker.openRelease(`https://${RELEASE_HOST}/other/repo/releases/tag/v9.9.9`)).resolves.toBe(false)
    await expect(checker.openRelease(`https://${RELEASE_HOST}/bigfaner/dsh-forge-releases/tag/v9.9.9`)).resolves.toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('refuses non-https and non-URL input', async () => {
    const openExternal = vi.fn(async () => {})
    const checker = createUpdateChecker({ fetchText: vi.fn(), openExternal })
    await expect(checker.openRelease(`http://${RELEASE_HOST}${RELEASE_PATH_PREFIX}/tag/v0.2.0`)).resolves.toBe(false)
    await expect(checker.openRelease('not a url')).resolves.toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('SC6 timing constants', () => {
  it('startup budget is 60s and the feed URL is https on the allowlisted host', () => {
    expect(UPDATE_CHECK_STARTUP_BUDGET_MS).toBe(60_000)
    const url = new URL(RELEASE_FEED_URL)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe(RELEASE_HOST)
  })
})
