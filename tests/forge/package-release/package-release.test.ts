// package-release 契约测试（plugin-forge-combo 1.12——G1 打包门；forge-aggregate-bundle
// 1.7 bundle 变体定形）：发布树结构 / manifest 一致性 / solo 字段剥离 / 发布树字段自检门
// （反例红）/ forge bundle 六插行断言 + file: 依赖快层契约断言 / 五件各件自带插行断言 /
// zip 产出。被测物 = scripts/package-release.mjs（字段驱动纯物化器）——fixture 为最小
// 合成仓（forge + 两件成员），机检面与真仓六包同构；freshness 自动编译门归
// plugins/forge/scripts/freshness.mjs（归属守卫 + 门禁功能断言见
// tests/forge/deep-retirement-pin.test.ts），合成仓测试一律 freshness:false 直入物化面。
// forge-aggregate-bundle 1.16：bundle 变体改产自包含交付目录（forge 壳 + members/ 全闭包 +
// 依赖 file:./members/<pkg>——staging 孤立根除，bugs 539b7413/a96e09a5 同族复发根修）；
// 发布树六包共置形态继续作为 monorepo 开发态通道，两者并存机检分开。
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
  verifyBundleClosure,
  verifyReleaseTree,
} from '../../../scripts/package-release.mjs'

/** 最小合成成员包（dist + skills + patch + client bundle 声明面与真仓同构；自带插行=solo 语义在五件侧） */
function writeMember(root: string, short: string, version: string) {
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

/** 最小合成仓：forge（两条相对 file: 依赖 + bundle 插行清单 = forge + 两成员）+ alpha + beta（各件自带插行） */
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

describe('assembleRelease（bundle 发布树结构 + solo 剥离 + manifest）', () => {
  let root: string, outDir: string
  beforeEach(() => {
    root = writeFixtureRepo()
    outDir = join(mkdtempSync(join(tmpdir(), 'dshf-pkgrel-out-')), 'tree')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(dirnameOf(outDir), { recursive: true, force: true })
  })
  const dirnameOf = (p: string): string => p.replace(/[\\/][^\\/]+$/, '')

  it('发布树结构：六包共置 + files 条目拷贝完整 + forge 依赖重写相对 file: + devDeps/scripts 剥离', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
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

  it('manifest 一致性机检全绿：版本清单与树内实读逐包一致（bundle/solo 双通道，零 deep 残留）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    expect(verifyReleaseTree(outDir, { repoRoot: root })).toEqual([])
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.packages['@dsh-forge/alpha']).toEqual({ version: '0.26.1', dir: 'alpha' })
    expect(manifest.packages['@dsh-forge/forge'].version).toBe('0.1.3')
    expect(manifest.channels.bundle).toEqual({ dir: 'bundle', deps: { '@dsh-forge/alpha': 'file:./members/alpha', '@dsh-forge/beta': 'file:./members/beta' } })
    expect(manifest.channels.deep).toBeUndefined()
  })

  it('bundle 六插行断言：forge 树 patch 插行清单恰 forge + 成员清单序（发布树归一交付物）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forgePatch = readFileSync(join(outDir, 'forge', 'cordis.patch.yml'), 'utf8')
    expect(patchInsertEntryNames(forgePatch)).toEqual(['@dsh-forge/forge', '@dsh-forge/alpha', '@dsh-forge/beta'])
  })

  it('solo 变体：file: 依赖全剥离 + forge patch 正本随副本 + 成员自带插行在树侧保留', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const solo = JSON.parse(readFileSync(join(outDir, 'solo', 'forge', 'package.json'), 'utf8'))
    expect(Object.keys(solo.dependencies ?? {}).length).toBe(0)
    const soloPatch = readFileSync(join(outDir, 'solo', 'forge', 'cordis.patch.yml'), 'utf8')
    expect(soloPatch).toBe(readFileSync(join(outDir, 'forge', 'cordis.patch.yml'), 'utf8'))
    // solo 语义 = 五件各件自带插行：成员插行随包收录在树侧（勿误剥——bugs 539b7413/a96e09a5）
    const alphaPatch = readFileSync(join(outDir, 'alpha', 'cordis.patch.yml'), 'utf8')
    expect(patchInsertNames(alphaPatch)).toEqual(['@dsh-forge/alpha'])
  })

  it('反例·client bundle 缺席：自检门红（拷贝遗漏出树前堵截）', () => {
    rmSync(join(root, 'plugins', 'alpha', 'dist', 'client.js'))
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const violations = verifyReleaseTree(outDir, { repoRoot: root })
    expect(violations.some((v) => v.includes('@dsh-forge/alpha') && v.includes('client bundle 文件缺席'))).toBe(true)
  })

  it('反例·版本不一致：manifest vs 树内实读红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const alphaPkg = join(outDir, 'alpha', 'package.json')
    const pkg = JSON.parse(readFileSync(alphaPkg, 'utf8'))
    pkg.version = '9.9.9'
    writeFileSync(alphaPkg, JSON.stringify(pkg, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('@dsh-forge/alpha') && v.includes('版本不一致'))).toBe(true)
  })

  it('反例·bundle 插行清单漂移：机检红（成员缺席即红；额外条目合法——preset/skills 行同入 insert 块）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forgePatchPath = join(outDir, 'forge', 'cordis.patch.yml')
    // 额外条目合法：ghost 行同入 insert 块不判红（成员包含性断言语义）
    writeFileSync(forgePatchPath, `${readFileSync(forgePatchPath, 'utf8')}    - id: ghost\n      name: '@dsh-forge/ghost'\n`)
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('bundle 插行清单漂移'))).toBe(false)
    // 成员缺席即红：漏插 alpha 行 → 机检红
    writeFileSync(forgePatchPath, readFileSync(forgePatchPath, 'utf8').replace(`    - id: alpha\n      name: '@dsh-forge/alpha'\n`, ''))
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('bundle 插行清单漂移'))).toBe(true)
  })

  it('反例·file: 依赖指称悬空：快层契约断言红（file: 孤立风险快层落测）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forgePkgPath = join(outDir, 'forge', 'package.json')
    const pkg = JSON.parse(readFileSync(forgePkgPath, 'utf8'))
    pkg.dependencies['@dsh-forge/alpha'] = 'file:../gone'
    writeFileSync(forgePkgPath, JSON.stringify(pkg, null, 2))
    const violations = verifyReleaseTree(outDir, { repoRoot: root })
    expect(violations.some((v) => v.includes('file: 依赖指称悬空') && v.includes('@dsh-forge/alpha'))).toBe(true)
  })

  it('反例·file: 依赖指称包名不吻合：快层契约断言红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const alphaPkgPath = join(outDir, 'alpha', 'package.json')
    const alpha = JSON.parse(readFileSync(alphaPkgPath, 'utf8'))
    alpha.name = '@dsh-forge/alias'
    writeFileSync(alphaPkgPath, JSON.stringify(alpha, null, 2))
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('file: 依赖指称包名不吻合'))).toBe(true)
  })

  it('反例·成员自带插行缺席：机检红（五插行语义在五件侧，不得误剥）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    writeFileSync(join(outDir, 'alpha', 'cordis.patch.yml'), '# 插行被误剥\n')
    expect(verifyReleaseTree(outDir, { repoRoot: root }).some((v) => v.includes('@dsh-forge/alpha') && v.includes('自带插行缺席'))).toBe(true)
  })

  it('zip 产出：非空产物落盘', () => {
    const { zipPath } = assembleRelease({ repoRoot: root, outDir, zip: true, freshness: false })
    expect(zipPath).not.toBeUndefined()
    expect(statSync(zipPath!).size).toBeGreaterThan(0)
  })
})

