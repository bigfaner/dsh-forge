// Minimal, dependency-free tar reader for the packaged plugin pre-seeding
// (ui-plugin-foundation task 6; spike-report §4.1: "tarball built-in +
// shell-side pre-seeding" — no pnpm, no network at materialization time).
//
// node:tar does not exist on this toolchain (Node 24.9 / Electron's node both
// lack the builtin), and pulling a tar dependency into the shell main for a
// ~10KB JS-only artifact is not worth it — the npm-pack tar shape is small:
// regular files + directories under one `package/` root, ustar names with
// pax/GNU-longname extensions. This reader accepts exactly that and nothing
// more, and is deliberately paranoid:
//   - validation of EVERY entry completes before a single byte is written
//     (two-phase: parse + validate, then write);
//   - paths outside the `package/` root (traversal, absolute, wrong root),
//     link/device entries, checksum mismatches, truncations, and size/entry
//     caps all fail loud (TarballError) leaving the destination untouched.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

/** One unpacked tar entry, paths relative to the archive's `package/` root. */
export interface TarballEntry {
  /** Relative path inside the package ('' for the root directory entry). */
  readonly path: string
  /** Byte length of the entry body (files only). */
  readonly size: number
  /** Offset of the body inside the decompressed archive buffer. */
  readonly offset: number
  readonly isDirectory: boolean
}

/** Result of a successful extraction. */
export interface TarballExtractResult {
  /** Relative paths of written files (package-root relative). */
  readonly files: readonly string[]
  /** Relative paths of created directories ('' = the package root itself). */
  readonly dirs: readonly string[]
}

/** A malformed / unsupported / hostile tarball (explicit startup error path). */
export class TarballError extends Error {
  readonly code = 'ERR_TARBALL'

  constructor(message: string) {
    super(message)
    this.name = 'TarballError'
  }
}

const HEADER_SIZE = 512
const GZIP_MAGIC = 0x1f8b
const TAR_ROOT = 'package'
/** Generous for JS-only plugin packs; a red light long before anything pathological. */
const MAX_TOTAL_BYTES = 128 * 1024 * 1024
const MAX_ENTRIES = 8192

interface PendingMeta {
  path?: string
  globalPath?: string
}

function fail(message: string): never {
  throw new TarballError(`invalid plugin tarball: ${message}`)
}

/** Decode a NUL-terminated ASCII string field. */
function fieldString(header: Buffer, offset: number, length: number): string {
  const raw = header.subarray(offset, offset + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
}

/** Parse a tar numeric field (octal ASCII, space/NUL padded). */
function fieldOctal(header: Buffer, offset: number, length: number, what: string): number {
  const raw = fieldString(header, offset, length).replace(/[\s\u0000]/gu, '')
  if (raw === '') return 0
  if (!/^[0-7]+$/u.test(raw)) fail(`${what} field is not octal ("${raw}")`)
  const value = Number.parseInt(raw, 8)
  if (!Number.isSafeInteger(value)) fail(`${what} field overflows`)
  return value
}

/** Verify the ustar header checksum (field bytes counted as spaces). */
function verifyChecksum(header: Buffer): void {
  let sum = 0
  for (let i = 0; i < HEADER_SIZE; i++) sum += i >= 148 && i < 156 ? 32 : header[i]
  const stored = fieldOctal(header, 148, 8, 'checksum')
  if (sum !== stored) fail(`header checksum mismatch (stored ${String(stored)}, computed ${String(sum)})`)
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) {
    if (byte !== 0) return false
  }
  return true
}

/** Parse pax extended-header records ("<len> key=value\n" lines). */
function parsePaxRecords(data: Buffer, into: Record<string, string>): void {
  let cursor = 0
  while (cursor < data.length) {
    const spaceAt = data.indexOf(0x20, cursor)
    if (spaceAt === -1) fail('malformed pax record (no length separator)')
    const lengthText = data.subarray(cursor, spaceAt).toString('ascii')
    if (!/^[0-9]+$/u.test(lengthText)) fail(`malformed pax record length ("${lengthText}")`)
    const recordLength = Number.parseInt(lengthText, 10)
    const recordStart = cursor
    cursor += recordLength
    if (cursor <= recordStart || cursor > data.length) fail('pax record length escapes the archive body')
    const line = data.subarray(recordStart, cursor).toString('utf8')
    const eqAt = line.indexOf('=')
    if (eqAt === -1 || !line.endsWith('\n')) fail('malformed pax record (no key=value terminator)')
    into[line.slice(spaceAt - recordStart + 1, eqAt)] = line.slice(eqAt + 1, -1)
  }
}

