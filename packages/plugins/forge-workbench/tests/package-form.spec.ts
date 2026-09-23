import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Task 3.2 AC1/AC4: npm package form of the forge-workbench plugin.
//
// AC1 — the package is a buildable product bundle: exports map carries the
//       host half at '.' (lib/index.js — the stage-channel contract name) and
//       the browser half at './client'; the dsh block declares the bundle
//       patch and the client-half arrival packages.
// AC4 — @xyflow/react appears ONLY as a plugin dependency (dependencies
//       field), bundled into lib/client.js (bundle-artifact.spec.ts), never
//       in the shell or the host SPA's module table.
// Alignment-line discipline: every @deepseek-ai/dsh-client-* dep exact
// 0.1.6-alpha.2; cordis an independent exact line; every spec registry-exact.

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
  type: string
  main: string
  types: string
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

describe('forge-workbench package: npm version discipline (AC1)', () => {
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

describe('forge-workbench package: dual-half artifact faces (AC1/AC3)', () => {
  it('ships the host half at the stage-channel contract name and the browser half via exports["./client"]', () => {
    expect(manifest.name).toBe('@dsh-forge/plugin-forge-workbench')
    expect(manifest.type).toBe('module')
    expect(manifest.main).toBe('lib/index.js')
    expect(manifest.exports['.']?.default).toBe('./lib/index.js')
    expect(manifest.exports['./client']?.default).toBe('./lib/client.js')
    expect(manifest.exports['./package.json']).toBe('./package.json')
  })

  it('declares the bundle patch and the client-half arrival packages', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
    // The registration composes into the ui-layout `main` slot, the
    // ui-sidebar `sidebar.panellist` row, and the locale dictionaries —
    // the same set the upstream ui-plugin-manager precedent declares.
    expect(manifest.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ])
  })
})

describe('forge-workbench package: @xyflow/react placement (AC4)', () => {
  it('carries @xyflow/react as a plugin dependency only — never peer, dev, or absent', () => {
    expect(manifest.dependencies?.['@xyflow/react'], 'must be a bundled plugin dependency').toBe('12.11.6')
    expect(manifest.peerDependencies?.['@xyflow/react']).toBeUndefined()
    expect(manifest.devDependencies?.['@xyflow/react']).toBeUndefined()
  })

  it('keeps react/react-dom out of the plugin dependencies (host supplies the single instance)', () => {
    expect(manifest.dependencies?.react).toBeUndefined()
    expect(manifest.dependencies?.['react-dom']).toBeUndefined()
    expect(manifest.peerDependencies?.react).toBeUndefined()
    expect(manifest.peerDependencies?.['react-dom']).toBeUndefined()
  })
})
