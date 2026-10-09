// 3.4 冒烟（AC5）：boot 后 tool 面经 spawn 链路可达——spawn ELECTRON_RUN_AS_NODE=1 +
// stdio:['ipc'] 沿 P1 boot 链（fix-1 child 形态，官方 Desktop 同款）。单用例贯通四装配缝：
//   · AC5 tool 面（产品裁决 2026-10-09 反转）：默认组合（= 标准模式同栈）零 forge 工具
//     ——FORGE_TOOL_NAMES 全体缺席（plugin-forge 移出用户层/overlay 全局行，仅远征/突击
//     预设组合携带——预设会话装配面由 e2e m3 池承载）；inject forgeTasks/forgeProposals
//     解析 = tasksHome 注入链 + core 四域 provide 的联证（服务面不随 forge 面收窄变化）
//   · AC3 tasksHome：env DSH_FORGE_TASKS_HOME 生效 + deriveTaskStoreDir 单源（{tasksHome}/
//     {flatten}@{hash8}）+ listTasks 惰性开工作区库（forge.db 落 tasksHome）
//   · AC2 bindingsFile 生产端：withKnowledgeBindingsRefresh 包装 registerProject →
//     绑定表文件落 {wsPath,projectId}（plugin-forge/knowledge 同一消费形制）
//   · AC4 dispose 链：shutdown → 子侧 ProcessShutdown → cordis fiber disposer → core
//     disposer → store.dispose——工作区库 WAL 副产物（forge.db-wal）净场
// 环境前置（fail-loud，缺席即红——先 just compile / pnpm install）：
//   apps/host/dist/boot/child.js（tsc -b 产物——child 入口真实文件）；profile.dev 安装树
//   （含 @dsh-forge/plugin-forge link）；electron dist 二进制（devDep）。
// 隔离：独立 userData/tasksHome/DSH_HOME（临时目录）；独占端口（listen(0) 探测）——
// 不持应用单实例锁（无 Electron main），与 e2e 单实例纪律零冲突。
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { expect, it } from 'vitest'
import { FORGE_TOOL_NAMES } from '@dsh-forge/plugin-forge'
import type { DshHostHandle } from './run.js'
import { bootDshHost } from './run.js'
import { hostRoot, resolveHostPaths } from '../profile/paths.js'
import { withKnowledgeBindingsRefresh } from '../ipc/bindings.js'

