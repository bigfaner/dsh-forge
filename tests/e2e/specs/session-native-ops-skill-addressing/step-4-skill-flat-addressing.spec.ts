// @feature dsh-forge-m3 | @web-e2e | @journey session-native-ops-skill-addressing
// Traceability: docs/features/dsh-forge-m3/testing/session-native-ops-skill-
// addressing/contracts/step-4-skill-flat-addressing.md — one test per Outcome:
//   success            — boot 同步后 15 项扁平名技能全部解析(SKILL.md
//                        frontmatter.name === 扁平名,vendored 解析器字节);
//                        项目仓零新增文件。
//   deferred-skill-absent — 暂缓技能(deep-research)在 dsh 会话缺席不阻断
//                        (根内无该目录、15 项不受影响、动词面照常应答);
//                        外部会话可用性 = 外部核验通道,本 harness 不驱动
//                        (contract 验证通道注记)。
//   skill-dirs-sync-alert — 可管理漂移(受管条目重复)→ boot 同步重写恢复,
//                        用户自有条目字节保留;技能照常可寻址。
//                        // VERIFY: 不可管理形态的 ERR_SKILL_DIR_SYNC 设置面
//                        告警条目无 selector 事实,留待缝位(见覆盖报告)。
// fixture_spec: Project + SkillDirectory ×15 + PluginSkillRoot(customSkillDirs
// 受管条目)。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { MANDATORY_SKILLS, assertSkillsResolve, freshRoot, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildMainWorld } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('session-native-ops-skill-addressing / step 4: 技能集扁平名寻址', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('sess-s4'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 15 项扁平名全部解析;项目仓零新增。
  test('step4/success: the 15 mandatory skills resolve by flat name through the customSkillDirs root; the project repo gains ZERO files', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const repoBefore = snapshotTree((kernel as KernelWorld).codeRoot)
    const world = await manager.acquire(kernel as KernelWorld, 'main')

    // 可观察面(15/15 解析成功):boot 同步真实落笔 + frontmatter 寻址链。
    assertSkillsResolve(world.shell.profileDir)

    // 项目仓零新增文件(harness 级)。
    expect(snapshotTree((kernel as KernelWorld).codeRoot), '项目仓零新增文件(Invariant)').toEqual(repoBefore)
  })

  // Outcome "deferred-skill-absent" — 暂缓技能缺席不阻断。
  test('step4/deferred-skill-absent: a deferred skill (deep-research) is absent from the dsh root WITHOUT breaking anything — the 15 stay resolvable, the verb face keeps answering', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    const patch = readFileSync(join(world.shell.profileDir, 'cordis.patch.yml'), 'utf8')
    const skillRoot = /customSkillDirs:[\s\S]*?-\s*'([^']+)'/.exec(patch)?.[1] as string
    expect(existsSync(skillRoot), '技能根在场(15 项必迁集)').toBe(true)

    // 暂缓技能缺席:根内无该扁平名目录(dsh 会话侧 = 无「技能已迁」面)。
    const dirs = readdirSync(skillRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    expect(dirs.includes('deep-research'), '暂缓技能(deep-research)不在 dsh 技能根(暂缓迁移)').toBe(false)
    expect(dirs.sort(), '15 项必迁集不受影响').toEqual([...MANDATORY_SKILLS].sort())

    // 不阻断:无错误级失败 —— 动词面照常应答(应用健康)。
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(state.activeProjectId, '缺席不阻断(动词面照常应答)').toBe(world.projectId)
    expect(world.shell.pageErrors, '零 renderer 错误(无错误级失败)').toEqual([])
  })

  // Outcome "skill-dirs-sync-alert"(可管理漂移面)— boot 同步修复。
  test('step4/skill-dirs-sync-alert (manageable drift): a MISSING managed entry is RE-ADDED at boot; user-owned entries keep their bytes; the 15 stay resolvable', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    // 首启:建立 profile(patch 由 boot 写入)。
    const first = await manager.acquire(kernel as KernelWorld, 'main')
    const patchPath = join(first.shell.profileDir, 'cordis.patch.yml')
    const original = readFileSync(patchPath, 'utf8')
    const skillRoot = /customSkillDirs:[\s\S]*?-\s*'([^']+)'/.exec(original)?.[1] as string
    const userEntry = "- 'C:/user-own-skill-dir'"

    // 注入漂移:patch 是【顶层 YAML 数组】(provider 行 + 行内 config.
    // customSkillDirs 嵌套条目),非平铺映射 —— 用户自有条目须与受管条目
    // 同缩进成同级列表项。此处以用户行原位替换受管行(缺失漂移 + 用户条
    // 目一次注入;缩进取自受管行自身。生成稿曾用平铺键锚 + 固定缩进,结构
    // 损毁致 host「failed to parse overlay」→ 重启腿坠「连接已中断」)。
    const lines = original.split('\n')
    const entryIdx = lines.findIndex(line => line.trim().startsWith('-')
      && (line.includes(skillRoot) || line.includes(skillRoot.replaceAll('\\', '/'))))
    const entryIndent = lines[entryIdx]?.match(/^\s*/)?.[0] ?? ''
    const drifted = [...lines.slice(0, entryIdx), `${entryIndent}${userEntry}`, ...lines.slice(entryIdx + 1)].join('\n')
    // 杀前停在概览(session-restore 复现该视图;重启腿的激活块在概览找项
    // 目卡 —— 留在任务页则复现为任务页,卡片不可寻)。
    await first.page.locator('[data-dsh-forge-tab="workbench/overview"]').click()
    await manager.killLive()
    writeFileSync(patchPath, drifted, 'utf8')

    // 重启(同 rootDir/profile):boot 同步重写受管条目(可管理漂移恢复)。
    const second = await manager.acquire(kernel as KernelWorld, 'reboot', { tab: 'workbench/overview' })
    const repaired = readFileSync(patchPath, 'utf8')
    expect(repaired.includes(userEntry.trim()), '用户自有目录条目字节级保留').toBe(true)
    assertSkillsResolve(second.shell.profileDir)
    const entries = repaired.split('\n')
      .filter(line => line.trim().startsWith('-') && (line.includes(skillRoot) || line.includes(skillRoot.replaceAll('\\', '/'))))
    expect(entries.length, '受管条目重写为恰一条(缺失漂移被修复)').toBe(1)
  })
})
