// e2e 旅程 spec：bundle 安装全链（bundle-install-fullchain——forge-aggregate-bundle 1.8）。
// journey = .forge/docs/proposals/forge-aggregate-bundle/testing/bundle-install-fullchain/journey.md
// contract = 同目录 contracts/bundle-install.md（断言-契约溯源：每条断言标注 CT-BIF-* 条目 id；
// 锚值回填记录见契约文档「锚值回填（脚本任务 1.8）」节）。
//
// 真机纪律（AGENTS §1.8 前置声明）：
// - 被测物 = plugin-manager 正式安装的 bundle 变体发布树（`dsh plugin add <bundle 目录>`）；
// - 宿主 = `dsh --profile web --no-open --port <port>` 后台拉起（boot token 落盘），junction/
//   dist 直载与 dev 宿主形态不作证据；
// - **manifest 版本双校验 + 服务面代际戳探针先于一切大取证**（cheapGenerationGate——失败
//   即停，CT-BIF-B7 语义落地），先廉价校验装载版本再做大取证；
// - 侵入操作（卸载/重装/宿主重启）只作用于本套件自建隔离 home（FORGE_COMBO_DSH_HOME）内
//   的自拉实例（按 PID 定点回收，零按名通配）；世代冻结判据命中 → 条件 skip 留痕 SMOKE-LEDGER。
//
// 环境前置（真机收口轮置位）：FORGE_COMBO_E2E=1 + FORGE_COMBO_DSH_HOME + 
// FORGE_COMBO_RELEASE_TREE（bundle 变体发布树；闭包物化副本经 FORGE_COMBO_NPM_SOURCE_DIR
// 优先）。缺省整组 skip（SMOKE-LEDGER 留痕）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BARE_BUNDLES,
  FORGE_PKG,
  PRESET_FORGE_PROVIDER,
  SIX_ROW_IDS,
  cheapGenerationGate,
  comboDbPath,
  comboEnv,
  comboGateOn,
  dumpConfig,
  ensureHostShared,
  ensureInstalledShared,
  expectFiveGlobalSkillRows,
  expectPresetForgeOrderPin,
  expectSharedDbDispatch,
  expectSixInsertEntries,
  expectSixPkgsPresent,
  generationFrozen,
  invalidateInstalledShared,
  memberSkillId,
  nodeModulesOf,
  openForgeDetail,
  openPluginManager,
  overrideDisabled,
  packTarball,
  pluginAdd,
  pluginRemove,
  pluginCard,
  preflightCommitCharge,
  readForgeDiagEvents,
  readProfilePatch,
  requireBundleSource,
  sharedHostStdout,
  skillRows,
  stopHostShared,
  toggleRowSwitch,
  type WebHost,
} from '../bundle/support.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md 留痕）——常规跑批跳过')

const PROFILE = 'web'
const env = comboEnv()
const hostStdout = (): string => sharedHostStdout(env)
// 基建夹具共享（持久态文件——隔离 home 承载，跨用例/跨套件）：宿主存活即免 boot 附着
// 复用；拉起/存活失败 → fail-fast 闩秒级中止整套
const ensureHost = (): Promise<WebHost> => ensureHostShared(env, 19_650)
const stopHost = (): Promise<void> => stopHostShared(env)

test.afterEach(async () => {
  // 用例边界回收宿主（自拉实例按 PID 进程树定点回收——零残留进程；AGENTS §1.8 侵入边界）
  await stopHost()
})

test.afterAll(async () => {
  await stopHost()
  // 卸载收尾（幂等 best-effort——隔离 home）+ 正装共享态失效（边界归属本套件）
  await pluginRemove(env, FORGE_PKG, PROFILE)
  invalidateInstalledShared(env)
  rmSync(join(tmpdir(), 'dsh-forge-bundle-pack-'), { recursive: true, force: true })
})

// CT-BIF-B8：世代冻结判据命中 → 整旅程条件 skip，SMOKE-LEDGER 留痕（不作失败亦不作正向取证）。
test.beforeAll(async () => {
  // 跑批前置预检（commit charge ≥90% fail-loud 拒跑——windows-commit-exhaustion 判例配方）
  preflightCommitCharge()
  test.skip(generationFrozen(env, PROFILE), '世代冻结判据命中（0b5230e1 判据族）——整旅程条件 skip，SMOKE-LEDGER 留痕')
  // bundle 正装共享建成（purge → add → 廉价代际门，已建成且复验通过即跳过——G1 复装幂等，断言面零变更）
  await ensureInstalledShared(env, PROFILE)
})

