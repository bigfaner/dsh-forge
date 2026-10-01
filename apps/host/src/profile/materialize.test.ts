// 1.4 AC2 pin：profile 模板首启落地 {profile-dir} + 幂等不重写 + 模板内容形状
//（官方行 + @dsh-forge/core / @dsh-forge/knowledge 行）+ dev 形态文件同步。
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureProfileMaterialized } from './materialize.js'
import { DSH_STACK_VERSION, PROFILE_ROOT_BOOTSTRAP, PROFILE_TEMPLATE_FILES } from './template.js'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-forge-profile-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('AC2 首启落地：模板三件 + 空根兜底', () => {
  it('首启 created = 全量四文件，内容与模板常量逐字节一致', () => {
    const first = ensureProfileMaterialized(dir)
    expect([...first.created].sort()).toEqual(
      ['cordis.patch.yml', 'cordis.yml', 'package.json', 'pnpm-workspace.yaml'].sort(),
    )
    expect(first.kept).toEqual([])
    for (const [name, content] of Object.entries(PROFILE_TEMPLATE_FILES)) {
      expect(readFileSync(join(dir, name), 'utf8')).toBe(content)
    }
    expect(readFileSync(join(dir, PROFILE_ROOT_BOOTSTRAP.name), 'utf8')).toBe(PROFILE_ROOT_BOOTSTRAP.content)
  })

  it('package.json 模板：官方 web bundles 精确 pin + dsh.profile.bundles', () => {
    const pkg = JSON.parse(PROFILE_TEMPLATE_FILES['package.json']!) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    expect(pkg.dependencies).toEqual({
      '@deepseek-ai/dsh-base': DSH_STACK_VERSION,
      '@deepseek-ai/dsh-web-app': DSH_STACK_VERSION,
    })
    expect(pkg.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  })

  it('cordis.patch.yml 模板：官方行 + client-hmr 置停 + @dsh-forge/core / @dsh-forge/knowledge 产品行（disabled 预留）', () => {
    const patch = PROFILE_TEMPLATE_FILES['cordis.patch.yml']!
    expect(patch).toContain('- id: system-prompt')
    // client-hmr 置停（2.7）：全图 sync 对账掉掌舵产品行——S2 残留 #3 的 profile 面处置
    expect(patch).toContain('- id: client-hmr')
    expect(patch).toContain('disabled: true')
    expect(patch).toContain("name: '@dsh-forge/core'")
    expect(patch).toContain("name: '@dsh-forge/knowledge'")
  })

  it('pnpm-workspace.yaml 模板：hoisted + autoInstallPeers false（S1 pin 形状）', () => {
    const ws = PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml']!
    expect(ws).toContain('nodeLinker: hoisted')
    expect(ws).toContain('autoInstallPeers: false')
  })
})

describe('AC2 幂等：重复启动不重写', () => {
  it('二次落地 created=[] kept=全量，文件 mtime 不变', () => {
    const before = statSync(join(dir, 'cordis.patch.yml')).mtimeMs
    const second = ensureProfileMaterialized(dir)
    expect(second.created).toEqual([])
    expect([...second.kept].sort()).toEqual(
      ['cordis.patch.yml', 'cordis.yml', 'package.json', 'pnpm-workspace.yaml'].sort(),
    )
    expect(statSync(join(dir, 'cordis.patch.yml')).mtimeMs).toBe(before)
  })

  it('用户已改写的 cordis.patch.yml 原样保留（不回写模板）', () => {
    const custom = '# user-owned layer\n- id: system-prompt\n  config: {}\n'
    writeFileSync(join(dir, 'cordis.patch.yml'), custom, 'utf8')
    const again = ensureProfileMaterialized(dir)
    expect(again.created).toEqual([])
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toBe(custom)
  })
})

describe('落地机制边界', () => {
  it('深层不存在路径自动建目录', () => {
    const deep = join(dir, 'a', 'b', 'c', 'profile')
    const result = ensureProfileMaterialized(deep)
    expect(result.created).toHaveLength(4)
    expect(existsSync(join(deep, 'package.json'))).toBe(true)
  })

  it('部分已存在时仅补缺失文件', () => {
    const partial = join(dir, 'partial')
    mkdirSync(partial, { recursive: true })
    writeFileSync(join(partial, 'package.json'), '{"name":"kept"}', 'utf8')
    const result = ensureProfileMaterialized(partial)
    expect(result.created.sort()).toEqual(['cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml'].sort())
    expect(result.kept).toEqual(['package.json'])
    expect(readFileSync(join(partial, 'package.json'), 'utf8')).toBe('{"name":"kept"}')
  })
})

describe('dev 形态文件同步 pin（apps/host/profile.dev ↔ 打包模板）', () => {
  const devDir = join(import.meta.dirname, '..', '..', 'profile.dev')
  it('package.json 依赖与 bundles 一致（dev 直链 workspace 形态同源）', () => {
    const dev = JSON.parse(readFileSync(join(devDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    const packaged = JSON.parse(PROFILE_TEMPLATE_FILES['package.json']!) as typeof dev
    expect(dev.dependencies).toEqual(packaged.dependencies)
    expect(dev.dsh.profile.bundles).toEqual(packaged.dsh.profile.bundles)
  })
  it('cordis.patch.yml 语义一致（官方行 + client-hmr 置停 + 两产品行 disabled）', () => {
    const dev = readFileSync(join(devDir, 'cordis.patch.yml'), 'utf8')
    expect(dev).toContain('- id: system-prompt')
    expect(dev).toContain('- id: client-hmr')
    expect(dev).toContain("name: '@dsh-forge/core'")
    expect(dev).toContain("name: '@dsh-forge/knowledge'")
  })
  it('pnpm-workspace.yaml 全文一致', () => {
    const dev = readFileSync(join(devDir, 'pnpm-workspace.yaml'), 'utf8')
    expect(dev).toBe(PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml'])
  })
})
