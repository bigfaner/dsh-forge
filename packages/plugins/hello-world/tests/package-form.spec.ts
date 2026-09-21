import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Task 1 AC1-AC3: npm package form of the hello-world plugin.
//
// AC1 — alignment-line dependencies are exact 0.1.6-alpha.2 (no bare names, no
//       '^', no workspace:/link:/file: protocols); cordis peer is an independent
//       exact version line, never compared against desktopHostVersion.
// AC2 — zero vendored file references: every dependency spec resolves to the
//       npm registry; source imports never reach the vendored tree.
// AC3 — client half ships via exports['./client'], the host half is the empty
//       apply, and the package mirrors the upstream ui-goal form (small files).

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
  type: string
  main: string
  exports: Record<string, { types?: string; default?: string }>
  dsh?: { client?: { inject?: string[]; platform?: string } }
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

describe('hello-world package: npm version discipline (AC1)', () => {
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

describe('hello-world package: zero vendored references (AC2)', () => {
  it('resolves every dependency through the npm registry', () => {
    for (const [name, spec] of Object.entries(allDeps)) {
      expect(spec, `${name} must resolve to the registry`).not.toMatch(nonRegistrySpec)
      expect(name).not.toContain('desktop-host-vendor')
    }
    expect(Object.keys(allDeps)).not.toContain('@dsh-forge/desktop-host-vendor')
  })

  it('imports only bare npm specifiers and package-relative paths in src', async () => {
    const sources = ['src/index.ts', 'src/client/index.ts', 'src/client/HelloWorldPanel.tsx', 'src/client/contract.ts', 'src/client/locales.ts', 'src/client/store.ts']
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

describe('hello-world package: ui-goal plugin form (AC3)', () => {
  it('exposes the client half through exports["./client"] and the host half through exports["."]', () => {
    expect(manifest.exports['.']).toEqual({ types: './lib/types/index.d.ts', default: './lib/index.js' })
    expect(manifest.exports['./client']).toEqual({ types: './lib/types/client/index.d.ts', default: './lib/client.js' })
  })

  it('declares the dsh client surface: web platform plus explicit inject edges', () => {
    const client = manifest.dsh?.client
    expect(client?.platform).toBe('web')
    expect(Array.isArray(client?.inject)).toBe(true)
    for (const edge of client?.inject ?? []) {
      expect(typeof edge).toBe('string')
      expect(edge.startsWith('@deepseek-ai/')).toBe(true)
    }
    // Minimal stable subset: the services/slot-owner packages the plugin needs.
    expect(client?.inject).toContain('@deepseek-ai/dsh-client-ui-renderer')
    expect(client?.inject).toContain('@deepseek-ai/dsh-client-ui-chat')
  })

  it('ships a small ui-goal-shaped artifact list', () => {
    expect(manifest.files).toEqual(['lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts'])
  })

  it('provides an empty host-half apply so the host Loader sees the plugin', async () => {
    const host = await import('../src/index.ts')
    expect(typeof host.apply).toBe('function')
    expect(host.apply()).toBeUndefined()
  })
})
