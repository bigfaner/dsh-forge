// worktree-branch-management fix-4 真机 e2e：真实 boot 链（electron child spawn + 官方
// loader 装载 git-worktree 插件行）下 forge:worktree/list 返回 isGit:true + 全量 entries。
// Root cause（探针 001-repro/probe-runprofile-scope.mjs 实证）：overlay 的 git-worktree
// 新 id 裸行被 loader 补丁按 unknown target 静默跳过——插件从未装载；insert 形态注行后
// 能力服务经官方 provide 面可达，宿主具名消费 ctx.gitWorktree 成立。
// 环境前置（fail-loud，缺席即红）：apps/host/dist/boot/child.js（tsc -b 产物）、
// profile.dev 安装树（含 @dsh-forge/git-worktree link）、electron dist 二进制、真机 git。
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { DshHostHandle } from './run.js'
import { bootDshHost } from './run.js'
import { hostRoot, resolveHostPaths } from '../profile/paths.js'
import { WORKTREE_CHANNELS } from '@dsh-forge/contracts'

async function freePort(): Promise<number> {
  const { createServer } = await import('node:net')
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
  'fix-4 e2e：真实宿主 git 项目 forge:worktree/list isGit:true + 主仓 entry（插件行 insert 注入 + 官方面 provide + 具名消费）',
  async () => {
    // ── 前置门（fail-loud）──
    const childEntry = join(hostRoot(), 'dist', 'boot', 'child.js')
    expect(existsSync(childEntry), `boot child 入口缺席（先 just compile）：${childEntry}`).toBe(true)
    const profileDev = join(hostRoot(), 'profile.dev')
    expect(
      existsSync(join(profileDev, 'node_modules', '@dsh-forge', 'git-worktree', 'package.json')),
      'profile.dev 缺 @dsh-forge/git-worktree 链接（先 pnpm -C apps/host/profile.dev install）',
    ).toBe(true)
    const electronExe = createRequire(join(hostRoot(), 'package.json'))('electron') as unknown as string
    expect(existsSync(electronExe), `electron 二进制缺席（dist 未下载）：${electronExe}`).toBe(true)

    // ── 隔离装配 + git 仓库夹具（真实 git CLI）──
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fix4-e2e-'))
    const userData = join(root, 'user-data')
    const wsDir = join(root, 'demo-repo')
    mkdirSync(wsDir, { recursive: true })
    const git = (args: string[], cwd: string): void => {
      execFileSync('git', ['-c', 'user.email=fix4@test', '-c', 'user.name=fix4', ...args], { cwd, stdio: 'pipe' })
    }
    git(['init', '-b', 'main'], wsDir)
    writeFileSync(join(wsDir, 'README.md'), 'fix-4 fixture\n')
    git(['add', '.'], wsDir)
    git(['commit', '-m', 'init'], wsDir)

    const paths = resolveHostPaths(
      { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
      userData,
    )
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = paths.dshHome

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
          settingsFile: paths.settingsFile,
          skillsDir: paths.skillsDir,
        },
        { execPath: electronExe, childEntry },
      )
      expect(host.services.forgeWorktree, 'forgeWorktree RPC 服务缺席（child 装配段断裂）').toBeDefined()
      expect(host.services.forgeProjects, 'forgeProjects 服务缺席').toBeDefined()
      const diagLines: string[] = []
      host.onDiag((line) => diagLines.push(line))

      // 注册 git 仓库为主项目（身份归并层解析锚——list 能力位由 resolveProject 产出）
      const registered = await host.services.forgeProjects!.registerProject({
        workspaceDir: wsDir,
        name: 'demo-repo',
        forgeDir: join(wsDir, '.forge'),
        knowledgeDir: join(wsDir, '.knowledge'),
      })
      expect(registered.projectId).toBeTruthy()

      // AC2 主断言：list 返回 isGit:true + 全量 worktree entries（主仓行）
      const list = (await host.services.forgeWorktree!.list({ projectRoot: wsDir })) as {
        isGit: boolean
        entries: readonly { path: string; isMain: boolean }[]
      }
      expect(list.isGit, '能力位 false——插件能力服务未解析（回归即本任务根因复现）').toBe(true)
      expect(list.entries.length, 'worktree entries 为空').toBeGreaterThan(0)
      expect(
        list.entries.some((e) => e.isMain),
        '主仓 worktree 行缺席',
      ).toBe(true)
      // 通道键登记联证（contracts 单源）
      expect(WORKTREE_CHANNELS.list).toBe('forge:worktree/list')

      // AC3 联证：具名消费解析留痕经 diag 桥回流（harness.log 同源通道）
      await expect
        .poll(async () => diagLines.some((l) => l.includes('[git-worktree]') && l.includes('能力服务已解析')), {
          timeout: 15_000,
        })
        .toBe(true)
    } finally {
      if (host !== undefined) await host.shutdown()
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
      rmSync(root, { recursive: true, force: true })
    }
  },
  180_000,
)
