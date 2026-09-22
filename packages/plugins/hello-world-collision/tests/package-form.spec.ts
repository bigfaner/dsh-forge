import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Task 3: npm package form of the collision-replica fixture. Same discipline
// as hello-world (task 1): the fixture is a second SELF-INSTALLED plugin and
// must therefore be a pure npm-dependency package — alignment line exact
// 0.1.6-alpha.2, zero vendored references, ui-goal form, valid profile bundle.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
  type: string
  main: string
  exports: Record<string, { types?: string; default?: string }>
  dsh?: {
    bundle?: { patch?: string }
    client?: { inject?: string[]; platform?: string }
  }
  files?: string[]
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

const upstreamLock = JSON.parse(readFileSync(join(pkgRoot, '../../..', 'vendor/upstream.lock.json'), 'utf8')) as {
  desktopHostVersion: string
}

/** Every dependency section in one name → spec table (later sections cannot shadow). */
const allDeps: Record<string, string> = {
  ...manifest.dependencies,
  ...manifest.peerDependencies,
  ...manifest.devDependencies,
}

const alignmentLine = Object.entries(allDeps).filter(([name]) => name.startsWith('@deepseek-ai/dsh-client-'))
const nonRegistrySpec = /(workspace|link|file|npm|git|http|portal):/

describe('collision fixture package: npm version discipline', () => {
  it('declares the desktopHostVersion alignment line for every dsh-client contract dep', () => {
    expect(upstreamLock.desktopHostVersion).toBe('0.1.6-alpha.2')
    expect(alignmentLine.length).toBeGreaterThan(0)
    for (const [name, spec] of alignmentLine) {
      expect(spec, `${name} must pin the desktopHostVersion alignment line exactly`).toBe(upstreamLock.desktopHostVersion)
    }
  })

  it('uses exact registry specs only — no bare names, ranges, or protocols', () => {
    for (const [name, spec] of Object.entries(allDeps)) {
      expect(spec, `${name} must not use a non-registry protocol`).not.toMatch(nonRegistrySpec)
      // Exact = plain semver, no range operators (^ ~ > < * || -x.x.x).
      expect(spec, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
    }
  })

  it('keeps cordis as an independent exact version line, never matched to desktopHostVersion', () => {
    expect(manifest.peerDependencies?.['@deepseek-ai/cordis']).toBeDefined()
    const cordis = manifest.peerDependencies?.['@deepseek-ai/cordis']
    expect(cordis).toBe('4.0.2')
    expect(cordis).not.toBe(upstreamLock.desktopHostVersion)
  })
})

describe('collision fixture package: zero vendored references', () => {
  it('resolves every dependency through the npm registry', () => {
    for (const [name, spec] of Object.entries(allDeps)) {
      expect(spec, `${name} must resolve to the registry`).not.toMatch(nonRegistrySpec)
      expect(name).not.toContain('desktop-host-vendor')
    }
    expect(Object.keys(allDeps)).not.toContain('@dsh-forge/desktop-host-vendor')
  })

  it('imports only bare npm specifiers and package-relative paths in src', () => {
    const sources = ['src/index.ts', 'src/client/index.ts', 'src/client/ReplicaPanel.tsx', 'src/client/contract.ts', 'src/client/locales.ts', 'src/client/store.ts', 'src/client/mode.ts']
    for (const file of sources) {
      const text = readFileSync(join(pkgRoot, file), 'utf8')
      const imports = [...text.matchAll(/from '([^']+)'/g)].map(match => match[1])
      for (const spec of imports) {
        if (spec.startsWith('.')) {
          expect(spec, `${file} must not escape the package`).not.toContain('..')
          continue
        }
        // Bare specifier: must name an npm dependency, never the vendored tree.
        expect(spec, `${file} imports "${spec}" which is not a declared npm dependency`).toBeDefined()
        const depName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        expect(allDeps[depName], `${file} imports "${spec}" outside the declared dependency set`).toBeDefined()
        expect(spec).not.toMatch(/vendor|desktop-host-vendor/)
      }
    }
  })
})

describe('collision fixture package: ui-goal plugin form', () => {
  it('exposes the client half through exports["./client"] and the host half through exports["."]', () => {
    expect(manifest.exports['.']).toEqual({ types: './lib/types/index.d.ts', default: './lib/index.js' })
    expect(manifest.exports['./client']).toEqual({ types: './lib/types/client/index.d.ts', default: './lib/client.js' })
  })

  it('declares the same minimal stable inject subset as hello-world', () => {
    const client = manifest.dsh?.client
    expect(client?.platform).toBe('web')
    expect(client?.inject).toEqual([
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-chat',
      '@deepseek-ai/dsh-client-ui-renderer',
    ])
  })

  it('ships a small ui-goal-shaped artifact list plus the profile-layer patch', () => {
    expect(manifest.files).toEqual(['lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts', 'cordis.patch.yml'])
  })

  it('declares the dsh.bundle patch required for a profile layer', () => {
    expect(manifest.dsh?.bundle).toEqual({ patch: './cordis.patch.yml' })
    const patch = readFileSync(join(pkgRoot, 'cordis.patch.yml'), 'utf8')
    // One loader row mounting the package (web-app browser-roster row form).
    expect(patch).toContain("name: '@dsh-forge/plugin-hello-world-collision'")
  })

  it('provides an empty host-half apply so the host Loader sees the plugin', async () => {
    const host = await import('../src/index.ts')
    expect(typeof host.apply).toBe('function')
    expect(host.apply()).toBeUndefined()
  })

  it('commits the replica mode as the default probe', async () => {
    const mode = await import('../src/client/mode.ts')
    expect(mode.MODE).toBe('replica')
    // The replicated key is exactly hello-world's contributed sub-slot key.
    expect(mode.SHARED_PANEL_SLOT).toBe('hello-world.panel')
    expect(mode.CHILD_SLOT).toBe('hello-world.panel')
  })
})
