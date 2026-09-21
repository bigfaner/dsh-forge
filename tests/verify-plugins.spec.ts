import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
  ALIGNMENT_FAMILY_PREFIX,
  INDEPENDENT_LINE_PACKAGES,
  checkPluginVersionAlignment,
  checkVersionStamps,
  extractModuleSpecifiers,
  isExactVersion,
  loadBaseline,
  makeVersionStamp,
  printHumanReport,
  runCli,
  runGate,
  scanArtifactModuleSources,
  scanManifestModuleSources,
} from '../scripts/verify-plugins.mjs'

const testsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(testsDir, '..')

// --- fixtures ---------------------------------------------------------------

// Minimal synthetic lock: same shape as vendor/upstream.lock.json, values chosen
// so a mismatch against real values is impossible to miss in failures.
const FIXTURE_LOCK = {
  pinnedSha: 'deadbeef'.repeat(5),
  desktopHostVersion: '0.1.6-alpha.2',
  packages: [
    { name: '@deepseek-ai/cordis', version: '4.0.2', dir: 'vendor/cordis', fileCount: 1 },
    { name: '@deepseek-ai/dsh-desktop-host', version: '0.1.6-alpha.2', dir: 'apps/desktop-host', fileCount: 1 },
  ],
}

const FIXTURE_BASELINE = {
  pinnedSha: FIXTURE_LOCK.pinnedSha,
  desktopHostVersion: '0.1.6-alpha.2',
  cordisVersion: '4.0.2',
}

function pluginFixture(overrides: Record<string, any> = {}) {
  return {
    name: '@dsh-forge/plugin-fixture',
    dir: 'packages/plugins/fixture',
    manifest: {
      peerDependencies: {
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh-client-store': '0.1.6-alpha.2',
        '@deepseek-ai/dsh-client-ui-chat': '0.1.6-alpha.2',
      },
      devDependencies: {
        '@deepseek-ai/dsh-client-store': '0.1.6-alpha.2',
        react: '18.3.1',
      },
    },
    ...overrides,
  }
}

// Modelled on the real tsdown client bundle shape (window.__ModuleLoader__.load
// wrapper with require() externals) so extraction is proven against bundle syntax.
const CLEAN_CLIENT_BUNDLE = `window.__ModuleLoader__.load({
\tid: "@dsh-forge/plugin-fixture",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tlet react_jsx_runtime = require("react/jsx-runtime");
\t\tlet store = require("@deepseek-ai/dsh-client-store");
\t\tconst x = await import("./inline-helper");
\t\treturn module.exports;
\t}
});`

function makeTmpWorkspace(plugins: Array<{ name: string, manifest: any, artifacts?: Record<string, string>, stamp?: any }>) {
  const root = mkdtempSync(join(tmpdir(), 'verify-plugins-test-'))
  mkdirSync(join(root, 'vendor'), { recursive: true })
  writeFileSync(join(root, 'vendor', 'upstream.lock.json'), JSON.stringify(FIXTURE_LOCK, null, 2))
  for (const p of plugins) {
    const dir = join(root, 'packages', 'plugins', p.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(p.manifest, null, 2))
    for (const [file, code] of Object.entries(p.artifacts ?? {})) {
      const target = join(dir, file)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, code)
    }
    if (p.stamp !== undefined) {
      writeFileSync(join(dir, 'version-stamp.json'), JSON.stringify(p.stamp, null, 2))
    }
  }
  return root
}

// --- AC-1: explicit comparison set, exact + aligned --------------------------

describe('isExactVersion', () => {
  it('accepts plain exact semver, including prerelease and build suffixes', () => {
    expect(isExactVersion('0.1.6-alpha.2')).toBe(true)
    expect(isExactVersion('4.0.2')).toBe(true)
    expect(isExactVersion('1.2.3')).toBe(true)
    expect(isExactVersion('1.2.3-beta.1+build.5')).toBe(true)
  })

  it('rejects ranges, tags, x-ranges and protocol specs', () => {
    for (const bad of ['^0.1.6-alpha.2', '~0.1.6', '>=0.1.0', '0.1.x', '*', 'latest', 'alpha', '', 'workspace:*', 'workspace:^', 'file:../x', 'link:../x', 'npm:foo@1.0.0']) {
      expect(isExactVersion(bad), `spec "${bad}"`).toBe(false)
    }
  })
})

