// 构建脚本批准面固化自证（bug a85b6816 / 台账留痕 dff389f6——fix-20）：
// ensureProfileBuildApprovals + profileBuildApprovalGaps（e2e/support/forge-combo.ts）
// 正反双向验证（消费侧配置单源 = apps/host template.ts PROFILE_ALLOW_BUILDS）：
// - 文件缺席 → 写最小 yaml（单源全键 true）——round B 实证形态（dsh init 零触碰已存在文件）；
// - dsh init 占位值（`set this to true or false`）/ 值漂移 → 就地改 true，其余行零触碰；
// - allowBuilds 块缺席 / 键缺席 → 补块/补键；
// - 已批准 → 幂等零写入；
// - gaps 读面：占位值 / 键缺席 / 文件缺席逐条回报，固化后恒零缺口。
// 反锚（001-repro Round A 失败形态）：占位值 = 未批准 → 缺口清单非空。
// 环境封闭：临时目录夹具，零真机依赖。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROFILE_ALLOW_BUILDS, PROFILE_TEMPLATE_FILES, allowBuildsYamlLine } from '../../../apps/host/src/profile/template.js'
import {
  ensureProfileBuildApprovals,
  ensureRegistryProfile,
  profileBuildApprovalGaps,
  profileWorkspaceFile,
} from '../../../e2e/support/forge-combo.js'

/** 隔离 profile 夹具（返回 {dshHome, profile, file}） */
function makeProfileFixture(initial?: string): { dshHome: string; profile: string; file: string } {
  const dshHome = mkdtempSync(join(tmpdir(), 'approval-home-'))
  const profile = 'cal'
  if (initial !== undefined) {
    const file = profileWorkspaceFile(dshHome, profile)
    mkdirSync(join(dshHome, 'profiles', profile), { recursive: true })
    writeFileSync(file, initial, 'utf8')
  }
  return { dshHome, profile, file: profileWorkspaceFile(dshHome, profile) }
}

/** dsh CLI init 实锚形态（001-repro Round A 现场快照逐字——allowBuilds 全占位值） */
const DSH_INIT_PLACEHOLDER = [
  'packages:',
  '  - .',
  '',
  'nodeLinker: hoisted',
  'autoInstallPeers: false',
  'allowBuilds:',
  "  '@deepseek-ai/dsh-subprocess-local': set this to true or false",
  "  '@google/genai': set this to true or false",
  '  koffi: set this to true or false',
  '  node-pty: set this to true or false',
  '  protobufjs: set this to true or false',
  '',
].join('\n')

describe('PROFILE_ALLOW_BUILDS 单源（bug dff389f6 失败签名覆盖）', () => {
  it('覆盖 ERR_PNPM_IGNORED_BUILDS 五包（全 true；1.40 better-sqlite3 条目退役——node:sqlite 零安装脚本）', () => {
    for (const pkg of ['@deepseek-ai/dsh-subprocess-local', '@google/genai', 'koffi', 'node-pty', 'protobufjs']) {
      expect(PROFILE_ALLOW_BUILDS[pkg], `单源含 ${pkg}`).toBe(true)
    }
    expect(PROFILE_ALLOW_BUILDS['better-sqlite3']).toBeUndefined()
  })

  it('产品模板 yaml 与单源逐键一致（单源派生不漂移）', () => {
    // pin 正本 = apps/host/src/profile/materialize.test.ts 全文一致锚——此处只核派生面
    const yaml = PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml']!
    for (const [pkg, allowed] of Object.entries(PROFILE_ALLOW_BUILDS)) {
      expect(yaml).toContain(allowBuildsYamlLine(pkg, allowed))
    }
  })
})

