// package-release 契约测试（plugin-forge-combo 1.12——G1 打包门）：
// 发布树结构 / manifest 一致性 / solo 字段剥离 / 发布树字段自检门（反例红）/
// zip 产出。被测物 = scripts/package-release.mjs（字段驱动纯物化器）——
// fixture 为最小合成仓（forge + 两件成员），机检面与真仓六包同构。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assembleRelease,
  discoverPackages,
  patchInsertNames,
  relativeFileDep,
  soloDependencies,
  verifyReleaseTree,
} from '../../../scripts/package-release.mjs'

/** 最小合成成员包（dist + skills + patch + client bundle 声明面与真仓同构） */
function writeMember(root, short, version) {
  const dir = join(root, 'plugins', short)
  mkdirSync(join(dir, 'dist', 'host'), { recursive: true })
  mkdirSync(join(dir, 'skills'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'host', 'index.js'), 'export const x = 1\n')
  writeFileSync(join(dir, 'dist', 'client.js'), 'export const ui = 1\n')
  writeFileSync(join(dir, 'skills', 'demo.md'), '# demo\n')
  writeFileSync(join(dir, 'cordis.patch.yml'), "- insert:\n    - id: demo\n      name: '@dsh-forge/" + short + "'\n")
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: '@dsh-forge/' + short,
      version,
      private: true,
      type: 'module',
      main: './dist/host/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      exports: { '.': './dist/host/index.js', './client': { types: './dist/client.d.ts', default: './dist/client.js' } },
      files: ['dist', 'skills', 'cordis.patch.yml'],
      scripts: { build: 'tsc -b', prepack: 'node scripts/self-containment.mjs' },
      devDependencies: { '@dsh-forge/lib-util': 'workspace:*', typescript: '6.0.3' },
      dependencies: { zod: '4.6.6' },
      peerDependencies: { '@deepseek-ai/cordis': '4.0.4' },
    }, null, 2),
  )
}

/** 最小合成仓：forge（两条相对 file: 依赖 + 双裸名插行）+ alpha + beta */
function writeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'dshf-pkgrel-'))
  const forgeDir = join(root, 'plugins', 'forge')
  mkdirSync(forgeDir, { recursive: true })
  writeFileSync(join(forgeDir, 'cordis.patch.yml'), [
    '- insert:',
    "    - id: alpha",
    "      name: '@dsh-forge/alpha'",
    "    - id: beta",
    "      name: '@dsh-forge/beta'",
    '',
  ].join('\n'))
  writeFileSync(
    join(forgeDir, 'package.json'),
    JSON.stringify({
      name: '@dsh-forge/forge',
      version: '0.1.3',
      private: true,
      type: 'module',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      files: ['cordis.patch.yml'],
      dependencies: { '@dsh-forge/alpha': 'file:../alpha', '@dsh-forge/beta': 'file:../beta' },
    }, null, 2),
  )
  writeMember(root, 'alpha', '0.26.1')
  writeMember(root, 'beta', '0.18.1')
  return root
}

