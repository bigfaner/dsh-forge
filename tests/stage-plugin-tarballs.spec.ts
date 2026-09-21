import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverPluginIndex, parseConfig, planStaging } from '../scripts/stage-plugin-tarballs.mjs'

// Task 6 (spike-report §4.1): the packaged leg stages `pnpm pack` artifacts of
// the workspace plugins into the app resources next to plugin-bundles.json,
// so the shipped config's `tarball:` sources resolve at runtime. Staging is
// CONFIG-DRIVEN on both ends: which plugins get staged and where they land
// derive from the product config (the single source of truth) — never from a
// hardcoded list (the same Hard Rule as the shell side, build side).

const scratches: string[] = []
function makeScratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-stage-plan-'))
  scratches.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

function makePluginWorkspace(pluginsRoot: string): void {
  const hello = join(pluginsRoot, 'hello-world')
  mkdirSync(hello, { recursive: true })
  writeFileSync(join(hello, 'package.json'), `${JSON.stringify({ name: '@dsh-forge/plugin-hello-world', version: '0.1.0' }, undefined, 2)}\n`)
  const fixture = join(pluginsRoot, 'hello-world-collision')
  mkdirSync(fixture, { recursive: true })
  writeFileSync(join(fixture, 'package.json'), `${JSON.stringify({ name: '@dsh-forge/plugin-hello-world-collision', version: '0.1.0' }, undefined, 2)}\n`)
}

describe('stage-plugin-tarballs planning', () => {
  it('parses the product config strictly', () => {
    expect(parseConfig({ bundles: [{ name: 'a' }, { name: 'b', source: 'tarball:x.tgz' }] }).bundles).toHaveLength(2)
    for (const bad of [{}, { bundles: [] }, { bundles: 'x' }, { bundles: [{}] }, { bundles: [{ name: 7 }] }]) {
      expect(() => parseConfig(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('plans staging for tarball-sourced entries only, resolved by package name', () => {
    const scratch = makeScratch()
    const pluginsRoot = join(scratch, 'packages', 'plugins')
    makePluginWorkspace(pluginsRoot)
    const index = discoverPluginIndex(pluginsRoot)
    const config = parseConfig({
      bundles: [
        { name: '@deepseek-ai/dsh-base' },
        { name: '@deepseek-ai/dsh-web-app' },
        { name: '@dsh-forge/plugin-hello-world', source: 'tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz' },
      ],
    })
    const plan = planStaging(config, index)
    expect(plan).toEqual([{
      bundleName: '@dsh-forge/plugin-hello-world',
      sourceRel: 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz',
      pluginDir: join(pluginsRoot, 'hello-world'),
      version: '0.1.0',
    }])
  })

  it('fails loud when a config tarball entry has no matching workspace plugin', () => {
    const scratch = makeScratch()
    const pluginsRoot = join(scratch, 'packages', 'plugins')
    makePluginWorkspace(pluginsRoot)
    const index = discoverPluginIndex(pluginsRoot)
    const config = parseConfig({
      bundles: [{ name: '@dsh-forge/plugin-ghost', source: 'tarball:plugin-tarballs/ghost.tgz' }],
    })
    expect(() => planStaging(config, index)).toThrow(/@dsh-forge\/plugin-ghost/u)
  })
})
