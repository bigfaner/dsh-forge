// workbench/projects-identity/identity-match — D11 three-tier identity
// comparison (task 1.2). Cascade (task AC + §5.5):
//
//   1. canonical 命中 — probe canonical path exactly equals the stored
//      display canonical (projects.code_root);
//   2. pathKey 命中 — folded comparison keys equal (projects.code_root_key,
//      UNIQUE; case drift / junction re-entry land here);
//   3. (dev,ino) 物理仲裁 — physical identity equal → 「同一项目」 even
//      after a move/rename (dangling stored key); ino arbitrates but is
//      never a key (FAT/network providers are unstable, §5.5).
//
// Any hit yields the self-heal write-back payload (命中即仲裁回写自愈):
// the freshest probe values win; probe nulls keep the stored values; no
// drift → heal = null. NULL/dangling stored keys are tolerated — skipped in
// their tier, backfilled on any-tier hit (悬挂键 null 容忍,注册时回填).
//
// Boundary: this domain never writes the database. The heal payload is
// consumed by the 1.3 register/activation verbs; the match result feeds the
// ERR_PROJECT_EXISTS uniqueness check (比对结果供唯一性校验消费). Pure
// function — no fs, no store imports.

/** projects v3 identity columns as seen by this domain (read-only input). */
export interface RegisteredProjectIdentity {
  readonly projectId: string
  readonly displayName: string
  /** Stored display canonical (projects.code_root). */
  readonly codeRoot: string
  /** Folded comparison key; NULL tolerated (dangling / pre-backfill rows). */
  readonly codeRootKey: string | null
  readonly identityDev: string | null
  readonly identityIno: string | null
}

/** Fresh probe facts produced by the normalization pipeline + stat. */
export interface ProjectIdentityProbe {
  /** Null when realpath failed (string fallback mode). */
  readonly canonicalPath: string | null
  /** Null only when the entry itself was rejected. */
  readonly pathKey: string | null
  readonly identity: { readonly dev: string; readonly ino: string } | null
  readonly identityVerified: boolean
}

/** Write-back payload for the 1.3 verbs (回写自愈; null = nothing to heal). */
export interface IdentityHeal {
  readonly projectId: string
  readonly codeRoot: string
  readonly codeRootKey: string | null
  readonly identityDev: string | null
  readonly identityIno: string | null
  readonly identityVerified: boolean
}

export type IdentityMatchTier = 'canonical' | 'pathKey' | 'physical'

export type IdentityMatchResult =
  | { readonly matched: false }
  | {
    readonly matched: true
    readonly tier: IdentityMatchTier
    readonly project: RegisteredProjectIdentity
    readonly heal: IdentityHeal | null
  }

/**
 * Self-heal payload: merge the fresh probe over the stored row (probe nulls
 * keep stored values — a failed probe must not erase good data) and emit it
 * only when something actually changes.
 */
function computeHeal(row: RegisteredProjectIdentity, probe: ProjectIdentityProbe): IdentityHeal | null {
  const codeRoot = probe.canonicalPath ?? row.codeRoot
  const codeRootKey = probe.pathKey ?? row.codeRootKey
  const identityDev = probe.identity !== null ? probe.identity.dev : row.identityDev
  const identityIno = probe.identity !== null ? probe.identity.ino : row.identityIno
  const unchanged =
    codeRoot === row.codeRoot &&
    codeRootKey === row.codeRootKey &&
    identityDev === row.identityDev &&
    identityIno === row.identityIno
  if (unchanged) return null
  return { projectId: row.projectId, codeRoot, codeRootKey, identityDev, identityIno, identityVerified: probe.identityVerified }
}

/**
 * Run the three-tier cascade over the registry (rows scanned in order; the
 * first hit of the highest tier that matched wins). No match → matched:false
 * (the caller decides ERR_PROJECT_EXISTS vs fresh registration).
 */
export function matchProjectIdentity(
  probe: ProjectIdentityProbe,
  registered: readonly RegisteredProjectIdentity[],
): IdentityMatchResult {
  let hit: RegisteredProjectIdentity | null = null
  let tier: IdentityMatchTier | null = null

  if (probe.canonicalPath !== null) {
    for (const row of registered) {
      if (row.codeRoot === probe.canonicalPath) {
        hit = row
        tier = 'canonical'
        break
      }
    }
  }
  if (hit === null && probe.pathKey !== null) {
    for (const row of registered) {
      if (row.codeRootKey !== null && row.codeRootKey === probe.pathKey) {
        hit = row
        tier = 'pathKey'
        break
      }
    }
  }
  if (hit === null && probe.identity !== null) {
    for (const row of registered) {
      if (
        row.identityDev !== null &&
        row.identityIno !== null &&
        row.identityDev === probe.identity.dev &&
        row.identityIno === probe.identity.ino
      ) {
        hit = row
        tier = 'physical'
        break
      }
    }
  }

  if (hit === null || tier === null) return { matched: false }
  return { matched: true, tier, project: hit, heal: computeHeal(hit, probe) }
}
