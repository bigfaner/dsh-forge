// host-profile-skill-dirs.spec — task 5.7 装配接线面(customSkillDirs boot 同步):
// 壳侧驱动(配置遍历 → 物化产物探测 → 动态导入 → 同步)+ 告警聚合 +
// getState 设置面装配。临时用户配置 fixture = 真实临时 profile 目录 + 伪插件
// 物化(机制本体经 importModule seam 直连插件源码形态 —— 与打包态
// lib/skill-dirs.js 同一实现)。

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/workbench/store/db.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'
import { syncProfileSkillDirs, SKILL_DIRS_ARTIFACT, type SkillDirsImporter } from '../src/main/host-profile/skill-dirs.ts'
import type { PluginBundleEntry } from '../src/main/host-profile/index.ts'

/** 机制本体:插件源码形态(与 lib/skill-dirs.js 同一模块;打包态走运行时导入)。 */
const sourceImporter: SkillDirsImporter = async () => await import('../../../packages/plugins/forge-workbench/src/host/skill-dirs/sync.ts')

const PLUGIN = '@dsh-forge/plugin-forge-workbench'

const scratches: string[] = []
afterEach(() => {
  while (scratches.length > 0) {
    const dir = scratches.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

function makeScratch(prefix: string): string {
  const dir = join(tmpdir(), `dsh-forge-skilldirs-${prefix}-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

/** 伪插件物化:node_modules 下包目录 + skills 树 + lib/skill-dirs.js 占位(探测标记)。 */
function materializePlugin(profileDir: string, withArtifact: boolean): string {
  const pluginDir = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-forge-workbench')
  const skillRoot = join(pluginDir, 'resources', 'skills')
  for (const name of ['submit-task', 'git-commit']) {
    mkdirSync(join(skillRoot, name), { recursive: true })
    writeFileSync(join(skillRoot, name, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture\n---\n\nbody\n`)
  }
  if (withArtifact) {
    mkdirSync(join(pluginDir, 'lib'), { recursive: true })
    writeFileSync(join(pluginDir, SKILL_DIRS_ARTIFACT), '// built artifact stand-in; the importer seam bypasses it\n')
  }
  return pluginDir
}

function bundles(withPlugin: boolean): readonly PluginBundleEntry[] {
  const entries: PluginBundleEntry[] = [{ name: '@deepseek-ai/dsh-base', mandatory: true }]
  if (withPlugin) entries.push({ name: PLUGIN, mandatory: true })
  return entries
}

describe('task 5.7 syncProfileSkillDirs — boot wiring', () => {
  it('syncs every config bundle that ships the skill-dirs artifact (config-driven, order kept)', async () => {
    const profileDir = makeScratch('boot')
    const pluginDir = materializePlugin(profileDir, true)
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: sourceImporter })
    expect(outcome.alerts).toEqual([])
    const patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const skillRoot = join(pluginDir, 'resources', 'skills')
    expect(patch).toContain('- id: skill-filesystem')
    expect(patch).toContain(`- '${skillRoot}'`)
  })

  it('skips bundles without the artifact — no config write, no alerts', async () => {
    const profileDir = makeScratch('skip')
    // 物化了插件但无 lib/skill-dirs.js(不携带技能同步面的 bundle)。
    materializePlugin(profileDir, false)
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: sourceImporter })
    expect(outcome.alerts).toEqual([])
    expect(existsSync(join(profileDir, 'cordis.patch.yml'))).toBe(false)
  })

  it('skips entirely when the config carries no plugin materialization', async () => {
    const profileDir = makeScratch('none')
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(false), importModule: sourceImporter })
    expect(outcome.alerts).toEqual([])
    expect(existsSync(join(profileDir, 'cordis.patch.yml'))).toBe(false)
  })

  it('aggregates a sync failure as an ERR_SKILL_DIR_SYNC alert entry (explicit, not silent)', async () => {
    const profileDir = makeScratch('fail')
    // 物化目录存在但技能根缺失 → 机制面 failed(T3/漂移校验链)。
    const pluginDir = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-forge-workbench')
    mkdirSync(join(pluginDir, 'lib'), { recursive: true })
    writeFileSync(join(pluginDir, SKILL_DIRS_ARTIFACT), '// stand-in\n')
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: sourceImporter })
    expect(outcome.alerts).toHaveLength(1)
    expect(outcome.alerts[0]?.code).toBe('ERR_SKILL_DIR_SYNC')
    expect(outcome.alerts[0]?.plugin).toBe(PLUGIN)
  })

  it('a crashing artifact import degrades to an alert (boot never blocks on the skill face)', async () => {
    const profileDir = makeScratch('crash')
    materializePlugin(profileDir, true)
    const boom: SkillDirsImporter = async () => { throw new Error('artifact exploded') }
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: boom })
    expect(outcome.alerts).toHaveLength(1)
    expect(outcome.alerts[0]?.message).toContain('artifact exploded')
  })

  it('an artifact exporting no syncSkillDirs is an explicit alert, not a silent pass', async () => {
    const profileDir = makeScratch('noshape')
    materializePlugin(profileDir, true)
    const empty: SkillDirsImporter = async () => ({})
    const outcome = await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: empty })
    expect(outcome.alerts).toHaveLength(1)
    expect(outcome.alerts[0]?.message).toContain('syncSkillDirs')
  })
})

