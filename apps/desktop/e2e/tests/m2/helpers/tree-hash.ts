// e2e/tests/m2/helpers/tree-hash — task 6.4 Implementation Notes file: the
// SC5-3 Hard-Rule assertion base (移除断言必须文件系统级:哈希/目录树对拍,
// UI 层消失不算充分).
//
// hashTree walks one root depth-first in SORTED order and digests every FILE
// (path + byte content — mtimes deliberately excluded: the removal promise is
// ZERO content change, not zero mtime drift). The returned handle carries the
// per-entry map (diagnosable diffs) plus one aggregate digest (fast compare).
//
// assertTreesIdentical is the leg-facing check: entry-set and per-entry digest
// equality, with ≤4 sample paths on failure so a mismatch names the file.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'

/** A tree's content digest: per-relative-path file digests + the aggregate. */
export interface TreeHash {
  /** relPath (posix separators, root-relative) → sha256(path + content). */
  readonly entries: ReadonlyMap<string, string>
  /** sha256 over every sorted entry line — one-shot equality. */
  readonly digest: string
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

/**
 * Digest a directory tree (files only; symlinked dirs are not followed — the
 * fixture trees never carry them). A missing root hashes as EMPTY (removal of
 * the whole tree is still a comparable fact).
 */
export function hashTree(root: string): TreeHash {
  const entries = new Map<string, string>()
  const walk = (dir: string, rel: string): void => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return // unreadable/missing — the walker's own probe discipline
    }
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const name of names) {
      const abs = join(dir, name)
      const childRel = rel === '' ? name : `${rel}/${name}`
      let isDirectory: boolean
      try {
        isDirectory = statSync(abs).isDirectory()
      } catch {
        continue
      }
      if (isDirectory) {
        walk(abs, childRel)
      } else {
        let content: Buffer
        try {
          content = readFileSync(abs)
        } catch {
          continue
        }
        entries.set(childRel, sha256(`${childRel}\0${content.toString('binary')}`))
      }
    }
  }
  walk(root, '')
  const digest = sha256([...entries.entries()].map(([path, hash]) => `${path}\0${hash}`).join('\n'))
  return { entries, digest }
}

/**
 * SC5-3's Hard-Rule check: two digests of the SAME root taken across a remove
 * must be identical (zero file added/removed/rewritten).
 */
export function assertTreesIdentical(label: string, before: TreeHash, after: TreeHash): void {
  const samples: string[] = []
  for (const [path, hash] of before.entries) {
    if (after.entries.get(path) !== hash) samples.push(`changed/missing: ${path}`)
    if (samples.length >= 4) break
  }
  for (const path of after.entries.keys()) {
    if (!before.entries.has(path)) samples.push(`unexpected: ${path}`)
    if (samples.length >= 4) break
  }
  expect(
    after.digest,
    `${label}: tree content changed across remove (samples: ${samples.join('; ') || 'none'})`,
  ).toBe(before.digest)
  expect([...after.entries.keys()].length, `${label}: entry count`).toBe(before.entries.size)
}
