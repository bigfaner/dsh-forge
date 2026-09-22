#!/usr/bin/env node
/**
 * build-upstream-web.mjs — task disc-2: upstream web dist projection.
 *
 * Builds the upstream SPA (apps/web → dist) and projects the artifact into
 * the vendored tree (packages/desktop-host-vendor/vendored/apps/web/dist),
 * the static root served over dsh-app://.
 *
 * Build-scope decision (honest): the dist is built in the UPSTREAM checkout,
 * not the vendored projection. apps/web's build is devDependency-driven
 * (vite + workspace dev-only packages like @deepseek-ai/dsh-client-web's
 * build toolchain and the webworker runtime/packer), and the vendor lock
 * deliberately excludes devDependencies — so the vendored tree cannot build
 * it. The dist is treated as a projected build artifact, exactly like the
 * builtin Node runtime: produced build-time, never committed (gitignored).
 *
 * Usage:
 *   node scripts/build-upstream-web.mjs [--upstream <path>] [--check]
 *     --check: verify the projected dist exists (index.html) without building.
 *
 * Environment: DSH_FORGE_UPSTREAM overrides the checkout path.
 * Exit 0 on success; 1 on failure.
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const PINNED_SHA = 'c36ba648dc106d21fb32562793b3e3b9c8922bc4'
const UPSTREAM_DEFAULT = 'Z:/project/github/deepseek-harness'
const WEB_DIST_TARGET = join('packages', 'desktop-host-vendor', 'vendored', 'apps', 'web', 'dist')

const parseArgs = (argv) => {
  const args = { check: false, upstream: process.env.DSH_FORGE_UPSTREAM ?? UPSTREAM_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true
    else if (argv[i] === '--upstream') args.upstream = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  return args
}

const run = (command, args, cwd, label) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) { console.error(`${label} failed`); process.exit(1) }
}

export function checkDist() {
  if (!existsSync(join(WEB_DIST_TARGET, 'index.html'))) {
    console.error(`WEB_DIST_CHECK_FAILED missing: ${join(WEB_DIST_TARGET, 'index.html')}`)
    return false
  }
  console.log('WEB_DIST_CHECK_OK upstream web dist projected into vendored tree')
  return true
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) { process.exit(checkDist() ? 0 : 1) }

  // Upstream checkout guard: pinned SHA must be an ancestor of HEAD (the
  // recorded checkout carries dsh-forge spike-result commits on top; a
  // diverged or unrelated checkout must be refused).
  const rev = spawnSync('git', ['merge-base', '--is-ancestor', PINNED_SHA, 'HEAD'], { cwd: args.upstream, shell: process.platform === 'win32' })
  if (rev.status !== 0) {
    console.error(`upstream checkout at ${args.upstream} does not contain pinned SHA ${PINNED_SHA} — refusing to build`)
    process.exit(1)
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: args.upstream, encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim()
  if (head !== PINNED_SHA) console.warn(`WARN: upstream HEAD ${head} != pinned ${PINNED_SHA} (pinned is an ancestor; spike-result commits on top)`)

  // 1. Web dist build prerequisites: the webworker runtime/packer tsdown
  //    outputs and the client-face libs the SPA imports (devDep build
  //    artifacts, incremental when already built).
  run('pnpm', ['--filter', '@deepseek-ai/dsh-experimental-webworker-runtime', 'exec', 'tsdown'], args.upstream, 'webworker-runtime build')
  run('pnpm', ['--filter', '@deepseek-ai/dsh-experimental-webworker-packer', 'exec', 'tsdown'], args.upstream, 'webworker-packer build')
  run('npm', ['run', 'build:lib:client'], args.upstream, 'client lib build')

  // 2. SPA build (vite).
  run('pnpm', ['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'], args.upstream, 'web frontend build')

  // 3. Project the artifact into the vendored tree.
  rmSync(WEB_DIST_TARGET, { recursive: true, force: true })
  cpSync(join(args.upstream, 'apps', 'web', 'dist'), WEB_DIST_TARGET, { recursive: true })

  if (!checkDist()) process.exit(1)
  let bytes = 0
  const measure = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) measure(full)
      else if (entry.isFile()) bytes += statSync(full).size
    }
  }
  measure(WEB_DIST_TARGET)
  console.log(`WEB_DIST_PROJECTED bytes=${bytes} (${(bytes / 1024 / 1024).toFixed(1)}MB)`)
}

main()
