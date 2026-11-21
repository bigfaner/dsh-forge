// e2e 旅程 spec：solo 单装零 forge 依赖（bundle-solo-install——forge-aggregate-bundle 1.8）。
// journey = .forge/docs/proposals/forge-aggregate-bundle/testing/bundle-solo-install/journey.md
// contract = 同目录 contracts/bundle-solo.md（断言标注 CT-BSo-*；五件逐一单装串行成例——
// 每件成例前回落干净 profile；spec 双改行（skill-filesystem-spec/filesystem-spec，fefd5149
// 回归面）在 B1 点名）。真机纪律与前置同主旅程；FORGE_COMBO_E2E=1 缺省 skip。
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  MEMBERS,
  cheapGenerationGate,
  comboEnv,
  comboGateOn,
  dumpConfig,
  memberProvider,
  memberSkillId,
  nodeModulesOf,
  openPluginManager,
  packTarball,
  pluginAdd,
  pluginCard,
  pluginRemove,
  purgeBaseline,
  requireBundleSource,
  skillRows,
} from '../bundle/support.js'
import { join } from 'node:path'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md 留痕）——常规跑批跳过')

const PROFILE = 'web'
const env = comboEnv()
const memberTarball = (member: string): string => packTarball(join(requireBundleSource(env), '..', member))

/** 单件成例骨架（CT-BSo-G1–G5 + B1 双改点名——五件逐一串行复用） */
async function soloCase(member: (typeof MEMBERS)[number]): Promise<void> {
  // 回落干净 profile（前件残留归零——CT-BSo-B2 Preconditions）
  await purgeBaseline(env, PROFILE)
  const pkg = `@dsh-forge/${member}`
  const add = await pluginAdd(env, memberTarball(member), PROFILE)
  expect(add.code, `单件安装成功 ${pkg}（exit=${String(add.code)}）stderr=${add.stderr.slice(-300)}`).toBe(0)
  // 双校验前置（AGENTS §1.8——版本不符即停，零取证）
  cheapGenerationGate(nodeModulesOf(env, PROFILE), [pkg])
  // G1：管理页恰该件一条目（其余四件与 forge 逐一缺席——负断言）
  const h = await import('../bundle/support.js').then((m) => m.launchWebHost(env, 19_670))
  try {
    await openPluginManager(h.page)
    await expect(h.page.locator(pluginCard(pkg)), `管理页恰该件一条目 ${pkg}`).toBeVisible()
    await expect(h.page.locator(pluginCard(FORGE_PKG)), '零 forge 条目（INV-2）').toHaveCount(0)
    for (const other of BARE_BUNDLES.filter((b) => b !== pkg)) {
      await expect(h.page.locator(pluginCard(other)), `余件条目缺席 ${other}`).toHaveCount(0)
    }
  } finally {
    await h.close()
  }
  // G3/B1：skills 可见（异 id + 异 providerName 行生效；spec 件 = 双改行点名）
  const dump = await dumpConfig(env, PROFILE)
  const rows = skillRows(dump)
  const hit = rows.find((r) => r.id === memberSkillId(member))
  expect(hit, `skills 行在场 ${memberSkillId(member)}（solo 空档消除直接证据）`).toBeDefined()
  expect(hit!.providerName, `实例标识 = 双改后互异 providerName ${memberProvider(member)}`).toBe(memberProvider(member))
  expect(dump.includes('forge/db/forge/forge.db'), '零 forge 依赖（零 forge 下发面——B4）').toBe(false)
  // 成例终态回落干净
  const rm = await pluginRemove(env, pkg, PROFILE)
  expect(rm.code, `单件卸载回落（exit=${String(rm.code)}）`).toBe(0)
  await expect.poll(() => {
    const dirs = [FORGE_PKG, ...BARE_BUNDLES].map((p) => join(nodeModulesOf(env, PROFILE), '@dsh-forge', p.slice('@dsh-forge/'.length)))
    return dirs.every((d) => !existsSync(d))
  }, { timeout: 60_000 }).toBe(true)
}

for (const member of MEMBERS) {
  test(`CT-BSo-G1..G5/B1/B2/B4 #五件逐一串行成例：${member} 单装全链零 forge 依赖`, async () => {
    await soloCase(member)
  })
}

test('CT-BSo-B3 #O-B3-1：单装后 bundle 安装互斥（与 CT-BIF-B1 对称——loud-fail + 单装件原样）', async () => {
  await purgeBaseline(env, PROFILE)
  const add = await pluginAdd(env, memberTarball('spec'), PROFILE)
  expect(add.code, `单装 spec（exit=${String(add.code)}）`).toBe(0)
  const bundleAdd = await pluginAdd(env, requireBundleSource(env), PROFILE)
  expect(bundleAdd.code, 'bundle add 互斥 loud-fail（exit ≠ 0）').not.toBe(0)
  expect(`${bundleAdd.stderr}\n${bundleAdd.stdout}`, '互斥报错语义在场').toMatch(/互斥|冲突|conflict|already|已装|exist/u)
  const dump = await dumpConfig(env, PROFILE)
  expect(dump, '单装件原样在场（spec 插行原样）').toContain(`- id: ${memberSkillId('spec')}`)
})