describe('checkPluginVersionAlignment (AC-1 comparison set)', () => {
  it('enumerates the comparison set as the dsh-client family prefix + cordis independent line', () => {
    expect(ALIGNMENT_FAMILY_PREFIX).toBe('@deepseek-ai/dsh-client-')
    expect(INDEPENDENT_LINE_PACKAGES).toEqual(['@deepseek-ai/cordis'])
  })

  it('passes exact aligned deps and does not flag cordis as misaligned (AC-3 no false positive)', () => {
    const report = checkPluginVersionAlignment([pluginFixture()], FIXTURE_BASELINE)
    expect(report.ok).toBe(true)
    expect(report.violations).toEqual([])
  })

  it('flags exact-but-mismatched alignment-line versions (AC-2 red light)', () => {
    const plugin = pluginFixture({
      manifest: {
        peerDependencies: { '@deepseek-ai/dsh-client-store': '0.1.5-rc.2' },
      },
    })
    const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
    expect(report.ok).toBe(false)
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0].detail).toContain('0.1.5-rc.2')
    expect(report.violations[0].detail).toContain('desktopHostVersion')
  })

  it('flags every non-exact form on the alignment line (range, tag, workspace, file)', () => {
    for (const bad of ['^0.1.6-alpha.2', 'alpha', 'workspace:*', 'file:../../vendor/x']) {
      const plugin = pluginFixture({
        manifest: { peerDependencies: { '@deepseek-ai/dsh-client-ui-slots': bad } },
      })
      const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
      expect(report.ok, `spec "${bad}"`).toBe(false)
      expect(report.violations[0].detail).toContain('exact')
      expect(report.violations[0].detail).toContain(bad)
    }
  })

  it('treats cordis as an independent line: exact version is never compared with desktopHostVersion', () => {
    const plugin = pluginFixture({
      manifest: { peerDependencies: { '@deepseek-ai/cordis': '9.9.9' } },
    })
    const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
    expect(report.ok).toBe(true)
  })

  it('still requires exactness on the cordis independent line', () => {
    const plugin = pluginFixture({
      manifest: { peerDependencies: { '@deepseek-ai/cordis': '^4.0.2' } },
    })
    const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
    expect(report.ok).toBe(false)
    expect(report.violations[0].detail).toContain('independent version line')
  })

  it('leaves non-family deps outside the comparison set (react, @deepseek-ai/dsh-llm)', () => {
    const plugin = pluginFixture({
      manifest: {
        devDependencies: {
          react: '^18.3.1',
          '@deepseek-ai/dsh-llm': '^0.1.6-alpha.2',
          zustand: 'workspace:*',
        },
      },
    })
    const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
    expect(report.ok).toBe(true)
  })

  it('checks every dependency field, not only peerDependencies', () => {
    const plugin = pluginFixture({
      manifest: {
        dependencies: { '@deepseek-ai/dsh-client-locale': '0.1.5' },
        peerDependencies: { '@deepseek-ai/dsh-client-locale': '0.1.6-alpha.2' },
      },
    })
    const report = checkPluginVersionAlignment([plugin], FIXTURE_BASELINE)
    expect(report.ok).toBe(false)
    expect(report.violations[0].detail).toContain('dependencies')
  })
})

// --- AC-4: artifact-level vendored scan --------------------------------------

describe('extractModuleSpecifiers', () => {
  it('extracts require/import/export-from/dynamic-import specifiers from bundle code', () => {
    const code = [
      'const a = require("react/jsx-runtime")',
      'const b = require(\'@deepseek-ai/dsh-client-store\')',
      'const c = await import("./lazy")',
      'import side from "react"',
      'export * from "../other"',
      'const r = require.resolve("path")',
    ].join('\n')
    const specifiers = extractModuleSpecifiers(code).map((s) => s.specifier).sort()
    expect(specifiers).toEqual(['../other', './lazy', '@deepseek-ai/dsh-client-store', 'path', 'react', 'react/jsx-runtime'])
  })
})

