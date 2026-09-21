import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPluginBundlesConfig, PluginBundlesConfigError } from '../src/main/host-profile/index.ts'

// Task 2 AC1 + Implementation Note "配置缺失/损坏/非法时壳启动行为要有明确处理":
// the product-level plugin-bundles config is the single source of truth for the
// plugin tree, so every malformed shape fails loud with one error type (the
// shell routes it to the explicit start-failed path — never a silent crash).

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-plugin-bundles-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

function writeConfig(value: unknown): string {
  const scratch = makeScratch()
  const path = join(scratch, 'plugin-bundles.json')
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, undefined, 2)}\n`)
  return path
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

describe('loadPluginBundlesConfig (task 2 AC1)', () => {
  it('loads a valid config with official and source-carrying entries', () => {
    const path = writeConfig({
      bundles: [
        { name: '@deepseek-ai/dsh-base' },
        { name: '@deepseek-ai/dsh-web-app' },
        { name: '@dsh-forge/plugin-hello-world', source: 'workspace:packages/plugins/hello-world' },
      ],
    })
    const config = loadPluginBundlesConfig(path)
    expect(config.bundles).toEqual([
      { name: '@deepseek-ai/dsh-base' },
      { name: '@deepseek-ai/dsh-web-app' },
      { name: '@dsh-forge/plugin-hello-world', source: 'workspace:packages/plugins/hello-world' },
    ])
  })

  it('fails loud when the config file is missing', () => {
    const path = join(makeScratch(), 'plugin-bundles.json')
    expect(() => loadPluginBundlesConfig(path)).toThrow(PluginBundlesConfigError)
    expect(() => loadPluginBundlesConfig(path)).toThrow(/not found/u)
  })

  it('fails loud on corrupt JSON', () => {
    const path = writeConfig('{ "bundles": [')
    expect(() => loadPluginBundlesConfig(path)).toThrow(PluginBundlesConfigError)
    expect(() => loadPluginBundlesConfig(path)).toThrow(/valid JSON/u)
  })

  it('fails loud when the root is not an object', () => {
    for (const root of [['x'], 3, null]) {
      const path = writeConfig(root)
      expect(() => loadPluginBundlesConfig(path), JSON.stringify(root)).toThrow(/must hold a JSON object/u)
    }
    const stringRoot = join(makeScratch(), 'plugin-bundles.json')
    writeFileSync(stringRoot, '"x"\n')
    expect(() => loadPluginBundlesConfig(stringRoot)).toThrow(/must hold a JSON object/u)
  })

  it('fails loud on a missing / non-array / empty bundles list', () => {
    for (const value of [{}, { bundles: 'x' }, { bundles: [] }, { bundles: {} }]) {
      const path = writeConfig(value)
      expect(() => loadPluginBundlesConfig(path), JSON.stringify(value)).toThrow(/bundles/u)
    }
  })

  it('fails loud on malformed entries and names', () => {
    const badNames = ['', 'has space', 'a/b/c', 'pkg@1.2.3', 'pkg@', ' lead', 'trailing/', 7, null]
    for (const name of badNames) {
      const path = writeConfig({ bundles: [{ name }] })
      expect(() => loadPluginBundlesConfig(path), `name=${JSON.stringify(name)}`).toThrow(/invalid bundle name/u)
    }
    for (const entry of ['x', 3, null, {}]) {
      const path = writeConfig({ bundles: [entry] })
      expect(() => loadPluginBundlesConfig(path), JSON.stringify(entry)).toThrow(PluginBundlesConfigError)
    }
  })

  it('fails loud on duplicate bundle names', () => {
    const path = writeConfig({ bundles: [{ name: '@deepseek-ai/dsh-base' }, { name: '@deepseek-ai/dsh-base' }] })
    expect(() => loadPluginBundlesConfig(path)).toThrow(/duplicate/u)
  })

  it('fails loud on unknown root or entry keys', () => {
    const unknownRoot = writeConfig({ bundles: [{ name: 'a' }], soruce: 'typo' })
    expect(() => loadPluginBundlesConfig(unknownRoot)).toThrow(/unknown key/u)
    const unknownEntry = writeConfig({ bundles: [{ name: 'a', soruce: 'typo' }] })
    expect(() => loadPluginBundlesConfig(unknownEntry)).toThrow(/unknown key/u)
  })

  it('fails loud on invalid source specs', () => {
    const badSources = [
      '', 'workspace:', 'workspace:/abs/path', 'workspace:\\abs', 'workspace:../escape', 'workspace:a/../b',
      'npm:foo', 'file:../x', 'xworkspace:a', 'tarball:foo.tar', 'tarball:/abs/x.tgz', 'tarball:../up.tgz',
      'tarball:sub/dir/../evil.tgz', 'tarball:has<chars>.tgz', 'xtarball:a.tgz', 7,
    ]
    for (const source of badSources) {
      const path = writeConfig({ bundles: [{ name: '@dsh-forge/plugin-x', source }] })
      expect(() => loadPluginBundlesConfig(path), `source=${JSON.stringify(source)}`).toThrow(/invalid source/u)
    }
  })

  // Task 6: the packaged distribution form (spike-report §4.1) grows the
  // source vocabulary with `tarball:<resources-relative .tgz>` — the artifact
  // staged next to the config in app resources, unpacked by the shell at
  // reconciliation. Validation stays strict: relative, .tgz, no traversal.
  it('accepts tarball sources alongside workspace sources', () => {
    const path = writeConfig({
      bundles: [
        { name: '@deepseek-ai/dsh-base' },
        { name: '@dsh-forge/plugin-hello-world', source: 'tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz' },
        { name: '@dsh-forge/plugin-dev', source: 'workspace:packages/plugins/dev' },
      ],
    })
    const config = loadPluginBundlesConfig(path)
    expect(config.bundles).toEqual([
      { name: '@deepseek-ai/dsh-base' },
      { name: '@dsh-forge/plugin-hello-world', source: 'tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz' },
      { name: '@dsh-forge/plugin-dev', source: 'workspace:packages/plugins/dev' },
    ])
  })
})