test('CT-BIF-G1 #O-G1-1：一条命令六包全装（exit 0 + profile node_modules 六包齐备）', async () => {
  const source = requireBundleSource(env)
  const add = await pluginAdd(env, source, PROFILE)
  expect(add.code, `bundle add 成功（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)
  expectSixPkgsPresent(nodeModulesOf(env, PROFILE))
})

test('CT-BIF-G2 #O-G2-1/#O-G2-2：插件管理页一包一卡（forge 卡在场 + 五件条目逐一缺席——INV-2）', async () => {
  const h = await ensureHost()
  await openPluginManager(h.page)
  await expect(h.page.locator(pluginCard(FORGE_PKG))).toBeVisible()
  for (const bare of BARE_BUNDLES) {
    await expect(h.page.locator(pluginCard(bare)), `五件条目缺席（负断言逐包判定）${bare}`).toHaveCount(0)
  }
})

test('CT-BIF-G3 #O-G3-1：版本双校验前置门 + 详情页六插行（dump-config insert 条目对偶）', async () => {
  await ensureHost()
  // 版本双校验 + 服务面代际戳（AGENTS §1.8 取证顺序纪律——失败即抛，零后续取证）
  cheapGenerationGate(nodeModulesOf(env, PROFILE))
  const detail = await openForgeDetail(await ensureHost().then((h) => h.page))
  // 详情页 RowsSection 六行启停开关在场（probe-① 定谳机械锚；开关定位 = 官方 dockkit Switch）
  const switches = detail.getByRole('switch')
  await expect(switches).toHaveCount(6)
  // 组合实况对偶：六插行 insert 条目逐一在场（dump-config 官方 CLI 公开面）
  expectSixInsertEntries(await dumpConfig(env, PROFILE))
})

test('CT-BIF-G4 #O-G4-1：行级启停语义往返（project 行关→开；状态后效 = user 层 patch override + 开关终态）', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  // 关：开关 → user 层 patch override（宿主持久化事实——probe-uninstall patch.ts:17 语义）
  await toggleRowSwitch(detail, 'project', false)
  await expect
    .poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 })
    .toBe(true)
  // 开：override 被吸收（合并语义——复记删除，残留不污染）
  await toggleRowSwitch(detail, 'project', true)
  await expect
    .poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 })
    .toBe(false)
})

test('CT-BIF-G5 #O-G5-1：bundle 级整包启停往返（forge 条目关→开；终态 = 开启）', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, 'forge', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(true)
  await toggleRowSwitch(detail, 'forge', true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(false)
})

test('CT-BIF-G6 #O-G6-1：五件服务与 UI 全量在场（服务面代际戳 + forge-bundle-apply 标记 + client 注入通道取件）', async () => {
  const h = await ensureHost()
  // 服务面 bundle 特有标记①：五件代际戳（manifest + bundle-client banner 双校验——失败即停）
  cheapGenerationGate(nodeModulesOf(env, PROFILE))
  // 服务面 bundle 特有标记②：forge-bundle-apply diag 事件（diag jsonl 或 boot stdout）
  const diag = readForgeDiagEvents(env.dshHome)
  expect(
    diag.includes('forge-bundle-apply') || hostStdout().includes('forge-bundle-apply'),
    `forge-bundle-apply 标记在场（diag=${JSON.stringify(diag.slice(-4))}）`,
  ).toBe(true)
  // 五件 UI 全量在场：client 注入通道实际取件（行为锚——同代文件被宿主实际装载）
  for (const bare of BARE_BUNDLES) {
    expect(h.clientUrls.some((u) => u.includes(bare)), `client 注入通道实际取件 ${bare}`).toBe(true)
  }
})

test('CT-BIF-G7 #O-G7-1：共库 db 落点单源（四持库件 dbFile = {home}/forge/db/forge/forge.db；写痕段按写操作在场性判定）', async () => {
  await ensureHost()
  const dump = await dumpConfig(env, PROFILE)
  expectSharedDbDispatch(dump)
  // 写痕段（须 ≥1 件产生过写操作；隔离 home 冷装无写操作时按在场性判定——零写痕不判红）
  const db = comboDbPath(env.dshHome)
  if (!existsSync(db)) return
  // O-G7-1：单文件共享落点 + 非各包私有库（单装缺省库缺席）
  expect(existsSync(join(env.dshHome, 'forge', 'db', 'project', 'project.db')), '零 project 单装私有库（负断言）').toBe(false)
})

test('CT-BIF-G8 #O-G8-1：standard 会话 skills 五实例可见（dump-config 合并实况——五异 id + 互异 providerName + 零装载 throw）', async () => {
  const h = await ensureHost()
  const dump = await dumpConfig(env, PROFILE)
  expectFiveGlobalSkillRows(dump)
  // INV-4 零 throw：宿主存活 + boot/运行日志零装载异常（模块解析失败/未处理拒绝）
  expect(h.child.exitCode, '宿主进程存活（零装载 throw 的进程面证据）').toBeNull()
  for (const clue of ['ERR_MODULE_NOT_FOUND', 'UnhandledPromiseRejection', 'providerName 同层重名']) {
    expect(hostStdout(), `零装载异常标记 ${clue}`).not.toContain(clue)
  }
})

test('CT-BIF-G9 #O-G9-1：Forge模式预设两层合并可见（order=2 定值 pin + preset 层 filesystem-forge + global 五实例）', async () => {
  const dump = await dumpConfig(env, PROFILE)
  expectPresetForgeOrderPin(dump)
  const rows = skillRows(dump)
  const presetRow = rows.find((r) => r.providerName === PRESET_FORGE_PROVIDER)
  expect(presetRow, `preset 层实例可见（providerName ${PRESET_FORGE_PROVIDER}）`).toBeDefined()
  expect(rows.filter((r) => r.id === 'skill-filesystem-forge'), 'preset 层行 id = skill-filesystem-forge').toHaveLength(1)
  expectFiveGlobalSkillRows(dump)
})

test('CT-BIF-G10 #O-G10-1：已装副本独立存活（profile 内 require 五件往返 + 源目录零参与零触碰）', async () => {
  const { spawnSync } = await import('node:child_process')
  const nm = nodeModulesOf(env, PROFILE)
  const source = requireBundleSource(env)
  const srcBefore = statSync(join(source, 'package.json')).mtimeMs
  for (const bare of BARE_BUNDLES) {
    const script = `const p=require.resolve('${bare}');const assert=require('node:assert');assert(p.startsWith(${JSON.stringify(nm)}),p);require('${bare}');console.log(p)`
    const res = spawnSync(process.execPath, ['-e', script], { cwd: mkdtempSync(join(tmpdir(), 'dsh-forge-bundle-req-')), encoding: 'utf8', windowsHide: true })
    expect(res.status, `profile 内 require 往返 ${bare}（exit=${String(res.status)}）stderr=${String(res.stderr).slice(-300)}`).toBe(0)
    expect(res.stdout, `解析自 profile 副本（源目录零参与）${bare}`).toContain(nm)
  }
  expect(statSync(join(source, 'package.json')).mtimeMs, '源目录零触碰（mtime 不变——非破坏性验证）').toBe(srcBefore)
})

test('CT-BIF-B1 #O-B1-1/#O-B1-2：安装互斥 loud-fail（单装 project 后 bundle add → 非零退出 + 既有安装零变化）', async () => {
  const nm = nodeModulesOf(env, PROFILE)
  const before = readdirSync(join(nm, '@dsh-forge')).sort().join(',')
  const tgz = packTarball(join(requireBundleSource(env), '..', 'project'))
  const add = await pluginAdd(env, tgz, PROFILE)
  expect(add.code, '互斥 loud-fail（exit ≠ 0）').not.toBe(0)
  expect(`${add.stderr}\n${add.stdout}`, '互斥报错语义在场（非裸失败）').toMatch(/互斥|冲突|conflict|already|已装|exist/u)
  expect(readdirSync(join(nm, '@dsh-forge')).sort().join(','), '既有安装逐件原样（零静默半装）').toBe(before)
})

test('CT-BIF-B2 #O-B2-1：重复安装幂等（重装成功 + 从正源刷新 + 呈现与首装一致）', async () => {
  const add = await pluginAdd(env, requireBundleSource(env), PROFILE)
  expect(add.code, `重装成功（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)
  expectSixPkgsPresent(nodeModulesOf(env, PROFILE))
  cheapGenerationGate(nodeModulesOf(env, PROFILE))
  expectSixInsertEntries(await dumpConfig(env, PROFILE))
})

