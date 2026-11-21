// deep 产物契约测试（forge-deep-pack 1.7——tests/forge/，提案 §二.2 + §五 R4/P0 #4）：
// 被测物 = plugins/forge/scripts/deep-build.mjs 产物（dist-deep/ staging 解包形态 +
// forge-deep-<version>.tgz）。断言面：
//   ① 单文件形状（dist/host 恰一 index.js + 生成版 manifest 形状 + 剥五条 file:）；
//   ② external 面（inline 档零 @dsh-forge/* 裸名 + official/native/registry 依赖面）；
//   ③ skills 聚合完整性（staging dist/skills/<member> == 五件源包 skills）；
//   ④ 五件 client 合并装载（staging client.js == forge bundle-client 产物复用 + 五件
//      自注册注册头逐件在场）；
//   ⑤ tgz auditTarballFile 一站式审计零违规（inline 档零豁免）；
//   ⑥ freshness 门（R4 用户裁定）语义 pin：脚本内置按依赖序自动编译 + 代际标记双校验。
// 产物由 deep-build 全链产出（freshness 自动编译五件 + forge）——缺席时 beforeAll 现跑；
// DEEP_BUILD_FORCE=1 强制重跑（开发迭代默认复用在盘产物，代际校验仍拦陈旧）。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditTarballFile } from '../../plugins/forge/scripts/self-containment.mjs'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FORGE_DIR = resolve(REPO_ROOT, 'plugins/forge')
const OUT_DIR = join(FORGE_DIR, 'dist-deep')
const STAGING = join(OUT_DIR, 'package')
const PKG_SPEC = JSON.parse(readFileSync(join(FORGE_DIR, 'package.json'), 'utf8')) as { name: string; version: string }
const TARBALL = join(OUT_DIR, `forge-deep-${PKG_SPEC.version}.tgz`)
const MEMBERS = ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'] as const
// 模块说明符面匹配（self-containment.mjs SPECIFIER 同面值——注释里的包名不算运行期引用）
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*|\bimport\(\s*)["']([^"']+)["']/g

function walkRel(dir: string, root = dir): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walkRel(full, root))
    else out.push(relative(root, full).replaceAll('\\', '/'))
  }
  return out.sort()
}

