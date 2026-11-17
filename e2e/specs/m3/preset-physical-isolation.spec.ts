// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// 预设物理隔离——配置/文件级契约面（Contract 半；Journey 半由 mode-selection-alignment
// 与 overview-entry-new-session 承载）。当前契约（plugin-spec 1.9 迁移后——源码核实）：
//   - boot-overlay.yml（apps/host/src/boot/overlay.ts 物化 + e2e/support/m3.ts
//     presetSkillDirs 切片）：预设行宿主 = {userData}/boot-overlay.yml（每启由底稿重写
//     ——产品工件）；customSkillDirs 物化 = 绝对路径（解析缺席 = 整行剔除 fail-soft
//     ——overlay.ts PRESET_SKILL_DIR_TOKENS 分支）；`!!js` 全形态死刑（平台门行物化期
//     就地求值——PLATFORM_GATE_ROWS）；
//   - 底稿（apps/host/src/profile/presets/{cordis,expedition,blitz}.patch.yml）：
//     registry default = blitz（bug 2ba146d8）；远征组合 = core + spec 双目录
//     （{{plugin-forge-skills}} + {{plugin-forge-spec-skills}}），突击组合仅 core——
//     零 spec 占位符（契约 pin 单源 = presets.test.ts）；
//   - 技能目录（fs）：packages/plugin-forge/skills = README 占位（plugin-forge 技能
//     全数迁出——1.9 迁移收口）；spec 锚 = @dsh-forge/spec（plugins/spec/skills——
//     fix-bug/grilling/investigate-bug/loop-blocking 随包分发）。
//
// 退役断言面（plugin-spec 1.9——规格作者技能族随提案域退役）：
//   退役（plugin-spec 1.9 提案域退役——「远征含 spec 七规格技能目录（规格全集物理
//   前提）」断言随域退役：规格作者技能族（write-prd/ui-design/tech-design/
//   breakdown-tasks/review-prd/review-tech，残存 @dsh-forge/plugin-forge-spec 包）
//   不再入任何预设 customSkillDirs 装载面；远征 spec 锚改指 @dsh-forge/spec 迁移
//   技能族，本件枚举断言随迁至当前契约）。
//   退役（plugin-spec 1.9 技能退役——核心包 fs 阳性对照 brainstorm/submit-task 行
//   随技能退役（brainstorm 退役、plugin-forge 技能全数迁出）：核心包技能目录现 =
//   README 占位，阳性对照改锚 @dsh-forge/spec 包成员全集）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { createSharedLaunchFixture, requireInSharedUdRoot } from '../../support/fixtures.js'
import { ROOT } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { presetSkillDirs } from '../../support/m3.js'

const WS_NAME = 'ws-jppi'

/** 物化绝对路径判据（Windows 盘符/UNC——含正反斜杠） */
const isAbsoluteMaterialized = (dir: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith('\\\\') || dir.startsWith('/')

/** spec 技能目录判据（1.9 spec 锚 = @dsh-forge/spec——迁移技能族随包分发） */
const isSpecDir = (d: string): boolean => /@dsh-forge[/\\]spec[/\\]skills/.test(d) || d.toLowerCase().includes('plugin-forge-spec')
const isCoreDir = (d: string): boolean => !isSpecDir(d) && d.toLowerCase().includes('plugin-forge')

/** 共享 launch 形态 boot-overlay 判读：支撑层单源定位（udDir 透传）内 boot-overlay.yml
 *  （三底稿每启重写，内容与 userData 路径无关）。 */
function sharedOverlayText(udDir: string): string {
  return requireInSharedUdRoot(udDir, (ud) => {
    const file = join(ud, 'boot-overlay.yml')
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  }, 'shared-launch: boot-overlay.yml 未找到（共享 userData 根缺失）')
}

// ── 共享 launch fixture（空白工作区；预设座位断言面零夹具档案依赖）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero' },
})

test('@web-e2e @m3 预设物理隔离·T1：突击组合 spec 物理缺席 + 远征 spec 锚对照 + customSkillDirs 恒物化绝对路径', async ({ sharedLaunch }) => {
  test.setTimeout(300_000)
  const { page, pageErrors, wsDir, udDir } = sharedLaunch
  const project = await registerProject(page, wsDir, WS_NAME)

  // ── 物化产物在场（boot 每启重写——产品工件）──
  const overlay = sharedOverlayText(udDir)
  expect(overlay.includes('preset-expedition'), '远征预设行在场').toBe(true)
  expect(overlay.includes('preset-blitz'), '突击预设行在场').toBe(true)
  expect(/default:\s*blitz/.test(overlay), 'registry default = blitz（bug 2ba146d8 缺省=blitz）').toBe(true)

  // ── Step1：突击组合技能目录——spec 物理缺席（枚举面即证）+ 核心包阳性对照 ──
  const blitzDirs = presetSkillDirs(overlay, 'blitz')
  expect(blitzDirs.every((d) => !isSpecDir(d)), '突击组合 spec 目录物理缺席（物理调不到，非被叮嘱不要）').toBe(true)
  expect(blitzDirs.some(isCoreDir), '核心包技能目录在场（成员资格式——expert-squad 可装卸不断总数；阳性对照枚举通道有效性）').toBe(true)

  // ── Step1b：远征对照——spec 锚目录挂载（1.9 迁移技能族随包分发）──
  const expDirs = presetSkillDirs(overlay, 'expedition')
  expect(expDirs.some(isSpecDir), '远征含 @dsh-forge/spec 技能目录（迁移技能族物理挂载）').toBe(true)
  expect(expDirs.some(isCoreDir), '远征含 core 技能目录').toBe(true)

  // ── 技能目录 fs 阳性对照（枚举通道有效性证明——缺席断言不空洞通过）──
  // 核心包 = README 占位（1.9 迁移收口——plugin-forge 技能全数迁出）
  const coreEntries = readdirSync(join(ROOT, 'packages', 'plugin-forge', 'skills')).filter((e) => e !== 'README.md')
  expect(coreEntries, '核心包技能目录零技能残留（1.9 迁移收口）').toEqual([])
  // spec 锚包成员全集（plugins/spec/skills——迁移技能族随包分发）
  const specEntries = readdirSync(join(ROOT, 'plugins', 'spec', 'skills')).filter((e) => e !== 'README.md')
  for (const skill of ['fix-bug', 'grilling', 'investigate-bug', 'loop-blocking']) {
    expect(specEntries, `spec 包技能在盘（${skill}——迁移技能族物理前提）`).toContain(skill)
  }
  expect(specEntries, 'spec 包零 brainstorm 残留（1.9 技能退役断言）').not.toContain('brainstorm')

  // ── Step3：customSkillDirs 恒物化绝对路径（!!js 表达式形态零在场）──
  expect(overlay.includes('!!js'), '物化输出零 !!js 残留（全形态死刑）').toBe(false)
  for (const dir of [...expDirs, ...blitzDirs]) {
    expect(isAbsoluteMaterialized(dir), `物化绝对路径（${dir}）`).toBe(true)
  }
  // 必填 config 全集物化直证（镜像行义务的运行期半面——sampleOverCapGlobResults 键在场）
  expect(overlay.includes('sampleOverCapGlobResults'), '镜像行必填 config 物化在场（tool-fs-search 全集义务）').toBe(true)

  expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  expect(project.id, '注册收敛（世界在场）').toBeTruthy()
})