describe('task 5.7 — settings-face assembly (getState carries the alerts)', () => {
  /** pluginFace(listRows)读产品清单 —— 给它一份最小合法 fixture。 */
  function writeBundlesFixture(dir: string): string {
    const path = join(dir, 'plugin-bundles.json')
    writeFileSync(path, `${JSON.stringify({ bundles: [{ name: PLUGIN, mandatory: true }] })}\n`)
    return path
  }

  it('injects boot alerts into WorkbenchState.skillDirSyncAlerts through the real service assembly', async () => {
    const userData = makeScratch('state')
    const { db } = await openDatabase(userData)
    try {
      const assembly = createWorkbenchIpcServices({
        db,
        pluginBundlesPath: writeBundlesFixture(userData),
        userDataPath: userData,
        skillDirSyncAlerts: [{ code: 'ERR_SKILL_DIR_SYNC', plugin: PLUGIN, message: 'drift repair failed' }],
        onEvents: () => {},
        perception: { retarget: () => {}, rescan: () => {} },
      })
      expect(assembly.verbs.getState().skillDirSyncAlerts).toEqual([
        { code: 'ERR_SKILL_DIR_SYNC', plugin: PLUGIN, message: 'drift repair failed' },
      ])
      assembly.dispose()
    } finally {
      db.close()
    }
  })

  it('a healthy boot keeps the field absent (existing consumers unaffected)', async () => {
    const userData = makeScratch('state-clean')
    const { db } = await openDatabase(userData)
    try {
      const assembly = createWorkbenchIpcServices({
        db,
        pluginBundlesPath: writeBundlesFixture(userData),
        userDataPath: userData,
        skillDirSyncAlerts: [],
        onEvents: () => {},
        perception: { retarget: () => {}, rescan: () => {} },
      })
      expect(assembly.verbs.getState().skillDirSyncAlerts).toBeUndefined()
      assembly.dispose()
    } finally {
      db.close()
    }
  })
})

// 导入 seam 的 URL 契约:物化产物以 file:// URL 动态导入(Windows 绝对路径)。
it('importer receives a file URL for the materialized artifact', async () => {
  const seen: string[] = []
  const spy: SkillDirsImporter = async (url) => {
    seen.push(url)
    return await sourceImporter(url)
  }
  const profileDir = makeScratch('url')
  const pluginDir = materializePlugin(profileDir, true)
  await syncProfileSkillDirs({ profileDir, bundles: bundles(true), importModule: spy })
  expect(seen).toEqual([pathToFileURL(join(pluginDir, SKILL_DIRS_ARTIFACT)).href])
})
