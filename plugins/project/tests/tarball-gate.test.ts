// tarball 自洽守卫（fix-2；bug a2b6818f 家族）：selfcontained tarball 的自含性是
// 包元数据/产物形态性质，既有离手门只审 dist import 面——漏掉「tarball 解包后
// 零 symlink、零 workspace:/file:/link: 协议依赖」断言面。审计逻辑正本 =
// scripts/self-containment.mjs（auditTarballManifest / auditTarballTree /
// auditTarballFile），与本文件共享断言口径。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { auditTarballFile, auditTarballManifest, auditTarballTree } from '../scripts/self-containment.mjs'

const tmpRoot = mkdtempSync(join(tmpdir(), 'dshf-tarball-gate-'))
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }))

const CLEAN_MANIFEST = {
  name: '@dsh-forge/project',
  version: '0.15.2',
  dependencies: { 'gray-matter': '4.0.3', '@deepseek-ai/dsh-typert-protocol': '0.2.0-rc.2' },
  peerDependencies: { '@deepseek-ai/cordis': '4.0.4' },
}

function packTgz(dir) {
  const tgz = join(tmpRoot, `pack-${Math.random().toString(36).slice(2)}.tgz`)
  execFileSync('tar', ['-czf', tgz, '-C', dir, 'package'], { stdio: 'ignore' })
  return tgz
}

describe('tarball 解包审计——包元数据依赖形态（manifest 面）', () => {
  it('干净 manifest（registry 依赖 + 官方单例 peer）零违规', () => {
    expect(auditTarballManifest(CLEAN_MANIFEST)).toEqual([])
  })

  it('workspace:/file:/link: 协议依赖 = 违规（安装期产生指向检出树的链接）', () => {
    const violations = auditTarballManifest({
      ...CLEAN_MANIFEST,
      dependencies: { ...CLEAN_MANIFEST.dependencies, '@dsh-forge/contracts': 'workspace:*' },
      devDependencies: { '@dsh-forge/lib-util': 'link:../lib-util', x: 'file:../x' },
    })
    expect(violations.some((v) => v.includes('@dsh-forge/contracts') && v.includes('workspace:'))).toBe(true)
    expect(violations.some((v) => v.includes('@dsh-forge/lib-util') && v.includes('link:'))).toBe(true)
    expect(violations.some((v) => v.includes('file:'))).toBe(true)
  })

  it('dependencies/peerDependencies 声明 @dsh-forge/* = 违规（private 包不可 registry 解析）', () => {
    const violations = auditTarballManifest({
      ...CLEAN_MANIFEST,
      peerDependencies: { ...CLEAN_MANIFEST.peerDependencies, '@dsh-forge/core': 'workspace:*' },
    })
    expect(violations.some((v) => v.includes('@dsh-forge/core'))).toBe(true)
  })
})

describe('tarball 解包审计——解包树形态（symlink/reparse 面）', () => {
  it('含 symlink/junction 的解包树 = 违规，实体树零违规', () => {
    const dirty = join(tmpRoot, 'dirty', 'package')
    mkdirSync(join(dirty, 'dist'), { recursive: true })
    writeFileSync(join(dirty, 'dist', 'index.js'), 'export {}\n')
    // junction 形态（Windows 免特权可建）——tarball 内任何 reparse 点都违规
    symlinkSync(join(tmpRoot, 'elsewhere'), join(dirty, 'dist', 'linked'), 'junction')
    const dirtyViolations = auditTarballTree(dirty)
    expect(dirtyViolations.length).toBeGreaterThan(0)
    expect(dirtyViolations.some((v) => v.includes('linked'))).toBe(true)

    const clean = join(tmpRoot, 'clean', 'package')
    mkdirSync(join(clean, 'dist'), { recursive: true })
    writeFileSync(join(clean, 'dist', 'index.js'), 'export {}\n')
    expect(auditTarballTree(clean)).toEqual([])
  })
})

describe('tarball 一站式审计 auditTarballFile（tgz → 解包 → manifest+树审计）', () => {
  it('干净 tgz 零违规', () => {
    const src = join(tmpRoot, 'ok', 'package')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'package.json'), JSON.stringify(CLEAN_MANIFEST))
    writeFileSync(join(src, 'index.js'), 'export {}\n')
    expect(auditTarballFile(packTgz(join(tmpRoot, 'ok')))).toEqual([])
  })

  it('携 workspace 协议依赖 manifest 的 tgz 被抓到协议违规', () => {
    const src = join(tmpRoot, 'badmanifest', 'package')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'package.json'), JSON.stringify({
      ...CLEAN_MANIFEST,
      dependencies: { ...CLEAN_MANIFEST.dependencies, '@dsh-forge/contracts': 'workspace:*' },
    }))
    writeFileSync(join(src, 'index.js'), 'export {}\n')
    const violations = auditTarballFile(packTgz(join(tmpRoot, 'badmanifest')))
    expect(violations.some((v) => v.includes('@dsh-forge/contracts') && v.includes('workspace:'))).toBe(true)
  })
  // 说明：symlink 入 tgz 的形态由 auditTarballTree 单测覆盖（bsdtar 打包时对
  // junction 做解引用，本地 tar 往返无法构造携 symlink 条目的 tgz——真实 tgz 由
  // pnpm pack 写出，symlink 条目经 auditTarballTree 在解包面统一拦截）。
})
