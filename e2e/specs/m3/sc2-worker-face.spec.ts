// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC2 L1 双层（PRD Goals SC2）——e2e 断言面 = 装配/数据面（Hard Rule 禁真实模型）：
//   ① 预设层技能枚举边界：boot-overlay.yml 物化（真实 boot 产物）——远征组合 customSkillDirs
//      含 [core, spec] 双目录、突击组合仅 core（spec 目录物理缺席 = L1 物理边界的数据直证）；
//      registry default = 突击（bug 2ba146d8 缺省=blitz）；物化输出零 !!js（绝对路径 only）；
//   ② 核心包技能目录无 git-commit / git-checkout 条目（移除/未迁断言——PRD SC2 预设层）；
//      spec 包 8 技能在盘（远征全量可见的物理前提）；
//   ③ worker model 与 Forge设置 一致的数据面：forge:settings/set 落 {userData}/
//      forge-settings.json（core 单写者）+ get 回读一致——dispatchTask 组装面（agentOptions
//      显式携带）消费本法（运行期 relay = 3.9 W 用例实证——VERIFICATION-3.9.md；
//      5.3 dogfood 重录）。
// worker 运行期面（toolFilter deny 探针/技能目录到达/run-tests 按需加载正反例/AGENTS.md
// relay）经 3.9 W 用例（真实 dispatchTask——spike 形态例外）；矩阵 deny 期望集 = 5.1
// pin-12 + e2e/support/m3/worker-face.test.ts（deriveWorkerToolFilter 实函数断言）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { SETTINGS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { ROOT } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createSharedLaunchFixture, requireInSharedUdRoot } from '../../support/fixtures.js'
import { presetSkillDirs } from '../../support/m3.js'

/** 仓库核心/spec 技能目录（dev 形态物化锚——junction 绝对路径解析目标） */
const CORE_SKILLS = join(ROOT, 'packages', 'plugin-forge', 'skills')
const SPEC_SKILLS = join(ROOT, 'packages', 'plugin-forge-spec', 'skills')

// e2e-fast-shared-launch 存量迁移（批次四b）：共享 launch fixture——launchHost 整 spec 一次，
// userData 由 fixture 自管。boot-overlay / forge-settings 判读经支撑层单源定位（udDir
// 透传——魔法前缀扫描退役）：overlay 三底稿每启重写与路径无关（批次四a 同径）；
// forge-settings.json 仅本 spec 写入，存在性即本 worker 锚（workers=2 下他 worker 不落此文件）。
// 静态面用例（底稿同构，无 app）不消费共享会话——沿用 @playwright/test 原生 test
//（expert-squad-service-key step-5 audit 同径先例）。
const { test: m3Test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: 'ws-sc2',
  launch: { expectPhase: 'hero' },
})

function sharedOverlayText(udDir: string): string {
  return requireInSharedUdRoot(udDir, (ud) => {
    const file = join(ud, 'boot-overlay.yml')
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  }, 'shared-launch: boot-overlay.yml 未找到（共享 userData 根缺失）')
}

function sharedSettingsFile(udDir: string): string {
  return requireInSharedUdRoot(udDir, (ud) => {
    const file = join(ud, 'forge-settings.json')
    return existsSync(file) ? file : undefined
  }, 'shared-launch: forge-settings.json 未找到（共享 userData 根缺失——set 未落盘）')
}

