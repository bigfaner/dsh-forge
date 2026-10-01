// G1 pin ⑧：dsh profile 目录形状（`loadProfileDirectory` / `runProfile` 签名——S1 实测回填）。
// 权威：tech-design Appendix 契约面清单第 8 项 + spikes/s1-thin-host/README.md（实测签名与
// 目录形状）。上游面（0.2.0-rc.2）：
//   - @deepseek-ai/dsh-app-boot：loadProfileDirectory(binName, dir, installAnchor, {userLayer?})
//     → Profile{name, dir, layers, patchPath, patches, skippedBundles}；reportSkippedBundles /
//     loadLayeredEnv 同门导出
//   - @deepseek-ai/dsh/profile-boot：runProfile(options: RunProfileOptions)
//     → Promise<{ctx, shutdown}>；RunProfileOptions = {environment, profile, resolvedProfile?,
//     fromDefaultProfile?, patchFiles, args, packageManager?}；PROFILE_ROOT_FILENAME='cordis.yml'
//     （每启重写空根——Loader 需真实根锚定 baseUrl）
//   - profile 目录形状：package.json（dsh.profile.bundles）+ cordis.patch.yml（用户层顶层数组）
//     + pnpm-workspace.yaml（hoisted + autoInstallPeers:false）+ node_modules + cordis.yml
// 我方镜像：apps/host/src/profile/template.ts（首启落地模板）+ profile.dev（dev 形态同义标本）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DSH_STACK_VERSION, PROFILE_ROOT_BOOTSTRAP, PROFILE_TEMPLATE_FILES } from '../../apps/host/src/profile/template.js'
import { expectPinnedVersion, importUpstream, interfaceMembers, norm, readTypes, readUpstream, ROOT } from './pins.js'

const PROFILE_DEV = join(ROOT, 'apps/host/profile.dev')

describe('pin ⑧-1 版本锚', () => {
  it('@deepseek-ai/dsh-app-boot（host 锚）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh-app-boot')
  })
  it('@deepseek-ai/dsh（profile-boot 出口宿主）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh')
  })
})

describe('pin ⑧-2 loadProfileDirectory 签名（d.ts + 运行期双锚）', () => {
  const profileTypes = readTypes('host', '@deepseek-ai/dsh-app-boot', 'lib/types/profile.d.ts')

  it('签名 = (binName, dir, installAnchor, options?: {userLayer?}): Profile（S1 实测）', () => {
    expect(profileTypes).toContain(
      'loadProfileDirectory(binName: string, dir: string, installAnchor: string, options?: { userLayer?: boolean; }): Profile',
    )
  })

  it('语义：应用自有 profile 目录直载（不经 Harness home 解析）+ userLayer:false 跳过用户层', () => {
    expect(profileTypes).toContain('Load an already initialized profile directory without resolving it through')
    expect(profileTypes).toContain('`userLayer: false` skips reading `cordis.patch.yml`')
  })

  it('Profile 形状 = {name, dir, layers, patchPath, patches, skippedBundles}', () => {
    expect(interfaceMembers(readUpstream('host', '@deepseek-ai/dsh-app-boot', 'lib/types/profile.d.ts'), 'Profile')).toEqual([
      'dir',
      'layers',
      'name',
      'patchPath',
      'patches',
      'skippedBundles',
    ])
  })

  it('运行期导出：loadProfileDirectory 函数（参数数 3）+ reportSkippedBundles / loadLayeredEnv 同门', async () => {
    const mod = await importUpstream('host', '@deepseek-ai/dsh-app-boot')
    const fn = mod['loadProfileDirectory'] as (...args: unknown[]) => unknown
    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(3)
    expect(typeof mod['reportSkippedBundles']).toBe('function')
    expect(typeof mod['loadLayeredEnv']).toBe('function')
  })
})