describe('scanArtifactModuleSources (AC-4 artifact scan)', () => {
  const plugin = { name: 'fixture', dir: 'packages/plugins/fixture' }

  it('passes clean bundles: bare specifiers and non-vendor relative imports stay green', () => {
    const report = scanArtifactModuleSources(plugin, [{ path: join(repoRoot, 'packages/plugins/fixture/lib/client.js'), code: CLEAN_CLIENT_BUNDLE }], repoRoot)
    expect(report.violations).toEqual([])
    expect(report.specifierCount).toBeGreaterThan(0)
  })

  it('reds on a relative require resolving into the vendored tree', () => {
    const code = 'const x = require("../../../../vendor/cordis/lib/index.js")'
    const artifactDir = join(repoRoot, 'packages/plugins/fixture/lib')
    const report = scanArtifactModuleSources(plugin, [{ path: join(artifactDir, 'client.js'), code }], repoRoot)
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0].detail).toContain('vendored')
    expect(report.violations[0].detail).toContain('vendor/cordis')
  })

  it('reds on an absolute path whose specifier itself carries a vendor/ segment', () => {
    const code = 'const x = require("/usr/local/src/deepseek-harness/vendor/cordis/lib/index.js")'
    const report = scanArtifactModuleSources(plugin, [{ path: join(repoRoot, 'packages/plugins/fixture/lib/client.js'), code }], repoRoot)
    expect(report.violations.length).toBe(1)
    expect(report.violations[0].detail).toContain('vendored')
  })

  it('reds on a file: URL pointing into the repo', () => {
    const url = pathToFileURL(join(repoRoot, 'vendor', 'some-module.js')).href
    const code = `const x = await import("${url}")`
    const report = scanArtifactModuleSources(plugin, [{ path: join(repoRoot, 'packages/plugins/fixture/lib/client.js'), code }], repoRoot)
    expect(report.violations.length).toBe(1)
    expect(report.violations[0].detail).toContain('file:')
  })

  it('reds on a resolution into the desktop-host-vendor projection tree', () => {
    const code = 'const x = require("../../../../packages/desktop-host-vendor/vendored/packages/core/src/index.ts")'
    const artifactDir = join(repoRoot, 'packages/plugins/fixture/lib')
    const report = scanArtifactModuleSources(plugin, [{ path: join(artifactDir, 'client.js'), code }], repoRoot)
    expect(report.violations.length).toBe(1)
    expect(report.violations[0].detail).toContain('desktop-host-vendor')
  })
})

describe('scanManifestModuleSources (AC-4 manifest leg)', () => {
  it('reds on file:/link:/workspace:/path-form dependency specs pointing into the repo', () => {
    const plugin = pluginFixture({
      manifest: {
        dependencies: { '@deepseek-ai/cordis': 'file:../../vendor/cordis' },
        devDependencies: { '@deepseek-ai/dsh-client-store': 'link:../../../shared/store' },
        peerDependencies: { '@deepseek-ai/dsh-client-ui-slots': 'workspace:*' },
      },
    })
    const report = scanManifestModuleSources([plugin], repoRoot)
    const fields = report.violations.map((v) => v.detail)
    expect(report.ok).toBe(false)
    expect(fields.some((d) => d.includes('file:'))).toBe(true)
    expect(fields.some((d) => d.includes('link:'))).toBe(true)
    expect(fields.some((d) => d.includes('workspace:'))).toBe(true)
  })

  it('passes plain npm registry specs', () => {
    const plugin = pluginFixture()
    const report = scanManifestModuleSources([plugin], repoRoot)
    expect(report.ok).toBe(true)
    expect(report.violations).toEqual([])
  })
})

// --- AC-5: version stamp -----------------------------------------------------

describe('version stamp (AC-5 template mechanism)', () => {
  it('derives a deterministic stamp from the same baseline source', () => {
    expect(makeVersionStamp(FIXTURE_BASELINE)).toEqual({
      source: 'vendor/upstream.lock.json',
      pinnedSha: FIXTURE_BASELINE.pinnedSha,
      desktopHostVersion: '0.1.6-alpha.2',
      cordisVersion: '4.0.2',
    })
  })

  it('greens on a stamp in sync with the lock', () => {
    const report = checkVersionStamps([{ name: 'fixture', dir: 'packages/plugins/fixture', stamp: makeVersionStamp(FIXTURE_BASELINE) }], FIXTURE_BASELINE)
    expect(report.ok).toBe(true)
  })

  it('reds on a stale stamp (upstream bumped, stamp not regenerated)', () => {
    const stale = { ...makeVersionStamp(FIXTURE_BASELINE), desktopHostVersion: '0.1.5-rc.2' }
    const report = checkVersionStamps([{ name: 'fixture', dir: 'packages/plugins/fixture', stamp: stale }], FIXTURE_BASELINE)
    expect(report.ok).toBe(false)
    expect(report.violations[0].detail).toContain('0.1.5-rc.2')
    expect(report.violations[0].detail).toContain('0.1.6-alpha.2')
  })

  it('reds on an incomplete stamp', () => {
    const partial = { desktopHostVersion: '0.1.6-alpha.2' }
    const report = checkVersionStamps([{ name: 'fixture', dir: 'packages/plugins/fixture', stamp: partial }], FIXTURE_BASELINE)
    expect(report.ok).toBe(false)
    expect(report.violations[0].detail).toContain('pinnedSha')
  })
})

