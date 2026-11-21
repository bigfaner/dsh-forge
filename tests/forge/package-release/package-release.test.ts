// package-release 契约测试（plugin-forge-combo 1.12——G1 打包门；forge-deep-pack 1.9 改形）：
// 发布树结构 / manifest 一致性 / solo 字段剥离 / 发布树字段自检门（反例红）/
// forge 单行自插断言（五件零插行——组合缝激活）/ 五件各件自带插行断言 /
// deep 通道齐备性机检 / zip 产出。被测物 = scripts/package-release.mjs（字段驱动
// 纯物化器）——fixture 为最小合成仓（forge + 两件成员），机检面与真仓六包同构；
// deep 变体真机产出归 deep-build（deep-build 内置 freshness 自动编译），此处只
// 测通道齐备性机检面（deep:false 出树 + 合成 deep 目录验证）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assembleRelease,
  discoverPackages,
  patchInsertEntryNames,
  patchInsertNames,
  relativeFileDep,
  soloDependencies,
  verifyReleaseTree,
} from '../../../scripts/package-release.mjs'

/** 最小合成成员包（dist + skills + patch + client bundle 声明面与真仓同构；自带插行=solo 语义在五件侧） */
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

/** 最小合成仓：forge（两条相对 file: 依赖 + 单行自插）+ alpha + beta（各件自带插行） */
function writeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'dshf-pkgrel-'))
  const forgeDir = join(root, 'plugins', 'forge')
  mkdirSync(forgeDir, { recursive: true })
  writeFileSync(join(forgeDir, 'cordis.patch.yml'), [
    '- insert:',
    "    - id: forge",
    "      name: '@dsh-forge/forge'",
    "      config:",
    "        home: 'demo'",
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
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
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

  it('manifest 一致性机检全绿：版本清单与树内实读逐包一致（deep:false 面零违规）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    expect(verifyReleaseTree(outDir, { repoRoot: root, deep: false })).toEqual([])
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.packages['@dsh-forge/alpha']).toEqual({ version: '0.26.1', dir: 'alpha' })
    expect(manifest.packages['@dsh-forge/forge'].version).toBe('0.1.3')
    expect(manifest.channels.deep).toBeUndefined()
  })

  it('solo 变体：file: 依赖全剥离 + forge patch 单行自插（裸名行形态退役）+ 成员自带插行在树侧保留', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const solo = JSON.parse(readFileSync(join(outDir, 'solo', 'forge', 'package.json'), 'utf8'))
    expect(Object.keys(solo.dependencies ?? {}).length).toBe(0)
    const soloPatch = readFileSync(join(outDir, 'solo', 'forge', 'cordis.patch.yml'), 'utf8')
    expect(patchInsertNames(soloPatch)).toEqual(['@dsh-forge/forge'])
    expect(soloPatch).toBe(readFileSync(join(outDir, 'forge', 'cordis.patch.yml'), 'utf8'))
    // solo 语义 = 五件各件自带插行 + forge 单行：成员插行随包收录在树侧
    const alphaPatch = readFileSync(join(outDir, 'alpha', 'cordis.patch.yml'), 'utf8')
    expect(patchInsertNames(alphaPatch)).toEqual(['@dsh-forge/alpha'])
  })

  it('反例·client bundle 缺席：自检门红（拷贝遗漏出树前堵截）', () => {
    rmSync(join(root, 'plugins', 'alpha', 'dist', 'client.js'))
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const violations = verifyReleaseTree(outDir, { repoRoot: root, deep: false })
    expect(violations.some((v) => v.includes('@dsh-forge/alpha') && v.includes('client bundle 文件缺席'))).toBe(true)
  })

  it('反例·版本不一致：manifest vs 树内实读红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const alphaPkg = join(outDir, 'alpha', 'package.json')
    const pkg = JSON.parse(readFileSync(alphaPkg, 'utf8'))
    pkg.version = '9.9.9'
    writeFileSync(alphaPkg, JSON.stringify(pkg, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root, deep: false }).some((v) => v.includes('@dsh-forge/alpha') && v.includes('版本不一致'))).toBe(true)
  })

  it('反例·forge patch 非单行自插：机检红（单行自插断言——五件零插行）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const forgePatchPath = join(outDir, 'forge', 'cordis.patch.yml')
    writeFileSync(forgePatchPath, `${readFileSync(forgePatchPath, 'utf8')}    - id: alpha\n      name: '@dsh-forge/alpha'\n`)
    expect(verifyReleaseTree(outDir, { repoRoot: root, deep: false }).some((v) => v.includes('forge') && v.includes('非单行自插'))).toBe(true)
  })

  it('反例·成员自带插行缺席：机检红（五插行语义在五件侧，不得误剥）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    writeFileSync(join(outDir, 'alpha', 'cordis.patch.yml'), '# 插行被误剥\n')
    expect(verifyReleaseTree(outDir, { repoRoot: root, deep: false }).some((v) => v.includes('@dsh-forge/alpha') && v.includes('自带插行缺席'))).toBe(true)
  })

  it('deep 通道齐备性机检：deep:false 出树后 deep:true 校验红（channels.deep/tgz/staging 缺席）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const violations = verifyReleaseTree(outDir, { repoRoot: root, deep: true })
    expect(violations.some((v) => v.includes('deep') && v.includes('channels.deep 缺席'))).toBe(true)
    expect(violations.some((v) => v.includes('deep') && v.includes('staging package.json 缺席'))).toBe(true)
  })

  it('deep 通道齐备性机检全绿：合成 deep 目录（staging 依赖面轻检 + 版本一致）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const staging = join(outDir, 'deep', 'package')
    mkdirSync(join(staging, 'dist', 'host'), { recursive: true })
    writeFileSync(join(staging, 'package.json'), JSON.stringify({
      name: '@dsh-forge/forge',
      version: '0.1.3',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      dependencies: { zod: '4.6.6', chokidar: '4.0.3' },
    }, null, 2))
    for (const rel of ['dist/host/index.js', 'dist/client.js', 'cordis.patch.yml']) writeFileSync(join(staging, rel), 'x\n')
    writeFileSync(join(outDir, 'deep', 'forge-deep-0.1.3.tgz'), 'tgz-bytes\n')
    const manifestPath = join(outDir, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.channels.deep = { dir: 'deep', staging: 'deep/package', tgz: 'deep/forge-deep-0.1.3.tgz', version: '0.1.3' }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root, deep: true })).toEqual([])
  })

  it('反例·deep staging 依赖面漂移：file:/@dsh-forge/* 残留红（plain dependency 不进层）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, deep: false })
    const staging = join(outDir, 'deep', 'package')
    mkdirSync(staging, { recursive: true })
    writeFileSync(join(staging, 'package.json'), JSON.stringify({
      name: '@dsh-forge/forge',
      version: '0.1.3',
      dependencies: { '@dsh-forge/alpha': 'file:../alpha', '@dsh-forge/spec': '^1.0.0' },
    }, null, 2))
    const violations = verifyReleaseTree(outDir, { repoRoot: root, deep: true })
    expect(violations.some((v) => v.includes('deep') && v.includes('file: 依赖'))).toBe(true)
    expect(violations.some((v) => v.includes('deep') && v.includes('@dsh-forge/*'))).toBe(true)
  })

  it('zip 产出：非空产物落盘', () => {
    const { zipPath } = assembleRelease({ repoRoot: root, outDir, zip: true, deep: false })
    expect(zipPath).not.toBeUndefined()
    expect(statSync(zipPath).size).toBeGreaterThan(0)
  })
})

describe('纯函数面', () => {
  it('patchInsertEntryNames 只取顶层 insert 块（块外 name: 行不计——单行自插断言锚）', () => {
    const text = [
      '- insert:',
      "    - id: forge",
      "      name: '@dsh-forge/forge'",
      '- id: skill-filesystem',
      "  name: '@deepseek-ai/dsh-skill-filesystem'",
      "  config:",
      "    x: 1",
    ].join('\n')
    expect(patchInsertEntryNames(text)).toEqual(['@dsh-forge/forge'])
  })
  it('soloDependencies 剥离 file: 保留 registry 依赖', () => {
    expect(soloDependencies({ dependencies: { a: 'file:../a', b: 'zod' } })).toEqual({ b: 'zod' })
  })
  it('relativeFileDep 产出 POSIX 兄弟相对形态', () => {
    expect(relativeFileDep(join('t', 'forge'), join('t', 'alpha'))).toBe('file:../alpha')
  })
})