test('CT-BIF-B3 #O-B3-1：forge 壳行自身启停跨重启不漂（停用 → 宿主重启 → 停用态保持）', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, 'forge', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(true)
  // 宿主重启（自拉实例——close 后复启，单实例语义下冷启动复锚）
  await stopHost()
  await ensureHost()
  expect(overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), '停用态跨重启持久（零态漂）').toBe(true)
  // 复原：开启态回收（后续用例基线）
  const detail2 = await openForgeDetail((await ensureHost()).page)
  await toggleRowSwitch(detail2, 'forge', true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(false)
})

test('CT-BIF-B4 #O-B4-1：行级启停后组合实况一致性（被关闭件 disabled、其余在件原样——INV-1 config face）', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, 'project', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 }).toBe(true)
  const dump = await dumpConfig(env, PROFILE)
  // 新状态面：被关闭件呈停用语义、其余四件 skills 行不受牵连
  expect(overrideDisabled(readProfilePatch(env, PROFILE), 'project'), '被关闭件停用态在案').toBe(true)
  expect(dump, '其余件插行不受牵连（task-loop 行原样）').toMatch(/- id: task-loop/)
  await toggleRowSwitch(detail, 'project', true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'project'), { timeout: 60_000 }).toBe(false)
})

test('CT-BIF-B5 #O-B5-1：五实例共存零 throw + 单件卸除余四件 skills 不受牵连（INV-4）', async () => {
  const h = await ensureHost()
  expectFiveGlobalSkillRows(await dumpConfig(env, PROFILE))
  expect(h.child.exitCode, '全量装载零 throw（进程面）').toBeNull()
  const detail = await openForgeDetail(h.page)
  await toggleRowSwitch(detail, 'knowledge', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'knowledge'), { timeout: 60_000 }).toBe(true)
  const dump = await dumpConfig(env, PROFILE)
  const remaining = ['project', 'spec', 'task-loop', 'expert-squad'] as const
  for (const member of remaining) {
    expect(dump, `卸除 knowledge 后余件 skills 行原样 ${memberSkillId(member)}`).toContain(`- id: ${memberSkillId(member)}`)
  }
  await toggleRowSwitch(detail, 'knowledge', true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'knowledge'), { timeout: 60_000 }).toBe(false)
})

