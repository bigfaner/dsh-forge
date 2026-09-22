import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { extractTarball, TarballError } from '../src/main/host-profile/tarball.ts'
import {
  fileEntry, makeScratch, pluginPackBlocks, tarballBytes, ustarHeader, writeTarball,
} from './helpers/tarball-fixture.ts'

// Task 6 (spike-report §4.1): the packaged distribution form is "tarball
// built-in + shell-side pre-seeding" — the shell unpacks the npm-pack
// artifact into the profile's node_modules itself, with no pnpm and no
// network. That needs a dependency-free tar reader (node:tar is not
// available on this toolchain: Node 24.9 has no such builtin), deliberately
// strict: only the npm-pack shape (regular files + directories under one
// `package/` root) is accepted, validation completes before anything is
// written, and every deviation fails loud.
//
// Fixtures come from the independent test-side ustar writer (helpers/), so
// the reader is exercised against the format, not against itself.

const scratches: string[] = []
const scratch = () => {
  const dir = makeScratch()
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

describe('extractTarball (task 6 pre-seeding carrier)', () => {
  it('unpacks a gzipped npm-pack-shaped tarball into the destination', () => {
    const dir = scratch()
    const path = writeTarball(pluginPackBlocks('@dsh-forge/plugin-x', '0.1.0'), dir, 'fixture.tgz')
    const result = extractTarball(path, join(dir, 'out'))
    expect(result.files.sort()).toEqual([
      'cordis.patch.yml', 'lib/client.js', 'lib/index.js', 'package.json',
    ])
    expect(result.dirs.sort()).toEqual(['', 'lib'])
    expect(readFileSync(join(dir, 'out', 'package', 'lib', 'client.js'), 'utf8')).toContain('client half')
  })

  it('accepts a plain (non-gzipped) tar', () => {
    const dir = scratch()
    const path = join(dir, 'plain.tar')
    writeFileSync(path, tarballBytes(fileEntry('package/a.js', 'x'), { gzip: false }))
    extractTarball(path, join(dir, 'out'))
    expect(readFileSync(join(dir, 'out', 'package', 'a.js'), 'utf8')).toBe('x')
  })

  it('rejects entries outside the single package/ root — nothing is written', () => {
    for (const evil of ['../evil.js', '/abs/evil.js', 'package/../../evil.js', 'other/file.js', 'package/../escape.js']) {
      const dir = scratch()
      const dest = join(dir, 'out')
      expect(() => extractTarball(writeTarball(fileEntry(evil, 'x'), dir, 'evil.tgz'), dest), evil).toThrow(TarballError)
      expect(existsSync(dest)).toBe(false)
    }
  })

  it('rejects symlink and hardlink entries loudly', () => {
    // A tar whose first entry is a link: the validate-then-write design must
    // abort before writing anything.
    const dir = scratch()
    const dest = join(dir, 'out')
    const linkBlocks = [ustarHeader('package/link.js', 0, '2'), ...fileEntry('package/real.js', 'ok')]
    expect(() => extractTarball(writeTarball(linkBlocks, dir, 'link.tgz'), dest)).toThrow(/link/u)
    expect(existsSync(dest)).toBe(false)
  })

  it('honors pax extended-header path overrides (long names)', () => {
    const longName = 'package/lib/types/' + 'very-long-segment-'.repeat(10) + 'index.d.ts'
    const dir = scratch()
    // The real npm/pnpm form: a short placeholder name on the entry + a pax
    // `path` override carried by the preceding 'x' header.
    const record = Buffer.from(`path=${longName}\n`, 'utf8')
    let len = record.length + 2
    for (let i = 0; i < 4; i++) len = record.length + String(len).length + 1
    const line = Buffer.from(`${len} path=${longName}\n`, 'utf8')
    const linePadding = Buffer.alloc((512 - (line.length % 512)) % 512)
    const tarball = writeTarball([
      ustarHeader('./PaxHeaders/plugin', line.length, 'x'), line, linePadding,
      ...fileEntry('package/PLACEHOLDER', 'typed'),
    ], dir, 'pax.tgz')
    const dest = join(dir, 'out')
    extractTarball(tarball, dest)
    expect(readFileSync(join(dest, ...longName.split('/')), 'utf8')).toBe('typed')
    expect(existsSync(join(dest, 'package', 'PLACEHOLDER'))).toBe(false)
  })

  it('honors GNU longname (L) entries', () => {
    const longName = `package/${'l'.repeat(120)}.js`
    const dir = scratch()
    const data = Buffer.from(`${longName}\0`, 'utf8')
    const padding = Buffer.alloc((512 - (data.length % 512)) % 512)
    const tarball = writeTarball([
      ustarHeader('././@LongLink', data.length, 'L'), data, padding,
      ...fileEntry('package/short-name.js', 'content'),
    ], dir, 'gnu.tgz')
    const dest = join(dir, 'out')
    extractTarball(tarball, dest)
    expect(readFileSync(join(dest, ...longName.split('/')), 'utf8')).toBe('content')
  })

  it('fails loud on non-tar garbage, bad checksums, and truncated bodies', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'garbage.tgz'), gzipSync(Buffer.from('this is not a tar at all.........')))
    expect(() => extractTarball(join(dir, 'garbage.tgz'), join(dir, 'out'))).toThrow(TarballError)

    // Bad checksum: mutate a name byte after checksum computation.
    const blocks = fileEntry('package/a.js', 'x')
    ;(blocks[0] as Buffer).write('b.js', 0)
    expect(() => extractTarball(writeTarball(blocks, dir, 'badsum.tgz'), join(dir, 'out2'))).toThrow(/checksum/u)

    // Truncated: header declares 4096 bytes, the archive holds one block.
    const truncated = writeTarball([ustarHeader('package/big.js', 4096, '0'), Buffer.alloc(512)], dir, 'cut.tgz')
    const bytes = readFileSync(truncated)
    writeFileSync(truncated, bytes.subarray(0, 1024))
    expect(() => extractTarball(truncated, join(dir, 'out3'))).toThrow(TarballError)
  })

  it('fails loud when the size cap is exceeded', () => {
    const dir = scratch()
    const huge = Buffer.alloc(512)
    huge.write('package/huge.js', 0, 100)
    huge.write(`${(200 * 1024 * 1024).toString(8).padStart(11, '0')} `, 124, 12)
    huge.write('        ', 148, 8)
    huge.write('0', 156, 1)
    huge.write('ustar\0', 257, 6)
    let sum = 0
    for (const byte of huge) sum += byte
    huge.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
    expect(() => extractTarball(writeTarball([huge], dir, 'huge.tgz'), join(dir, 'out'))).toThrow(TarballError)
  })
})
