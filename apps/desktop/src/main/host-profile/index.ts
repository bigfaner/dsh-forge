// host-profile — application-owned host profile + payload projection (disc-2),
// config-ized bundle list + startup reconciliation (ui-plugin-foundation task 2).
//
// The vendored upstream host entry boots with three filesystem inputs:
//   argv[2] runtimeDir — the dsh installation dir whose node_modules carries
//                        the install anchor (vendored apps/desktop-host).
//   argv[3] projectDir — the profile project: package.json `dsh.profile.bundles`
//                        manifest; the host materializes its own node_modules
//                        (link-mode fallback junctions) on first boot.
//   argv[4] source     — primary-runtime payload dir; its sibling
//                        `office-skills/` is a hard host-boot requirement
//                        (upstream office.ts). The interpreter bundle itself
//                        installs lazily on first tool use, so a stub dir is
//                        enough for the boot/handshake bar.
//
// This module projects both app-owned inputs under the shell's userData
// (<userData>/host-profile, <userData>/host-payload) — never inside the
// upstream $DSH_HOME (SC8 coexistence: `runProfile` with `resolvedProfile`
// writes only into the profile dir we hand it).
//
// Task 2 — the bundle list is no longer a shell-code constant. The product
// config (`apps/desktop/resources/plugin-bundles.json`, staged next to the
// other installer resources when packaged) is the plugin tree's single source
// of truth; the projector converges the userData projection to it at startup
// (K8s-style declarative reconciliation, npm `prune` prototype):
//   add leg    — manifest bundle list rewritten to the config order, and each
//                entry carrying a `source` gets its profile-local
//                materialization seeded.
//   delete leg — entries the config dropped are pruned from the manifest and
//                their profile-local materialization removed. Upstream-owned
//                module-fallback links under `.dsh-module-fallback/` are never
//                touched (the host heals those itself on every boot); cleanup
//                only invalidates — it never adds an assembly channel, which
//                stays exclusively the profile manifest the host consumes.
//
// Task 6 (spike-report §4.1) — the source vocabulary has two forms:
//   `workspace:<repo-relative dir>` — dev inner-loop form, seeded as a
//   junction into the workspace package (source dir must be present);
//   `tarball:<resources-relative .tgz>` — the packaged distribution form
//   ("tarball built-in + shell-side pre-seeding"): the pnpm-pack artifact is
//   staged next to the config in app resources and the shell unpacks it into
//   the profile's node_modules as a real directory — no pnpm, no network,
//   write-once (a seed marker with the artifact sha256 makes re-runs
//   idempotent and sha drift converge). Zero plugin identity ever appears in
//   shell code: names and artifact paths come from the config alone.
//
// The config itself is read-only to this module (AC5): it is loaded once at
// startup and never written — runtime enable/disable writers (M2 UF6) may read
// the same file but must not mutate product-owned entries through it.
//
// Task 3.1 — entries may carry `mandatory: true` (forge core / platform
// required bundles; the plugin tree's mandatory identity derives from this
// manifest alone, G6). The projector folds the userData runtime overlay
// (`plugin-runtime.json`, `{ disabled: [...] }` — third-party names only)
// into the same reconciliation flow: mandatory bundles are immune to the
// overlay (always assembled, even if a hand-edited file names them) and a
// disabled third-party bundle is held out of the profile manifest — its
// injected content exits; re-enabling restores it through the add leg. The
// overlay is read defensively: a malformed file never blocks startup.

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { shellLog } from '../log.ts'
import { readPluginRuntimeOverlay } from '../plugin-runtime/overlay.ts'
import { extractTarball, TarballError } from './tarball.ts'

/** Upstream's profile-owned module-fallback directory (never touched here). */
const PROFILE_MODULE_FALLBACK_DIR = '.dsh-module-fallback'

/** Shell-owned pre-seed marker inside an unpacked bundle materialization. */
const SEED_MARKER_FILE = '.dsh-forge-seed.json'

/** Scoped/plain npm package name; no paths, spaces, or version ranges. */
const BUNDLE_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-._~]+$/u

/** `workspace:<repo-relative dir>` — the dev materialization source form. */
const WORKSPACE_SOURCE_PATTERN = /^workspace:(?<rel>.+)$/u