// --- gate over the real workspace (AC-3 green + AC-4 integration) ------------

describe('runGate on the real workspace', () => {
  it('reads the real lock baseline', () => {
    const baseline = loadBaseline(repoRoot)
    expect(baseline.desktopHostVersion).toBe('0.1.6-alpha.2')
    expect(baseline.pinnedSha).toMatch(/^[0-9a-f]{40}$/)
    expect(baseline.cordisVersion).toBe('4.0.2')
  })

  it('greens: aligned deps, cordis exact, vendored-free artifacts, stamp in sync (AC-3)', () => {
    const report = runGate(repoRoot)
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
    // evidence the scan actually ran over real plugin artifacts
    expect(report.scanned.artifacts).toBeGreaterThan(0)
    expect(report.scanned.specifiers).toBeGreaterThan(0)
    expect(report.plugins.map((p) => p.name).sort()).toEqual([
      '@dsh-forge/plugin-hello-world',
      '@dsh-forge/plugin-hello-world-collision',
    ])
  })

  it('reds with explicit guidance when plugin build artifacts are missing (no silent skip)', () => {
    const root = makeTmpWorkspace([{ name: 'fixture', manifest: pluginFixture().manifest }])
    try {
      const report = runGate(root)
      expect(report.ok).toBe(false)
      expect(report.violations[0].detail).toContain('artifacts missing')
      expect(report.violations[0].detail).toContain('verify:plugins')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// --- AC-2: red-light reproduction through the CLI ----------------------------

describe('CLI red-light reproduction (AC-2)', () => {
  const cli = join(testsDir, '..', 'scripts', 'verify-plugins.mjs')

  function runCliAt(root: string) {
    return spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' })
  }

  it('exits 1 with violation output when an alignment-line dependency is mismatched', () => {
    const mismatched = pluginFixture({
      manifest: {
        peerDependencies: {
          '@deepseek-ai/cordis': '4.0.2',
          '@deepseek-ai/dsh-client-store': '0.1.5-rc.2',
          '@deepseek-ai/dsh-client-ui-chat': '0.1.6-alpha.2',
        },
      },
    })
    const root = makeTmpWorkspace([{
      name: 'fixture',
      manifest: mismatched.manifest,
      artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE },
    }])
    try {
      const result = runCliAt(root)
      expect(result.status).toBe(1)
      expect(result.stdout).toContain('0.1.5-rc.2')
      expect(result.stdout).toContain('desktopHostVersion')
      expect(result.stdout.toLowerCase()).toContain('fail')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits 0 on a clean synthetic workspace', () => {
    const root = makeTmpWorkspace([{
      name: 'fixture',
      manifest: pluginFixture().manifest,
      artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE, 'lib/index.js': 'export function apply() {}\n' },
    }])
    try {
      const result = runCliAt(root)
      expect(result.status).toBe(0)
      expect(result.stdout.toLowerCase()).toContain('pass')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('--json emits machine-readable report', () => {
    const root = makeTmpWorkspace([{
      name: 'fixture',
      manifest: pluginFixture().manifest,
      artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE },
    }])
    try {
      const result = spawnSync(process.execPath, [cli, '--root', root, '--json'], { encoding: 'utf8' })
      const parsed = JSON.parse(result.stdout)
      expect(parsed.ok).toBe(true)
      expect(parsed.baseline.desktopHostVersion).toBe('0.1.6-alpha.2')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('--stamp <pluginDir> writes a stamp derived from the lock and exits 0 (template mechanism)', () => {
    const root = makeTmpWorkspace([{ name: 'fixture', manifest: pluginFixture().manifest, artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE } }])
    try {
      const result = spawnSync(process.execPath, [cli, '--root', root, '--stamp', 'packages/plugins/fixture'], { encoding: 'utf8' })
      expect(result.status).toBe(0)
      const stamp = JSON.parse(readFileSync(join(root, 'packages', 'plugins', 'fixture', 'version-stamp.json'), 'utf8'))
      expect(stamp).toEqual(makeVersionStamp(FIXTURE_BASELINE))
      // stamped workspace stays green end-to-end
      expect(spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' }).status).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('--stamp rejects malformed invocations with exit 2', () => {
    const root = makeTmpWorkspace([{ name: 'fixture', manifest: pluginFixture().manifest }])
    try {
      const noArg = spawnSync(process.execPath, [cli, '--root', root, '--stamp'], { encoding: 'utf8' })
      expect(noArg.status).toBe(2)
      const notAPlugin = spawnSync(process.execPath, [cli, '--root', root, '--stamp', 'packages/plugins/nope'], { encoding: 'utf8' })
      expect(notAPlugin.status).toBe(2)
      expect(notAPlugin.stderr).toContain('not a plugin package')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('loadBaseline throws with remediation when the lock is absent', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'verify-plugins-nolock-'))
    try {
      expect(() => loadBaseline(emptyRoot)).toThrow(/upstream lock not found/)
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }
  })
})

// --- CLI in-process (coverage of arg handling / stamp / render paths) -------

describe('runCli in-process', () => {
  it('returns 0 on a clean workspace and 1 on a mismatched one', () => {
    const clean = makeTmpWorkspace([{
      name: 'fixture',
      manifest: pluginFixture().manifest,
      artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE },
    }])
    const mismatched = makeTmpWorkspace([{
      name: 'fixture',
      manifest: pluginFixture({
        manifest: { peerDependencies: { '@deepseek-ai/dsh-client-store': '0.1.5-rc.2' } },
      }).manifest,
      artifacts: { 'lib/client.js': CLEAN_CLIENT_BUNDLE },
    }])
    try {
      expect(runCli(['node', 'verify-plugins.mjs', '--root', clean])).toBe(0)
      expect(runCli(['node', 'verify-plugins.mjs', '--root', mismatched])).toBe(1)
    } finally {
      rmSync(clean, { recursive: true, force: true })
      rmSync(mismatched, { recursive: true, force: true })
    }
  })

  it('printHumanReport renders per-check PASS/FAIL lines and violation details', () => {
    const clean = printHumanReport({
      baseline: { desktopHostVersion: '0.1.6-alpha.2', cordisVersion: '4.0.2', pinnedSha: 'deadbeef' },
      plugins: [{ name: 'p', dir: 'packages/plugins/p' }],
      scanned: { manifests: 1, artifacts: 2, specifiers: 3 },
      violations: [],
    })
    expect(clean).toContain('[PASS] version alignment')
    expect(clean).toContain('gate PASS')
    const red = printHumanReport({
      baseline: { desktopHostVersion: '0.1.6-alpha.2', cordisVersion: '4.0.2', pinnedSha: 'deadbeef' },
      plugins: [{ name: 'p', dir: 'packages/plugins/p' }],
      scanned: { manifests: 1, artifacts: 0, specifiers: 0 },
      violations: [
        { check: 'version-stamp', detail: '[version-stamp] stale' },
        { check: 'artifacts-missing', detail: '[artifacts-missing] nothing built' },
      ],
    })
    expect(red).toContain('FAIL version stamps in sync')
    expect(red).toContain('FAIL plugin build artifacts present')
    expect(red).toContain('[version-stamp] stale')
    expect(red).toContain('2 violation(s)')
  })
})

// sanity guard for the fixture helper itself (relative path stays inside repo)
describe('fixture workspace layout', () => {
  it('places synthetic plugins under packages/plugins inside the temp root', () => {
    const root = makeTmpWorkspace([{ name: 'fixture', manifest: pluginFixture().manifest }])
    try {
      const rel = relative(root, join(root, 'packages', 'plugins', 'fixture', 'package.json'))
      expect(rel).toBe(join('packages', 'plugins', 'fixture', 'package.json'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