test('CT-BIF-B6 #O-B6-1：整包停用态下行级操作零半激活（停用面一致——五件全量停用、无任一件单独激活）', async () => {
  const h = await ensureHost()
  const detail = await openForgeDetail(h.page)
  // 整包停用
  await toggleRowSwitch(detail, 'forge', false)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(true)
  // 停用态下行级操作尝试 → 停用面一致（零半激活：任一件单独 disabled override 不得新增激活语义）
  const patch = readProfilePatch(env, PROFILE)
  for (const bare of SIX_ROW_IDS) {
    if (bare === 'forge') continue
    expect(overrideDisabled(patch, bare) ? 'disabled' : 'inherited', `整包停用态下 ${bare} 停用面一致（禁半激活）`).not.toBe('enabled-only')
  }
  // 整包恢复（基线回收）
  await toggleRowSwitch(detail, 'forge', true)
  await expect.poll(() => overrideDisabled(readProfilePatch(env, PROFILE), 'forge'), { timeout: 60_000 }).toBe(false)
})

test('CT-BIF-B7 #O-B7-1：版本双校验失败立即停（守卫反例注入——doctored manifest → 抛出 → 复原 → 绿）', async () => {
  // 断言可红性证明（套件代表性守卫——cheapGenerationGate 反例注入）：
  // doctored 副本目录伪装安装面 → 门抛出（红）；复原真实 node_modules → 门通过（绿）。
  const nm = nodeModulesOf(env, PROFILE)
  const fake = mkdtempSync(join(tmpdir(), 'dsh-forge-bundle-b7-'))
  mkdirSync(join(fake, '@dsh-forge'), { recursive: true })
  for (const pkg of [FORGE_PKG, ...BARE_BUNDLES]) {
    const src = join(nm, '@dsh-forge', pkg.slice('@dsh-forge/'.length))
    rmSync(join(fake, '@dsh-forge', pkg.slice('@dsh-forge/'.length)), { recursive: true, force: true })
    const { cpSync } = await import('node:fs')
    cpSync(src, join(fake, '@dsh-forge', pkg.slice('@dsh-forge/'.length)), { recursive: true })
  }
  const pkgFile = join(fake, '@dsh-forge', 'forge', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { version: string }
  pkg.version = '0.0.0-doctored'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(pkgFile, JSON.stringify(pkg), 'utf8')
  expect(() => cheapGenerationGate(fake), '反例注入：doctored manifest → 双校验门抛出（红）').toThrow()
  cheapGenerationGate(nm)
  rmSync(fake, { recursive: true, force: true })
})
