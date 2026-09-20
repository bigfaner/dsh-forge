// GitHub Releases atom feed parsing (pure, no dependencies, no Electron).
// The feed shape (https://github.com/<owner>/<repo>/releases.atom):
//   <feed><entry><title>v0.2.0-rc.1</title>
//     <link rel="alternate" type="text/html" href="https://github.com/.../releases/tag/v0.2.0-rc.1"/>
//   </entry>...</feed>
// Entries are reverse-chronological, but we never trust feed ordering:
// the latest release is the maximum parsed semver across all entries.

import { parseSemver } from './semver.ts'

export interface FeedEntry {
  readonly version: string
  readonly releaseUrl: string
}

export type FeedParseResult =
  | { readonly ok: true; readonly entries: readonly FeedEntry[] }
  | { readonly ok: false }

function extractEntries(xml: string): Array<{ title: string; href: string }> {
  const entries: Array<{ title: string; href: string }> = []
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g
  let entryMatch: RegExpExecArray | null
  while ((entryMatch = entryRe.exec(xml)) !== null) {
    const body = entryMatch[1]
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1]?.trim()
    // Atom link: <link ... href="..."/> — rel defaults to "alternate";
    // take the first http(s) alternate link, matching GH's feed shape.
    const linkBody = /<link\b([^>]*)\/?>/.exec(body)?.[1] ?? ''
    const rel = /\brel="([^"]*)"/.exec(linkBody)?.[1] ?? 'alternate'
    const href = /\bhref="([^"]*)"/.exec(linkBody)?.[1]
    if (title !== undefined && href !== undefined && rel === 'alternate') {
      entries.push({ title, href })
    }
  }
  return entries
}

/**
 * Parse a GitHub Releases atom XML document into valid feed entries.
 * Entries whose title is not a semver (or missing a link) are dropped.
 * Returns { ok: false } for structurally broken feeds (no parseable entries).
 */
export function parseReleaseFeed(xml: string): FeedParseResult {
  let entries: Array<{ title: string; href: string }>
  try {
    entries = extractEntries(xml)
  } catch {
    return { ok: false }
  }
  const parsed = entries.flatMap((entry) => {
    const version = parseSemver(entry.title)
    if (version === undefined) return []
    return [{ version: entry.title.trim().replace(/^[vV]/, ''), releaseUrl: entry.href }]
  })
  if (parsed.length === 0) return { ok: false }
  return { ok: true, entries: parsed }
}
