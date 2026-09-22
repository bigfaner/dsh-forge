// Test-side fixture builder for task 6: an INDEPENDENT minimal ustar writer
// (deliberately not shared with the src/ reader implementation) so the reader
// is exercised against the tar format itself, plus a tiny npm-pack-shaped
// package tarball factory for the projector-level seeding specs.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export function ustarHeader(name: string, size: number, typeflag: string): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0, 100, 'utf8')
  header.write('0000644\0', 100, 8)
  header.write('0000000\0', 108, 8)
  header.write('0000000\0', 116, 8)
  header.write(`${size.toString(8).padStart(11, '0')} `, 124, 12)
  header.write(`${Math.floor(1_700_000_000).toString(8).padStart(11, '0')} `, 136, 12)
  header.write('        ', 148, 8) // checksum field = spaces while computing
  header.write(typeflag, 156, 1)
  header.write('ustar\0', 257, 6)
  header.write('00', 263, 2)
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return header
}

export function fileEntry(name: string, content: string): Buffer[] {
  const data = Buffer.from(content, 'utf8')
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512)
  return [ustarHeader(name, data.length, '0'), data, padding]
}

export function rawEntry(typeflag: string, data: Buffer): Buffer[] {
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512)
  return [ustarHeader(typeflag === '5' ? 'package-dir-placeholder' : `./${typeflag}-entry`, data.length, typeflag), data, padding]
}

/** pax extended header carrying `path` (the form npm/pnpm packs emit for long names). */
export function paxPathEntry(path: string): Buffer[] {
  const record = Buffer.from(`path=${path}\n`, 'utf8')
  let len = record.length + 2
  for (let i = 0; i < 4; i++) len = record.length + String(len).length + 1
  const line = Buffer.from(`${len} path=${path}\n`, 'utf8')
  return rawEntry('x', line)
}

export function tarballBytes(blocks: Buffer[], { gzip = true }: { gzip?: boolean } = {}): Buffer {
  const tar = Buffer.concat([...blocks, Buffer.alloc(1024)])
  return gzip ? gzipSync(tar) : tar
}

/** Write a fixture tarball into a scratch dir (creating it); returns its absolute path. */
export function writeTarball(blocks: Buffer[], scratchDir: string, file: string): string {
  mkdirSync(scratchDir, { recursive: true })
  const path = join(scratchDir, file)
  writeFileSync(path, tarballBytes(blocks))
  return path
}

/**
 * A complete npm-pack-shaped tarball for one package (files[] face of the
 * hello-world form) — @dsh-forge/plugin-hello-world or a scratch impostor.
 */
export function pluginPackBlocks(name: string, version: string, marker = 'v1'): Buffer[] {
  return [
    ustarHeader('package/', 0, '5'),
    ...fileEntry('package/package.json', `${JSON.stringify({ name, version }, undefined, 2)}\n`),
    ustarHeader('package/lib/', 0, '5'),
    ...fileEntry('package/lib/index.js', `/* host half ${marker} */\nexport function apply() {}\n`),
    ...fileEntry('package/lib/client.js', `/* client half ${marker} */\nexport function apply() {}\n`),
    ...fileEntry('package/cordis.patch.yml', '- id: patch\n'),
  ]
}

let scratchCounter = 0

/** Fresh scratch dir helper for specs that stage fixture tarballs. */
export function makeScratch(): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-tarball-${String(process.pid)}-${String(scratchCounter++)}`))
  return dir
}
