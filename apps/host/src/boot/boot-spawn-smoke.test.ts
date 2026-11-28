// 3.4 冒烟（AC5）：boot 后 tool 面经 spawn 链路可达——spawn ELECTRON_RUN_AS_NODE=1 +
// stdio:['ipc'] 沿 P1 boot 链（fix-1 child 形态，官方 Desktop 同款）。单用例贯通四装配缝：
//   · AC5 tool 面：默认组合零 forge 闭环工具（旧包 plugin-forge 已随 M1 阶段B 退役——
//     工具面只装现役包；inject forgeTasks 解析 = tasksHome 注入链 + core 四域 provide 的
//     联证（服务面不随装配收窄变化）
//   · AC3 tasksHome：env DSH_FORGE_TASKS_HOME 生效 + deriveTaskStoreDir 单源（{tasksHome}/
//     {flatten}@{hash8}）+ listTasks 惰性开工作区库（forge.db 落 tasksHome）
//   · AC4 dispose 链：shutdown → 子侧 ProcessShutdown → cordis fiber disposer → core
//     disposer → store.dispose——工作区库 WAL 副产物（forge.db-wal）净场
// 环境前置（fail-loud，缺席即红——先 just compile / pnpm install）：
//   apps/host/dist/boot/child.js（tsc -b 产物——child 入口真实文件）；profile.dev 安装树；
//   electron dist 二进制（devDep）。
// 隔离：独立 userData/tasksHome/DSH_HOME（临时目录）；独占端口（listen(0) 探测）——
// 不持应用单实例锁（无 Electron main），与 e2e 单实例纪律零冲突。
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { expect, it } from 'vitest'
import type { DshHostHandle } from './run.js'
import { bootDshHost } from './run.js'
import { hostRoot, resolveHostPaths } from '../profile/paths.js'

/** DSH 派生会话（DSH_SHELL=1）下 Electron 子进程写临时目录及其清理均 EPERM（沙箱环境边界）——真机 boot 冒烟仅在独立终端执行 */
const inDshShell = process.env.DSH_SHELL === '1'

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

