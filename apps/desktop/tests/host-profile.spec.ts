import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { projectHostProfile, type PluginBundleEntry } from '../src/main/host-profile/index.ts'
import { pluginPackBlocks, writeTarball } from './helpers/tarball-fixture.ts'

// Task 2: the projector reconciles the app-owned userData profile against the
// product-level plugin-bundles config (single source of truth). Write-once
// semantics survive for host-managed materialization; the manifest bundle list
// converges to the config (add leg = rewrite + seed, delete leg = rewrite +
// prune), and the upstream-owned module-fallback links are never touched.

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

const OFFICIAL: readonly PluginBundleEntry[] = [
  { name: '@deepseek-ai/dsh-base' },
  { name: '@deepseek-ai/dsh-web-app' },
]

/** A scratch workspace whose `packages/plugins/hello-world` is a valid `workspace:` source (production-shaped relative spec). */
interface PluginWorkspace {
  workspaceRoot: string
  withHelloWorld: readonly PluginBundleEntry[]
}

function makePluginWorkspace(scratch: string, root = 'ws'): PluginWorkspace {
  const workspaceRoot = join(scratch, root)
  const dir = join(workspaceRoot, 'packages', 'plugins', 'hello-world')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@dsh-forge/plugin-hello-world', version: '0.1.0' }, undefined, 2)}\n`)
  return { workspaceRoot, withHelloWorld: [...OFFICIAL, { name: '@dsh-forge/plugin-hello-world', source: 'workspace:packages/plugins/hello-world' }] }
}

interface ProjectedManifest {
  dsh?: { profile?: { bundles?: string[] } }
  dependencies?: Record<string, string>
}

function readManifest(profileDir: string): ProjectedManifest {
  return JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
}

const OFFICE = (scratch: string) => {
  const officeAssets = join(scratch, 'office-assets')
  mkdirSync(officeAssets, { recursive: true })
  return officeAssets
}