/** Validate one resolved entry path against the single-package-root contract. */
function validateEntryPath(raw: string): string {
  if (raw === '') fail('entry with an empty name')
  if (raw.includes('\\')) fail(`entry name uses a backslash ("${raw}")`)
  if (raw.includes('\0')) fail('entry name contains a NUL')
  const withSlash = raw.endsWith('/') ? raw : `${raw}/`
  if (withSlash !== `${TAR_ROOT}/` && !withSlash.startsWith(`${TAR_ROOT}/`)) {
    fail(`entry outside the ${TAR_ROOT}/ root ("${raw}")`)
  }
  const rel = withSlash.slice(TAR_ROOT.length + 1)
  const segments = rel === '' ? [] : rel.slice(0, -1).split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') fail(`entry path traversal ("${raw}")`)
  }
  return segments.join('/')
}

interface ParsedArchive {
  readonly entries: readonly TarballEntry[]
}

/** Phase 1: parse + validate every entry (no writes). */
function parseArchive(buffer: Buffer): ParsedArchive {
  const entries: TarballEntry[] = []
  let cursor = 0
  let totalBytes = 0
  const globals: Record<string, string> = {}
  const pending: PendingMeta = {}
  let longName: string | undefined

  while (cursor + HEADER_SIZE <= buffer.length) {
    const header = buffer.subarray(cursor, cursor + HEADER_SIZE)
    if (isZeroBlock(header)) return { entries } // end-of-archive block
    verifyChecksum(header)
    const size = fieldOctal(header, 124, 12, 'size')
    totalBytes += size
    if (totalBytes > MAX_TOTAL_BYTES) fail('total uncompressed size exceeds the cap')
    const bodyOffset = cursor + HEADER_SIZE
    const padded = size + (size % HEADER_SIZE === 0 ? 0 : HEADER_SIZE - (size % HEADER_SIZE))
    if (bodyOffset + size > buffer.length) fail(`truncated body for entry ("${fieldString(header, 0, 100)}")`)
    const typeflag = String.fromCharCode(header[156] ?? 0)
    const body = buffer.subarray(bodyOffset, bodyOffset + size)

    if (typeflag === 'x' || typeflag === 'g') {
      const records: Record<string, string> = {}
      parsePaxRecords(body, records)
      if (typeflag === 'g') Object.assign(globals, records)
      else pending.path = records.path
      cursor = bodyOffset + padded
      continue
    }
    if (typeflag === 'L' || typeflag === 'K') {
      const text = body.toString('utf8').replace(/\0.*$/su, '')
      if (typeflag === 'L') longName = text
      // 'K' (long link name) only matters for link entries, which are rejected.
      cursor = bodyOffset + padded
      continue
    }
    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '5') {
      fail(`unsupported entry type "${typeflag}" (only plain files and directories — links and devices are rejected)`)
    }

    const ustarName = `${fieldString(header, 345, 155)}${fieldString(header, 0, 100)}`
    const resolved = longName ?? pending.path ?? globals.path ?? ustarName
    longName = undefined
    pending.path = undefined
    const relPath = validateEntryPath(resolved)
    const isDirectory = typeflag === '5' || resolved.endsWith('/')
    if (isDirectory && size !== 0) fail(`directory entry with a body ("${resolved}")`)
    if (entries.length >= MAX_ENTRIES) fail('entry count exceeds the cap')
    entries.push({ path: relPath, size, offset: bodyOffset, isDirectory })
    cursor = bodyOffset + padded
  }
  if (entries.length === 0) fail('no entries before end of archive')
  if (cursor < buffer.length && cursor + HEADER_SIZE > buffer.length) fail('truncated trailing header')
  return { entries }
}

/**
 * Unpack a (gzipped) npm-pack-shaped tarball so that its `package/` root lands
 * as `<destDir>/package`. Nothing is written unless every entry validates.
 * @param tarballPath - path of the .tgz artifact (gzipped or plain tar).
 * @param destDir - destination directory (created; must not hold a `package` entry).
 * @returns the written files / created directories, package-root relative.
 */
export function extractTarball(tarballPath: string, destDir: string): TarballExtractResult {
  let raw: Buffer
  try {
    raw = readFileSync(tarballPath)
  } catch (error) {
    fail(`cannot read ${tarballPath}: ${String(error)}`)
  }
  let buffer: Buffer = raw
  if (raw.length >= 2 && raw[0] === (GZIP_MAGIC >> 8) && raw[1] === (GZIP_MAGIC & 0xff)) {
    try {
      buffer = gunzipSync(raw)
    } catch (error) {
      fail(`cannot decompress gzip: ${String(error)}`)
    }
  }
  const { entries } = parseArchive(buffer)

  const packageDir = `${destDir}/${TAR_ROOT}`
  mkdirSync(packageDir, { recursive: true })
  const files: string[] = []
  const dirs: string[] = ['']
  for (const entry of entries) {
    const target = entry.path === '' ? packageDir : `${packageDir}/${entry.path}`
    if (entry.isDirectory) {
      mkdirSync(target, { recursive: true })
      if (!dirs.includes(entry.path)) dirs.push(entry.path)
      continue
    }
    mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
    writeFileSync(target, buffer.subarray(entry.offset, entry.offset + entry.size))
    files.push(entry.path)
  }
  return { files, dirs }
}
