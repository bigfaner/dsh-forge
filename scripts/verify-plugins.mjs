// Plugin foundation gate (ui-plugin-foundation task 4): version-consistency
// assertion + artifact-level vendored scan, joined into one quality gate.
//
// Two entry forms share this module (single source of truth):
//   - vitest: tests/verify-plugins.spec.ts imports the functions below, so the
//     gate runs inside `pnpm test` (the CI lint-unit leg already runs it).
//   - CLI: `node scripts/verify-plugins.mjs` (wired as `pnpm verify:plugins`,
//     which builds the plugins first), for standalone red-light reproduction
//     and for stamping template version stamps (`--stamp <pluginDir>`).
//
// Comparison set is EXPLICIT and must not be widened to make the gate pass
// (task Hard Rule):
//   - alignment line: every `@deepseek-ai/dsh-client-*` dependency (host
//     contract family), in every dependency field, must be an exact pinned
//     version identical to UpstreamLock.desktopHostVersion. dist-tags (e.g.
//     `alpha`) must be resolved and committed as their exact result first.
//   - independent line: `@deepseek-ai/cordis` (peer, own semver line) must be
//     exact but is deliberately NOT compared with desktopHostVersion.
//   - everything else (react, @deepseek-ai/dsh-llm, build tools, ...) is out
//     of the comparison set.
//
// Vendored scan (SC1 artifact-level check): plugin build artifacts under lib/
// must stay vendor-free — any module specifier resolving into the repo's
// vendor trees (vendor/ or packages/desktop-host-vendor/), carrying a
// vendor path segment, or using the file: protocol to point into the repo is
// a red light. Manifest dependency specs declaring file:/link:/workspace: or
// bare paths into the repo are red for the same reason.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ALIGNMENT_FAMILY_PREFIX = '@deepseek-ai/dsh-client-'
export const INDEPENDENT_LINE_PACKAGES = ['@deepseek-ai/cordis']
export const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
export const LOCK_RELATIVE_PATH = 'vendor/upstream.lock.json'
export const STAMP_FILE_NAME = 'version-stamp.json'
export const ARTIFACT_DIR_NAME = 'lib'
export const ARTIFACT_EXTENSIONS = ['.js', '.mjs', '.cjs']

// --- baseline ---------------------------------------------------------------

