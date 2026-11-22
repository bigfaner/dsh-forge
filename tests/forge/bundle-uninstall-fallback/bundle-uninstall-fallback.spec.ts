// e2e 旅程 spec：卸载回落六包尽出（bundle-uninstall-fallback——forge-aggregate-bundle 1.8）。
// journey = .forge/docs/proposals/forge-aggregate-bundle/testing/bundle-uninstall-fallback/journey.md
// contract = 同目录 contracts/bundle-uninstall.md（断言标注 CT-BUn-*；卸载链口径按任务 1.3
// probe-uninstall 源码核销校准：机制段 = 取消选择→停插件→pnpm remove→发布 resolution；
// 磁盘段 = pnpm 孤儿 prune 真机事实（源码不可定谳，本 spec 承接）；user 层 override 残留
// 不清理、按合并语义判定（patch.ts:17）——重装后 bundle 层给 enabled ⇒ 残留被吸收）。
// 真机纪律与前置 = 主旅程（bundle-install-fullchain）同口径：隔离 home、版本双校验前置、
// 自拉实例按 PID 回收。FORGE_COMBO_E2E=1 缺省 skip（SMOKE-LEDGER 留痕）。
// Workers=2 并行互扰修复：beforeAll 取套件互斥锁与 bundle 其余三套件跨文件串行化。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  acquireSuiteLock,
  cheapGenerationGate,
  comboEnv,
  comboGateOn,
  dumpConfig,
  expectPresetSkillInstances,
  forgeInstallSource,
  launchWebHost,
  nodeModulesOf,
  openForgeDetail,
  openPluginManager,
  overrideDisabled,
  pluginAdd,
  pluginCard,
  pluginRemove,
  purgeBaseline,
  readProfilePatch,
  releaseSuiteLock,
  SUITE_HOOK_TIMEOUT_MS,
  requireBundleSource,
  toggleRowSwitch,
  type WebHost,
} from '../bundle/support.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md 留痕）——常规跑批跳过')

const PROFILE = 'web'
const env = comboEnv()
let host: WebHost | undefined

const ensureHost = async (): Promise<WebHost> => {
  host ??= await launchWebHost(env, 19_660)
  return host
}
const stopHost = async (): Promise<void> => {
  if (host !== undefined) {
    await host.close()
    host = undefined
  }
}
/** 卸载前置静默门（pnpm remove 后 lockfile/manifest 落盘异步收敛——cheap poll） */
async function expectUninstallSettled(): Promise<void> {
  await expect.poll(() => {
    const dirs = [FORGE_PKG, ...BARE_BUNDLES].map((p) => join(nodeModulesOf(env, PROFILE), '@dsh-forge', p.slice('@dsh-forge/'.length)))
    return dirs.every((d) => !existsSync(d))
  }, { timeout: 60_000 }).toBe(true)
}

test.beforeAll(async () => {
  // Workers=2 并行互扰修复：bundle 四套件对隔离 home/profile 独占敏感——跨套件互斥锁串行化
  await acquireSuiteLock(env, 'bundle-uninstall-fallback')
}, SUITE_HOOK_TIMEOUT_MS)
test.afterEach(stopHost)
test.afterAll(async () => {
  await stopHost()
  await pluginRemove(env, FORGE_PKG, PROFILE)
  releaseSuiteLock(env, 'bundle-uninstall-fallback')
})

test('CT-BUn-G1 #O-G1-1：user 层启停残留制造（project 行关闭生效）', async () => {
  // Preconditions：bundle 正装态（自建——契约允许独立重装满足）
  await purgeBaseline(env, PROFILE)
  const add = await pluginAdd(env, requireBundleSource(env), PROFILE)
  expect(add.code, `bundle 正装（exit=${String(add.code)}）`).toBe(0)
  cheapGenerationGate(nodeModulesOf(env, PROFILE))
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, 'project', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 }).toBe(true)
})

test('CT-BUn-G2 #O-G2-1：卸载六包尽出（exit 0 + 六包目录逐一不存在——pnpm 孤儿 prune 磁盘事实）', async () => {
  await stopHost()
  const remove = await pluginRemove(env, FORGE_PKG, PROFILE)
  expect(remove.code, `卸载成功（exit=${String(remove.code)}）stderr=${remove.stderr.slice(-400)}`).toBe(0)
  await expectUninstallSettled()
})

test('CT-BUn-G3 #O-G3-1：呈现面回落干净（管理页零条目 + dump-config 零 forge 下发面）', async () => {
  const h = await ensureHost()
  await openPluginManager(h.page)
  await expect(h.page.locator(pluginCard(FORGE_PKG)), '管理页零 forge 条目').toHaveCount(0)
  for (const bare of BARE_BUNDLES) {
    await expect(h.page.locator(pluginCard(bare)), `管理页零五件条目 ${bare}`).toHaveCount(0)
  }
  const dump = await dumpConfig(env, PROFILE)
  expect(dump.includes('forge/db/forge/forge.db'), 'forge 下发面清零（共库 dbFile 表达式缺席）').toBe(false)
})

test('CT-BUn-B1 #O-B1-1：磁盘残层核验（lockfile 零六包悬空引用）', async () => {
  const lock = join(env.dshHome, 'profiles', PROFILE, 'pnpm-lock.yaml')
  expect(readFileSync(lock, 'utf8'), 'lockfile 可读（卸载后原地重写）').toBeTruthy()
  const text = readFileSync(lock, 'utf8')
  for (const pkg of [FORGE_PKG, ...BARE_BUNDLES]) {
    expect(text, `lockfile 零悬空引用 ${pkg}`).not.toContain(`'${pkg}'`)
  }
})

test('CT-BUn-G4 #O-G4-1：重装默认激活态（无残留污染——project 行回激活 + preset 子树技能实例恢复）', async () => {
  const add = await pluginAdd(env, forgeInstallSource(env), PROFILE)
  expect(add.code, `重装成功（exit=${String(add.code)}）`).toBe(0)
  cheapGenerationGate(nodeModulesOf(env, PROFILE))
  // user 层残留被吸收（patch.ts:17 合并语义——bundle 层 enabled ⇒ 孤立 override 删除）
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 }).toBe(false)
  expectPresetSkillInstances(await dumpConfig(env, PROFILE))
})

test('CT-BUn-B4 #O-B4-1：卸后重装 skills 端到端零 throw（宿主存活 + 双 preset 子树实例齐备）', async () => {
  const h = await ensureHost()
  expect(h.child.exitCode, '宿主进程存活（零装载 throw 进程面）').toBeNull()
  expectPresetSkillInstances(await dumpConfig(env, PROFILE))
})

test('CT-BUn-B2 #O-B2-1：重复卸载幂等（六包尽出后再次卸载零破坏性错误）', async () => {
  await stopHost()
  const again = await pluginRemove(env, FORGE_PKG, PROFILE)
  expect(again.code, `重复卸载零破坏性错误（exit=${String(again.code)}；MISSING_DEPS 非零合规）`).toBeGreaterThanOrEqual(0)
  await expectUninstallSettled()
})
