#!/usr/bin/env node
/**
 * prepare-host-primary-runtime.mjs — task disc-2: primary-runtime payload.
 *
 * The vendored host entry hard-requires a "primary runtime" payload
 * (argv[4]): the office-skills asset tree plus a relocatable interpreter
 * bundle (pinned Node + CPython + pnpm + locked wheels) that upstream's
 * desktop packaging assembles via apps/desktop/scripts/prepare-primary-runtime.ts.
 * Its absence is a fatal host-boot error (upstream decision: "Missing sibling
 * office-skills resources fail Host startup").
 *
 * dsh-forge does not re-implement that pipeline; this driver runs the
 * upstream one in the upstream checkout (network: downloads the locked
 * archives once into .desktop-build/downloads, sha256-verified) and reports
 * the payload path to feed the shell:
 *
 *   DSH_FORGE_PRIMARY_RUNTIME=<payload> pnpm dev:desktop
 *
 * Usage:
 *   node scripts/prepare-host-primary-runtime.mjs [--upstream <path>] [--check]
 *     --check: print the resolved payload path if complete, exit 1 otherwise.
 *
 * Exit 0 on success; 1 on failure.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const UPSTREAM_DEFAULT = 'Z:/project/github/deepseek-harness'

const parseArgs = (argv) => {
  const args = { check: false, upstream: process.env.DSH_FORGE_UPSTREAM ?? UPSTREAM_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true
    else if (argv[i] === '--upstream') args.upstream = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  return args
}

/** Win/mac target dir naming follows upstream desktop-build-paths.mjs. */
function runtimeDir(upstream) {
  const target = process.platform === 'win32' ? 'win-x64'
    : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64') : undefined
  if (target === undefined) { console.error('no upstream primary-runtime target for this platform'); process.exit(1) }
  return join(upstream, 'apps', 'desktop', '.desktop-build', 'targets', target, 'runtime')
}

function isComplete(dir) {
  return existsSync(join(dir, 'primary-runtime', 'runtime.json')) && existsSync(join(dir, 'office-skills'))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = runtimeDir(args.upstream)

  if (args.check) {
    if (!isComplete(dir)) { console.error(`PRIMARY_RUNTIME_CHECK_FAILED incomplete: ${dir}`); process.exit(1) }
    console.log(`PRIMARY_RUNTIME_OK ${join(dir, 'primary-runtime')}`)
    return
  }

  const run = spawnSync('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'prepare:primary-runtime'], { cwd: args.upstream, stdio: 'inherit', shell: process.platform === 'win32' })
  if (run.status !== 0) { console.error('upstream prepare:primary-runtime failed'); process.exit(1) }
  if (!isComplete(dir)) { console.error(`payload incomplete after prepare: ${dir}`); process.exit(1) }
  console.log(`PRIMARY_RUNTIME_OK ${join(dir, 'primary-runtime')}`)
  console.log(`dev usage: DSH_FORGE_PRIMARY_RUNTIME=${join(dir, 'primary-runtime')} pnpm dev:desktop`)
}

main()
