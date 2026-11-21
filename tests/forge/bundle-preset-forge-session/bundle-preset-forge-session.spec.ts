// e2e 旅程 spec：「Forge模式」预设会话（bundle-preset-forge-session——forge-aggregate-bundle 1.8）。
// journey = .forge/docs/proposals/forge-aggregate-bundle/testing/bundle-preset-forge-session/journey.md
// contract = 同目录 contracts/bundle-preset.md（断言标注 CT-BPf-*；order pin = 真机断言 pin
// （dump-config 合并实况定值 2——漂移可发现而非被吸收，圆桌裁决用户裁定 2026-11-21）；
// persona 不锁字面（只锁「persona 行在 preset-forge 插行内成套生效」行为语义））。
// B3 = order pin 反例注入载体（断言可红性证明——doctored dump → 红 → 复原 → 绿）。
// 真机纪律与前置同主旅程；FORGE_COMBO_E2E=1 缺省 skip。
import { expect, test } from '@playwright/test'
import {
  PRESET_FORGE_ORDER,
  PRESET_FORGE_PROVIDER,
  comboEnv,
  comboGateOn,
  dumpConfig,
  ensureHostShared,
  ensureInstalledShared,
  expectFiveGlobalSkillRows,
  expectPresetForgeOrderPin,
  FORGE_PKG,
  FORGE_ROW_ID,
  invalidateInstalledShared,
  openForgeDetail,
  overrideDisabled,
  pluginRemove,
  preflightCommitCharge,
  presetOrderOf,
  readProfilePatch,
  skillRows,
  stopHostShared,
  toggleRowSwitch,
  type WebHost,
} from '../bundle/support.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md 留痕）——常规跑批跳过')

const PROFILE = 'web'
const env = comboEnv()
// 基建夹具共享（持久态文件——与 bundle-install-fullchain 共用一次正装与宿主拉起；
// 拉起/存活失败 → fail-fast 闩秒级中止整套）
const ensureHost = (): Promise<WebHost> => ensureHostShared(env, 19_680)
const stopHost = (): Promise<void> => stopHostShared(env)

test.beforeAll(async () => {
  // 跑批前置预检（commit charge ≥90% fail-loud 拒跑）+ 正装共享建成（已装且状态复验通过即跳过）
  preflightCommitCharge()
  await ensureInstalledShared(env, PROFILE)
})
test.afterEach(stopHost)
test.afterAll(async () => {
  await stopHost()
  await pluginRemove(env, FORGE_PKG, PROFILE)
  invalidateInstalledShared(env)
})

test('CT-BPf-G1 #O-G1-1：预设选择器 Forge模式在场 + order=2 pin（真机合并实况）', async () => {
  const dump = await dumpConfig(env, PROFILE)
  expectPresetForgeOrderPin(dump)
})

test('CT-BPf-G2 #O-G2-1：官方 standard 预设原样（order=1 + 零 forge 覆写）', async () => {
  const dump = await dumpConfig(env, PROFILE)
  expect(presetOrderOf(dump.match(/- id: persona[\s\S]*?(?=^- id: (?:headhunter|skill-|settings)|$)/m)?.[0] ?? dump), 'standard 预设 order=1（官方底稿核销值）').toBe(1)
  // INV-1：standard 段零 preset-forge 注入痕迹（filesystem-forge 只在 forge 预设段）
  expect(skillRows(dump).filter((r) => r.providerName === PRESET_FORGE_PROVIDER), 'preset 层实例仅 forge 预设段一份').toHaveLength(1)
})

test('CT-BPf-G3 #O-G3-1：Forge模式插行成套生效（persona 行 + skill-filesystem-forge 行 + 裁剪工具集非空）', async () => {
  const dump = await dumpConfig(env, PROFILE)
  // 行为语义判定：persona 行在 forge 预设内成套（零字面锁定——演进友好）
  const forgePresetBlock = dump.slice(Math.max(0, dump.indexOf('order: 2') - 2000), dump.indexOf('order: 2') + 500)
  expect(forgePresetBlock, 'persona 行成套在场（@deepseek-ai/dsh-persona）').toContain("- name: '@deepseek-ai/dsh-persona'")
  expect(forgePresetBlock, '行内 skill-filesystem-forge 实例（五条已装包锚）').toContain('- id: skill-filesystem-forge')
  expect(forgePresetBlock.match(/^    tools:/m)?.[0], '裁剪工具集声明非空（standard 同构裁剪）').toBeDefined()
})

test('CT-BPf-G4 #O-G4-1：两层 skills 合并可见（preset 层 filesystem-forge + global 五实例，标识互异零 throw）', async () => {
  const dump = await dumpConfig(env, PROFILE)
  const rows = skillRows(dump)
  expect(rows.find((r) => r.providerName === PRESET_FORGE_PROVIDER), 'preset 层实例可见').toBeDefined()
  expectFiveGlobalSkillRows(dump)
  expect(rows.filter((r) => r.providerName === PRESET_FORGE_PROVIDER), 'preset/global 零撞名（唯一 forge 实例）').toHaveLength(1)
})

test('CT-BPf-B2 #O-B2-1：bundle 停用后 forge 预设缺席、standard 不受影响；重开恢复', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, FORGE_ROW_ID, false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), FORGE_ROW_ID), { timeout: 60_000 }).toBe(true)
  const off = await dumpConfig(env, PROFILE)
  expect(off.includes('skill-filesystem-forge'), '停用期 forge 预设行缺席').toBe(false)
  expect(off.includes('- id: headhunter') || off.includes('order: 1'), 'standard 官方预设不受影响').toBe(true)
  await toggleRowSwitch(detail, FORGE_ROW_ID, true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), FORGE_ROW_ID), { timeout: 60_000 }).toBe(false)
  expect((await dumpConfig(env, PROFILE)).includes('skill-filesystem-forge'), '重开后 forge 预设恢复').toBe(true)
})

test('CT-BPf-B3 #O-B3-1：order pin 反例注入（断言可红性证明——doctored dump → 红 → 真实 dump → 绿）', async () => {
  const real = await dumpConfig(env, PROFILE)
  // 注入：order 2 → 3（模拟轨改值同构——pin 断言函数本体注入红）
  const doctored = real.replace(/^(    order: )2$/m, '$13')
  expect(() => expectPresetForgeOrderPin(doctored), '注入态断言红（pin 生效——漂移可发现）').toThrow()
  expectPresetForgeOrderPin(real)
  expect(presetOrderOf(real), '复原后断言绿（order pin 定值一致）').toBe(PRESET_FORGE_ORDER)
})
