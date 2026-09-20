import { describe, expect, it } from 'vitest'
import { desktopRuntimeFileExclusion, nodeRuntimeFileExclusion } from '../scripts/runtime-file-policy.mjs'

const linux = { platform: 'linux', arch: 'x64' }

describe('desktopRuntimeFileExclusion (vendored tree / closure trim)', () => {
  it('keeps ordinary runtime source', () => {
    expect(desktopRuntimeFileExclusion('packages/core/src/index.ts', linux)).toBeUndefined()
    expect(desktopRuntimeFileExclusion('apps/desktop-host/src/index.ts', linux)).toBeUndefined()
  })

  it('drops package-manager metadata anywhere in the path', () => {
    expect(desktopRuntimeFileExclusion('node_modules/.bin/tool', linux)).toBe('package-manager metadata')
    expect(desktopRuntimeFileExclusion('vendor/node_modules/.pnpm/pkg', linux)).toBe('package-manager metadata')
  })

  it('drops source maps, declarations and build caches', () => {
    expect(desktopRuntimeFileExclusion('a/main.js.map', linux)).toBe('source map')
    expect(desktopRuntimeFileExclusion('a/index.d.ts', linux)).toBe('TypeScript declaration')
    expect(desktopRuntimeFileExclusion('a/x.tsbuildinfo', linux)).toBe('TypeScript build cache')
  })

  it('drops node-pty prebuilds for other platforms and pdb symbols, keeps target prebuild', () => {
    expect(desktopRuntimeFileExclusion('node_modules/node-pty/prebuilds/win32-x64/pty.node', linux))
      .toBe('node-pty other platform')
    expect(desktopRuntimeFileExclusion('node_modules/node-pty/prebuilds/linux-x64/pty.pdb', linux))
      .toBe('node-pty debug symbols')
    expect(desktopRuntimeFileExclusion('node_modules/node-pty/prebuilds/linux-x64/pty.node', linux)).toBeUndefined()
  })

  it('keeps LICENSE files while dropping other documentation', () => {
    expect(desktopRuntimeFileExclusion('node_modules/foo/LICENSE.md', linux)).toBeUndefined()
    expect(desktopRuntimeFileExclusion('node_modules/foo/README.md', linux)).toBeUndefined()
    expect(desktopRuntimeFileExclusion('node_modules/foo/HISTORY.md', linux)).toBe('documentation')
  })
})

describe('nodeRuntimeFileExclusion (standalone Node dist trim)', () => {
  it('keeps the node executable and its libraries', () => {
    expect(nodeRuntimeFileExclusion('node.exe')).toBeUndefined()
    expect(nodeRuntimeFileExclusion('bin/node')).toBeUndefined()
    expect(nodeRuntimeFileExclusion('bin/node.exe')).toBeUndefined()
  })

  it('drops npm/corepack/include subtrees and tool shims', () => {
    expect(nodeRuntimeFileExclusion('npm/node_modules/npm/lib/npm.js')).toBe('node dist npm')
    expect(nodeRuntimeFileExclusion('corepack/dist/corepack.js')).toBe('node dist corepack')
    expect(nodeRuntimeFileExclusion('include/node/node.h')).toBe('node dist include')
    expect(nodeRuntimeFileExclusion('npm.cmd')).toBe('node dist tool shim')
    expect(nodeRuntimeFileExclusion('bin/corepack')).toBeUndefined() // bin/ content kept (unix layout)
  })

  it('drops dist metadata at the root only', () => {
    expect(nodeRuntimeFileExclusion('CHANGELOG.md')).toBe('node dist metadata')
    expect(nodeRuntimeFileExclusion('docs/CHANGELOG.md')).toBeUndefined()
  })
})
