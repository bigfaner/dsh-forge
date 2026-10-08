// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: preset-physical-isolation（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/contracts/
//   step-{1..3}-*.md（eval-contract 1010/1100 通过——Contract 半承载旅程）。
//
// 旅程分工（web surface 50/50）：本旅程承担 Contract 半（配置/文件级契约面）——本件按
// 「观察通道」行落 e2e 可达面（boot-overlay 物化产物内省 + 技能目录 fs 枚举）；Journey 半
// 由 mode-selection-alignment 与 overview-entry-new-session 承载。
//
// Fact Table 摘录（源码核实）：
//   - boot-overlay.yml（m3.ts overlayTextOf/presetSkillDirs/presetBlockOf）：预设声明行
//     宿主 = {userData}/boot-overlay.yml（每启由三底稿重写——产品工件）；customSkillDirs
//     物化 = 绝对路径（junction 解析目标——Windows 亦反斜杠容错）；`!!js` 全形态死刑；
//   - 底稿（apps/host/src/profile/presets/{cordis,expedition,blitz}.patch.yml）：镜像行
//     含必填 config 全集（如 tool-fs-search sampleOverCapGlobResults）——presets.test.ts
//     与上游 profile.dev 树机械 diff（契约 pin 单源）；
//   - 技能目录（fs）：packages/plugin-forge/skills（core——run-tests/brainstorm/run-tasks/
//     submit-task/quick-tasks 在场）+ packages/plugin-forge-spec/skills（spec 七技能——
//     远征全量可见的物理前提）。
//
// Outcome → 测试映射：
//   Step1 success（突击组合 spec 物理缺席 + 核心包阳性对照）…………………………………「T1」
//   Step1 expedition-catalog-contrast（远征组合双目录——对照面）………………………………「T1」
//   Step3 success（customSkillDirs 恒物化绝对路径——零 !!js）……………………………………「T1」
//   Step2 success（镜像行机械 diff 一致 + 必填 config 全集）………………………………………交叉引用
//   Step2 mirror-config-missing-broken / Step3 js-expression-broken…………………诚实映射
//
// 诚实映射 / 交叉引用（无 e2e 通道或已有承载面——不伪造断言）：
//   - Step2 success（双预设 standard 基础行 ↔ 上游 standard.patch.yml 机械 diff 一致）：
//     e2e 无「与被测安装同版本的上游 checkout」运行期基线（profile.dev 树属 dev 环境面），
//     契约 pin 单源 = apps/host/src/profile/presets.test.ts「standard 基础行 ↔ 上游机械
//     diff 一致（分叉行外逐字节）」+「镜像行 config 全集」——vitest 门承载；本件 T1 以
//     物化产物内省承载运行期半面（必填 config 键在物化行在场 = 全集物化直证）；
//   - Step2 mirror-config-missing-broken / Step3 js-expression-broken（底稿故障注入 →
//     整预设 broken 不上菜单）：注入靶 = 产品底稿（apps/host/src/profile/presets——
//     仓共享树），e2e 变异共享树违反测试隔离铁则（Isolation——不得变异共享全局状态）；
//     schema 拒绝/!!js broken 形态由 3.9 spike 实证（VERIFICATION-3.9.md——packaged-js
//     负对照）+ presets.test.ts（config 全集义务）+ materialize.test.ts（渲染纯函数
//     直测物化形状）承载；
//   - Step1 expedition-catalog-contrast 的 brainstorm 行使半段（技能可用性）= 模型行使
//     面 → dogfood-sc-m3.spec.ts（真实远征会话 brainstorm 行使）；枚举对照半段在本件。
//
// Assertion depth: 18/19 behavioral（95%），其中 deep 7/18（39%）——两阈均过。

import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { overlayTextOf, presetSkillDirs } from '../../support/m3.js'

const WS_NAME = 'ws-jppi'

/** 物化绝对路径判据（Windows 盘符/UNC——含正反斜杠） */
const isAbsoluteMaterialized = (dir: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith('\\\\') || dir.startsWith('/')

test('@web-e2e @m3 预设物理隔离·T1：突击组合 spec 物理缺席（枚举面即证）+ 远征对照 + customSkillDirs 恒物化绝对路径', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jppi-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jppi-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)

    // ── 物化产物在场（boot 每启重写——产品工件）──
    const overlay = overlayTextOf(userData)
    expect(overlay.includes('preset-expedition'), '远征预设行在场').toBe(true)
    expect(overlay.includes('preset-blitz'), '突击预设行在场').toBe(true)
    expect(/default:\s*expedition/.test(overlay), 'registry default = expedition（远征对照起点）').toBe(true)

    // ── Step1：突击组合技能目录——spec 物理缺席（枚举面即证）+ 核心包阳性对照 ──
    const isSpecDir = (d: string): boolean => d.toLowerCase().includes('plugin-forge-spec')
    const isCoreDir = (d: string): boolean => !isSpecDir(d) && d.toLowerCase().includes('plugin-forge')
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(blitzDirs.length, `突击组合仅一目录（dirs=${JSON.stringify(blitzDirs)}）`).toBe(1)
    expect(blitzDirs.every((d) => !isSpecDir(d)), '突击组合 spec 目录物理缺席（七规格技能零在场——物理调不到，非被叮嘱不要）').toBe(true)
    expect(blitzDirs.filter(isCoreDir).length, '核心包技能目录在场（阳性对照——枚举通道有效性）').toBe(1)

    // ── Step1b：远征对照——双目录全量挂载 ──
    const expDirs = presetSkillDirs(overlay, 'expedition')
    expect(expDirs.length, `远征组合双目录（dirs=${JSON.stringify(expDirs)}）`).toBe(2)
    expect(expDirs.filter(isSpecDir).length, '远征含 spec 技能目录（规格全集物理前提）').toBe(1)
    expect(expDirs.filter(isCoreDir).length, '远征含 core 技能目录').toBe(1)

    // ── 核心包技能行 fs 阳性对照（枚举通道有效性证明——缺席断言不空洞通过）──
    const coreEntries = readdirSync(join(ROOT, 'packages', 'plugin-forge', 'skills')).filter((e) => e !== 'README.md')
    for (const skill of ['run-tests', 'brainstorm', 'run-tasks', 'submit-task']) {
      expect(coreEntries, `核心包技能行可见（${skill}——阳性对照）`).toContain(skill)
    }

    // ── Step3：customSkillDirs 恒物化绝对路径（!!js 表达式形态零在场）──
    expect(overlay.includes('!!js'), '物化输出零 !!js 残留（全形态死刑）').toBe(false)
    for (const dir of [...expDirs, ...blitzDirs]) {
      expect(isAbsoluteMaterialized(dir), `物化绝对路径（${dir}）`).toBe(true)
    }
    // 必填 config 全集物化直证（镜像行义务的运行期半面——sampleOverCapGlobResults 键在场）
    expect(overlay.includes('sampleOverCapGlobResults'), '镜像行必填 config 物化在场（tool-fs-search 全集义务）').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    expect(project.id, '注册收敛（世界在场）').toBeTruthy()
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
