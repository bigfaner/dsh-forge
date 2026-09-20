import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HOST_PROFILE_BUNDLES, projectHostProfile } from '../src/main/host-profile/index.ts'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-host-profile-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

describe('projectHostProfile (disc-2)', () => {
  it('projects the profile manifest with the upstream web bundle list', () => {
    const scratch = makeScratch()
    const officeAssets = join(scratch, 'office-assets')
    mkdirSync(officeAssets, { recursive: true })
    const result = projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: officeAssets })
    const manifest = JSON.parse(readFileSync(join(result.profileDir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
    expect(manifest.dsh?.profile?.bundles).toEqual([...HOST_PROFILE_BUNDLES])
    expect(result.primaryRuntimeSource).toBe(join(scratch, 'host-payload', 'primary-runtime'))
    // Payload layout: office-skills sibling of the primary-runtime source dir.
    expect(existsSync(join(scratch, 'host-payload', 'office-skills'))).toBe(true)
    expect(existsSync(result.primaryRuntimeSource)).toBe(true)
  })

  it('is idempotent: an existing (host-materialized) profile is never reset', () => {
    const scratch = makeScratch()
    const officeAssets = join(scratch, 'office-assets')
    mkdirSync(officeAssets, { recursive: true })
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: officeAssets })
    // Simulate the host's own link-mode materialization inside the profile.
    writeFileSync(join(profileDir, 'host-materialized-marker'), 'keep')
    const second = projectHostProfile({ profileDir, officeSkillsSource: officeAssets })
    expect(second.primaryRuntimeSource).toBe(join(scratch, 'host-payload', 'primary-runtime'))
    expect(existsSync(join(profileDir, 'host-materialized-marker'))).toBe(true)
  })

  it('returns an undefined payload source when the vendored office assets are missing', () => {
    const scratch = makeScratch()
    const result = projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: join(scratch, 'does-not-exist') })
    expect(result.primaryRuntimeSource).toBeUndefined()
    // The profile manifest is still projected — the failure is payload-only.
    expect(existsSync(join(result.profileDir, 'package.json'))).toBe(true)
  })
})
