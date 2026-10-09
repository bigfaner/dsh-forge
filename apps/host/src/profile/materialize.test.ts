// 1.4 AC2 pin：profile 模板首启落地 {profile-dir} + 幂等不重写 + 模板内容形状
//（官方行 + @dsh-forge/core / @dsh-forge/knowledge 行）+ dev 形态文件同步。
// M3 3.7 增：ui-settings 开关行首启预置（模板补行 + 增量补行 id 键控——此后归用户运行时）。
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureProfileMaterialized } from './materialize.js'
import { DSH_STACK_VERSION, PROFILE_ROOT_BOOTSTRAP, PROFILE_TEMPLATE_FILES, UI_SETTINGS_PRESET_ROW } from './template.js'

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

  it('cordis.patch.yml 模板：官方行 + client-hmr 置停 + @dsh-forge/{core,knowledge} 产品行（产品裁决 2026-10-09：plugin-forge 移出用户层——标准模式零 forge 面，仅预设组合携带）', () => {
    const patch = PROFILE_TEMPLATE_FILES['cordis.patch.yml']!
    expect(patch).toContain('- id: system-prompt')
    // client-hmr 置停（2.7）：全图 sync 对账掉掌舵产品行——S2 残留 #3 的 profile 面处置
    expect(patch).toContain('- id: client-hmr')
    expect(patch).toContain('disabled: true')
    // 产品两行启用（4.2 转正）：insert 块无 disabled；行 config 不在用户层书写
    // （dbFile / tasksHome / bindingsFile / skills 挂载目录 = boot overlay 装配期注入）
    expect(patch).toContain(
      [
        '- insert:',
        '    - id: dsh-forge-core',
        "      name: '@dsh-forge/core'",
        '    - id: dsh-forge-knowledge',
        "      name: '@dsh-forge/knowledge'",
      ].join('\n'),
    )
    // plugin-forge 行已移出（全局用户层行对一切组合生效＝泄漏进标准会话；预设底稿行内自带）
    expect(patch).not.toContain("name: '@dsh-forge/plugin-forge'")
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

  it('用户已改写的 cordis.patch.yml 原样保留（不回写模板；3.7 起仅增量补 ui-settings 行）', () => {
    const custom = '# user-owned layer\n- id: system-prompt\n  config: {}\n'
    writeFileSync(join(dir, 'cordis.patch.yml'), custom, 'utf8')
    const again = ensureProfileMaterialized(dir)
    expect(again.created).toEqual([])
    // 3.7 增量补行（id 键控）：用户内容逐字保留 + ui-settings 开关行尾置补写（老用户升级径）
    const after = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
    expect(after.startsWith(custom)).toBe(true)
    expect(after).toContain('- id: ui-settings\n  config:\n    enabled: true')
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

describe('M3 3.7 ui-settings 开关行首启预置（行所有权用户侧径）', () => {
  it('模板补行：cordis.patch.yml 模板含开关行 enabled: true（首启替用户写成开）', () => {
    expect(PROFILE_TEMPLATE_FILES['cordis.patch.yml']).toContain('- id: ui-settings\n  config:\n    enabled: true')
    // 模板行与增量补行同源（template.ts 单源常量——两径字面一致）
    expect(PROFILE_TEMPLATE_FILES['cordis.patch.yml']).toContain(UI_SETTINGS_PRESET_ROW)
  })

  it('增量补行（id 键控）：老用户 cordis.patch.yml 无行 → 补写一次（patched 记账）；二次稳态零动作', () => {
    const oldDir = join(dir, 'old-user')
    mkdirSync(oldDir, { recursive: true })
    const legacy = '# legacy profile (pre-M3)\n- id: system-prompt\n  config: {}\n'
    writeFileSync(join(oldDir, 'cordis.patch.yml'), legacy, 'utf8')
    const first = ensureProfileMaterialized(oldDir)
    expect(first.patched).toEqual(['cordis.patch.yml'])
    const patchedText = readFileSync(join(oldDir, 'cordis.patch.yml'), 'utf8')
    expect(patchedText.startsWith(legacy)).toBe(true)
    expect(patchedText).toContain('- id: ui-settings\n  config:\n    enabled: true')
    // 行在场 → 不再触碰（mtime 稳态）
    const mtime = statSync(join(oldDir, 'cordis.patch.yml')).mtimeMs
    const second = ensureProfileMaterialized(oldDir)
    expect(second.patched).toEqual([])
    expect(statSync(join(oldDir, 'cordis.patch.yml')).mtimeMs).toBe(mtime)
  })

  it('行在场不覆盖：用户已改值（enabled: false）原样保留——此后归用户运行时', () => {
    const userDir = join(dir, 'user-owned')
    mkdirSync(userDir, { recursive: true })
    const userChoice = '- id: ui-settings\n  config:\n    enabled: false\n'
    writeFileSync(join(userDir, 'cordis.patch.yml'), `# user layer\n${userChoice}`, 'utf8')
    const result = ensureProfileMaterialized(userDir)
    expect(result.patched).toEqual([])
    expect(readFileSync(join(userDir, 'cordis.patch.yml'), 'utf8')).toBe(`# user layer\n${userChoice}`)
  })

  it('行锚精确：ui-settings-general 等前缀行不误判（insert 块内缩进行不匹配顶层行锚）', () => {
    const tricky = join(dir, 'tricky')
    mkdirSync(tricky, { recursive: true })
    writeFileSync(
      join(tricky, 'cordis.patch.yml'),
      ['- id: ui-settings-general', '  config: {}', '- insert:', '    - id: ui-settings-account', "      name: '@deepseek-ai/dsh-client-ui-settings-account'", ''].join('\n'),
      'utf8',
    )
    const result = ensureProfileMaterialized(tricky)
    expect(result.patched).toEqual(['cordis.patch.yml']) // 前缀行/缩进行 ≠ ui-settings 行 → 补写
    expect(readFileSync(join(tricky, 'cordis.patch.yml'), 'utf8')).toMatch(/^- id: ui-settings$/m)
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
    // M3 3.7：远征组合 in-preset plugin-forge-spec 行的 loader 解析锚（预设装配 dev 供应面）
    expect(dev.dependencies['@dsh-forge/plugin-forge-spec']).toBe('link:../../../packages/plugin-forge-spec')
    // core 运行期原生依赖（prebuilds 随包分发；兜底供非 realpath 解析路径）
    expect(dev.dependencies['better-sqlite3']).toBe('13.0.3')
    expect(dev.dependencies['gray-matter']).toBe('4.0.3')
  })
  it('cordis.patch.yml 语义一致（官方行 + client-hmr 置停 + 两产品行启用——4.2 转正；产品裁决 2026-10-09：plugin-forge 移出用户层，仅 core/knowledge）', () => {
    const dev = readFileSync(join(devDir, 'cordis.patch.yml'), 'utf8')
    expect(dev).toContain('- id: system-prompt')
    expect(dev).toContain('- id: client-hmr')
    expect(dev).toContain("name: '@dsh-forge/core'")
    expect(dev).toContain("name: '@dsh-forge/knowledge'")
    // plugin-forge 行移出（标准模式零 forge 面——forge 工具/技能仅预设组合携带）
    expect(dev).not.toContain("name: '@dsh-forge/plugin-forge'")
    expect(dev).not.toMatch(/dsh-forge-(core|knowledge)[\s\S]{0,80}disabled/)
    // M3 3.7：ui-settings 开关行（dev = 已落地用户层等价物——语义同步模板补行）
    expect(dev).toContain('- id: ui-settings\n  config:\n    enabled: true')
  })
  it('pnpm-workspace.yaml 全文一致', () => {
    const dev = readFileSync(join(devDir, 'pnpm-workspace.yaml'), 'utf8')
    expect(dev).toBe(PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml'])
  })
})
