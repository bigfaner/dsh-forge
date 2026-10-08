// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC2 L1 双层（PRD Goals SC2）——e2e 断言面 = 装配/数据面（Hard Rule 禁真实模型）：
//   ① 预设层技能枚举边界：boot-overlay.yml 物化（真实 boot 产物）——远征组合 customSkillDirs
//      含 [core, spec] 双目录、突击组合仅 core（spec 目录物理缺席 = L1 物理边界的数据直证）；
//      registry default = 远征；物化输出零 !!js（绝对路径 only）；
//   ② 核心包技能目录无 git-commit / git-checkout 条目（移除/未迁断言——PRD SC2 预设层）；
//      spec 包 8 技能在盘（远征全量可见的物理前提）；
//   ③ worker model 与 Forge设置 一致的数据面：forge:settings/set 落 {userData}/
//      forge-settings.json（core 单写者）+ get 回读一致——dispatchTask 组装面（agentOptions
//      显式携带）消费本法（运行期 relay = 3.9 W 用例实证——VERIFICATION-3.9.md；
//      5.3 dogfood 重录）。
// worker 运行期面（toolFilter deny 探针/技能目录到达/run-tests 按需加载正反例/AGENTS.md
// relay）经 3.9 W 用例（真实 dispatchTask——spike 形态例外）；矩阵 deny 期望集 = 5.1
// pin-12 + e2e/support/m3/worker-face.test.ts（deriveWorkerToolFilter 实函数断言）。
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { SETTINGS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { overlayTextOf, presetSkillDirs } from '../../support/m3.js'

/** 仓库核心/spec 技能目录（dev 形态物化锚——junction 绝对路径解析目标） */
const CORE_SKILLS = join(ROOT, 'packages', 'plugin-forge', 'skills')
const SPEC_SKILLS = join(ROOT, 'packages', 'plugin-forge-spec', 'skills')

test('@web-e2e @m3 SC2·L1 双层装配面：预设技能枚举边界 + 物化零 !!js + 核心包无退役技能 + 设置单写者', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc2-'))
  const wsDir = join(fixtureRoot, 'ws-sc2')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, 'ws-sc2')

    // ── ① boot-overlay.yml 物化断言（真实 boot 产物）──
    const overlay = overlayTextOf(userData)
    expect(overlay.includes('preset-expedition'), '远征预设行在场').toBe(true)
    expect(overlay.includes('preset-blitz'), '突击预设行在场').toBe(true)
    expect(/default:\s*expedition/.test(overlay), 'registry default = expedition').toBe(true)
    expect(overlay.includes('!!js'), '物化输出零 !!js 残留（绝对路径 only）').toBe(false)

    // L1 物理边界（数据直证）：远征组合 = [core, spec] 双目录；突击组合 = 仅 core
    const isSpecDir = (d: string): boolean => d.toLowerCase().includes('plugin-forge-spec')
    const isCoreDir = (d: string): boolean => !isSpecDir(d) && d.toLowerCase().includes('plugin-forge')
    const expDirs = presetSkillDirs(overlay, 'expedition')
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(expDirs.length, `远征组合双技能目录（dirs=${JSON.stringify(expDirs)}）`).toBe(2)
    expect(expDirs.filter(isSpecDir).length, '远征含 spec 技能目录（全量挂载）').toBe(1)
    expect(expDirs.filter(isCoreDir).length, '远征含 core 技能目录').toBe(1)
    expect(blitzDirs.length, `突击组合仅 core 目录（dirs=${JSON.stringify(blitzDirs)}）`).toBe(1)
    expect(blitzDirs.every((d) => !isSpecDir(d)), '突击组合 spec 目录物理缺席（L1 边界——突击会话技能清单不含规格技能全集）').toBe(true)

    // ── ② 技能目录枚举（fs 面）──
    const coreEntries = readdirSync(CORE_SKILLS).filter((e) => e !== 'README.md')
    expect(coreEntries.includes('run-tasks'), 'core 含 run-tasks').toBe(true)
    expect(coreEntries.includes('quick-tasks'), 'core 含 quick-tasks（突击直达链）').toBe(true)
    expect(coreEntries.includes('brainstorm'), 'core 含 brainstorm（远征全链起点）').toBe(true)
    expect(coreEntries.includes('submit-task'), 'core 含 submit-task').toBe(true)
    expect(coreEntries, '核心包无 git-commit 条目（M3 移除断言）').not.toContain('git-commit')
    expect(coreEntries, '核心包无 git-checkout 条目（未迁断言）').not.toContain('git-checkout')
    const specEntries = readdirSync(SPEC_SKILLS).filter((e) => e !== 'README.md')
    for (const skill of ['write-prd', 'ui-design', 'tech-design', 'gen-journeys', 'gen-contracts', 'gen-test-scripts', 'breakdown-tasks']) {
      expect(specEntries, `spec 包技能在盘（${skill}——远征全量可见的物理前提）`).toContain(skill)
    }
    expect(specEntries, 'spec 包无 git-commit（拆包后移除断言）').not.toContain('git-commit')

    // ── ③ Forge设置 单写者数据面：set → {userData}/forge-settings.json 落盘 + get 回读一致 ──
    const WORKER = { provider: 'deepseek', model: 'e2e-sc2-worker-model', reasoning: 'high' as const }
    await forgeInvoke(page, SETTINGS_CHANNELS.set, { worker: WORKER })
    const settingsFile = join(userData, 'forge-settings.json')
    expect(existsSync(settingsFile), 'forge-settings.json 落 {userData}（core 单写者·路径守卫域）').toBe(true)
    const persisted = JSON.parse(readFileSync(settingsFile, 'utf8')) as { worker?: { model?: string; provider?: string } }
    expect(persisted.worker?.model, '设置落盘 = 写入值（worker model 数据面）').toBe(WORKER.model)
    const got = await forgeInvoke<{ worker?: { model?: string; provider?: string; reasoning?: string } }>(page, SETTINGS_CHANNELS.get)
    expect(got.worker, 'get 回读一致（dispatchTask agentOptions 组装数据源）').toEqual(WORKER)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    expect(project.id, '注册收敛（世界在场）').toBeTruthy()
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

// ── 静态面（无 app）：dev 形态底稿与物化产物同构（占位符 → repo 绝对路径的机械替换面） ──

test('@web-e2e @m3 SC2·底稿同构面：三 patch 底稿在场 + 远征/突击组合占位符口径', () => {
  const presetsDir = join(ROOT, 'apps', 'host', 'src', 'profile', 'presets')
  const read = (name: string): string => readFileSync(join(presetsDir, name), 'utf8')
  const cordis = read('cordis.patch.yml')
  expect(/default:\s*expedition/.test(cordis), 'registry 底稿 default = expedition').toBe(true)
  const expedition = read('expedition.patch.yml')
  const blitz = read('blitz.patch.yml')
  expect(expedition.includes('"{{plugin-forge-skills}}"'), '远征底稿 core 目录占位符').toBe(true)
  expect(expedition.includes('"{{plugin-forge-spec-skills}}"'), '远征底稿 spec 目录占位符').toBe(true)
  expect(blitz.includes('"{{plugin-forge-skills}}"'), '突击底稿 core 目录占位符').toBe(true)
  expect(blitz.includes('{{plugin-forge-spec-skills}}'), '突击底稿零 spec 占位符（L1 边界源面）').toBe(false)
  expect(expedition.includes('order: 1'), '远征 order 1（菜单序源面）').toBe(true)
  expect(blitz.includes('order: 2'), '突击 order 2').toBe(true)
})