it.skipIf(inDshShell)(
  '3.4 冒烟：electron child boot → 标准组合零 forge 工具 + 四域服务在场 + dispose 净场',
  async () => {
    // ── 前置门（fail-loud：装配缺口显形为红灯，不静默跳过）──
    const childEntry = join(hostRoot(), 'dist', 'boot', 'child.js')
    expect(existsSync(childEntry), `boot child 入口缺席（先 just compile）：${childEntry}`).toBe(true)
    const electronExe = createRequire(join(hostRoot(), 'package.json'))('electron') as unknown as string
    expect(existsSync(electronExe), `electron 二进制缺席（dist 未下载）：${electronExe}`).toBe(true)

    // ── 隔离装配（env 口径与 main.ts 同款：resolveHostPaths → bootDshHost）──
    // Root cause（fix-5）：宿主派生会话下 Electron 子进程写 %TEMP% EPERM（环境边界）——
    // mkdtemp 基目录可经 HOST_TEST_TMP_ROOT 覆写（E2E_USER_DATA_ROOT 先例 d11818ae）；
    // 缺省 tmpdir() 不变——真实终端零变化。
    const tmpBase = process.env.HOST_TEST_TMP_ROOT ?? tmpdir()
    if (process.env.HOST_TEST_TMP_ROOT) mkdirSync(tmpBase, { recursive: true })
    const root = mkdtempSync(join(tmpBase, 'dsh-forge-smoke-34-'))
    const userData = join(root, 'user-data')
    const tasksHome = join(root, 'tasks-home') // AC3：env 显式覆盖面
    const wsDir = join(root, 'demo-ws')
    mkdirSync(wsDir, { recursive: true }) // 工作区目录（注册链承接 canonical 化）
    const paths = resolveHostPaths(
      { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData, DSH_FORGE_TASKS_HOME: tasksHome },
      userData,
    )
    expect(paths.tasksHome).toBe(tasksHome) // env > {userData}/forge-workspaces（AC3 优先级）
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = paths.dshHome // 数据隔离（child 经 spawn env 继承——main.ts 同径）

    let host: DshHostHandle | undefined
    try {
      host = await bootDshHost(
        {
          profileDir: paths.profileDir,
          installAnchor: paths.installAnchor,
          port: await freePort(),
          stateDb: paths.stateDb,
          tasksHome: paths.tasksHome,
          settingsFile: paths.settingsFile, // M3 3.8：设置域存储注入（core 行 config——forgeSettings 装配门）
        },
        { execPath: electronExe, childEntry }, // vitest(node/src) 驱动：electron 二进制 + dist child 入口（spawn 链路同款：ELECTRON_RUN_AS_NODE=1 + stdio ipc）
      )

      // AC5：默认组合零 forge 闭环工具（旧包 plugin-forge 已退役——工具面只装现役包）。
      // 任一旧 forge 闭环动词在场 = 装配回归（标准组合不带闭环工具/技能）。
      for (const name of ['addTask', 'claimTask', 'dispatchTask', 'submitTask', 'createProposal'] as const) {
        expect(host.toolNames, `默认组合零 forge 闭环面：${name} 不应注册`).not.toContain(name)
      }
      // M2 四域 + P1 双服务 + M3 设置域全在场（tasksHome/settingsFile 注入 → core provide 联证；
      // forgeProposals 随 plugin-spec/1.11 提案域下线零注册——不在场清单）
      for (const service of [
        'forgeProjects', 'knowledge', 'forgeTasks', 'forgeFeatures', 'forgeDocs', 'forgeSettings',
      ] as const) {
        expect(host.services[service], `${service} 服务缺席（装配链断裂）`).toBeDefined()
      }

      // M3 3.8 AC6：settingsFile 注入往返——forgeSettings get/set 经桥可达（未配置 = {} →
      // set 落盘 {userData}/forge-settings.json → get 实时读回——图 11 设置单门读写同源）
      expect(await host.services.forgeSettings!.get()).toEqual({}) // 未配置态（worker 键缺席）
      const worker = { provider: 'deepseek', model: 'demo-model', reasoning: 'high' as const }
      await host.services.forgeSettings!.set({ worker })
      expect(await host.services.forgeSettings!.get()).toEqual({ worker })
      const persisted = JSON.parse(readFileSync(paths.settingsFile, 'utf8')) as { worker?: { model?: string } }
      expect(persisted.worker?.model).toBe('demo-model') // 子进程 core 单写者落注入路径（boot overlay 注行联证）

      // AC3（1.14 改指新数据面）：derive 单源（projects 域，core 缝不变）+ task-loop 域
      // 装配自持库落 {DSH_HOME}/forge/db/task-loop/task-loop.db（fix-1 缺省装配三件单源；
      // listTasks 触达 → task-loop.db 读面可达，旧 per-workspace forge.db tasks 写链退役）
      const derived = await host.services.forgeProjects!.deriveTaskStoreDir({ workspaceDir: wsDir })
      expect(derived.dir.startsWith(tasksHome)).toBe(true)
      const taskLoopDb = join(paths.dshHome, 'forge', 'db', 'task-loop', 'task-loop.db')
      expect(existsSync(taskLoopDb), 'task-loop.db 未落缺省装配路径（@dsh-forge/task-loop 插件行未装载/装配链断裂）').toBe(true)
      expect(await host.services.forgeTasks!.listTasks({ projectKey: 'Z-project-dsh-dsh-forge' })).toEqual([])

      // AC4 前置：句柄在场（WAL 副产物 = 连接存活的机械证据）
      const wal = `${taskLoopDb}-wal`
      expect(existsSync(wal), 'task-loop.db-wal 缺席（域库句柄未开——dispose 断言失据）').toBe(true)

      // AC4：shutdown → fiber disposer → task-loop db dispose → WAL 净场（中央库同判）
      await host.shutdown()
      await expect
        .poll(() => existsSync(wal), { timeout: 15_000, message: 'dispose 链未收口（task-loop 域库句柄仍开）' })
        .toBe(false)
      await expect
        .poll(() => existsSync(`${paths.stateDb}-wal`), { timeout: 15_000, message: '中央库句柄未关' })
        .toBe(false)
    } finally {
      if (host !== undefined) await host.shutdown() // 幂等（killed 短路）
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
      rmSync(root, { recursive: true, force: true })
    }
  },
  180_000,
)