/** `tarball:<resources-relative .tgz>` — the packaged materialization source form. */
const TARBALL_SOURCE_PATTERN = /^tarball:(?<rel>.+\.tgz)$/u

/** One product-config bundle entry. */
export interface PluginBundleEntry {
  /** Bundle package name as listed in the profile manifest `dsh.profile.bundles`. */
  readonly name: string
  /**
   * Materialization source: `workspace:<dir>` (dev link) or
   * `tarball:<.tgz>` (packaged pre-seed); entries without one resolve from
   * the vendored installation closure.
   */
  readonly source?: string
  /**
   * `true` marks a mandatory bundle (forge core / platform required, task
   * 3.1): always assembled regardless of the runtime overlay; disable
   * requests for it are rejected upstream (ERR_PLUGIN_MANDATORY). Absent =
   * third-party (the only overlay-writable tier).
   */
  readonly mandatory?: true
}

/** Parsed product-level plugin-bundles config (single source of truth, task 2). */
export interface PluginBundlesConfig {
  readonly bundles: readonly PluginBundleEntry[]
}

/** A missing / corrupt / invalid product config (explicit startup error path). */
export class PluginBundlesConfigError extends Error {
  readonly code = 'ERR_PLUGIN_BUNDLES_CONFIG'

  constructor(message: string) {
    super(message)
    this.name = 'PluginBundlesConfigError'
  }
}

/** A profile projection that cannot be reconciled (explicit startup error path). */
export class HostProfileError extends Error {
  readonly code = 'ERR_HOST_PROFILE'

