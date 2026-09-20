#!/usr/bin/env node
// Upstream web e2e ① leg runner (task 6.1, tech-design §Testing Strategy SC7):
// runs the upstream client web e2e suite AS-IS (等价性来自同一代码, 不重写用例)
// on the upstream workspace at the vendored pinned SHA, in Playwright browser
// mode, and enforces the exemption-list mechanism — a test that did not run
// (skipped / self-skipped) is only acceptable when it is declared in
// e2e/upstream-web-e2e-exemptions.json; anything else fails the run
// (不允许静默跳过), with every exemption called out in the report.
//
// Usage:
//   DSH_UPSTREAM_ROOT=<path to deepseek-harness checkout> \
//     node scripts/run-upstream-web-e2e.mjs
// Env:
//   DSH_UPSTREAM_ROOT       required — upstream checkout (pinned SHA verified
//                           against vendor/upstream.lock.json unless
//                           DSH_UPSTREAM_SKIP_SHA_CHECK=1)
//   DSH_E2E_REPORT_DIR      output dir (default test-results/upstream-web-e2e)
//   DSH_E2E_TEST_FILTER     extra vitest filter args (default: apps/web/tests)
// Exit codes: 0 = green (skips only declared exemptions); 1 = failures or
// undeclared skips; 2 = environment error (missing root, sha mismatch).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = process.env.DSH_UPSTREAM_ROOT
if (upstreamRoot === undefined || upstreamRoot === '') {
  console.error('[upstream-web-e2e] DSH_UPSTREAM_ROOT is required — refusing to run nothing (no silent skip)')
  process.exit(2)
}
const reportDir = resolve(repoRoot, process.env.DSH_E2E_REPORT_DIR ?? 'test-results/upstream-web-e2e')
mkdirSync(reportDir, { recursive: true })

// --- pinned-SHA guard: the ① leg proves equivalence of the VENDORED code ----
if (process.env.DSH_UPSTREAM_SKIP_SHA_CHECK !== '1') {
  const lock = JSON.parse(readFileSync(join(repoRoot, 'vendor/upstream.lock.json'), 'utf8'))
  const pinnedSha = lock.pinnedSha
  let headSha = ''
  try {
    headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstreamRoot, encoding: 'utf8' }).trim()
  } catch {
    console.error('[upstream-web-e2e] cannot read HEAD of DSH_UPSTREAM_ROOT — is it a git checkout?')
    process.exit(2)
  }
  if (headSha !== pinnedSha) {
    console.error(`[upstream-web-e2e] upstream HEAD ${headSha} != vendored pinned SHA ${pinnedSha}; set DSH_UPSTREAM_SKIP_SHA_CHECK=1 to override`)
    process.exit(2)
  }
}

// --- exemption list ----------------------------------------------------------
const exemptionsPath = join(repoRoot, 'e2e/upstream-web-e2e-exemptions.json')
const exemptions = JSON.parse(readFileSync(exemptionsPath, 'utf8')).exemptions ?? []
const exemptIds = new Set(exemptions.map(e => e.test))

// --- run the upstream suite as-is (browser mode, Playwright-driven) ---------
// Upstream layout: apps/web/tests/**.e2e.ts runs under vitest.web.config.ts
// (the root vitest.e2e.config.ts is the real-API suite and excludes apps/web)
// and needs the web frontend dist built first (upstream `test:web` recipe).
const filter = process.env.DSH_E2E_TEST_FILTER ?? 'apps/web/tests'
const jsonReport = join(reportDir, 'vitest-json-report.json')
const useShell = process.platform === 'win32'
function runPnpm(args, label) {
  console.log(`[upstream-web-e2e] ${label}: pnpm ${args.join(' ')}`)
  try {
    // win32: pnpm is a .cmd shim — needs a shell (Node >=20 refuses bare .cmd).
    execFileSync('pnpm', args, { cwd: upstreamRoot, stdio: 'inherit', shell: useShell })
    return 0
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1
  }
}
if (process.env.DSH_E2E_SKIP_BUILD !== '1') {
  const buildStatus = runPnpm(['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'], 'building web frontend')
  if (buildStatus !== 0) {
    console.error('[upstream-web-e2e] web frontend build failed — aborting (no silent skip)')
    process.exit(1)
  }
}
const vitestArgs = [
  'exec', 'vitest', 'run', '--config', 'vitest.web.config.ts',
  '--reporter=json', `--outputFile=${useShell ? JSON.stringify(jsonReport) : jsonReport}`,
  filter,
]
const vitestStatus = runPnpm(vitestArgs, 'running upstream web e2e')
if (!existsSync(jsonReport)) {
  console.error('[upstream-web-e2e] vitest did not produce a JSON report — cannot audit skips (no silent skip)')
  process.exit(1)
}

// --- audit skips against the exemption list ----------------------------------
const report = JSON.parse(readFileSync(jsonReport, 'utf8'))
const skipped = []
const passed = []
const failed = []
for (const suite of report.testResults ?? []) {
  for (const assertion of suite.assertionResults ?? []) {
    const id = `${suite.name} > ${[...(assertion.ancestorTitles ?? []), assertion.title].join(' > ')}`
    if (assertion.status === 'skipped') skipped.push(id)
    else if (assertion.status === 'failed') failed.push(id)
    else passed.push(id)
  }
}
const undeclared = skipped.filter(id => !exemptIds.has(id))
const declaredUsed = skipped.filter(id => exemptIds.has(id))
const declaredStale = [...exemptIds].filter(id => !skipped.includes(id))

const summary = {
  ranAt: new Date().toISOString(),
  upstreamRoot,
  total: passed.length + failed.length + skipped.length,
  passed: passed.length,
  failed,
  skippedDeclared: declaredUsed,
  skippedUndeclared: undeclared,
  declaredButNotSkipped: declaredStale,
}
writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

console.log(`[upstream-web-e2e] passed=${String(passed.length)} failed=${String(failed.length)} skipped=${String(skipped.length)} (declared=${String(declaredUsed.length)}, undeclared=${String(undeclared.length)})`)
for (const id of declaredUsed) console.log(`[exempted, declared] ${id}`)
for (const id of declaredStale) console.log(`[exemption stale — remove it] ${id}`)
for (const id of undeclared) console.error(`[UNDECLARED SKIP — not allowed] ${id}`)

if (undeclared.length > 0 || failed.length > 0 || vitestStatus !== 0) process.exit(1)
console.log('[upstream-web-e2e] green: every non-running case is a declared exemption')
