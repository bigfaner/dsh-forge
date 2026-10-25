// 1.46 ② 收口冒烟（bug cf2fc46b——tools.restrict deny 落点）：真机 boot 可见性取证——
// 真实 electron child spawn 链（官方 Desktop 同款）+ dev profile overlay（cordis.patch.yml
// 全局 expert-squad 行 + child.ts:326 loadPresetPatches 每启注入含 HR 预设行 denyTools 守卫态）。
// 断言面：
//   · 主会话可见：delegate_expert ∈ host.toolNames（官方 ToolRuntime.schemas() 全局视图投影，
//     child.ts:1303-1305 toolNamesOf——全局单实例注册面活体）。
//   · HR deny 守卫清洁生效：diag 窗口零「restrict deny 失败 / restrict 缺席」warn
//     （denyTools 落 preset scope 官方 restrict 正门；源码级核销 + 官方机械实跑 =
//     forge 任务日志 expert-squad/1.46/004-restrict-pin/pin-report.md + probe3）。
// 环境前置（fail-loud，同 boot-spawn-smoke 形制）：dist/boot/child.js（tsc -b 产物）、
// profile.dev @dsh-forge/expert-squad 链接、electron 二进制。
// 隔离：独立 userData/tasksHome/DSH_HOME（临时目录）；独占端口——不持应用单实例锁。
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { expect, it } from 'vitest'
import type { DshHostHandle } from './run.js'
import { bootDshHost } from './run.js'
import { hostRoot, resolveHostPaths } from '../profile/paths.js'

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

it(
  '1.46 ② 真机 boot：主会话 delegate_expert 可见（全局注册）+ HR deny 守卫清洁（diag 零 restrict 失败）',
  async () => {
    // ── 前置门（fail-loud）──
    const childEntry = join(hostRoot(), 'dist', 'boot', 'child.js')
    expect(existsSync(childEntry), `boot child 入口缺席（先 just compile）：${childEntry}`).toBe(true)
    const profileDev = join(hostRoot(), 'profile.dev')
    expect(
      existsSync(join(profileDev, 'node_modules', '@dsh-forge', 'expert-squad', 'package.json')),
      'profile.dev 缺 @dsh-forge/expert-squad 链接（先 pnpm -C apps/host/profile.dev install）',
    ).toBe(true)
    const electronExe = createRequire(join(hostRoot(), 'package.json'))('electron') as unknown as string
    expect(existsSync(electronExe), `electron 二进制缺席（dist 未下载）：${electronExe}`).toBe(true)

    // ── 隔离装配（env 口径与 boot-spawn-smoke 同款）──
    const tmpBase = process.env.HOST_TEST_TMP_ROOT ?? tmpdir()
    if (process.env.HOST_TEST_TMP_ROOT) mkdirSync(tmpBase, { recursive: true })
    const root = mkdtempSync(join(tmpBase, 'dsh-forge-xsq-visibility-'))
    const userData = join(root, 'user-data')
    const paths = resolveHostPaths(
      { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
      userData,
    )
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = paths.dshHome

    let host: DshHostHandle | undefined
    const diagLines: string[] = []
    try {
      host = await bootDshHost(
        {
          profileDir: paths.profileDir,
          installAnchor: paths.installAnchor,
          port: await freePort(),
          stateDb: paths.stateDb,
          bindingsFile: paths.bindingsFile,
          tasksHome: paths.tasksHome,
          settingsFile: paths.settingsFile,
          skillsDir: paths.skillsDir,
        },
        { execPath: electronExe, childEntry },
      )
      host.onDiag((line) => diagLines.push(line))

      // 主会话可见：全局单实例注册面（dev profile cordis.patch.yml expert-squad 行）
      expect(
        host.toolNames,
        `delegate_expert 缺席全局工具面（全局行未装载/注册链断裂）：${JSON.stringify(host.toolNames)}`,
      ).toContain('delegate_expert')

      // HR deny 守卫清洁生效：窗口采样后零失败 warn（抛错形态 = deny 落点错/全局行缺席）
      await new Promise((resolve) => setTimeout(resolve, 8_000))
      const guardFailures = diagLines.filter((line) =>
        line.includes('[expert-squad]') && (line.includes('restrict deny 失败') || line.includes('restrict 缺席')),
      )
      expect(guardFailures, `HR denyTools 守卫异常行在场：${JSON.stringify(guardFailures)}`).toEqual([])
    } finally {
      if (host !== undefined) await host.shutdown()
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
      // 清理有界重试（Windows 句柄异步释放竞态——boot-spawn-smoke 同族 tmp；尽力而为不遮断言）
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          rmSync(root, { recursive: true, force: true })
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1_000))
        }
      }
    }
  },
  180_000,
)