/** 归一比较（盘符大小写/分隔符两态——绑定行 wsPath 为 core canonical 化产物） */
const norm = (p: string): string => realpathSync(p).replace(/\\/g, '/').toLowerCase()

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
  '3.4 冒烟：electron child boot → 标准组合零 forge 工具 + 四域服务在场 + 绑定表生产 + dispose 净场',
  async () => {
    // ── 前置门（fail-loud：装配缺口显形为红灯，不静默跳过）──
    const childEntry = join(hostRoot(), 'dist', 'boot', 'child.js')
    expect(existsSync(childEntry), `boot child 入口缺席（先 just compile）：${childEntry}`).toBe(true)
    const profileDev = join(hostRoot(), 'profile.dev')
    expect(
      existsSync(join(profileDev, 'node_modules', '@dsh-forge', 'plugin-forge', 'package.json')),
      'profile.dev 缺 @dsh-forge/plugin-forge 链接（先 pnpm -C apps/host/profile.dev install）',
    ).toBe(true)
    const electronExe = createRequire(join(hostRoot(), 'package.json'))('electron') as unknown as string
    expect(existsSync(electronExe), `electron 二进制缺席（dist 未下载）：${electronExe}`).toBe(true)

    // ── 隔离装配（env 口径与 main.ts 同款：resolveHostPaths → bootDshHost）──
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-smoke-34-'))
    const userData = join(root, 'user-data')
    const tasksHome = join(root, 'tasks-home') // AC3：env 显式覆盖面
    const wsDir = join(root, 'demo-ws')
    mkdirSync(wsDir, { recursive: true }) // 工作区目录（注册链承接 canonical 化）
    const paths = resolveHostPaths(
      { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData, DSH_FORGE_TASKS_HOME: tasksHome },
      userData,
    )
    expect(paths.tasksHome).toBe(tasksHome) // env > {userData}/forge-workspaces（AC3 优先级）
    expect(paths.skillsDir).toBeDefined() // skills 挂载目录解析（workspace 链接树）
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
          bindingsFile: paths.bindingsFile,
          tasksHome: paths.tasksHome,
          settingsFile: paths.settingsFile, // M3 3.8：设置域存储注入（core 行 config——forgeSettings 装配门）
          skillsDir: paths.skillsDir,
        },
        { execPath: electronExe, childEntry }, // vitest(node/src) 驱动：electron 二进制 + dist child 入口（spawn 链路同款：ELECTRON_RUN_AS_NODE=1 + stdio ipc）
      )

      // AC5（产品裁决 2026-10-09 反转）：默认组合（= 标准模式同栈）零 forge 工具——
      // plugin-forge 已移出用户层/overlay 全局行（仅远征/突击预设组合携带）。任一
      // forge 动词在场 = 全局行泄漏回归（标准模式不带 forge 工具/技能）。
      for (const name of FORGE_TOOL_NAMES) {
        expect(host.toolNames, `标准组合零 forge 面：${name} 不应注册（全局行泄漏回归——产品裁决 2026-10-09）`).not.toContain(name)
      }
      // M2 四域 + P1 双服务 + M3 设置域全在场（tasksHome/settingsFile 注入 → core provide 联证）
      for (const service of [
        'forgeProjects', 'forgeKnowledge', 'forgeTasks', 'forgeFeatures', 'forgeProposals', 'forgeDocs', 'forgeSettings',
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

      // AC2：绑定表生产端（注册增量刷新——main.ts withKnowledgeBindingsRefresh 同款包装）
      const projects = withKnowledgeBindingsRefresh(host.services.forgeProjects!, paths.bindingsFile)
      const registered = await projects.registerProject({
        workspaceDir: wsDir,
        name: 'demo-ws',
        forgeDir: join(wsDir, '.forge'),
        knowledgeDir: join(wsDir, '.knowledge'),
      })
      const bindings = JSON.parse(readFileSync(paths.bindingsFile, 'utf8')) as {
        version: number
        projects: readonly { wsPath: string; projectId: string }[]
      }
      expect(bindings.version).toBe(1)
      const row = bindings.projects.find((p) => p.projectId === registered.projectId)
      expect(row, '绑定表行缺席（生产端断裂——plugin-forge cwd 路由数据缝无源）').toBeDefined()
      expect(norm(row!.wsPath)).toBe(norm(wsDir))

      // AC3：derive 单源 + 惰性开库（listTasks 触达 → {tasksHome}/{flatten}@{hash8}/forge.db）
      const derived = await host.services.forgeProjects!.deriveTaskStoreDir({ workspaceDir: wsDir })
      expect(derived.dir.startsWith(tasksHome)).toBe(true)
      expect(await host.services.forgeTasks!.listTasks({ projectId: registered.projectId })).toEqual([])
      expect(existsSync(join(derived.dir, 'forge.db')), '工作区库未落派生目录（惰性开库链断裂）').toBe(true)

      // AC4 前置：句柄在场（WAL 副产物 = 连接存活的机械证据）
      const wal = `${join(derived.dir, 'forge.db')}-wal`
      expect(existsSync(wal), 'forge.db-wal 缺席（工作区句柄未开——dispose 断言失据）').toBe(true)

      // AC4：shutdown → fiber disposer → store.dispose → WAL 净场（中央库同判）
      await host.shutdown()
      await expect
        .poll(() => existsSync(wal), { timeout: 15_000, message: 'dispose 链未收口（工作区句柄仍开）' })
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
