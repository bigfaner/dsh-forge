#!/usr/bin/env node
/**
 * smoke-host-entry.mjs
 *
 * AC2 smoke: spawn the desktop-host child-process entry contract under the
 * builtin upstream Node runtime (acquired by scripts/prepare-host-runtime.mjs)
 * and verify the IPC handshake + clean shutdown.
 *
 * Runs the host-entry fixture (same argv/IPC contract as the vendored
 * upstream entry) because booting the real entry requires the pnpm-installed
 * dependency closure, which is a build-time install step. The fixture pins
 * the spawn wiring: runtime node executable, argv shape, message flow.
 *
 * Usage:
 *   node scripts/smoke-host-entry.mjs [--entry <fixture.mjs>]
 * Exit 0 on handshake + clean shutdown, 1 otherwise.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURE = 'packages/desktop-host-vendor/tests/fixtures/host-entry-fixture.mjs'

function parseArgs(argv) {
  const args = { entry: FIXTURE }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--entry') args.entry = argv[++i]
    else { console.error(`Unknown argument: ${argv[i]}`); process.exit(2) }
  }
  return args
}

/** Resolve the builtin node via the vendor package seam (src/index.ts). */
async function resolveBuiltinNode() {
  const { resolveBuiltinNode: resolve } = await import('../packages/desktop-host-vendor/src/index.ts')
    .catch(() => import(join('packages/desktop-host-vendor/src/index.ts')))
  return resolve()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.entry)) { console.error(`entry not found: ${args.entry}`); process.exit(1) }
  const { nodeExecutable, manifest } = await resolveBuiltinNode()
  const runtimeDir = 'runtime-smoke-does-not-exist-yet' // argv shape only, fixture does not touch the fs
  const projectDir = process.cwd()

  console.log(`builtin node: ${manifest.runtimeId} (${manifest.nodeVersion}, source=${manifest.source})`)
  console.log(`spawning: ${nodeExecutable} ${args.entry}`)

  const child = spawn(nodeExecutable, [args.entry, runtimeDir, projectDir], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })

  const fail = (reason) => {
    console.error(`SMOKE FAILED: ${reason}`)
    child.kill()
    process.exit(1)
  }

  const timer = setTimeout(() => fail('timeout waiting for handshake'), 20000)
  let gotReady = false
  let gotShutdownComplete = false

  child.stdout.on('data', (d) => process.stdout.write(`[host] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[host] ${d}`))

  child.on('message', (message) => {
    if (typeof message !== 'object' || message === null) return
    if (message.type === 'smoke-ready') {
      gotReady = true
      if (message.nodeVersion !== `v${manifest.nodeVersion}`) fail(`child runs ${message.nodeVersion}, manifest says v${manifest.nodeVersion}`)
      console.log(`handshake OK: smoke-ready from pid ${message.pid} under ${message.nodeVersion}`)
      child.send({ type: 'shutdown' })
    }
    if (message.type === 'shutdown-complete') {
      gotShutdownComplete = true
      console.log('clean shutdown acknowledged')
    }
  })

  child.on('exit', (code, signal) => {
    clearTimeout(timer)
    if (!gotReady) return fail('exited before handshake')
    if (!gotShutdownComplete) return fail('exited without shutdown-complete')
    if (code !== 0) return fail(`non-zero exit: code=${code} signal=${signal}`)
    console.log('SMOKE PASSED: builtin-Node host entry handshake + clean shutdown')
    process.exit(0)
  })

  child.on('error', (error) => fail(`spawn error: ${error.message}`))
}

await main()