  constructor(message: string) {
    super(message)
    this.name = 'HostProfileError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Load and validate the product-level plugin-bundles config.
 * @param configPath - absolute path of the product config JSON.
 * @returns the frozen config; every invalid shape fails loud as a
 *   {@link PluginBundlesConfigError} (the shell surfaces it through the
 *   crash-recovery failed state — never a silent startup crash).
 */
export function loadPluginBundlesConfig(configPath: string): PluginBundlesConfig {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    throw new PluginBundlesConfigError(`product plugin-bundles config not found at ${configPath} — the bundle list has no other source`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new PluginBundlesConfigError(`product plugin-bundles config ${configPath} is not valid JSON: ${String(error)}`)
  }
  if (!isPlainObject(parsed)) {
    throw new PluginBundlesConfigError(`product plugin-bundles config ${configPath} must hold a JSON object`)
  }
  for (const key of Object.keys(parsed)) {
    if (key !== 'bundles') throw new PluginBundlesConfigError(`unknown key ${JSON.stringify(key)} in ${configPath} (expected only "bundles")`)
  }
  const bundles = parsed.bundles
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new PluginBundlesConfigError(`"bundles" in ${configPath} must be a non-empty array`)
  }
  const entries: PluginBundleEntry[] = []
  const seen = new Set<string>()
  for (const candidate of bundles) {
    if (!isPlainObject(candidate)) {
      throw new PluginBundlesConfigError(`every bundle entry in ${configPath} must hold a JSON object`)
    }
    for (const key of Object.keys(candidate)) {
      if (key !== 'name' && key !== 'source' && key !== 'mandatory') throw new PluginBundlesConfigError(`unknown key ${JSON.stringify(key)} on a bundle entry in ${configPath} (expected "name", "source", "mandatory")`)
    }
    const { name, source, mandatory } = candidate
    if (typeof name !== 'string' || !BUNDLE_NAME_PATTERN.test(name)) {
      throw new PluginBundlesConfigError(`invalid bundle name ${JSON.stringify(name)} in ${configPath} (expected a plain or scoped npm package name)`)
    }
    if (seen.has(name)) throw new PluginBundlesConfigError(`duplicate bundle name ${JSON.stringify(name)} in ${configPath}`)
    seen.add(name)
    if (source !== undefined && !isValidSource(source)) {
      throw new PluginBundlesConfigError(`invalid source ${JSON.stringify(source)} for bundle ${JSON.stringify(name)} in ${configPath} (expected "workspace:<repo-relative dir>")`)
    }
    // Task 3.1: the mandatory convention is `mandatory: true` (absent = third-party);
    // any other value fails loud rather than half-marking the protected partition.
    if (mandatory !== undefined && mandatory !== true) {
      throw new PluginBundlesConfigError(`invalid mandatory ${JSON.stringify(mandatory)} for bundle ${JSON.stringify(name)} in ${configPath} (only literal true marks a mandatory bundle; omit the key otherwise)`)
    }
    entries.push({ name, ...(source === undefined ? {} : { source }), ...(mandatory === undefined ? {} : { mandatory }) })
  }
  return Object.freeze({ bundles: Object.freeze(entries) })
}

/** A validated source spec — the two materialization forms share one vocabulary. */
type SourceSpec =
  | { readonly kind: 'workspace'; readonly rel: string }
  | { readonly kind: 'tarball'; readonly rel: string }

/** Parse a source spec into its form + relative path, or undefined when malformed. */
function parseSourceSpec(source: string): SourceSpec | undefined {
  const workspace = WORKSPACE_SOURCE_PATTERN.exec(source)?.groups?.rel
  if (workspace !== undefined) return { kind: 'workspace', rel: workspace }
  const tarball = TARBALL_SOURCE_PATTERN.exec(source)?.groups?.rel
  if (tarball !== undefined) return { kind: 'tarball', rel: tarball }
  return undefined
}

/** Relative source paths must stay relative, traversal-free, and Windows-safe. */
function isSafeRelativePath(rel: string): boolean {
  if (rel.length === 0) return false
  if (rel.startsWith('/') || rel.startsWith('\\') || /^:[a-zA-Z]:/u.test(rel)) return false
  if (/[<>:"|?*\u0000-\u001f]/u.test(rel)) return false
  return rel.split(/[/\\]/u).every(segment => segment !== '..' && segment !== '.')
}

/** A source spec must be a well-formed, traversal-free relative path of its form. */
function isValidSource(source: unknown): source is string {
  if (typeof source !== 'string') return false
  const spec = parseSourceSpec(source)
  return spec !== undefined && isSafeRelativePath(spec.rel)
}

/** Resolve a validated source spec against its anchor, failing loud with remediation. */
function resolveSourceSpec(
  entry: PluginBundleEntry,
  workspaceRoot: string | undefined,
  resourcesRoot: string | undefined,
): SourceSpec & { readonly path: string } {
  const spec = parseSourceSpec(entry.source as string) as SourceSpec
  if (spec.kind === 'workspace') {
    if (workspaceRoot === undefined) {
      throw new HostProfileError(`bundle ${entry.name} declares source ${entry.source} but no workspaceRoot anchor was provided (dev wiring error)`)
    }
    const dir = resolve(workspaceRoot, spec.rel)
    if (!existsSync(join(dir, 'package.json'))) {
      throw new HostProfileError(`materialization source for bundle ${entry.name} has no package.json at ${dir} — build the plugin (pnpm build:plugins) or fix the config source`)
    }
    return { ...spec, path: dir }
  }
  if (resourcesRoot === undefined) {
    throw new HostProfileError(`bundle ${entry.name} declares source ${entry.source} but no resourcesRoot anchor was provided (packaged resources not resolved)`)
  }
  return { ...spec, path: resolve(resourcesRoot, spec.rel) }
}

export interface HostProfileDeps {
  /** Profile project dir (app-owned; default <userData>/host-profile). */
  readonly profileDir: string
  /** Vendored office-skills asset tree (packages/skill/skill-office/assets). */
  readonly officeSkillsSource: string
  /** Product-config bundle list (the single source of truth). */
  readonly bundles: readonly PluginBundleEntry[]
  /** Repo root anchoring `workspace:` source specs (dev wiring form). */
  readonly workspaceRoot?: string
  /** App-resources root anchoring `tarball:` source specs (dev: apps/desktop/resources; packaged: process.resourcesPath). */
  readonly resourcesRoot?: string
  /**
   * Runtime enable/disable overlay (`<userData>/plugin-runtime.json`, task
   * 3.1). When provided, disabled third-party bundles are held out of the
   * profile manifest; mandatory bundles are immune. Absent/missing file =
   * empty overlay = every config bundle assembled. Read defensively — a
   * malformed overlay never fails the projection.
   */
  readonly overlayPath?: string
}

export interface HostProfileProjection {
  /** The profile project dir to pass as the host entry's projectDir (argv[3]). */
  readonly profileDir: string
  /** Primary-runtime payload source (argv[4]); undefined when the payload cannot be projected. */
  readonly primaryRuntimeSource: string | undefined
}

function linkTree(target: string, source: string): void {
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

/** Path of a bundle's profile-local materialization under the profile's node_modules. */
export function materializationPath(profileDir: string, name: string): string {
  return join(profileDir, 'node_modules', ...name.split('/'))
}

/** Whether an existing path is one of upstream's own module-fallback links (never touched by the shell). */
function isUpstreamFallbackLink(profileDir: string, path: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false
    const target = resolve(dirname(path), readlinkSync(path))
    const rel = relative(join(profileDir, PROFILE_MODULE_FALLBACK_DIR), target)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

/** Remove the scoped parent directory of a materialization when it becomes empty (best-effort). */
function pruneEmptyScopeParent(profileDir: string, name: string): void {
  if (!name.startsWith('@')) return
  const parent = dirname(materializationPath(profileDir, name))
  try {
    if (readdirOrEmpty(parent).length === 0) rmSync(parent, { recursive: true, force: true })
  } catch { /* best-effort cleanup only */ }
}

function readdirOrEmpty(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Prune the profile-local materialization of a config-removed bundle (delete leg). */
function pruneMaterialization(profileDir: string, name: string): void {
  const path = materializationPath(profileDir, name)
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    return // nothing materialized locally (installation-resolved bundle)
  }
  if (isUpstreamFallbackLink(profileDir, path)) {
    shellLog.info({ code: 'HOST_PROFILE_PRUNE_SKIPPED', message: 'removed bundle materialization is upstream-owned; the host heals it on next boot', data: { bundle: name } })
    return
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) rmSync(path, { recursive: true, force: true, maxRetries: 5 })
  else unlinkSync(path)
  pruneEmptyScopeParent(profileDir, name)
  shellLog.info({ code: 'HOST_PROFILE_PRUNED', message: 'removed bundle materialization pruned from the host profile', data: { bundle: name } })
}

/** Seed (or re-point) a config bundle's profile-local materialization (add leg). */
function ensureMaterialization(
  profileDir: string,
  entry: PluginBundleEntry,
  workspaceRoot: string | undefined,
  resourcesRoot: string | undefined,
): void {
  const path = materializationPath(profileDir, entry.name)
  if (entry.source === undefined) return // resolves from the vendored installation closure
  const spec = resolveSourceSpec(entry, workspaceRoot, resourcesRoot)
  if (spec.kind === 'workspace') return seedWorkspaceLink(profileDir, entry, path, spec.path)
  return seedTarball(profileDir, entry, path, spec.path)
}

/** Dev form: a junction into the workspace package directory. */
function seedWorkspaceLink(profileDir: string, entry: PluginBundleEntry, path: string, sourceDir: string): void {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    stat = undefined
  }
  if (stat !== undefined && isUpstreamFallbackLink(profileDir, path)) {
    shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path is an upstream module-fallback link; leaving it to the host', data: { bundle: entry.name } })
    return
  }
  if (stat !== undefined && !stat.isSymbolicLink()) {
    shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path already holds a non-link package (package-manager owned); leaving it untouched', data: { bundle: entry.name } })
    return
  }
  if (stat !== undefined) unlinkSync(path) // stale shell-seeded link — re-point to the config source
  mkdirSync(dirname(path), { recursive: true })
  linkTree(path, sourceDir)
  shellLog.info({ code: 'HOST_PLUGIN_SEEDED', message: 'bundle materialization seeded from the product config source', data: { bundle: entry.name, form: 'workspace-link', source: sourceDir } })
}

interface SeedMarker {
  bundle: string
  source: string
  sha256: string
  seededAt: string
}

let seedStagingCounter = 0

/**
 * Packaged form (spike §4.1): unpack the staged pnpm-pack artifact into the
 * profile's node_modules as a real directory, write-once — a seed marker
 * carrying the artifact sha256 makes re-runs no-ops and artifact drift (a
 * version bump) re-materialize. Marker-less real directories are foreign
 * (package-manager owned) and left alone; upstream-owned fallback links are
 * the host's business. No pnpm, no network — local file operations only.
 */
function seedTarball(profileDir: string, entry: PluginBundleEntry, path: string, tarballPath: string): void {
  let tarballBytes: Buffer
  try {
    tarballBytes = readFileSync(tarballPath)
  } catch (error) {
    throw new HostProfileError(`tarball source for bundle ${entry.name} is missing at ${tarballPath} — stage the plugin artifacts (pnpm stage:plugin-tarballs) or fix the config source (${String(error)})`)
  }
  const sha256 = createHash('sha256').update(tarballBytes).digest('hex')

  let stat
  try {
    stat = lstatSync(path)
  } catch {
    stat = undefined
  }
  if (stat !== undefined && isUpstreamFallbackLink(profileDir, path)) {
    shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path is an upstream module-fallback link; leaving it to the host', data: { bundle: entry.name } })
    return
  }
  if (stat !== undefined && !stat.isSymbolicLink()) {
    const marker = readSeedMarker(path)
    if (marker === undefined) {
      shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path already holds a non-link package without a shell seed marker (package-manager owned); leaving it untouched', data: { bundle: entry.name } })
      return
    }
    if (marker.bundle === entry.name && marker.source === entry.source && marker.sha256 === sha256
      && readMaterializedName(path) === entry.name) {
      return // steady state: the staged artifact is already materialized (write-once)
    }
    rmSync(path, { recursive: true, force: true, maxRetries: 5 }) // artifact drift — converge
  } else if (stat !== undefined) {
    unlinkSync(path) // stale shell-seeded workspace link — the config now wants the tarball form
  }

  // Stage the unpack in a scratch dir inside the profile, then move the
  // validated package into place — a corrupt or hostile artifact never leaves
  // a partial materialization behind.
  const stagingDir = join(profileDir, `.dsh-forge-seed-${String(process.pid)}-${String(seedStagingCounter++)}`)
  rmSync(stagingDir, { recursive: true, force: true })
  try {
    const extracted = extractTarball(tarballPath, stagingDir)
    const stagedPackage = join(stagingDir, 'package')
    const materializedName = readMaterializedName(stagedPackage)
    if (materializedName !== entry.name) {
      throw new HostProfileError(`tarball for bundle ${entry.name} packages a different identity (${String(materializedName)}) — the config entry and the artifact disagree`)
    }
    mkdirSync(dirname(path), { recursive: true })
    renameSync(stagedPackage, path)
    writeFileSync(join(path, SEED_MARKER_FILE), `${JSON.stringify({
      bundle: entry.name,
      source: entry.source,
      sha256,
      seededAt: new Date().toISOString(),
    } satisfies SeedMarker, undefined, 2)}\n`)
    shellLog.info({ code: 'HOST_PLUGIN_SEEDED', message: 'bundle materialization pre-seeded from the staged tarball', data: { bundle: entry.name, form: 'tarball', artifact: tarballPath, files: extracted.files.length } })
  } catch (error) {
    throw new HostProfileError(`pre-seeding bundle ${entry.name} from ${tarballPath} failed: ${error instanceof TarballError || error instanceof HostProfileError ? error.message : String(error)}`)
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

/** The `name` field of a materialized package manifest (undefined when unreadable). */
function readMaterializedName(packageDir: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    return isPlainObject(parsed) && typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

/** The shell-owned seed marker of a materialization, when present and well-formed. */
function readSeedMarker(packageDir: string): SeedMarker | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(packageDir, SEED_MARKER_FILE), 'utf8'))
    if (!isPlainObject(parsed)) return undefined
    if (typeof parsed.bundle !== 'string' || typeof parsed.source !== 'string' || typeof parsed.sha256 !== 'string') return undefined
    return parsed as SeedMarker
  } catch {
    return undefined
  }
}

interface HostProfileManifest {
  name?: unknown
  private?: unknown
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: unknown } }
}

/** Read the projected profile manifest, failing loud when it is corrupt. */
function readProfileManifest(profileDir: string): HostProfileManifest {
  const manifestPath = join(profileDir, 'package.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new HostProfileError(`host profile manifest ${manifestPath} is not valid JSON: ${String(error)} — remove the directory and relaunch to re-project it`)
  }
  if (!isPlainObject(parsed)) throw new HostProfileError(`host profile manifest ${manifestPath} must hold a JSON object`)
  return parsed
}

/** Order-sensitive bundle list comparison (upstream `sameBundles` semantics). */
function sameBundles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Project the host profile project and the office payload source, reconciling
 * the manifest bundle list and profile-local materializations against the
 * product config (single source of truth), folded with the runtime overlay
 * (task 3.1): mandatory bundles assemble unconditionally (a hand-edited
 * overlay naming them is stripped by the overlay reader — load-side guard,
 * T5), disabled third-party bundles are held out (their injected content
 * exits; re-enabling converges back through the add leg). Existing
 * host-managed materialization is never reset: only the shell-owned manifest
 * list and the shell-seeded links converge to the config; upstream-owned
 * fallback links are left to the host.
 */
export function projectHostProfile(deps: HostProfileDeps): HostProfileProjection {
  const { profileDir, officeSkillsSource, bundles } = deps
  // Task 3.1: the overlay read is defensive (missing = empty; malformed =
  // isolated + rebuilt by the overlay module) — it can never fail the boot.
  const overlay = deps.overlayPath === undefined
    ? { disabled: new Set<string>() }
    : readPluginRuntimeOverlay(deps.overlayPath, bundles.map(entry => ({ name: entry.name, mandatory: entry.mandatory === true })))
  const desired = bundles
    .filter((entry) => {
      if (entry.mandatory === true) return true // protected partition: disabled never applies
      return !overlay.disabled.has(entry.name)
    })
    .map(entry => entry.name)
  for (const entry of bundles) {
    if (entry.mandatory !== true && overlay.disabled.has(entry.name)) {
      shellLog.info({ code: 'HOST_PROFILE_PLUGIN_DISABLED', message: 'third-party bundle held out of the host profile (runtime overlay)', data: { bundle: entry.name } })
    }
  }

  mkdirSync(profileDir, { recursive: true })
  const manifestPath = join(profileDir, 'package.json')
  let currentBundles: string[] = []
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, `${JSON.stringify({
      name: 'dsh-forge-host-profile',
      private: true,
      dsh: { profile: { bundles: [...desired] } },
    }, undefined, 2)}\n`)
    shellLog.info({ code: 'HOST_PROFILE_INITIALIZED', message: 'host profile manifest written', data: { dir: profileDir, bundles: [...desired] } })
  } else {
    const manifest = readProfileManifest(profileDir)
    const declared = manifest.dsh?.profile?.bundles
    if (declared === undefined) currentBundles = []
    else if (Array.isArray(declared) && declared.every(name => typeof name === 'string')) currentBundles = [...declared]
    else throw new HostProfileError(`host profile manifest ${manifestPath} has a non-string-array dsh.profile.bundles`)
    if (!sameBundles(currentBundles, desired)) {
      // Delete leg first (prune while the old list is still known), then rewrite.
      for (const name of currentBundles) {
        if (!desired.includes(name)) pruneMaterialization(profileDir, name)
      }
      const updated = { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...desired] } } }
      writeFileSync(manifestPath, `${JSON.stringify(updated, undefined, 2)}\n`)
      shellLog.info({ code: 'HOST_PROFILE_RECONCILED', message: 'host profile bundle list converged to the product config', data: { from: currentBundles, to: [...desired] } })
    }
  }
  // Add leg: seed profile-local materializations for config entries with a source.
  for (const entry of bundles) ensureMaterialization(profileDir, entry, deps.workspaceRoot, deps.resourcesRoot)

  // Payload: <sibling-of-profileDir>/host-payload/{primary-runtime/, office-skills@link}.
  // The host's office plugin resolves assetRoot = dirname(source)/office-skills.
  const payloadDir = join(dirname(profileDir), 'host-payload')
  const officeSkillsLink = join(payloadDir, 'office-skills')
  const primaryRuntimeSource = join(payloadDir, 'primary-runtime')
  mkdirSync(primaryRuntimeSource, { recursive: true })
  if (!existsSync(officeSkillsSource)) {
    shellLog.warn({ code: 'WARN_HOST_OFFICE_ASSETS_MISSING', message: 'vendored office-skills assets not installed — host boot will fail at the office plugin', data: { expected: officeSkillsSource, remediation: 'node scripts/install-host-closure.mjs' } })
    return { profileDir, primaryRuntimeSource: undefined }
  }
  if (!existsSync(officeSkillsLink)) {
    linkTree(officeSkillsLink, officeSkillsSource)
    shellLog.info({ code: 'HOST_PAYLOAD_LINKED', message: 'office-skills payload linked', data: { target: officeSkillsSource } })
  }
  return { profileDir, primaryRuntimeSource }
}
