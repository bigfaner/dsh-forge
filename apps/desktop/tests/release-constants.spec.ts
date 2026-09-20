import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { RELEASE_HOST, RELEASE_PATH_PREFIX } from '../src/main/update-checker/constants.ts'

// Task 6.3 AC "白名单常量与实际 repo 一致": the build-time openExternal
// allowlist must match the repository this CI publishes to (release.yml
// publishes to the checkout's own repo, i.e. `git remote origin`). If GH
// naming ever changes, this test fails before the allowlist and the release
// channel can drift apart.

function resolveOrigin(): { host: string; owner: string; repo: string } | null {
  let url: string
  try {
    url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
  } catch {
    return null // no git metadata (e.g. exported tarball) — cannot verify
  }
  // git@github.com:owner/repo.git | https://github.com/owner/repo.git | ...
  const scp = url.match(/^git@([^:/]+):([^/]+)\/(.+?)(?:\.git)?$/)
  if (scp) return { host: scp[1], owner: scp[2], repo: scp[3] }
  const https = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (https) return { host: https[1], owner: https[2], repo: https[3] }
  return null
}

describe('release allowlist constants vs actual repo (task 6.3)', () => {
  it('RELEASE_HOST/RELEASE_PATH_PREFIX match git remote origin', () => {
    const origin = resolveOrigin()
    if (!origin) {
      throw new Error(
        'cannot verify allowlist: `git remote get-url origin` unavailable — '
        + 'this test must run inside a git checkout (as CI does)',
      )
    }
    expect(RELEASE_HOST).toBe(origin.host)
    expect(RELEASE_PATH_PREFIX).toBe(`/${origin.owner}/${origin.repo}/releases`)
  })

  it('RELEASE_PATH_PREFIX shape is /<owner>/<repo>/releases', () => {
    expect(RELEASE_PATH_PREFIX).toMatch(/^\/[\w.-]+\/[\w.-]+\/releases$/)
  })
})
