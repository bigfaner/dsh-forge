// e2e 旅程 spec：安装互斥 loud-fail（INV-3——bug ef3e92ea，forge-aggregate-bundle 1.32）。
// journey = bundle-install-fullchain journey.md 边界分支 B1 双向 + INV-3 不变式真机取证：
//   Path A：bundle 已装 → solo 成员 add（exit 0）→ 重启宿主 = 激活期 loud-fail；
//   Path B：solo 成员已装 → bundle add → 重启宿主 = 同判 loud-fail。
// 被测物 = plugin-manager 正式安装的 bundle 变体（AGENTS §1.8——npm 通道闭包物化源，
// FORGE_COMBO_NPM_SOURCE_DIR；junction/dist 直载与 dev 宿主不作证据）。缺省整组 skip。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  comboEnv,
  comboGateOn,
  dumpConfig,
  ensureInstalledShared,
  invalidateInstalledShared,
  launchWebHost,
  memberSource,
  packTarball,
  pluginAdd,
  preflightCommitCharge,
  purgeBaseline,
  readForgeDiagEvents,
  requireBundleSource,
  sharedHostBootForensics,
  stopHostShared,
  type WebHost,
} from '../bundle/support.js'

test.skip(!comboGateOn(), 'FORGE_COMBO_E2E=1 真机收口轮专用套件（e2e/SMOKE-LEDGER.md 留痕）——常规跑批跳过')

const PROFILE = 'web'
const env = comboEnv()

/** 组合实况诊断切片（越装态 dump-config + profile bundles 名单——断言报文携带） */
async function compositionEvidence(): Promise<string> {
  let dump = ''
  try {
    dump = await dumpConfig(env, PROFILE)
  } catch (e) {
    dump = `dump-config 失败：${String(e).slice(-200)}`
  }
  let bundles = ''
  try {
    const manifest = readFileSync(join(env.dshHome, 'profiles', PROFILE, 'package.json'), 'utf8')
    bundles = manifest.match(/"bundles":\s*\[[^\]]*\]/)?.[0] ?? 'bundles 键缺席'
  } catch {
    bundles = 'profile manifest 读失败'
  }
  const forgeRows = dump.match(/- id: (?:forge-bundle|project|spec|task-loop|expert-squad|knowledge)\b/g)?.join(',') ?? '零 forge 插行'
  const comboMark = dump.includes('comboMark') ? 'comboMark 在场' : 'comboMark 缺席'
  return `bundles=${bundles}；forgeRows=${forgeRows}；${comboMark}`
}

/** 越装宿主拉起取证（loud-fail 判据：forge-bundle-conflict diag 事件 或 boot 取证 INV-3 字样） */
async function expectCrossInstallLoudFail(port: number, label: string): Promise<void> {
  let boot: WebHost | undefined
  let bootErr: unknown
  try {
    boot = await launchWebHost(env, port)
  } catch (e) {
    bootErr = e
  }
  try {
    const diag = readForgeDiagEvents(env.dshHome)
    let stdoutEvidence = ''
    if (boot !== undefined) {
      stdoutEvidence = boot.stdout
      // 宿主激活失败面（entries did not activate）落 stderr——共享取证全文切片
      stdoutEvidence += '\n' + sharedHostBootForensics(env)
    } else if (bootErr instanceof Error) {
      const pointer = bootErr.message.match(/取证指针=(\S+)/)?.[1]
      if (pointer !== undefined) stdoutEvidence = readFileSync(pointer, 'utf8')
    }
    expect(
      diag.includes('forge-bundle-conflict') || stdoutEvidence.includes('INV-3'),
      `${label}越装 loud-fail 取证（diag=${JSON.stringify(diag.slice(-6))}）boot 取证切片=${stdoutEvidence.slice(-400)}；组合实况=${await compositionEvidence()}`,
    ).toBe(true)
  } finally {
    if (boot !== undefined) await boot.close()
    await stopHostShared(env)
  }
}

test.afterAll(async () => {
  await stopHostShared(env)
  await purgeBaseline(env, PROFILE)
  invalidateInstalledShared(env)
})

test('INV-3 Path A：bundle 已装 → solo 成员 add exit 0 → 宿主激活期 loud-fail（非静默共存）', async () => {
  preflightCommitCharge()
  await ensureInstalledShared(env, PROFILE)
  await stopHostShared(env)
  // solo 成员安装（bug 本体面：add exit 0——loud-fail 落在激活期，非安装命令）
  const add = await pluginAdd(env, packTarball(memberSource(env, 'project')), PROFILE)
  expect(add.code, `solo 成员 add（exit=${String(add.code)}）stderr=${add.stderr.slice(-400)}`).toBe(0)
  await expectCrossInstallLoudFail(19_761, 'Path A（bundle→solo）')
})

test('INV-3 Path B：solo 成员已装 → bundle add → 宿主激活期同判 loud-fail', async () => {
  preflightCommitCharge()
  await purgeBaseline(env, PROFILE)
  const soloAdd = await pluginAdd(env, packTarball(memberSource(env, 'project')), PROFILE)
  expect(soloAdd.code, `solo 成员 add（exit=${String(soloAdd.code)}）stderr=${soloAdd.stderr.slice(-400)}`).toBe(0)
  const bundleAdd = await pluginAdd(env, requireBundleSource(env), PROFILE)
  expect(bundleAdd.code, `bundle add（exit=${String(bundleAdd.code)}）stderr=${bundleAdd.stderr.slice(-400)}`).toBe(0)
  await expectCrossInstallLoudFail(19_762, 'Path B（solo→bundle）')
})