describe('自包含 bundle 交付目录（forge-aggregate-bundle 1.16——staging 孤立根除）', () => {
  let root: string, outDir: string
  beforeEach(() => {
    root = writeFixtureRepo()
    outDir = join(mkdtempSync(join(tmpdir(), 'dshf-pkgrel-out-')), 'tree')
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(dirnameOf(outDir), { recursive: true, force: true })
  })
  const dirnameOf = (p: string): string => p.replace(/[\\/][^\\/]+$/, '')

  it('bundle 结构：forge 壳 + members/<pkg> 全闭包（files 条目齐备）+ 依赖改指 file:./members/<pkg>', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    for (const rel of [
      'bundle/package.json',
      'bundle/cordis.patch.yml',
      'bundle/members/alpha/package.json',
      'bundle/members/alpha/dist/client.js',
      'bundle/members/alpha/dist/host/index.js',
      'bundle/members/alpha/skills/demo.md',
      'bundle/members/alpha/cordis.patch.yml',
      'bundle/members/beta/package.json',
      'bundle/members/beta/dist/client.js',
    ]) {
      expect(existsSync(join(outDir, rel)), rel).toBe(true)
    }
    const forge = JSON.parse(readFileSync(join(outDir, 'bundle/package.json'), 'utf8'))
    expect(forge.dependencies).toEqual({ '@dsh-forge/alpha': 'file:./members/alpha', '@dsh-forge/beta': 'file:./members/beta' })
    const alpha = JSON.parse(readFileSync(join(outDir, 'bundle/members/alpha/package.json'), 'utf8'))
    expect(alpha.devDependencies).toBeUndefined()
    expect(alpha.scripts).toBeUndefined()
  })

  it('机检全绿 + manifest channels.bundle 指自包含目录（发布树兄弟通道语义不变）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    expect(verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })).toEqual([])
    const forge = JSON.parse(readFileSync(join(outDir, 'forge/package.json'), 'utf8'))
    expect(forge.dependencies).toEqual({ '@dsh-forge/alpha': 'file:../alpha', '@dsh-forge/beta': 'file:../beta' })
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.channels.bundle.dir).toBe('bundle')
    expect(manifest.channels.solo.dir).toBe('solo/forge')
  })

  it('bundle 生成版 package.json pnpm.overrides 退役（1.40 node:sqlite 迁移——better-sqlite3 依赖零残留）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forge = JSON.parse(readFileSync(join(outDir, 'bundle/package.json'), 'utf8'))
    expect(forge.pnpm?.overrides).toBeUndefined()
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest.channels.bundle.overrides).toBeUndefined()
  })

  it('bundle 目录补发 pnpm-workspace.yaml（allowBuilds 空批准表消 ignored-builds 门）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const wsText = readFileSync(join(outDir, 'bundle/pnpm-workspace.yaml'), 'utf8')
    expect(wsText).toMatch(/^allowBuilds:/m)
    expect(verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })).toEqual([])
  })

  it('反例·pnpm-workspace.yaml 缺席：闭包机检红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    rmSync(join(outDir, 'bundle/pnpm-workspace.yaml'))
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('pnpm-workspace.yaml 缺席'))).toBe(true)
  })

  it('反例·overrides 键残留：闭包机检红（1.40 退役断言——overrides 在场即红）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forgePath = join(outDir, 'bundle/package.json')
    const forge = JSON.parse(readFileSync(forgePath, 'utf8'))
    forge.pnpm = { overrides: { 'better-sqlite3': '13.0.3' } }
    writeFileSync(forgePath, JSON.stringify(forge, null, 2))
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('bundle') && v.includes('overrides'))).toBe(true)
  })

  it('bundle 交付 patch 顶层零 skills 行（forge-aggregate-bundle 1.34 技能预设独占收敛——顶层增补退役为设计，标准模式零成员技能；源码/solo 通道零回归）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const bundlePatch = readFileSync(join(outDir, 'bundle/cordis.patch.yml'), 'utf8')
    expect(bundlePatch).not.toMatch(/^ {0,4}- id: skill-filesystem-\S+$/m)
    expect(bundlePatch).not.toMatch(/- id: skill-filesystem$/m)
    const sourcePatch = readFileSync(join(root, 'plugins/forge/cordis.patch.yml'), 'utf8')
    expect(sourcePatch).not.toContain('skill-filesystem-alpha')
    const soloPatch = readFileSync(join(outDir, 'solo/forge/cordis.patch.yml'), 'utf8')
    expect(soloPatch).not.toContain('skill-filesystem-')
  })

  it('preset-forge 子树 skills 实例随正本承带 + preset-headhunter 块 skills 实例在场（正本自含——机检实例在场断言）', () => {
    // fixture forge patch 注入 preset-forge + preset-headhunter 双块（真仓正本同构最小形）
    const forgePatchPath = join(root, 'plugins/forge/cordis.patch.yml')
    writeFileSync(forgePatchPath, [
      '- insert:',
      "    - id: forge",
      "      name: '@dsh-forge/forge'",
      "      config:",
      "        home: 'demo'",
      "    - id: alpha",
      "      name: '@dsh-forge/alpha'",
      "    - id: beta",
      "      name: '@dsh-forge/beta'",
      "    - id: preset-forge",
      "      name: '@deepseek-ai/dsh-agent-preset'",
      "      config:",
      "        order: 2",
      "        plugins:",
      "          - id: skill-filesystem-forge",
      "            name: '@deepseek-ai/dsh-skill-filesystem'",
      "            config:",
      "              providerName: filesystem-forge",
      "              customSkillDirs:",
      "                - !!js (()=>{try{return baseUrl}catch(e){return undefined}})()",
      '- insert:',
      "    - id: preset-headhunter",
      "      name: '@deepseek-ai/dsh-agent-preset'",
      "      config:",
      "        order: 3",
      "        plugins:",
      "          - id: skill-filesystem-expert-squad",
      "            name: '@deepseek-ai/dsh-skill-filesystem'",
      "            config:",
      "              providerName: filesystem-expert-squad",
      '',
    ].join('\n'))
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    expect(verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })).toEqual([])
    const bundlePatch = readFileSync(join(outDir, 'bundle/cordis.patch.yml'), 'utf8')
    expect(bundlePatch).toContain('- id: skill-filesystem-forge')
    expect(bundlePatch).toContain('providerName: filesystem-forge')
  })

  it('WYSIWYG 恒等：交付 bundle patch ≡ forge 正本逐字节一致 + 零改写（打包脚本零 patch 改写面）', () => {
    const forgePatchPath = join(root, 'plugins/forge/cordis.patch.yml')
    const sourcePatch = readFileSync(forgePatchPath, 'utf8')
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const bundlePatch = readFileSync(join(outDir, 'bundle/cordis.patch.yml'), 'utf8')
    expect(bundlePatch).toBe(sourcePatch)
    // 反例·交付 patch 被改写（≠ 正本）：闭包机检红
    writeFileSync(join(outDir, 'bundle/cordis.patch.yml'), `${bundlePatch}# tampered\n`)
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('交付 patch ≢ forge 正本'))).toBe(true)
  })

  it('反例·交付 patch 顶层承带 skills 行：闭包机检红（顶层禁承带——preset 子树嵌套实例不误伤）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const patchPath = join(outDir, 'bundle/cordis.patch.yml')
    writeFileSync(patchPath, `${readFileSync(patchPath, 'utf8')}- insert:\n  - id: skill-filesystem-alpha\n    name: '@deepseek-ai/dsh-skill-filesystem'\n`)
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('顶层禁承带 skills 行') && v.includes('skill-filesystem-alpha'))).toBe(true)
    // 子树嵌套形不误伤：深层缩进实例零新增违规
    writeFileSync(patchPath, `${readFileSync(patchPath, 'utf8')}          - id: skill-filesystem-nested\n            name: '@deepseek-ai/dsh-skill-filesystem'\n`)
    expect(verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root }).some((v) => v.includes('skill-filesystem-nested'))).toBe(false)
  })

  it('成员自带插行随包收录（members 侧 solo 语义不回归）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const alphaPatch = readFileSync(join(outDir, 'bundle/members/alpha/cordis.patch.yml'), 'utf8')
    expect(patchInsertEntryNames(alphaPatch)).toEqual(['@dsh-forge/alpha'])
  })

  it('反例·闭包拷贝遗漏：members dist 缺席即红', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    rmSync(join(outDir, 'bundle/members/alpha/dist/client.js'))
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('members/alpha') && v.includes('闭包拷贝遗漏'))).toBe(true)
  })

  it('反例·files 声明条目源缺席：双向对账红（缺失条目被 sourceFileEntries 静默过滤——判例 50bfbcec skills 静默丢弃）', () => {
    const betaPkgPath = join(root, 'plugins', 'beta', 'package.json')
    const beta = JSON.parse(readFileSync(betaPkgPath, 'utf8'))
    beta.files.push('missing-dir')
    writeFileSync(betaPkgPath, JSON.stringify(beta, null, 2))
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const bundleViolations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(bundleViolations.some((v) => v.includes('members/beta') && v.includes('files 声明条目源缺席'))).toBe(true)
    const treeViolations = verifyReleaseTree(outDir, { repoRoot: root })
    expect(treeViolations.some((v) => v.includes('@dsh-forge/beta') && v.includes('files 声明条目源缺席'))).toBe(true)
  })

  it('反例·members skills 锚目录缺席：闭包机检红（交付 patch skills 行自锚落空）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    rmSync(join(outDir, 'bundle/members/alpha/skills'), { recursive: true, force: true })
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('members/alpha') && v.includes('skills 锚目录缺席'))).toBe(true)
  })

  it('反例·依赖指称树外：file: 指向 members 外目录即红（staging 孤立复发构造）', () => {
    assembleRelease({ repoRoot: root, outDir, zip: false, freshness: false })
    const forgePath = join(outDir, 'bundle/package.json')
    const forge = JSON.parse(readFileSync(forgePath, 'utf8'))
    forge.dependencies['@dsh-forge/alpha'] = 'file:../alpha'
    writeFileSync(forgePath, JSON.stringify(forge, null, 2))
    const violations = verifyBundleClosure(join(outDir, 'bundle'), { repoRoot: root })
    expect(violations.some((v) => v.includes('@dsh-forge/alpha') && (v.includes('in-tree') || v.includes('指称悬空') || v.includes('目录外')))).toBe(true)
  })
})

describe('纯函数面', () => {
  it('patchInsertEntryNames 只取顶层 insert 块（块外 name: 行不计——插行清单断言锚）', () => {
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