describe('deep 产物（dist-deep staging + tgz）——forge-deep-pack 1.7', () => {
  it('产物在盘（deep-build 全链产出；缺缺席即现场重跑）', { timeout: 900_000 }, () => {
    if (process.env.DEEP_BUILD_FORCE === '1' || !existsSync(TARBALL)) {
      const r = spawnSync('node', [join(FORGE_DIR, 'scripts/deep-build.mjs')], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 870_000,
        shell: true,
      })
      expect(r.status, `deep-build 失败：\n${r.stdout}\n${r.stderr}`).toBe(0)
    }
    expect(existsSync(STAGING), 'staging 解包形态缺席').toBe(true)
    expect(existsSync(TARBALL), 'tgz 缺席').toBe(true)
  })

  const manifest = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(STAGING, 'package.json'), 'utf8')) as Record<string, unknown>

  it('单文件形状：dist/host 恰一 index.js + 生成版 manifest exports 指向单文件', () => {
    const hostFiles = walkRel(join(STAGING, 'dist/host'))
    expect(hostFiles, 'dist/host 单文件形状漂移').toEqual(['index.js'])
    const m = manifest()
    expect(m.name).toBe('@dsh-forge/forge')
    expect(m.version).toBe(PKG_SPEC.version)
    expect(m.exports).toMatchObject({
      './package.json': './package.json',
      '.': { import: './dist/host/index.js' },
      './client': { default: './dist/client.js' },
    })
  })

  it('生成版 manifest 剥五条 file: 依赖（plain dependency 不进层——组合缝激活）', () => {
    const m = manifest()
    const deps = m.dependencies as Record<string, string>
    for (const [name, spec] of Object.entries(deps)) {
      expect(name.startsWith('@dsh-forge/'), `生成版依赖残留 private 包：${name}`).toBe(false)
      expect(spec.startsWith('file:') || spec.startsWith('workspace:') || spec.startsWith('link:'), `生成版依赖残留协议依赖：${name} ${spec}`).toBe(false)
    }
    // registry 运行期依赖实体化（五件 dependencies 并集——inline 档 external 面的宿主解析面）
    const memberDeps = MEMBERS.flatMap((member) =>
      Object.entries(
        (JSON.parse(readFileSync(join(REPO_ROOT, 'plugins', member, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {},
      ).filter(([name, spec]) => !name.startsWith('@dsh-forge/') && !spec.startsWith('file:')),
    )
    for (const [name, spec] of memberDeps) expect(deps[name], `registry 依赖漏实体化：${name}`).toBe(spec)
    expect(deps['better-sqlite3'], 'better-sqlite3（native）须声明由宿主 pnpm 解析').toBeTypeOf('string')
  })

  it('external 面：host 单文件零 @dsh-forge/* 裸名（五件 dist 全量内联），官方/native/registry 依赖面如实', () => {
    const code = readFileSync(join(STAGING, 'dist/host/index.js'), 'utf8')
    const registryDeps = new Set(Object.keys(manifest().dependencies as Record<string, string>))
    const seen = new Set<string>()
    for (const match of code.matchAll(SPECIFIER)) {
      const spec = match[1]
      if (/[\s"']/.test(spec) || seen.has(spec)) continue
      seen.add(spec)
      expect(spec.startsWith('@dsh-forge/'), `host 单文件残留 @dsh-forge/* 裸名："${spec}"（inline 档零豁免）`).toBe(false)
      if (spec.startsWith('.') || spec.startsWith('node:')) continue
      expect(
        spec.startsWith('@deepseek-ai/') || spec === 'better-sqlite3' || registryDeps.has(spec),
        `external 面越界："${spec}"（仅 cordis/@deepseek-ai runtime/better-sqlite3/registry 依赖实体面）`,
      ).toBe(true)
    }
    // inline 自证：expert-squad 内联痕迹（experts/ 扫描表达式）在唯一 host 入口在场
    expect(/["']\.\.\/\.\.\/experts\/["']/.test(code), 'expert-squad 内联痕迹缺席——五件 inline 失效').toBe(true)
  })

  it('skills 聚合完整性：staging dist/skills/<member> == 五件源包 skills 文件集', () => {
    for (const member of MEMBERS) {
      const srcSet = walkRel(join(REPO_ROOT, 'plugins', member, 'skills')).filter((f) => f !== '.gitkeep')
      const dstSet = walkRel(join(STAGING, 'dist/skills', member)).filter((f) => f !== '.gitkeep')
      expect(dstSet, `skills/${member} 聚合不完整`).toEqual(srcSet)
    }
  })

  it('experts 布局同构在位（P0 #4——dist/host → ../../experts/ 恰落 staging 包根）', () => {
    expect(walkRel(join(STAGING, 'experts'))).toEqual(
      walkRel(join(REPO_ROOT, 'plugins/expert-squad/experts')),
    )
    expect(existsSync(join(STAGING, 'cordis.patch.yml')), '单行自插 patch 收录缺席').toBe(true)
  })

  it('五件 client 合并装载：staging client.js == forge bundle-client 产物复用 + 五件注册头逐件在场', () => {
    const deep = readFileSync(join(STAGING, 'dist/client.js'), 'utf8')
    const forge = readFileSync(join(FORGE_DIR, 'dist/client.js'), 'utf8')
    expect(deep, 'client.js 非复用（≠ forge bundle-client 产物）').toBe(forge)
    expect(deep.startsWith(`window.__ModuleLoader__.load({ id: "@dsh-forge/forge"`), '产物头非自注册注册头').toBe(true)
    for (const member of MEMBERS) {
      expect(deep.includes(`window.__ModuleLoader__.load({ id: "@dsh-forge/${member}"`), `${member} 自注册单元缺席`).toBe(true)
    }
  })

  it('tgz auditTarballFile 一站式审计零违规（inline 档零豁免）', () => {
    expect(auditTarballFile(TARBALL)).toEqual([])
  })

  it('freshness 门语义 pin（R4 用户裁定）：脚本内置自动编译 + 代际标记双校验 + run-once', () => {
    const script = readFileSync(join(FORGE_DIR, 'scripts/deep-build.mjs'), 'utf8')
    expect(script.includes('"pnpm"'), 'freshness 门缺 pnpm 自动编译步').toBe(true)
    expect(script.includes('"build"'), '自动编译命令面漂移').toBe(true)
    expect(script.includes('@dsh-forge-generation'), '代际标记双校验缺席').toBe(true)
    expect(script.includes('代际校验失败'), '陈旧即 fail 分支缺席').toBe(true)
    expect(script.includes('auditTarballFile'), 'tgz 一站式审计缺席').toBe(true)
    expect(script.includes('allowPrivate:'), 'inline 档不得启用 allowPrivate 豁免').toBe(false)
    expect(script.includes('--watch'), '禁 watch（AGENTS §2 run-once 纪律）').toBe(false)
    expect(script.includes('构建闭包守卫'), '构建闭包守卫缺席').toBe(true)
  })
})
