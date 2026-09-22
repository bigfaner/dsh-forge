#!/usr/bin/env node
/**
 * stage-plugin-tarballs.mjs — ui-plugin-foundation task 6 packaging staging
 * step (spike-report §4.1: "tarball built-in + shell-side pre-seeding").
 *
 * Packs the workspace plugins the product config references via `tarball:`
 * sources (pnpm pack — the exact artifact a third party would install) and
 * stages them next to plugin-bundles.json in the app resources, where both
 * the dev shell (apps/desktop/resources) and electron-builder's extraResources
 * (apps/desktop/build/electron-builder.config.mjs, filter 'plugin-tarballs/**')
 * pick them up. The shell unpacks them into the userData host profile at
 * startup reconciliation — zero pnpm, zero network at materialization.
 *
 * Staging is config-driven on both ends (same Hard Rule as the shell side,
 * build side): WHICH plugins are staged and WHERE they land derive from
 * apps/desktop/resources/plugin-bundles.json — never from a hardcoded list.
 * The staged artifact filename must equal the config-declared basename, so a
 * plugin version bump without a config edit fails loud instead of mis-naming.
 *
 * Usage:
 *   pnpm build:plugins && node scripts/stage-plugin-tarballs.mjs
 *   node scripts/stage-plugin-tarballs.mjs --check   (verify staged files exist)
 * Exit 0 on success; 1 on failure.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const CONFIG_PATH = join('apps', 'desktop', 'resources', 'plugin-bundles.json')
const RESOURCES_ROOT = join('apps', 'desktop', 'resources')
const PLUGINS_ROOT = join('packages', 'plugins')

/**
 * Strictly parse the product config (build-side face of the shell loader).
 * @param {unknown} value - parsed JSON of plugin-bundles.json.
 * @returns {{ bundles: Array<{ name: string, source?: string }> }}
 */
export function parseConfig(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('plugin-bundles config must hold a JSON object')
  const bundles = value.bundles
  if (!Array.isArray(bundles) || bundles.length === 0) throw new Error('"bundles" must be a non-empty array')
  return {
    bundles: bundles.map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('every bundle entry must hold a JSON object')
      if (typeof entry.name !== 'string' || entry.name === '') throw new Error('every bundle entry needs a string name')
      const source = entry.source === undefined ? undefined : entry.source
      if (source !== undefined && typeof source !== 'string') throw new Error(`bundle ${entry.name}: source must be a string`)
      return { name: entry.name, ...(source === undefined ? {} : { source }) }
    }),
  }
}

/**
 * Index the workspace plugin packages by package name.
 * @param {string} pluginsRoot - packages/plugins.
 * @returns {Map<string, { dir: string, version: string }>}
 */
export function discoverPluginIndex(pluginsRoot) {
  const index = new Map()
  if (!existsSync(pluginsRoot)) return index
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(pluginsRoot, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue
    index.set(manifest.name, { dir, version: manifest.version })
  }
  return index
}

/**
 * Derive the staging plan from the config: one item per `tarball:` entry,
 * resolved to its workspace plugin package.
 * @param {{ bundles: Array<{ name: string, source?: string }> }} config
 * @param {Map<string, { dir: string, version: string }>} pluginIndex
 * @returns {Array<{ bundleName: string, sourceRel: string, pluginDir: string, version: string }>}
 */
export function planStaging(config, pluginIndex) {
  const plan = []
  for (const entry of config.bundles) {
    if (entry.source === undefined || !entry.source.startsWith('tarball:')) continue
    const sourceRel = entry.source.slice('tarball:'.length)
    const plugin = pluginIndex.get(entry.name)
    if (plugin === undefined) {
      throw new Error(`config declares tarball source for ${entry.name} but no workspace plugin package with that name exists under ${PLUGINS_ROOT}`)
    }
    plan.push({ bundleName: entry.name, sourceRel, pluginDir: plugin.dir, version: plugin.version })
  }
  return plan
}

/** pnpm pack one plugin into a scratch dir; returns the produced artifact path. */
function packPlugin(pluginDir, scratch) {
  if (!existsSync(join(pluginDir, 'lib', 'index.js'))) {
    throw new Error(`${pluginDir} has no built lib/index.js — run pnpm build:plugins first`)
  }
  // shell: true — pnpm is a .cmd shim on Windows and Node refuses to spawn
  // those without a shell; the argument list is fixed constants (no untrusted
  // input reaches this dev/CI-only build script).
  const result = spawnSync('pnpm', ['pack', '--pack-destination', scratch], { cwd: pluginDir, shell: true, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`pnpm pack failed in ${pluginDir}: ${(result.stderr ?? result.stdout ?? '').trim().slice(0, 500)}`)
  const produced = readdirSync(scratch).filter(name => name.endsWith('.tgz'))
  if (produced.length !== 1) throw new Error(`pnpm pack in ${pluginDir} produced ${String(produced.length)} tarballs (expected exactly 1)`)
  return join(scratch, produced[0])
}

function main() {
  const check = process.argv.includes('--check')
  if (!existsSync(CONFIG_PATH)) { console.error(`STAGE FAILED: config not found at ${CONFIG_PATH}`); process.exit(1) }
  const config = parseConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  const plan = planStaging(config, discoverPluginIndex(PLUGINS_ROOT))
  if (plan.length === 0) {
    console.log('STAGED_TARBALLS {"items":[]} — no tarball-sourced entries in the product config')
    return
  }

  if (check) {
    const missing = plan.filter(item => !existsSync(join(RESOURCES_ROOT, item.sourceRel)))
    if (missing.length > 0) {
      console.error(`STAGE CHECK FAILED: staged tarballs missing: ${missing.map(item => join(RESOURCES_ROOT, item.sourceRel)).join(', ')}`)
      process.exit(1)
    }
    console.log(`STAGE_CHECK OK — ${String(plan.length)} staged tarball(s) present`)
    return
  }

  const scratch = mkdtempSync(join(tmpdir(), 'dsh-forge-stage-tarballs-'))
  const staged = []
  try {
    for (const item of plan) {
      const artifact = packPlugin(item.pluginDir, scratch)
      if (basename(artifact) !== basename(item.sourceRel)) {
        throw new Error(`packed artifact ${basename(artifact)} does not match the config-declared ${basename(item.sourceRel)} for ${item.bundleName} — bump the config source path with the plugin version`)
      }
      const destination = join(RESOURCES_ROOT, item.sourceRel)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(artifact, destination)
      staged.push({
        bundle: item.bundleName,
        version: item.version,
        file: join('apps', 'desktop', 'resources', item.sourceRel),
        bytes: statSync(destination).size,
        sha256: createHash('sha256').update(readFileSync(destination)).digest('hex'),
      })
      // One scratch artifact per pack — clear for the next.
      rmSync(artifact, { force: true })
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(`STAGED_TARBALLS ${JSON.stringify({ items: staged })}`)
}

main()