describe('projectHostProfile (disc-2 + task 2 config-ization)', () => {
  it('projects the profile manifest from the config bundle list (single source of truth)', () => {
    const scratch = makeScratch()
    const result = projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    expect(readManifest(result.profileDir).dsh?.profile?.bundles).toEqual(OFFICIAL.map(e => e.name))
    expect(result.primaryRuntimeSource).toBe(join(scratch, 'host-payload', 'primary-runtime'))
    expect(existsSync(join(scratch, 'host-payload', 'office-skills'))).toBe(true)
  })

  it('is idempotent with no config drift: an existing profile is never rewritten', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    // Simulate the host's own link-mode materialization inside the profile.
    writeFileSync(join(profileDir, 'host-materialized-marker'), 'keep')
    const before = readFileSync(join(profileDir, 'package.json'), 'utf8')
    const second = projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    expect(second.primaryRuntimeSource).toBe(join(scratch, 'host-payload', 'primary-runtime'))
    expect(existsSync(join(profileDir, 'host-materialized-marker'))).toBe(true)
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(before)
  })

  it('returns an undefined payload source when the vendored office assets are missing', () => {
    const scratch = makeScratch()
    const result = projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: join(scratch, 'does-not-exist'), bundles: OFFICIAL })
    expect(result.primaryRuntimeSource).toBeUndefined()
    expect(existsSync(join(result.profileDir, 'package.json'))).toBe(true)
  })

  it('add leg: a config-only new entry rewrites the manifest and seeds its materialization', () => {
    const scratch = makeScratch()
    const { workspaceRoot, withHelloWorld } = makePluginWorkspace(scratch)
    const profileDir = join(scratch, 'host-profile')
    // Pre-existing M1-style projection (official bundles only).
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: withHelloWorld, workspaceRoot })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(withHelloWorld.map(e => e.name))
    const seeded = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-hello-world')
    expect(existsSync(join(seeded, 'package.json'))).toBe(true)
    expect(lstatSync(seeded).isSymbolicLink()).toBe(true)
    // Re-run with the same config: no drift, nothing reseeded or rewritten.
    const before = readFileSync(join(profileDir, 'package.json'), 'utf8')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: withHelloWorld, workspaceRoot })
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(before)
  })

  it('add leg: a missing or malformed source fails loud', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    const withUnbuiltSource: readonly PluginBundleEntry[] = [
      ...OFFICIAL, { name: '@dsh-forge/plugin-hello-world', source: 'workspace:packages/plugins/hello-world' },
    ]
    expect(() => projectHostProfile({
      profileDir, officeSkillsSource: OFFICE(scratch), bundles: withUnbuiltSource, workspaceRoot: join(scratch, 'ws'),
    })).toThrow(/package\.json/u)
    // A workspace source without a workspaceRoot anchor is a wiring error.
    expect(() => projectHostProfile({
      profileDir: join(scratch, 'host-profile-2'), officeSkillsSource: OFFICE(scratch), bundles: withUnbuiltSource,
    })).toThrow(/workspaceRoot/u)
  })

  it('add leg: re-points a stale shell-seeded link but leaves non-link materialization alone', () => {
    const scratch = makeScratch()
    const stale = makePluginWorkspace(scratch, 'ws-stale')
    writeFileSync(join(stale.workspaceRoot, 'packages', 'plugins', 'hello-world', 'package.json'), '{"stale":true}\n')
    const fresh = makePluginWorkspace(scratch, 'ws')
    const profileDir = join(scratch, 'host-profile')
    const project = (ws: PluginWorkspace) => projectHostProfile({
      profileDir, officeSkillsSource: OFFICE(scratch), bundles: ws.withHelloWorld, workspaceRoot: ws.workspaceRoot,
    })
    project(stale)
    const seeded = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-hello-world')
    expect(readFileSync(join(seeded, 'package.json'), 'utf8')).toContain('stale')
    // Same config entry, new source location: the seeded link follows the config.
    project(fresh)
    expect(readFileSync(join(seeded, 'package.json'), 'utf8')).toContain('plugin-hello-world')
    // A real (non-link) directory at the target is left untouched.
    rmSync(seeded, { recursive: true, force: true })
    mkdirSync(seeded, { recursive: true })
    writeFileSync(join(seeded, 'package.json'), '{"name":"pnpm-managed"}\n')
    expect(() => project(fresh)).not.toThrow()
    expect(readFileSync(join(seeded, 'package.json'), 'utf8')).toContain('pnpm-managed')
  })

  it('delete leg: a config-removed entry is pruned from the manifest and its materialization removed', () => {
    const scratch = makeScratch()
    const { workspaceRoot, withHelloWorld } = makePluginWorkspace(scratch)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: withHelloWorld, workspaceRoot })
    const seeded = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-hello-world')
    expect(existsSync(seeded)).toBe(true)
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(OFFICIAL.map(e => e.name))
    expect(existsSync(seeded)).toBe(false)
    // The scoped parent directory is cleaned when it becomes empty.
    expect(existsSync(join(profileDir, 'node_modules', '@dsh-forge'))).toBe(false)
  })

  it('delete leg: installation-resolved entries prune nothing outside the profile', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    const outside = join(scratch, 'installation', 'dsh-web-app')
    mkdirSync(outside, { recursive: true })
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: [{ name: '@deepseek-ai/dsh-base' }] })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(existsSync(outside)).toBe(true) // shell never touches the installation tree
    expect(readdirSync(profileDir).includes('node_modules')).toBe(false)
  })

  it('delete leg: upstream-owned module-fallback links are never removed', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    // Existing projection listing an upstream-healed fallback package.
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({ name: 'dsh-forge-host-profile', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-fallback-guest', '@deepseek-ai/dsh-base'] } } })}\n`)
    const ownedDir = join(profileDir, '.dsh-module-fallback', 'node_modules', '@deepseek-ai', 'dsh-fallback-guest')
    mkdirSync(ownedDir, { recursive: true })
    writeFileSync(join(ownedDir, 'package.json'), '{"name":"@deepseek-ai/dsh-fallback-guest"}\n')
    const modulesDir = join(profileDir, 'node_modules', '@deepseek-ai')
    mkdirSync(modulesDir, { recursive: true })
    const link = join(modulesDir, 'dsh-fallback-guest')
    symlinkSync(ownedDir, link, 'junction')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: [{ name: '@deepseek-ai/dsh-base' }] })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(existsSync(link)).toBe(true) // upstream heals its own links; the shell never fights them
    expect(existsSync(join(ownedDir, 'package.json'))).toBe(true) // the owned payload itself is untouched
  })

  it('order drift converges to the config order', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    const reordered: readonly PluginBundleEntry[] = [{ name: '@deepseek-ai/dsh-web-app' }, { name: '@deepseek-ai/dsh-base' }]
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: reordered })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(reordered.map(e => e.name))
  })

  it('preserves unrelated manifest fields through a reconciliation rewrite', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    const manifestPath = join(profileDir, 'package.json')
    const withDeps = { ...readManifest(profileDir), dependencies: { '@deepseek-ai/dsh-client-ui-goal': '0.1.6-alpha.2' } }
    writeFileSync(manifestPath, `${JSON.stringify(withDeps, undefined, 2)}\n`)
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: [{ name: '@deepseek-ai/dsh-base' }] })
    expect(readManifest(profileDir).dependencies).toEqual({ '@deepseek-ai/dsh-client-ui-goal': '0.1.6-alpha.2' })
  })

  it('reconciles a manifest whose dsh.profile.bundles field is missing, but fails loud on a corrupt manifest', () => {
    const scratch = makeScratch()
    const profileDir = join(scratch, 'host-profile')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({ name: 'dsh-forge-host-profile', private: true })}\n`)
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(OFFICIAL.map(e => e.name))
    writeFileSync(join(profileDir, 'package.json'), '{ corrupt')
    expect(() => projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })).toThrow(/valid JSON/u)
    writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({ dsh: { profile: { bundles: 'not-an-array' } } })}\n`)
    expect(() => projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })).toThrow(/bundles/u)
  })

  it('never writes the product config through a full add/delete cycle (runtime read-only, AC5)', () => {
    const scratch = makeScratch()
    const { workspaceRoot, withHelloWorld } = makePluginWorkspace(scratch)
    const configPath = join(scratch, 'plugin-bundles.json')
    const configBytes = `${JSON.stringify({ bundles: withHelloWorld }, undefined, 2)}\n`
    writeFileSync(configPath, configBytes)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: withHelloWorld, workspaceRoot })
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL })
    expect(readFileSync(configPath, 'utf8')).toBe(configBytes)
  })
})

