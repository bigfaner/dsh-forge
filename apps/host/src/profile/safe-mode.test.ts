// 安全模式 profile 三件套单测（fix-12 B——官方 main.js:2697-2732 语义搬运的三处 pin：
// 目录名/基座 bundle/空 patch/hoisted workspace + ensure 幂等 writeIfChanged）。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SAFE_MODE_BUNDLES,
  SAFE_MODE_PROFILE_NAME,
  ensureSafeModeProfile,
  safeModeProfileFiles,
} from './safe-mode.js'

const tempDirs: string[] = []

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-safe-mode-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('safeModeProfileFiles 三件套内容（官方逐字 pin）', () => {
  it('package.json 仅官方基座 bundle（dsh.profile.bundles = SAFE_MODE_BUNDLES）+ 版本 pin 依赖', () => {
    const manifest = JSON.parse(safeModeProfileFiles()['package.json'] ?? '{}') as {
      name?: string
      private?: boolean
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: readonly string[] } }
    }
    expect(manifest.name).toBe('dsh-profile-desktop-safe-mode')
    expect(manifest.private).toBe(true)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(Object.keys(manifest.dependencies ?? []).sort()).toEqual([...SAFE_MODE_BUNDLES].sort())
    // 版本 pin 与产品模板单源：全部为 DSH_STACK_VERSION（0.2.0-rc.2 pin）
    for (const version of Object.values(manifest.dependencies ?? {})) expect(version).toBe('0.2.0-rc.2')
  })

  it('cordis.patch.yml = 空 patch []（用户层/第三方行零注入——官方 SAFE_MODE_PATCH 逐字）', () => {
    const patch = safeModeProfileFiles()['cordis.patch.yml'] ?? ''
    expect(patch).toContain('# Managed by DSH Desktop Safe Mode.')
    expect(patch.trimEnd().endsWith('[]')).toBe(true)
    expect(patch).not.toMatch(/^\s*- id:/m) // 零 patch 行
  })

  it('pnpm-workspace.yaml = hoisted（官方 SAFE_MODE_WORKSPACE 逐字语义）', () => {
    const workspace = safeModeProfileFiles()['pnpm-workspace.yaml'] ?? ''
    expect(workspace).toContain('nodeLinker: hoisted')
    expect(workspace).toContain('autoInstallPeers: false')
    expect(workspace).toContain('packages:')
  })
})

describe('ensureSafeModeProfile 落地（幂等）', () => {
  it('首启全量落地三件套于 {dshHome}/profiles/desktop-safe-mode；重复调用零实写', () => {
    const home = tempHome()
    const first = ensureSafeModeProfile(home)
    expect(first.directory).toBe(join(home, 'profiles', SAFE_MODE_PROFILE_NAME))
    expect([...first.written].sort()).toEqual(['cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml'])
    expect(readFileSync(join(first.directory, 'package.json'), 'utf8')).toContain('dsh-profile-desktop-safe-mode')

    const second = ensureSafeModeProfile(home)
    expect(second.written).toEqual([])

    // 异内容（用户手改）→ 官方 writeIfChanged 语义覆写回托管内容
    writeFileSync(join(home, 'profiles', SAFE_MODE_PROFILE_NAME, 'cordis.patch.yml'), '- id: rogue\n', 'utf8')
    const third = ensureSafeModeProfile(home)
    expect(third.written).toEqual(['cordis.patch.yml'])
    expect(readFileSync(join(third.directory, 'cordis.patch.yml'), 'utf8')).toContain('Managed by DSH Desktop Safe Mode.')
  })
})
