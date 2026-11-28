// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC2 L1 双层（PRD Goals SC2）——e2e 断言面 = 装配/数据面（Hard Rule 禁真实模型）：
//   ① 预设层技能枚举边界：boot-overlay.yml 物化（真实 boot 产物）——远征组合 customSkillDirs
//      含 spec 目录（spec 锚 = @dsh-forge/spec——迁移技能族随包分发）、突击组合 spec
//      目录物理缺席（L1 物理边界的数据直证）；registry default = 突击
//      （bug 2ba146d8 缺省=blitz）；物化输出零 !!js（绝对路径 only）；
//   ② spec 锚包（@dsh-forge/spec——plugins/spec）技能成员在盘（远征挂载的物理前提
//      ——清单随技能退役随动）；旧包 plugin-forge[+spec] 技能目录与预设占位符零残留
//      （M1 阶段B 退役）；
//   ③ worker model 与 Forge设置 一致的数据面：forge:settings/set 落 {userData}/
//      forge-settings.json（core 单写者）+ get 回读一致——dispatchTask 组装面（agentOptions
//      显式携带）消费本法（运行期 relay = 3.9 W 用例实证——VERIFICATION-3.9.md；
//      5.3 dogfood 重录）。
// worker 运行期面（toolFilter deny 探针/技能目录到达/run-tests 按需加载正反例/AGENTS.md
// relay）经 3.9 W 用例（真实 dispatchTask——spike 形态例外）；矩阵 deny 期望集 =
// plugins/task-loop/tests/dispatch/assemble.test.ts（模块④单测池）。
// 退役断言面（plugin-spec 1.9——随域/随迁移退役）：
//   退役（plugin-spec 1.9 装配面迁移——远征含 expert-squad 技能目录断言随装配面退役：
//     squad 物化锚走 installAnchor 邻接树解析（apps/host/src/profile/paths.ts
//     resolvePackageSkillsDir），expert-squad 不在 apps/host 安装树 workspace 链接集内
//     ——squadSkillsDir 缺席 = 目录行剔除 fail-soft（overlay.ts 剔除分支），枚举断言
//     在本形态恒空；契约面由 presets.test.ts pin 承载）。
//   退役（plugin-spec 1.9 提案域退役——规格作者技能族（write-prd/ui-design/tech-design/
//     breakdown-tasks/review-prd/review-tech 及 gen-* 退役断言）随域退役；其载体旧包
//     plugin-forge-spec 随 M1 阶段B 整包退役——远征 spec 锚 = @dsh-forge/spec 迁移
//     技能族，清单锚当前盘面成员全集）。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { SETTINGS_CHANNELS } from '@dsh-forge/lib-api/channels'
import { ROOT } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createSharedLaunchFixture, requireInSharedUdRoot } from '../../support/fixtures.js'
import { presetSkillDirs } from '../../support/m3.js'

/** 仓库 spec 技能目录（dev 形态物化锚——junction 绝对路径解析目标；1.9 spec 锚 =
 *  @dsh-forge/spec，包源 = plugins/spec；旧包 plugin-forge skills 目录随 M1 阶段B 退役） */
const SPEC_SKILLS = join(ROOT, 'plugins', 'spec', 'skills')

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

m3Test('@web-e2e @m3 SC2·L1 双层装配面：预设技能枚举边界 + 物化零 !!js + 旧包目录零残留 + 设置单写者', async ({ sharedLaunch }) => {
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

    // L1 物理边界（数据直证·成员资格式——可装卸目录不做总数快照）：
    //   远征必含 spec（plugin-spec 1.9：spec 锚 = @dsh-forge/spec——迁移技能族随包）；
    //   突击物理不含 spec（1.9 skills-blitz 随 grilling 迁 spec 退役——突击零专属技能目录）；
    //   旧包 plugin-forge[+spec] 技能目录零残留（M1 阶段B 退役）。
    const isSpecDir = (d: string): boolean => /@dsh-forge[/\\]spec[/\\]skills/.test(d)
    const expDirs = presetSkillDirs(overlay, 'expedition')
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(expDirs.some(isSpecDir), '远征含 spec 技能目录（迁移技能族挂载）').toBe(true)
    expect(expDirs.every((d) => !d.toLowerCase().includes('plugin-forge')), '远征零旧包技能目录（M1 阶段B 退役）').toBe(true)
    expect(blitzDirs.every((d) => !isSpecDir(d)), '突击组合 spec 目录物理缺席（L1 边界——突击会话技能清单不含规格技能全集）').toBe(true)
    expect(blitzDirs.every((d) => !d.toLowerCase().includes('plugin-forge')), '突击零旧包技能目录（M1 阶段B 退役）').toBe(true)
    expect(blitzDirs.some((d) => d.toLowerCase().includes('skills-blitz')), '1.9 skills-blitz 退役：突击零专属技能目录').toBe(false)

    // ── ② 技能目录枚举（fs 面）──
    const specEntries = readdirSync(SPEC_SKILLS).filter((e) => e !== 'README.md')
    // spec 锚包成员全集（@dsh-forge/spec——plugins/spec；清单随技能退役随动）
    for (const skill of ['fix-bug', 'grilling', 'investigate-bug']) {
      expect(specEntries, `spec 包技能在盘（${skill}——远征挂载的物理前提）`).toContain(skill)
    }
    expect(specEntries, 'spec 包零 loop-blocking 残留（退役——rescue-task-loop 单入口）').not.toContain('loop-blocking')
    expect(specEntries, 'spec 包零 brainstorm 残留（1.9 技能退役断言）').not.toContain('brainstorm')
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
  expect(expedition.includes('order: 1'), '远征 order 1（菜单序源面）').toBe(true)
  expect(blitz.includes('order: 2'), '突击 order 2').toBe(true)
  // 旧包占位符零残留（M1 阶段B：{{plugin-forge-skills}}/{{plugin-forge-spec-skills}} 行随包退役）
  expect(/\{\{plugin-forge/.test(expedition), '远征底稿零旧包占位符残留').toBe(false)
  expect(/\{\{plugin-forge/.test(blitz), '突击底稿零旧包占位符残留').toBe(false)
})