describe('discoverPackages（字段驱动六包发现）', () => {
  it('forge + file: 依赖成员按声明发现', () => {
    const root = writeFixtureRepo()
    try {
      const pkgs = discoverPackages(root)
      expect(pkgs.map((p) => p.name)).toEqual(['@dsh-forge/forge', '@dsh-forge/alpha', '@dsh-forge/beta'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('assembleRelease（发布树结构 + solo 剥离 + manifest）', () => {
  let root, outDir
  beforeEach(() => {
    root = writeFixtureRepo()
    outDir = join(mkdtempSync(join(tmpdir(), 'dshf-pkgrel-out-')), 'tree')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(dirnameOf(outDir), { recursive: true, force: true })
  })
  const dirnameOf = (p) => p.replace(/[\\/][^\\/]+$/, '')

  it('发布树结构：六包共置 + files 条目拷贝完整 + forge 依赖重写相对 file: + devDeps/scripts 剥离', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false })
    for (const dir of ['forge', 'alpha', 'beta']) {
      expect(existsSync(join(outDir, dir, 'package.json')), dir).toBe(true)
    }
    for (const rel of ['alpha/dist/client.js', 'alpha/dist/host/index.js', 'alpha/skills/demo.md', 'alpha/cordis.patch.yml', 'beta/dist/client.js']) {
      expect(existsSync(join(outDir, rel)), rel).toBe(true)
    }
    const forge = JSON.parse(readFileSync(join(outDir, 'forge', 'package.json'), 'utf8'))
    expect(forge.dependencies).toEqual({ '@dsh-forge/alpha': 'file:../alpha', '@dsh-forge/beta': 'file:../beta' })
    const alpha = JSON.parse(readFileSync(join(outDir, 'alpha', 'package.json'), 'utf8'))
    expect(alpha.devDependencies).toBeUndefined()
    expect(alpha.scripts).toBeUndefined()
    expect(alpha.dependencies).toEqual({ zod: '4.6.6' })
    expect(alpha.peerDependencies).toEqual({ '@deepseek-ai/cordis': '4.0.4' })
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(true)
  })

  it('manifest 一致性机检全绿：版本清单与树内实读逐包一致', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false })
    expect(verifyReleaseTree(outDir, { repoRoot: root })).toEqual([])
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.packages['@dsh-forge/alpha']).toEqual({ version: '0.26.1', dir: 'alpha' })
    expect(manifest.packages['@dsh-forge/forge'].version).toBe('0.1.3')
  })

  it('solo 变体：五条（此处两条）file: 依赖全剥离 + 裸名插行原文保留', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false })
    const solo = JSON.parse(readFileSync(join(outDir, 'solo', 'forge', 'package.json'), 'utf8'))
    expect(Object.keys(solo.dependencies ?? {}).length).toBe(0)
    const soloPatch = readFileSync(join(outDir, 'solo', 'forge', 'cordis.patch.yml'), 'utf8')
    expect(patchInsertNames(soloPatch)).toEqual(['@dsh-forge/alpha', '@dsh-forge/beta'])
    expect(soloPatch).toBe(readFileSync(join(outDir, 'forge', 'cordis.patch.yml'), 'utf8'))
  })

  it('反例·client bundle 缺席：自检门红（拷贝遗漏出树前堵截）', () => {
    rmSync(join(root, 'plugins', 'alpha', 'dist', 'client.js'))
    assembleRelease({ repoRoot: root, outDir, zip: false })
    const violations = verifyReleaseTree(outDir, { repoRoot: root })
    expect(violations.some((v) => v.includes('@dsh-forge/alpha') && v.includes('client bundle 文件缺席'))).toBe(true)
  })

  it('反例·版本不一致：manifest vs 树内实读红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false })
    const alphaPkg = join(outDir, 'alpha', 'package.json')
    const pkg = JSON.parse(readFileSync(alphaPkg, 'utf8'))
    pkg.version = '9.9.9'
    writeFileSync(alphaPkg, JSON.stringify(pkg, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('@dsh-forge/alpha') && v.includes('版本不一致'))).toBe(true)
  })

  it('反例·forge file: 依赖缺插行对应：机检红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false })
    const forgePkg = join(outDir, 'forge', 'package.json')
    const pkg = JSON.parse(readFileSync(forgePkg, 'utf8'))
    pkg.dependencies['@dsh-forge/stray'] = 'file:../stray'
    writeFileSync(forgePkg, JSON.stringify(pkg, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('file: 依赖无插行对应 @dsh-forge/stray'))).toBe(true)
  })

  it('zip 产出：非空产物落盘', () => {
    const { zipPath } = assembleRelease({ repoRoot: root, outDir, zip: true })
    expect(zipPath).toBeDefined()
    expect(statSync(zipPath).size).toBeGreaterThan(0)
  })
})

describe('纯函数面', () => {
  it('soloDependencies 剥离 file: 保留 registry 依赖', () => {
    expect(soloDependencies({ dependencies: { a: 'file:../a', b: 'zod' } })).toEqual({ b: 'zod' })
  })
  it('relativeFileDep 产出 POSIX 兄弟相对形态', () => {
    expect(relativeFileDep(join('t', 'forge'), join('t', 'alpha'))).toBe('file:../alpha')
  })
})
