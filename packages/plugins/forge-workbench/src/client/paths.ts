/**
 * Pure path primitives shared by the register wizard (task 5.4) and its mock
 * twin — the only place path EQUALITY and directory-name derivation live, so
 * the client-side guard (step ② ERR_DOC_PATH_CONFLICT, spec Error Handling)
 * and the mock verb chain cannot drift apart. Deterministic by construction:
 * no fs access, no platform branching beyond separator spelling.
 */

/**
 * Normalize a path for equality checks: trim whitespace and strip trailing
 * `/` or `\` separators (a lone root separator survives).
 */
export function normalizePathForCompare(path: string): string {
  let value = path.trim()
  while (value.length > 1 && (value.endsWith('/') || value.endsWith('\\'))) {
    value = value.slice(0, -1)
  }
  return value
}

/** Path equality under {@link normalizePathForCompare} (both spellings, both orders). */
export function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b)
}

/**
 * The last non-empty `\` / `/` segment — Interface 1's registerProject
 * displayName default (缺省 = codeRoot 目录名). Empty string when the path has
 * no segments.
 */
export function directoryNameOf(path: string): string {
  const segments = path.split(/[\\/]+/).filter(segment => segment.length > 0)
  return segments.length > 0 ? (segments[segments.length - 1] as string) : ''
}
