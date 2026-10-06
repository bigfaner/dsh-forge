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

  it('cordis.patch.yml 模板：官方行 + client-hmr 置停 + @dsh-forge/{core,knowledge,plugin-forge} 产品行（3.4 增 plugin-forge）', () => {
    const patch = PROFILE_TEMPLATE_FILES['cordis.patch.yml']!
    expect(patch).toContain('- id: system-prompt')
    // client-hmr 置停（2.7）：全图 sync 对账掉掌舵产品行——S2 残留 #3 的 profile 面处置
    expect(patch).toContain('- id: client-hmr')
    expect(patch).toContain('disabled: true')
    // 产品三行启用（4.2 转正 + 3.4 plugin-forge 入列）：insert 块无 disabled；行 config 不在
    // 用户层书写（dbFile / tasksHome / bindingsFile / skills 挂载目录 = boot overlay 装配期注入）
    expect(patch).toContain(
      [
        '- insert:',
        '    - id: dsh-forge-core',
        "      name: '@dsh-forge/core'",
        '    - id: dsh-forge-knowledge',
        "      name: '@dsh-forge/knowledge'",
        '    - id: dsh-forge-plugin-forge',
        "      name: '@dsh-forge/plugin-forge'",
      ].join('\n'),
    )
    expect(patch).not.toContain('disabled: true\n    - id: dsh-forge-knowledge')
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
  it('package.json：官方 bundle 行与模板逐键一致 + 产品插件 link 三件与原生依赖兜底（4.2 dev 直链）', () => {
    const dev = JSON.parse(readFileSync(join(devDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    const packaged = JSON.parse(PROFILE_TEMPLATE_FILES['package.json']!) as typeof dev
    // 官方 bundle 逐键一致（模板全集 ⊆ dev——dev 另有产品插件行）
    for (const [name, version] of Object.entries(packaged.dependencies)) {
      expect(dev.dependencies[name], `dev profile 缺官方行 ${name}`).toBe(version)
    }
    expect(dev.dsh.profile.bundles).toEqual(packaged.dsh.profile.bundles)
    // dev 直链 workspace 构建产物（4.2：装载面 = loader 行 import 以 profileDir 为锚）
    expect(dev.dependencies['@dsh-forge/core']).toBe('link:../../../packages/core')
    expect(dev.dependencies['@dsh-forge/knowledge']).toBe('link:../../../packages/knowledge')
    expect(dev.dependencies['@dsh-forge/contracts']).toBe('link:../../../packages/contracts')
    expect(dev.dependencies['@dsh-forge/plugin-forge']).toBe('link:../../../packages/plugin-forge')
    // core 运行期原生依赖（prebuilds 随包分发；兜底供非 realpath 解析路径）
    expect(dev.dependencies['better-sqlite3']).toBe('13.0.3')
    expect(dev.dependencies['gray-matter']).toBe('4.0.3')
  })
  it('cordis.patch.yml 语义一致（官方行 + client-hmr 置停 + 三产品行启用——4.2 转正 + 3.4 plugin-forge）', () => {
    const dev = readFileSync(join(devDir, 'cordis.patch.yml'), 'utf8')
    expect(dev).toContain('- id: system-prompt')
    expect(dev).toContain('- id: client-hmr')
    expect(dev).toContain("name: '@dsh-forge/core'")
    expect(dev).toContain("name: '@dsh-forge/knowledge'")
    expect(dev).toContain("name: '@dsh-forge/plugin-forge'")
    expect(dev).not.toMatch(/dsh-forge-(core|knowledge|plugin-forge)[\s\S]{0,80}disabled/)
  })
  it('pnpm-workspace.yaml 全文一致', () => {
    const dev = readFileSync(join(devDir, 'pnpm-workspace.yaml'), 'utf8')
    expect(dev).toBe(PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml'])
  })
})
