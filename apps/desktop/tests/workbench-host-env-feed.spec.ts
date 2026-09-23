// Task 6.1: the shell-side host env feed (4.1's flag — production ownership
// gap closed). Explicit env wins; the feeder's OWN previous value refreshes.
import { describe, expect, it } from 'vitest'
import { HOST_PROJECT_ROOTS_ENV, createHostSpawnEnvFeeder } from '../src/main/workbench/host-env-feed.ts'

describe('createHostSpawnEnvFeeder', () => {
  it('refreshes the allowlist from the projects table when unset', () => {
    const env: Record<string, string | undefined> = {}
    const feed = createHostSpawnEnvFeeder(env)
    const value = feed(['Z:/a/b', 'Z:/c'])
    expect(value).toBe(JSON.stringify(['Z:/a/b', 'Z:/c']))
    expect(env[HOST_PROJECT_ROOTS_ENV]).toBe('["Z:/a/b","Z:/c"]')
  })

  it('overwrites an empty-string stale value (empty ≡ unset for the host half)', () => {
    const env: Record<string, string | undefined> = { [HOST_PROJECT_ROOTS_ENV]: '' }
    createHostSpawnEnvFeeder(env)([])
    expect(env[HOST_PROJECT_ROOTS_ENV]).toBe('[]')
  })

  it('an EXTERNAL explicit value WINS (test-profile override channel)', () => {
    const env: Record<string, string | undefined> = {}
    const feed = createHostSpawnEnvFeeder(env)
    feed(['Z:/table-root']) // the feeder's own first feed
    const explicit = '["Z:/explicit"]'
    env[HOST_PROJECT_ROOTS_ENV] = explicit // an external writer overrides
    const value = feed(['Z:/table-root', 'Z:/other'])
    expect(value).toBe(explicit)
    expect(env[HOST_PROJECT_ROOTS_ENV]).toBe(explicit)
  })

  it('repeated feeds refresh the FEEDER-OWNED value (recovery restarts converge to the latest table)', () => {
    const env: Record<string, string | undefined> = {}
    const feed = createHostSpawnEnvFeeder(env)
    feed(['Z:/one'])
    feed(['Z:/one', 'Z:/two'])
    expect(JSON.parse(env[HOST_PROJECT_ROOTS_ENV] as string)).toEqual(['Z:/one', 'Z:/two'])
  })

  it('an empty table serializes as an explicit empty array (fail-closed shape)', () => {
    const env: Record<string, string | undefined> = {}
    createHostSpawnEnvFeeder(env)([])
    expect(env[HOST_PROJECT_ROOTS_ENV]).toBe('[]')
  })

  it('two feeders over one env bag: the second feeder treats the first\'s value as external', () => {
    const env: Record<string, string | undefined> = {}
    const feedA = createHostSpawnEnvFeeder(env)
    const feedB = createHostSpawnEnvFeeder(env)
    feedA(['Z:/a'])
    const value = feedB(['Z:/b'])
    expect(value).toBe('["Z:/a"]') // feedB sees a foreign explicit value and keeps it
  })
})
