// fix-24 单测：安装通道单源（forgeInstallSource）+ 陈旧 CAS 副本守卫
// （staleVirtualStoreCopies）——纯 fs 夹具自证，判据正反双向（新鲜副本零违例 +
// 陈旧副本违例逐条）。
// 契约锚 = proposals/plugin-forge-combo/issues/fix-24/findings.md（037 轮②定谳：
// pnpm file: 虚拟 store CAS 键按源路径编码，worktree 稳定路径逐代命中同键陈旧副本）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { forgeInstallSource, staleVirtualStoreCopies } from '../../../e2e/support/forge-combo.js'

const tmpRoots: string[] = []
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-combo-fix24-'))
  tmpRoots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true })
})

/** 造虚拟 store 副本夹具：@dsh-forge+<bare>@fil_<hash>/node_modules/@dsh-forge/<bare> */
function makeStoreEntry(nodeModules: string, bare: string, opts: { withEntry: boolean; withManifest?: boolean }): string {
  const storeDir = join(nodeModules, '.pnpm', `@dsh-forge+${bare}@fil_0123456789abcdef0123456789abcdef`)
  const pkgDir = join(storeDir, 'node_modules', '@dsh-forge', bare)
  mkdirSync(pkgDir, { recursive: true })
  if (opts.withManifest ?? true) {
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: `@dsh-forge/${bare}`, exports: { '.': { import: './dist/index.js' } } }),
    )
  }
  if (opts.withEntry) {
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'dist', 'index.js'), 'export {}')
  }
  return storeDir
}

describe('forgeInstallSource（fix-24 安装通道单源）', () => {
  it('发布树置位且 <tree>/forge/package.json 在场 → 返回发布树 forge（发布树优先）', () => {
    const tree = tmpDir()
    mkdirSync(join(tree, 'forge'), { recursive: true })
    writeFileSync(join(tree, 'forge', 'package.json'), '{"name":"@dsh-forge/forge"}')
    expect(forgeInstallSource({ forgeDir: 'X:\\worktree\\plugins\\forge', releaseTree: tree })).toBe(join(tree, 'forge'))
  })

  it('发布树置位但 forge 目录缺席 → fail-loud（不静默回落——静默回落即陈旧通道复活）', () => {
    const tree = tmpDir()
    expect(() => forgeInstallSource({ forgeDir: 'X:\\worktree\\plugins\\forge', releaseTree: tree })).toThrow(/发布树 forge 目录缺席/)
  })

  it('发布树缺席 → 回落 env.forgeDir（worktree 形——仅存开发自跑形态）', () => {
    const forgeDir = 'X:\\worktree\\plugins\\forge'
    expect(forgeInstallSource({ forgeDir })).toBe(forgeDir)
  })
})

describe('staleVirtualStoreCopies（fix-24 陈旧 CAS 副本守卫）', () => {
  it('store 根缺席 → 零贡献', () => {
    expect(staleVirtualStoreCopies(join(tmpDir(), 'absent-profile'))).toEqual([])
  })

  it('新鲜副本（entry 指向物在场）→ 零违例', () => {
    const nm = tmpDir()
    makeStoreEntry(nm, 'project', { withEntry: true })
    expect(staleVirtualStoreCopies(nm)).toEqual([])
  })

  it('陈旧副本（entry 指向物缺席——036 轮无 dist 断裂实锚签名）→ 违例携 pkg + 签名 detail', () => {
    const nm = tmpDir()
    const storeDir = makeStoreEntry(nm, 'task-loop', { withEntry: false })
    const violations = staleVirtualStoreCopies(nm)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.pkg).toBe('@dsh-forge/task-loop')
    expect(violations[0]?.storeDir).toBe(storeDir)
    expect(violations[0]?.detail).toContain('entry 指向物缺席')
  })

  it('manifest 缺席副本 → 违例；无 exports 声明副本与 @dsh-forge 外条目不判', () => {
    const nm = tmpDir()
    makeStoreEntry(nm, 'spec', { withEntry: false, withManifest: false })
    makeStoreEntry(nm, 'knowledge', { withEntry: true })
    // 无 exports 声明：改写夹具 manifest
    const noExportsPkg = join(nm, '.pnpm', '@dsh-forge+knowledge@fil_0123456789abcdef0123456789abcdef', 'node_modules', '@dsh-forge', 'knowledge')
    writeFileSync(join(noExportsPkg, 'package.json'), JSON.stringify({ name: '@dsh-forge/knowledge' }))
    const otherDir = join(nm, '.pnpm', '@deepseek-ai+dsh-base@fil_0123456789abcdef0123456789abcdef', 'node_modules', '@deepseek-ai', 'dsh-base')
    mkdirSync(otherDir, { recursive: true })
    const violations = staleVirtualStoreCopies(nm)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.pkg).toBe('@dsh-forge/spec')
    expect(violations[0]?.detail).toContain('manifest 缺席')
  })
})