describe('ensureProfileBuildApprovals（消费侧批准面固化）', () => {
  it('pnpm-workspace.yaml 缺席 → 写最小 yaml（单源全键 true）', () => {
    const fx = makeProfileFixture()
    expect(existsSync(fx.file)).toBe(false)
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    const text = readFileSync(fx.file, 'utf8')
    expect(text).toContain('nodeLinker: hoisted')
    for (const [pkg, allowed] of Object.entries(PROFILE_ALLOW_BUILDS)) {
      expect(text).toContain(allowBuildsYamlLine(pkg, allowed))
    }
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])
  })

  it('dsh init 占位值（Round A 失败形态）→ 就地改 true，其余行零触碰', () => {
    const fx = makeProfileFixture(DSH_INIT_PLACEHOLDER)
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile).length).toBeGreaterThanOrEqual(5)
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    const text = readFileSync(fx.file, 'utf8')
    expect(text).toContain('nodeLinker: hoisted')
    expect(text).not.toContain('set this to true or false')
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])
  })

  it('allowBuilds 块缺席 → 补块；键缺席 → 补键', () => {
    const fx = makeProfileFixture(['packages:', '  - .', '', 'nodeLinker: hoisted', ''].join('\n'))
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])

    const partial = fx.file
    const text = readFileSync(partial, 'utf8').replace(/^  koffi: true\r?\n/m, '')
    writeFileSync(partial, text, 'utf8')
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual(['koffi: allowBuilds 键缺席'])
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    expect(readFileSync(partial, 'utf8')).toMatch(/^  koffi: true$/m)
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])
  })

  it('已批准 → 幂等零写入（字节不变）', () => {
    const fx = makeProfileFixture()
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    const before = readFileSync(fx.file, 'utf8')
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    expect(readFileSync(fx.file, 'utf8')).toBe(before)
  })
})

describe('ensureRegistryProfile（registry 校准 profile 固化——fix-20 Round C/D 闭环面）', () => {
  const SPECS = ['@deepseek-ai/dsh-base@0.2.2-rc.2', '@deepseek-ai/dsh-web-app@0.2.2-rc.2']

  it('package.json 预物化（spec pins 直挂 deps + bundles）+ 批准面 yaml——add 即跳过 dsh init 默认背板', () => {
    const fx = makeProfileFixture()
    ensureRegistryProfile(fx.dshHome, fx.profile, SPECS)
    const pkg = JSON.parse(readFileSync(join(fx.file, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(pkg.dependencies).toEqual({ '@deepseek-ai/dsh-base': '0.2.2-rc.2', '@deepseek-ai/dsh-web-app': '0.2.2-rc.2' })
    expect(pkg.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])
  })

  it('幂等：已存在 package.json 零触碰（dsh init 同门——`!existsSync(package.json)`）', () => {
    const fx = makeProfileFixture()
    ensureRegistryProfile(fx.dshHome, fx.profile, SPECS)
    const pkgFile = join(fx.file, '..', 'package.json')
    const before = readFileSync(pkgFile, 'utf8')
    ensureRegistryProfile(fx.dshHome, fx.profile, SPECS)
    expect(readFileSync(pkgFile, 'utf8')).toBe(before)
  })

  it('spec 形状超封闭枚举（无 @version）→ fail-loud', () => {
    const fx = makeProfileFixture()
    expect(() => ensureRegistryProfile(fx.dshHome, fx.profile, ['@deepseek-ai/dsh-base'])).toThrow(/name@version/)
  })
})

describe('profileBuildApprovalGaps（缺口读面）', () => {
  it('文件缺席 → 单源全键逐条回报', () => {
    const fx = makeProfileFixture()
    const gaps = profileBuildApprovalGaps(fx.dshHome, fx.profile)
    expect(gaps).toHaveLength(Object.keys(PROFILE_ALLOW_BUILDS).length)
    expect(gaps.every((g) => g.includes('pnpm-workspace.yaml 缺席'))).toBe(true)
  })

  it('值漂移（false）→ 回报未批准', () => {
    const drifted = DSH_INIT_PLACEHOLDER.replace("'koffi': set this to true or false", "'koffi': false")
    const fx = makeProfileFixture(drifted)
    ensureProfileBuildApprovals(fx.dshHome, fx.profile)
    expect(profileBuildApprovalGaps(fx.dshHome, fx.profile)).toEqual([])
  })
})