/** Read the authoritative alignment baseline from vendor/upstream.lock.json. */
export function loadBaseline(rootDir) {
  const lockPath = join(rootDir, LOCK_RELATIVE_PATH)
  if (!existsSync(lockPath)) {
    throw new Error(`upstream lock not found at ${lockPath} — run "node scripts/sync-upstream.mjs" first`)
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  if (typeof lock.desktopHostVersion !== 'string' || lock.desktopHostVersion.length === 0) {
    throw new Error(`${LOCK_RELATIVE_PATH} is missing desktopHostVersion — the lock is the alignment baseline and must not be hand-edited`)
  }
  const cordis = (lock.packages ?? []).find((p) => p.name === '@deepseek-ai/cordis')
  return {
    pinnedSha: lock.pinnedSha,
    desktopHostVersion: lock.desktopHostVersion,
    cordisVersion: cordis ? cordis.version : undefined,
  }
}

// --- exactness --------------------------------------------------------------

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

/** True only for a fully pinned plain semver version (no ranges, tags, protocols). */
export function isExactVersion(spec) {
  const value = String(spec ?? '').trim()
  return value.length > 0 && EXACT_VERSION_RE.test(value)
}

// --- version alignment check --------------------------------------------------

/**
 * Check every plugin manifest against the baseline.
 * @param {Array<{name: string, dir: string, manifest: object}>} plugins
 * @param {{pinnedSha: string, desktopHostVersion: string, cordisVersion?: string}} baseline
 */
export function checkPluginVersionAlignment(plugins, baseline) {
  const violations = []
  for (const plugin of plugins) {
    for (const field of DEP_FIELDS) {
      const deps = plugin.manifest?.[field]
      if (!deps || typeof deps !== 'object') continue
      for (const [name, spec] of Object.entries(deps)) {
        const where = `${plugin.dir}/package.json > ${field}["${name}"]`
        if (name.startsWith(ALIGNMENT_FAMILY_PREFIX)) {
          if (!isExactVersion(spec)) {
            violations.push({
              plugin: plugin.name,
              check: 'version-alignment',
              detail: `[version-alignment] ${where}: "${spec}" — alignment-line dependency (${ALIGNMENT_FAMILY_PREFIX}*) must be an exact pinned version; ranges, dist-tags (resolve \`alpha\` to its exact result first), workspace:/file: specs are forbidden`,
            })
          } else if (String(spec) !== baseline.desktopHostVersion) {
            violations.push({
              plugin: plugin.name,
              check: 'version-alignment',
              detail: `[version-alignment] ${where}: "${spec}" != desktopHostVersion "${baseline.desktopHostVersion}" (${LOCK_RELATIVE_PATH}) — alignment-line dependencies must equal the vendored host version; bump deps and this assertion in the same diff`,
            })
          }
        } else if (INDEPENDENT_LINE_PACKAGES.includes(name)) {
          if (!isExactVersion(spec)) {
            violations.push({
              plugin: plugin.name,
              check: 'version-alignment',
              detail: `[version-alignment] ${where}: "${spec}" — independent version line (not compared with desktopHostVersion) still requires an exact pinned version`,
            })
          }
        }
        // Everything else is outside the explicit comparison set.
      }
    }
  }
  return { ok: violations.length === 0, violations }
}

// --- module specifier extraction (bundle-level, heuristic but deterministic) --

const MODULE_SPECIFIER_PATTERNS = [
  ['require', /\brequire(?:\.resolve)?\(\s*(['"])([^'"\n]+)\1\s*\)/g],
  ['import-statement', /\bimport\s+[^;'"()]*?\bfrom\s*(['"])([^'"\n]+)\1/g],
  ['import-side-effect', /\bimport\s*(['"])([^'"\n]+)\1/g],
  ['import-dynamic', /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g],
  ['export-from', /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g],
]

/** Extract static module specifiers (require/import/export-from/dynamic import). */
export function extractModuleSpecifiers(code) {
  const found = []
  const seen = new Set()
  for (const [syntax, pattern] of MODULE_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[2]
      const key = `${syntax}::${specifier}`
      if (!seen.has(key)) {
        seen.add(key)
        found.push({ syntax, specifier })
      }
    }
  }
  return found
}

// --- path classification ------------------------------------------------------

function toPosix(p) {
  return String(p).replaceAll('\\', '/')
}

function relativePosix(from, to) {
  return toPosix(relative(from, to))
}

/** Repo trees that hold the vendored upstream projection. */
function isInsideVendorTrees(absPath, rootDir) {
  const rel = relativePosix(rootDir, absPath)
  if (rel.startsWith('..')) return false
  return rel === 'vendor' || rel.startsWith('vendor/')
    || rel === 'packages/desktop-host-vendor' || rel.startsWith('packages/desktop-host-vendor/')
}

function isInsideRepo(absPath, rootDir) {
  const rel = relativePosix(rootDir, absPath)
  return rel.length > 0 && !rel.startsWith('..')
}

/** True when the specifier string itself carries a vendor/vendored path segment. */
function carriesVendorSegment(specifier) {
  const posix = toPosix(specifier)
  return /(^|\/)(vendor|vendored|desktop-host-vendor)(\/|$)/.test(posix)
}

function isWindowsAbsolutePath(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

function resolveFileSpecifier(specifier, fromDir) {
  const raw = String(specifier)
  if (raw.startsWith('file://')) {
    try {
      return fileURLToPath(new URL(raw))
    } catch {
      return undefined
    }
  }
  const pathPart = raw.slice('file:'.length)
  if (pathPart.startsWith('/')) return pathPart
  return resolve(fromDir, pathPart)
}

function classifyArtifactSpecifier(specifier, artifactPath, rootDir) {
  const artifactDir = dirname(artifactPath)
  const raw = String(specifier)

  if (raw.startsWith('file:')) {
    const resolved = resolveFileSpecifier(raw, artifactDir)
    if (resolved !== undefined && isInsideRepo(resolved, rootDir)) {
      return { red: true, reason: `"${raw}" — file: protocol specifier resolves into the repo (${relativePosix(rootDir, resolved)}) — plugin artifacts must not load repo-local files via file:` }
    }
    return { red: false }
  }

  const pathForm = raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/')
    || raw.startsWith('.\\') || raw.startsWith('..\\') || isWindowsAbsolutePath(raw)
  if (!pathForm) {
    return { red: false } // bare specifier: resolved by the host boot graph at runtime
  }

  const resolved = isAbsolute(raw) ? raw : resolve(artifactDir, raw)
  if (isInsideVendorTrees(resolved, rootDir)) {
    return { red: true, reason: `"${raw}" resolves into the vendored tree (${relativePosix(rootDir, resolved)}) — plugin bundles must not reference vendored sources` }
  }
  if (carriesVendorSegment(raw)) {
    return { red: true, reason: `"${raw}" carries a vendor path segment outside the repo — plugin bundles must not reference vendored sources` }
  }
  return { red: false }
}

// --- artifact scan -------------------------------------------------------------

/**
 * Scan built artifacts for module sources that resolve into the vendored tree.
 * @param {{name: string, dir: string}} plugin
 * @param {Array<{path: string, code: string}>} artifactFiles absolute paths + contents
 */
export function scanArtifactModuleSources(plugin, artifactFiles, rootDir) {
  const violations = []
  let specifierCount = 0
  for (const artifact of artifactFiles) {
    for (const { specifier } of extractModuleSpecifiers(artifact.code)) {
      specifierCount += 1
      const verdict = classifyArtifactSpecifier(specifier, artifact.path, rootDir)
      if (verdict.red) {
        violations.push({
          plugin: plugin.name,
          check: 'artifact-sources',
          detail: `[artifact-sources] ${relativePosix(rootDir, artifact.path)}: ${verdict.reason}`,
        })
      }
    }
  }
  return { ok: violations.length === 0, violations, specifierCount }
}

// --- manifest module-source scan ------------------------------------------------

function classifyManifestSpec(spec, pluginDirAbs, rootDir) {
  const raw = String(spec)
  let target
  if (raw.startsWith('file:')) {
    target = resolveFileSpecifier(raw, pluginDirAbs)
    return { protocol: 'file:', target }
  }
  if (raw.startsWith('link:')) {
    const rest = raw.slice('link:'.length)
    target = rest.startsWith('file://') ? fileURLToPath(new URL(rest)) : resolve(pluginDirAbs, rest)
    return { protocol: 'link:', target }
  }
  if (raw.startsWith('workspace:')) {
    return { protocol: 'workspace:', target: undefined } // by definition points into the workspace
  }
  if (raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/') || raw.startsWith('~/') || isWindowsAbsolutePath(raw)) {
    return { protocol: 'path', target: resolve(pluginDirAbs, raw.replace(/^~\/?/, '')) }
  }
  return { protocol: null }
}

/** Red on dependency specs that declare in-repo protocol/path sources. */
export function scanManifestModuleSources(plugins, rootDir) {
  const violations = []
  for (const plugin of plugins) {
    const pluginDirAbs = join(rootDir, plugin.dir)
    for (const field of DEP_FIELDS) {
      const deps = plugin.manifest?.[field]
      if (!deps || typeof deps !== 'object') continue
      for (const [name, spec] of Object.entries(deps)) {
        const verdict = classifyManifestSpec(spec, pluginDirAbs, rootDir)
        if (verdict.protocol === null) continue
        const where = `${plugin.dir}/package.json > ${field}["${name}"]`
        if (verdict.protocol === 'workspace:') {
          violations.push({
            plugin: plugin.name,
            check: 'manifest-sources',
            detail: `[manifest-sources] ${where}: "${spec}" — workspace: specs point into the workspace, not the npm registry; publishable plugins must declare registry specs`,
          })
          continue
        }
        if (verdict.target === undefined) continue
        if (isInsideRepo(verdict.target, rootDir)) {
          violations.push({
            plugin: plugin.name,
            check: 'manifest-sources',
            detail: `[manifest-sources] ${where}: "${spec}" — ${verdict.protocol}/path spec resolves into the repo (${relativePosix(rootDir, verdict.target)}) — plugins must stay vendor-free; declare npm registry specs`,
          })
        }
      }
    }
  }
  return { ok: violations.length === 0, violations }
}

// --- version stamp ---------------------------------------------------------------

/** Deterministic stamp derived from the same baseline source (no timestamps). */
export function makeVersionStamp(baseline) {
  return {
    source: LOCK_RELATIVE_PATH,
    pinnedSha: baseline.pinnedSha,
    desktopHostVersion: baseline.desktopHostVersion,
    cordisVersion: baseline.cordisVersion,
  }
}

/** Stamps are optional (template/reference plugins); present ones must be in sync. */
export function checkVersionStamps(stamps, baseline) {
  const violations = []
  for (const entry of stamps) {
    const where = `${entry.dir}/${STAMP_FILE_NAME}`
    for (const field of ['pinnedSha', 'desktopHostVersion', 'cordisVersion']) {
      const actual = entry.stamp?.[field]
      if (actual === undefined) {
        violations.push({
          plugin: entry.name,
          check: 'version-stamp',
          detail: `[version-stamp] ${where}: missing field "${field}" — regenerate with "node scripts/verify-plugins.mjs --stamp ${entry.dir}"`,
        })
        continue
      }
      const expected = baseline[field]
      if (expected === undefined || String(actual) !== String(expected)) {
        violations.push({
          plugin: entry.name,
          check: 'version-stamp',
          detail: `[version-stamp] ${where}: ${field} "${actual}" != lock "${expected ?? '(absent)'}" — the stamp is stale; regenerate it in the same diff as the dependency bump`,
        })
      }
    }
  }
  return { ok: violations.length === 0, violations }
}

// --- gate orchestration ------------------------------------------------------------

function collectArtifactFiles(libDir) {
  if (!existsSync(libDir)) return []
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (ARTIFACT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) files.push(full)
    }
  }
  walk(libDir)
  return files.sort()
}

function discoverPlugins(rootDir) {
  const pluginsRoot = join(rootDir, 'packages', 'plugins')
  if (!existsSync(pluginsRoot)) return []
  const plugins = []
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(pluginsRoot, entry.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    plugins.push({
      name: JSON.parse(readFileSync(manifestPath, 'utf8')).name ?? entry.name,
      dir: toPosix(relative(rootDir, join(pluginsRoot, entry.name))),
      dirAbs: join(pluginsRoot, entry.name),
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    })
  }
  return plugins
}

/** Run the full gate over a workspace root. */
export function runGate(rootDir) {
  const baseline = loadBaseline(rootDir)
  const plugins = discoverPlugins(rootDir)

  const versionAlignment = checkPluginVersionAlignment(plugins, baseline)
  const manifestSources = scanManifestModuleSources(plugins, rootDir)

  const artifactViolations = []
  let artifactCount = 0
  let specifierCount = 0
  for (const plugin of plugins) {
    const artifactFiles = collectArtifactFiles(join(plugin.dirAbs, ARTIFACT_DIR_NAME))
    if (artifactFiles.length === 0) {
      artifactViolations.push({
        plugin: plugin.name,
        check: 'artifacts-missing',
        detail: `[artifacts-missing] ${plugin.dir}: build artifacts missing (no *.{js,mjs,cjs} under ${ARTIFACT_DIR_NAME}/) — the vendored scan cannot verify what was not built; run "pnpm verify:plugins" (builds the plugins, then verifies)`,
      })
      continue
    }
    artifactCount += artifactFiles.length
    const report = scanArtifactModuleSources(
      plugin,
      artifactFiles.map((path) => ({ path, code: readFileSync(path, 'utf8') })),
      rootDir,
    )
    specifierCount += report.specifierCount
    artifactViolations.push(...report.violations)
  }

  const stamps = []
  const stampViolations = []
  for (const plugin of plugins) {
    const stampPath = join(plugin.dirAbs, STAMP_FILE_NAME)
    if (!existsSync(stampPath)) continue
    try {
      stamps.push({ name: plugin.name, dir: plugin.dir, stamp: JSON.parse(readFileSync(stampPath, 'utf8')) })
    } catch (error) {
      stampViolations.push({
        plugin: plugin.name,
        check: 'version-stamp',
        detail: `[version-stamp] ${plugin.dir}/${STAMP_FILE_NAME}: unparsable (${error.message}) — regenerate with --stamp`,
      })
    }
  }
  const stampCheck = checkVersionStamps(stamps, baseline)

  const violations = [
    ...versionAlignment.violations,
    ...manifestSources.violations,
    ...artifactViolations,
    ...stampViolations,
    ...stampCheck.violations,
  ]

  return {
    ok: violations.length === 0,
    baseline,
    plugins: plugins.map((p) => ({ name: p.name, dir: p.dir })),
    scanned: { manifests: plugins.length, artifacts: artifactCount, specifiers: specifierCount },
    violations,
  }
}

// --- CLI --------------------------------------------------------------------------

export function printHumanReport(report) {
  const lines = []
  lines.push('plugin foundation gate (version alignment + vendored scan)')
  lines.push(`  root: ${report.baseline.root ?? ''}`.trimEnd())
  lines.push(`  baseline: desktopHostVersion ${report.baseline.desktopHostVersion} / cordis ${report.baseline.cordisVersion ?? '(absent from lock)'} / pinnedSha ${report.baseline.pinnedSha ?? '(absent)'}`)
  lines.push(`  plugins: ${report.plugins.length}${report.plugins.length ? ` (${report.plugins.map((p) => p.name).join(', ')})` : ''}`)
  lines.push(`  scanned: ${report.scanned.manifests} manifests, ${report.scanned.artifacts} artifacts, ${report.scanned.specifiers} module specifiers`)
  const failedChecks = new Set(report.violations.map((v) => v.check))
  const checks = [
    ['version-alignment', 'version alignment (explicit set: @deepseek-ai/dsh-client-* exact == desktopHostVersion; @deepseek-ai/cordis exact, independent line)'],
    ['manifest-sources', 'manifest module sources (no file:/link:/workspace:/path specs into the repo)'],
    ['artifact-sources', 'artifact module sources (no vendor/ resolutions, no file: into the repo)'],
    ['artifacts-missing', 'plugin build artifacts present'],
    ['version-stamp', 'version stamps in sync with vendor/upstream.lock.json'],
  ]
  for (const [check, label] of checks) {
    lines.push(`  ${failedChecks.has(check) ? 'FAIL' : '[PASS]'} ${label}`)
  }
  if (report.violations.length > 0) {
    lines.push(`FAIL: ${report.violations.length} violation(s):`)
    for (const violation of report.violations) lines.push(`  - ${violation.detail}`)
  } else {
    lines.push('gate PASS: all checks green.')
  }
  return lines.join('\n')
}

/** CLI entry (also invoked in-process by tests). Returns the process exit code. */
export function runCli(argv) {
  const args = argv.slice(2)
  const flag = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
  }
  const rootDir = resolve(flag('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

  if (args.includes('--stamp')) {
    const pluginDirArg = flag('--stamp')
    if (!pluginDirArg) {
      console.error('usage: node scripts/verify-plugins.mjs [--root DIR] [--json] [--stamp <pluginDir>]')
      return 2
    }
    const pluginDirAbs = resolve(rootDir, pluginDirArg)
    const manifestPath = join(pluginDirAbs, 'package.json')
    if (!existsSync(manifestPath)) {
      console.error(`--stamp: ${pluginDirArg} is not a plugin package (no package.json)`)
      return 2
    }
    const baseline = loadBaseline(rootDir)
    const stamp = makeVersionStamp(baseline)
    const stampPath = join(pluginDirAbs, STAMP_FILE_NAME)
    mkdirSync(dirname(stampPath), { recursive: true })
    writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`)
    console.log(`wrote ${relative(rootDir, stampPath)} (desktopHostVersion ${stamp.desktopHostVersion}, cordis ${stamp.cordisVersion}, pinnedSha ${stamp.pinnedSha})`)
    return 0
  }

  const report = runGate(rootDir)
  report.baseline.root = rootDir
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : printHumanReport(report))
  return report.ok ? 0 : 1
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  process.exit(runCli(process.argv))
}