describe('pin ⑧-3 runProfile 签名（profile-boot 出口）', () => {
  const bootTypes = readTypes('host', '@deepseek-ai/dsh', 'lib/types/profile-boot.d.ts')

  it('runProfile(options) → Promise<{ctx, shutdown}>（单 options 对象入参）', () => {
    expect(bootTypes).toContain(
      'runProfile(options: RunProfileOptions): Promise<{ ctx: Context; shutdown: ProcessShutdown; }>',
    )
  })

  it('RunProfileOptions 成员集 = {environment, profile, resolvedProfile, fromDefaultProfile, patchFiles, args, packageManager}', () => {
    expect(
      interfaceMembers(readUpstream('host', '@deepseek-ai/dsh', 'lib/types/profile-boot.d.ts'), 'RunProfileOptions'),
    ).toEqual(['args', 'environment', 'fromDefaultProfile', 'packageManager', 'patchFiles', 'profile', 'resolvedProfile'])
  })

  it('resolvedProfile 供给即绕过 CLI profile 目录解析（应用自有 profile 通道）', () => {
    expect(bootTypes).toContain('bypasses named profile initialization when supplied')
  })

  it('运行期导出：runProfile 函数（参数数 1）+ PROFILE_ROOT_FILENAME = cordis.yml', async () => {
    const mod = await importUpstream('host', '@deepseek-ai/dsh/profile-boot')
    const fn = mod['runProfile'] as (...args: unknown[]) => unknown
    expect(typeof fn).toBe('function')
    expect(fn.length).toBe(1)
    expect(mod['PROFILE_ROOT_FILENAME']).toBe('cordis.yml')
  })
})

describe('pin ⑧-4 实跑：loadProfileDirectory × profile.dev（真实已安装 profile 标本）', () => {
  const load = async (userLayer?: boolean) => {
    const mod = (await importUpstream('host', '@deepseek-ai/dsh-app-boot')) as {
      loadProfileDirectory: (
        binName: string,
        dir: string,
        installAnchor: string,
        options?: { userLayer?: boolean },
      ) => {
        name: string
        dir: string
        layers: { packageName: string }[]
        patchPath: string
        patches: unknown[]
        skippedBundles: unknown[]
      }
    }
    return mod.loadProfileDirectory(
      'dsh',
      PROFILE_DEV,
      join(ROOT, 'apps/host/package.json'),
      userLayer === undefined ? undefined : { userLayer },
    )
  }

  it('bundle 层序 = package.json dsh.profile.bundles 声明序（dsh-base → dsh-web-app）', async () => {
    const profile = await load()
    expect(profile.layers.map((l) => l.packageName)).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
    ])
  })

  it('用户层读入（patches 非空）且 userLayer:false 跳过（patches 空）——S1 实测行为', async () => {
    const withUser = await load()
    const withoutUser = await load(false)
    expect(withUser.patches.length).toBeGreaterThan(0)
    expect(withUser.patchPath.endsWith('cordis.patch.yml')).toBe(true)
    expect(withoutUser.patches).toEqual([])
  })

  it('skippedBundles 通道在场（bundle 解析失败不阻断，进清单继续）', async () => {
    const profile = await load()
    expect(Array.isArray(profile.skippedBundles)).toBe(true)
    expect(profile.skippedBundles).toHaveLength(0)
  })
})

describe('pin ⑧-5 profile 目录形状（S1 pin 的文件级事实 × profile.dev 标本）', () => {
  it('四件套在场：package.json / cordis.patch.yml / pnpm-workspace.yaml / node_modules（+cordis.yml）', () => {
    for (const f of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'node_modules', 'cordis.yml']) {
      expect(existsSync(join(PROFILE_DEV, f)), `profile.dev/${f} 缺席`).toBe(true)
    }
  })

  it('pnpm-workspace.yaml：nodeLinker hoisted + autoInstallPeers false（上游 PROFILE_PNPM_WORKSPACE 同款）', () => {
    const yaml = norm(readFileSync(join(PROFILE_DEV, 'pnpm-workspace.yaml'), 'utf8'))
    expect(yaml).toContain('nodeLinker: hoisted')
    expect(yaml).toContain('autoInstallPeers: false')
    expect(yaml).toContain('packages: - .')
  })

  it('我方镜像：首启模板三件 = S1 形状（DSH_STACK_VERSION = pin 版本）', () => {
    expect(Object.keys(PROFILE_TEMPLATE_FILES).sort()).toEqual([
      'cordis.patch.yml',
      'package.json',
      'pnpm-workspace.yaml',
    ])
    expect(DSH_STACK_VERSION).toBe('0.2.0-rc.2')
    const templateYaml = norm(PROFILE_TEMPLATE_FILES['pnpm-workspace.yaml'] ?? '')
    expect(templateYaml).toContain('nodeLinker: hoisted')
    expect(templateYaml).toContain('autoInstallPeers: false')
    const templatePkg = JSON.parse(PROFILE_TEMPLATE_FILES['package.json'] ?? '{}') as {
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(templatePkg.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    // boot 拥有的根配置：空根 include（runProfile 每启重写；空/纯注释会 fail boot 须写 []）
    expect(PROFILE_ROOT_BOOTSTRAP.name).toBe('cordis.yml')
    expect(PROFILE_ROOT_BOOTSTRAP.content).toBe('[]\n')
  })
})
