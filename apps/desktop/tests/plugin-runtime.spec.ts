import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadPluginBundlesConfig,
  projectHostProfile,
} from '../src/main/host-profile/index.ts'
import { createPluginFace, readPluginManifestBundles } from '../src/main/workbench/ipc/plugins.ts'
import { createPluginEnableGuard, PluginMandatoryError } from '../src/main/plugin-runtime/guard.ts'
import { readPluginRuntimeOverlay, writePluginRuntimeOverlay } from '../src/main/plugin-runtime/overlay.ts'

// Task 3.1 — dual-layer mandatory-plugin protection (tech-design §Interface 4,
// threat T5): the product manifest's read-only mandatory partition, the userData
// plugin-runtime.json overlay (third-party only), and the single-write-path
// guard. Four AC groups: 必备恒载 (mandatory always loads despite disabled),
// 写入拒绝 (guard rejects/cleans pre-write), 畸形重建 (malformed overlay
// isolated + rebuilt, startup unblocked), 清单只读 (product manifest bytes
// never change through toggle operations).

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-plugin-runtime-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** In-memory structured-log collector (the modules' injectable log seam). */
function collector(): { warn: { code: string; data?: unknown }[]; log: { warn(entry: { code: string; data?: unknown }): void } } {
  const warn: { code: string; data?: unknown }[] = []
  return { warn, log: { warn: (entry: { code: string; data?: unknown }) => { warn.push(entry) } } }
}

/** A scratch fixture: product manifest (dsh-base mandatory + hello-world) + overlay path + office assets. */
function makeFixture() {
  const root = makeScratch()
  const manifest = join(root, 'resources', 'plugin-bundles.json')
  const overlayPath = join(root, 'user', 'plugin-runtime.json')
  mkdirSync(join(root, 'resources'), { recursive: true })
  mkdirSync(join(root, 'user'), { recursive: true })
  writeFileSync(manifest, `${JSON.stringify({
    bundles: [
      { name: '@deepseek-ai/dsh-base', mandatory: true },
      { name: 'hello-world' },
    ],
  }, undefined, 2)}\n`)
  return { root, manifest, overlayPath }
}

function projectWithOverlay(root: string, manifest: string, overlayPath: string) {
  return projectHostProfile({
    profileDir: join(root, 'host-profile'),
    officeSkillsSource: join(root, 'office-assets'),
    bundles: loadPluginBundlesConfig(manifest).bundles,
    overlayPath,
  })
}

function profileBundles(root: string): string[] {
  const parsed = JSON.parse(readFileSync(join(root, 'host-profile', 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
  return parsed.dsh?.profile?.bundles ?? []
}

describe('3.1 mandatory partition: config convention + host-profile consumption (必备恒载)', () => {
  it('loadPluginBundlesConfig accepts mandatory: true and rejects any other mandatory value', () => {
    const { manifest } = makeFixture()
    const config = loadPluginBundlesConfig(manifest)
    expect(config.bundles.map(entry => ({ name: entry.name, mandatory: entry.mandatory ?? false }))).toEqual([
      { name: '@deepseek-ai/dsh-base', mandatory: true },
      { name: 'hello-world', mandatory: false },
    ])

    const scratch = makeScratch()
    const write = (text: string) => {
      mkdirSync(scratch, { recursive: true })
      writeFileSync(join(scratch, 'plugin-bundles.json'), text)
      return join(scratch, 'plugin-bundles.json')
    }
    expect(() => loadPluginBundlesConfig(write(JSON.stringify({ bundles: [{ name: 'a', mandatory: false }] })))).toThrow(/invalid mandatory/u)
    expect(() => loadPluginBundlesConfig(write(JSON.stringify({ bundles: [{ name: 'a', mandatory: 'yes' }] })))).toThrow(/invalid mandatory/u)
  })

  it('mandatory bundles assemble even when the overlay disables them; third-party ones are held out', () => {
    const { root, manifest, overlayPath } = makeFixture()
    writePluginRuntimeOverlay(overlayPath, ['@deepseek-ai/dsh-base', 'hello-world'])
    projectWithOverlay(root, manifest, overlayPath)
    // dsh-base is mandatory: the overlay cannot remove it from the assembly
    expect(profileBundles(root)).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('a missing overlay is the empty overlay: every config bundle assembles (all enabled)', () => {
    const { root, manifest, overlayPath } = makeFixture()
    projectWithOverlay(root, manifest, overlayPath)
    expect(profileBundles(root)).toEqual(['@deepseek-ai/dsh-base', 'hello-world'])
    expect(existsSync(overlayPath)).toBe(false) // reads never conjure the file
  })

  it('re-enabling restores the held-out bundle through the same reconciliation', () => {
    const { root, manifest, overlayPath } = makeFixture()
    writePluginRuntimeOverlay(overlayPath, ['hello-world'])
    projectWithOverlay(root, manifest, overlayPath)
    expect(profileBundles(root)).toEqual(['@deepseek-ai/dsh-base'])

    writePluginRuntimeOverlay(overlayPath, [])
    projectWithOverlay(root, manifest, overlayPath)
    expect(profileBundles(root)).toEqual(['@deepseek-ai/dsh-base', 'hello-world'])
  })

  it('overlay entries naming mandatory bundles are stripped at load with ERR_PLUGIN_RUNTIME_STATE (T5 layer 2)', () => {
    const { manifest, overlayPath } = makeFixture()
    writeFileSync(overlayPath, JSON.stringify({ disabled: ['@deepseek-ai/dsh-base', 'hello-world'] }))
    const seen = collector()
    const bundles = readPluginManifestBundles(manifest)
    const overlay = readPluginRuntimeOverlay(overlayPath, bundles, seen.log)
    expect([...overlay.disabled]).toEqual(['hello-world']) // mandatory name cut
    expect(seen.warn.some(entry => entry.code === 'ERR_PLUGIN_RUNTIME_STATE')).toBe(true)
  })
})

describe('3.1 single write path: guard rejection + pre-write cleaning (写入拒绝/清单只读)', () => {
  it('the real guard rejects mandatory disable requests before any write, with the ERR_PLUGIN_MANDATORY log', () => {
    const { manifest, overlayPath } = makeFixture()
    const seen = collector()
    const guard = createPluginEnableGuard(() => readPluginManifestBundles(manifest), seen.log)

    let rejection: unknown
    try {
      guard.assertCanBeDisabled('@deepseek-ai/dsh-base')
    } catch (error) {
      rejection = error
    }
    expect(rejection).toBeInstanceOf(PluginMandatoryError)
    expect((rejection as PluginMandatoryError).code).toBe('ERR_PLUGIN_MANDATORY')
    expect(seen.warn.some(entry => entry.code === 'ERR_PLUGIN_MANDATORY')).toBe(true)
    expect(existsSync(overlayPath)).toBe(false) // nothing written on the rejected path
  })

  it('setPluginEnabled round-trips third-party state through the real guard; a tampered mandatory entry is cleaned pre-write', () => {
    const { manifest, overlayPath } = makeFixture()
    const pluginFace = createPluginFace({
      manifestPath: manifest,
      overlayPath,
      guard: createPluginEnableGuard(() => readPluginManifestBundles(manifest)),
    })

    // hand-tampered overlay smuggles a mandatory name in
    writeFileSync(overlayPath, JSON.stringify({ disabled: ['@deepseek-ai/dsh-base'] }))
    pluginFace.setEnabled('hello-world', false)
    // the write path persists only third-party names — the mandatory entry never lands
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: ['hello-world'] })

    const rows = pluginFace.setEnabled('hello-world', true)
    expect(rows.find(row => row.name === 'hello-world')).toMatchObject({ enabled: true, mandatory: false })
    expect(rows.find(row => row.name === '@deepseek-ai/dsh-base')).toMatchObject({ enabled: true, mandatory: true })
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: [] })
  })

  it('the product manifest is byte-identical after any toggle operations (runtime read-only)', () => {
    const { manifest, overlayPath } = makeFixture()
    const pluginFace = createPluginFace({
      manifestPath: manifest,
      overlayPath,
      guard: createPluginEnableGuard(() => readPluginManifestBundles(manifest)),
    })
    const before = readFileSync(manifest, 'utf8')

    pluginFace.setEnabled('hello-world', false)
    pluginFace.setEnabled('hello-world', true)
    pluginFace.setEnabled('hello-world', false)
    expect(() => pluginFace.setEnabled('@deepseek-ai/dsh-base', false)).toThrow(PluginMandatoryError)

    expect(readFileSync(manifest, 'utf8')).toBe(before)
  })
})

describe('3.1 malformed overlay: isolate + rebuild without blocking startup (畸形重建)', () => {
  it('corrupt JSON is isolated as .corrupt-* and an empty overlay is rebuilt', () => {
    const { manifest, overlayPath } = makeFixture()
    writeFileSync(overlayPath, '{ not json')
    const seen = collector()
    const bundles = readPluginManifestBundles(manifest)

    const overlay = readPluginRuntimeOverlay(overlayPath, bundles, seen.log)
    expect([...overlay.disabled]).toEqual([])
    expect(seen.warn.some(entry => entry.code === 'ERR_PLUGIN_RUNTIME_STATE')).toBe(true)
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: [] }) // rebuilt empty

    const isolated = readdirSync(dirname(overlayPath)).find(name => name.startsWith('plugin-runtime.json.corrupt-'))
    expect(isolated).toBeDefined()
    expect(readFileSync(join(dirname(overlayPath), isolated as string), 'utf8')).toBe('{ not json') // original preserved
  })

  it('unknown fields and a missing/non-array disabled are isolated + rebuilt the same way', () => {
    const { manifest, overlayPath } = makeFixture()
    const bundles = readPluginManifestBundles(manifest)

    writeFileSync(overlayPath, JSON.stringify({ disabled: [], enabled: ['hello-world'] }))
    expect([...readPluginRuntimeOverlay(overlayPath, bundles, collector().log).disabled]).toEqual([])
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: [] })

    writeFileSync(overlayPath, JSON.stringify({}))
    expect([...readPluginRuntimeOverlay(overlayPath, bundles, collector().log).disabled]).toEqual([])
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: [] })
  })

  it('a malformed overlay never blocks startup: projection completes with every bundle assembled', () => {
    const { root, manifest, overlayPath } = makeFixture()
    writeFileSync(overlayPath, '{ not json')

    const lines: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      lines.push(String(chunk))
      return true
    }) as typeof process.stdout.write)

    expect(() => projectWithOverlay(root, manifest, overlayPath)).not.toThrow()
    expect(profileBundles(root)).toEqual(['@deepseek-ai/dsh-base', 'hello-world']) // empty overlay = all enabled
    expect(lines.some(line => line.includes('ERR_PLUGIN_RUNTIME_STATE'))).toBe(true)
    expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toEqual({ disabled: [] }) // isolated + rebuilt
  })
})