m3Test('@web-e2e @m3 SC2·L1 双层装配面：预设技能枚举边界 + 物化零 !!js + 核心包无退役技能 + 设置单写者', async ({ sharedLaunch }) => {
  test.setTimeout(300_000)
  const { page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, 'ws-sc2')

    // ── ① boot-overlay.yml 物化断言（真实 boot 产物）──
    const overlay = sharedOverlayText(udDir)
    expect(overlay.includes('preset-expedition'), '远征预设行在场').toBe(true)
    expect(overlay.includes('preset-blitz'), '突击预设行在场').toBe(true)
    expect(/default:\s*blitz/.test(overlay), 'registry default = blitz（bug 2ba146d8 缺省=blitz）').toBe(true)
    expect(overlay.includes('!!js'), '物化输出零 !!js 残留（绝对路径 only）').toBe(false)

    // L1 物理边界（数据直证·成员资格式——expert-squad 可装卸，不做总数快照）：
    //   远征必含 core + spec；突击必含 core + skills-blitz、物理不含 spec；
    //   expert-squad/skills 双预设同挂（用户裁决 2026-11-01 / 19d9da56——在场断不断数）。
    const isSpecDir = (d: string): boolean => d.toLowerCase().includes('plugin-forge-spec')
    const isCoreDir = (d: string): boolean => !isSpecDir(d) && d.toLowerCase().includes('plugin-forge')
    const isSquadDir = (d: string): boolean => d.toLowerCase().includes('expert-squad')
    const isBlitzDir = (d: string): boolean => d.toLowerCase().includes('skills-blitz')
    const expDirs = presetSkillDirs(overlay, 'expedition')
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(expDirs.some(isSpecDir), '远征含 spec 技能目录（全量挂载）').toBe(true)
    expect(expDirs.some(isCoreDir), '远征含 core 技能目录').toBe(true)
    expect(expDirs.some(isSquadDir), '远征含 expert-squad 技能目录（双预设同挂）').toBe(true)
    expect(blitzDirs.every((d) => !isSpecDir(d)), '突击组合 spec 目录物理缺席（L1 边界——突击会话技能清单不含规格技能全集）').toBe(true)
    expect(blitzDirs.some(isCoreDir), '突击含 core 技能目录').toBe(true)
    expect(blitzDirs.some(isBlitzDir), '突击含 blitz 专属技能目录（grilling 挂载源）').toBe(true)

    // ── ② 技能目录枚举（fs 面）──
    const coreEntries = readdirSync(CORE_SKILLS).filter((e) => e !== 'README.md')
    expect(coreEntries.includes('run-tasks'), 'core 无 run-tasks 条目（dispatch-loop-hardening 3a 退役断言）').toBe(false)
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
    // [废弃注记：worker 段 UI 写径与机械读取径已随 expert-squad-default-routing AC4 退役
    // ——agentOptions 组装改经 expert-squad experts 服务折叠承载，不再消费 forge-settings
    // worker 段。本段仅作通用 forge:settings/set 通道落盘/回读数据面演练保留；worker 段
    // 写入后旧值残留文件但失效。]
    const WORKER = { provider: 'deepseek', model: 'e2e-sc2-worker-model', reasoning: 'high' as const }
    await forgeInvoke(page, SETTINGS_CHANNELS.set, { worker: WORKER })
    const settingsFile = sharedSettingsFile(udDir)
    expect(existsSync(settingsFile), 'forge-settings.json 落 {userData}（core 单写者·路径守卫域）').toBe(true)
    const persisted = JSON.parse(readFileSync(settingsFile, 'utf8')) as { worker?: { model?: string; provider?: string } }
    expect(persisted.worker?.model, '设置落盘 = 写入值（worker model 数据面）').toBe(WORKER.model)
    const got = await forgeInvoke<{ worker?: { model?: string; provider?: string; reasoning?: string } }>(page, SETTINGS_CHANNELS.get)
    expect(got.worker, 'get 回读一致（dispatchTask agentOptions 组装数据源）').toEqual(WORKER)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    expect(project.id, '注册收敛（世界在场）').toBeTruthy()
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

// ── 静态面（无 app）：dev 形态底稿与物化产物同构（占位符 → repo 绝对路径的机械替换面） ──

test('@web-e2e @m3 SC2·底稿同构面：三 patch 底稿在场 + 远征/突击组合占位符口径', () => {
  const presetsDir = join(ROOT, 'apps', 'host', 'src', 'profile', 'presets')
  const read = (name: string): string => readFileSync(join(presetsDir, name), 'utf8')
  const cordis = read('cordis.patch.yml')
  expect(/default:\s*blitz/.test(cordis), 'registry 底稿 default = blitz（bug 2ba146d8 缺省=blitz）').toBe(true)
  const expedition = read('expedition.patch.yml')
  const blitz = read('blitz.patch.yml')
  expect(expedition.includes('"{{plugin-forge-skills}}"'), '远征底稿 core 目录占位符').toBe(true)
  expect(expedition.includes('"{{plugin-forge-spec-skills}}"'), '远征底稿 spec 目录占位符').toBe(true)
  expect(blitz.includes('"{{plugin-forge-skills}}"'), '突击底稿 core 目录占位符').toBe(true)
  expect(blitz.includes('{{plugin-forge-spec-skills}}'), '突击底稿零 spec 占位符（L1 边界源面）').toBe(false)
  expect(expedition.includes('order: 1'), '远征 order 1（菜单序源面）').toBe(true)
  expect(blitz.includes('order: 2'), '突击 order 2').toBe(true)
})