// Task 6 (spike-report §4.1): packaged distribution form = tarball built-in +
// shell-side pre-seeding. The config's `source` vocabulary grows a
// `tarball:<resources-relative .tgz>` form; the projector unpacks the artifact
// into the profile's node_modules as a REAL directory (resolveBundleDir's
// second anchor accepts either), write-once with a shell-owned seed marker —
// no pnpm, no network, zero plugin identity in shell code (the name and the
// artifact path come from the config alone).
describe('projectHostProfile (task 6 tarball pre-seeding leg)', () => {
  const PLUGIN = '@dsh-forge/plugin-hello-world'

  /** A scratch resources root holding a packed plugin tarball; returns config-ready entries. */
  function makeResources(scratch: string, version = '0.1.0', marker = 'v1'): { resourcesRoot: string; bundles: readonly PluginBundleEntry[]; tarballPath: string } {
    const resourcesRoot = join(scratch, 'resources')
    mkdirSync(resourcesRoot, { recursive: true })
    const tarballPath = writeTarball(pluginPackBlocks(PLUGIN, version, marker), join(resourcesRoot, 'plugin-tarballs'), `dsh-forge-plugin-hello-world-${version}.tgz`)
    return {
      resourcesRoot,
      bundles: [...OFFICIAL, { name: PLUGIN, source: `tarball:plugin-tarballs/dsh-forge-plugin-hello-world-${version}.tgz` }],
      tarballPath,
    }
  }

  const seededDir = (profileDir: string) => join(profileDir, 'node_modules', '@dsh-forge', 'plugin-hello-world')
  const MARKER = '.dsh-forge-seed.json'

  it('pre-seeds the tarball entry as a real unpacked directory with a seed marker', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    const seeded = seededDir(profileDir)
    expect(lstatSync(seeded).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(seeded, 'package.json'), 'utf8')).toContain(PLUGIN)
    expect(readFileSync(join(seeded, 'lib', 'client.js'), 'utf8')).toContain('client half v1')
    const marker = JSON.parse(readFileSync(join(seeded, MARKER), 'utf8'))
    expect(marker.bundle).toBe(PLUGIN)
    expect(marker.source).toBe(bundles[2]?.source)
    expect(marker.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(typeof marker.seededAt).toBe('string')
  })

  it('is write-once: an identical re-run leaves the materialization untouched', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    const markerPath = join(seededDir(profileDir), MARKER)
    const before = readFileSync(markerPath, 'utf8')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    expect(readFileSync(markerPath, 'utf8')).toBe(before)
    // No staging residue is left behind either.
    expect(readdirSync(profileDir).filter(name => name.startsWith('.dsh-forge-seed-'))).toEqual([])
  })

  it('re-materializes when the artifact changes (sha drift converges)', () => {
    const scratch = makeScratch()
    const first = makeResources(scratch, '0.1.0', 'v1')
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: first.bundles, resourcesRoot: first.resourcesRoot })
    expect(readFileSync(join(seededDir(profileDir), 'lib', 'client.js'), 'utf8')).toContain('v1')
    // Same name, rebuilt artifact (different bytes/version).
    const second = makeResources(scratch, '0.1.1', 'v2')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: second.bundles, resourcesRoot: second.resourcesRoot })
    expect(readFileSync(join(seededDir(profileDir), 'lib', 'client.js'), 'utf8')).toContain('v2')
    expect(JSON.parse(readFileSync(join(seededDir(profileDir), 'package.json'), 'utf8')).version).toBe('0.1.1')
  })

  it('replaces a stale shell-seeded workspace junction with the unpacked directory', () => {
    const scratch = makeScratch()
    const { workspaceRoot, withHelloWorld } = makePluginWorkspace(scratch)
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: withHelloWorld, workspaceRoot })
    expect(lstatSync(seededDir(profileDir)).isSymbolicLink()).toBe(true)
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    expect(lstatSync(seededDir(profileDir)).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(seededDir(profileDir), 'lib', 'index.js'), 'utf8')).toContain('host half')
  })

  it('leaves a foreign (marker-less) real directory alone', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    const seeded = seededDir(profileDir)
    mkdirSync(seeded, { recursive: true })
    writeFileSync(join(seeded, 'package.json'), '{"name":"pnpm-managed"}\n')
    expect(() => projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })).not.toThrow()
    expect(readFileSync(join(seeded, 'package.json'), 'utf8')).toContain('pnpm-managed')
  })

  it('skips upstream-owned module-fallback links (the host heals those)', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    const ownedDir = join(profileDir, '.dsh-module-fallback', 'node_modules', '@dsh-forge', 'plugin-hello-world')
    const modulesDir = join(profileDir, 'node_modules', '@dsh-forge')
    mkdirSync(ownedDir, { recursive: true })
    writeFileSync(join(ownedDir, 'package.json'), '{"name":"upstream-healed"}\n')
    mkdirSync(modulesDir, { recursive: true })
    symlinkSync(ownedDir, join(modulesDir, 'plugin-hello-world'), 'junction')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    expect(lstatSync(join(modulesDir, 'plugin-hello-world')).isSymbolicLink()).toBe(true)
  })

  it('fails loud with remediation when the tarball is missing or the anchor is absent', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    rmSync(join(resourcesRoot, 'plugin-tarballs'), { recursive: true, force: true })
    expect(() => projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot }))
      .toThrow(/tarball/u)
    expect(() => projectHostProfile({ profileDir: join(scratch, 'host-profile-2'), officeSkillsSource: OFFICE(scratch), bundles }))
      .toThrow(/resourcesRoot/u)
  })

  it('fails loud on a corrupt tarball, leaving no materialization or residue behind', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    writeFileSync(join(resourcesRoot, 'plugin-tarballs', 'dsh-forge-plugin-hello-world-0.1.0.tgz'), Buffer.from('not a tarball'))
    const profileDir = join(scratch, 'host-profile')
    expect(() => projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })).toThrow()
    expect(existsSync(seededDir(profileDir))).toBe(false)
    expect(readdirSync(profileDir).filter(name => name.startsWith('.dsh-forge-seed-'))).toEqual([])
  })

  it('fails loud when the packed package identity does not match the config entry', () => {
    const scratch = makeScratch()
    const resourcesRoot = join(scratch, 'resources')
    mkdirSync(join(resourcesRoot, 'plugin-tarballs'), { recursive: true })
    writeTarball(pluginPackBlocks('@dsh-forge/plugin-impostor', '0.1.0'), join(resourcesRoot, 'plugin-tarballs'), 'dsh-forge-plugin-hello-world-0.1.0.tgz')
    const bundles: readonly PluginBundleEntry[] = [...OFFICIAL, { name: PLUGIN, source: 'tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz' }]
    expect(() => projectHostProfile({ profileDir: join(scratch, 'host-profile'), officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot }))
      .toThrow(/impostor|identity|name/u)
  })

  it('delete leg prunes a tarball-seeded directory and the empty scope parent', () => {
    const scratch = makeScratch()
    const { resourcesRoot, bundles } = makeResources(scratch)
    const profileDir = join(scratch, 'host-profile')
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles, resourcesRoot })
    expect(existsSync(seededDir(profileDir))).toBe(true)
    projectHostProfile({ profileDir, officeSkillsSource: OFFICE(scratch), bundles: OFFICIAL, resourcesRoot })
    expect(readManifest(profileDir).dsh?.profile?.bundles).toEqual(OFFICIAL.map(e => e.name))
    expect(existsSync(seededDir(profileDir))).toBe(false)
    expect(existsSync(join(profileDir, 'node_modules', '@dsh-forge'))).toBe(false)
  })
})
