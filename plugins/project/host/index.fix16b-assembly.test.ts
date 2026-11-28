// fix-16b RED 锚（bug 33aec906——1.40 e2e 实证残余，w141-probe + project.db/state.db 双库直查）：
//   宿主集成装配态（core forgeProjects 具名服务在场——单 SQLite 句柄真源）下，host 半
//   projects/worktrees 常驻 provider 须消费真实 core 服务（真实服务非兜底）：
//   ① projects 缝 registerProject 委托 core 服务（registration 落 core 行集——非自建空库）；
//   ② worktrees 缝 list 对真 git 仓（core 行集登记）返回 isGit:true + 主树 entry——
//     非恒兜底签名 {isGit:false,entries:[]}。
// 修复前形态（bug 在场）：main 半自开 {DSH_HOME}/forge/db/project/project.db（运营真源
//   在 core 库——两库分裂），identity resolveProject 读空库恒 null → list 恒兜底签名。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { OfficialRegistryFace } from './projects/registry-adapter.js'
import type { SeamCtxFace } from './assembly/seams.js'
import { injectProjectSeam, PROJECT_SEAM_KEYS, stubProjectsService } from './assembly/seams.js'
import type { Project, ProjectSummary } from '@dsh-forge/lib-api/dto/project'
import projectPlugin from './index.js'

/** fake registry（同形 OfficialRegistryFace——Map 承载，fix8 同款） */
function fakeRegistry(): OfficialRegistryFace {
  const registry = new Map<string, { id: string; path: string; title: string }>()
  let seq = 0
  return {
    list: async () => [...registry.values()],
    get: async (id: string) => registry.get(id),
    create: async (path: string, title?: string) => {
      const found = [...registry.values()].find((w) => w.path === path)
      if (found !== undefined) return found
      const w = { id: `ws-${++seq}`, path, title: title ?? path }
      registry.set(w.id, w)
      return w
    },
    delete: async (id: string) => {
      registry.delete(id)
    },
    resolveByPath: async (path: string) => [...registry.values()].find((w) => w.path === path),
  }
}

/** core forgeProjects 服务桩（宿主集成态真源——内存行集 + register 委托计数） */
function coreProjectsStub(): {
  face: {
    listProjects(): Promise<ProjectSummary[]>
    getProject(id: string): Promise<Project | null>
    registerProject(input: { workspaceDir: string; name: string; forgeDir?: string }): Promise<{ projectId: string; workspaceId: string; attachedToExisting: boolean }>
  }
  registerCalls: number
} {
  const rows: ProjectSummary[] = []
  const state = {
    registerCalls: 0,
    face: {
      listProjects: async (): Promise<ProjectSummary[]> => [...rows],
      getProject: async (id: string): Promise<Project | null> =>
        rows.find((r) => r.id === id) !== undefined
          ? ({ ...rows.find((r) => r.id === id), worktreeDir: undefined } as Project)
          : null,
      registerProject: async (input: { workspaceDir: string; name: string }): Promise<{ projectId: string; workspaceId: string; attachedToExisting: boolean }> => {
        state.registerCalls += 1
        const row = {
          id: `core-p-${state.registerCalls}`,
          workspaceId: `core-ws-${state.registerCalls}`,
          wsPath: input.workspaceDir,
          name: input.name,
          archived: false,
          forgeDir: input.forgeDir ?? '',
        } as ProjectSummary
        rows.push(row)
        return { projectId: row.id, workspaceId: row.workspaceId, attachedToExisting: false }
      },
    },
  }
  return state
}

/** 集成态 ctx：core forgeProjects 经 reflect.get 可读（具名服务防御取法缝——in-file
 *  readGitWorktreeCapability 同配方）；workspaceRegistry 走 inject 声明属性访问；
 *  顶层 provide 面在场（gitWorktree 能力服务 provide 缝——worktrees/index.ts 消费）。 */
function integratedCtx(services: { forgeProjects?: unknown; workspaceRegistry?: OfficialRegistryFace }): SeamCtxFace & Record<string, unknown> {
  const provided = new Map<string, unknown>()
  const provide = (name: string, value?: unknown): unknown => {
    provided.set(name, value)
    return value
  }
  const ctx: SeamCtxFace & Record<string, unknown> = {
    workspaceRegistry: services.workspaceRegistry,
    provide,
    reflect: {
      provide,
      get: (name: string) => (name === 'forgeProjects' ? services.forgeProjects : provided.get(name)),
    },
  }
  return ctx
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 真机 git 仓 fixture：init.defaultBranch=main + 首提交（fix8 同款） */
function realGitRepo(parent: string, name: string): string {
  const root = join(parent, name)
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', root], { stdio: 'ignore' })
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test'], { stdio: 'ignore' })
  execFileSync('git', ['-C', root, 'config', 'user.name', 'test'], { stdio: 'ignore' })
  const marker = join(root, 'README.md')
  writeFileSync(marker, 'fixture\n', 'utf8')
  execFileSync('git', ['-C', root, 'add', '.'], { stdio: 'ignore' })
  execFileSync('git', ['-C', root, 'commit', '-m', 'init'], { stdio: 'ignore' })
  return root
}

describe('fix-16b 集成装配态：host 半常驻 provider 消费 core forgeProjects 真实服务（非兜底）', () => {
  const home = mkdtempSync(join(tmpdir(), 'fix16b-'))
  const repo = realGitRepo(home, 'repo')
  const core = coreProjectsStub()
  const previousDshHome = process.env.DSH_HOME

  afterAll(() => {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // db/git 文件句柄 Windows 锁文件——临时目录留盘不判失败
    }
  })

  it('projects 缝 registerProject 委托 core 服务（registration 落 core 行集——非自建空库）', async () => {
    process.env.DSH_HOME = home // 自建库落 {home}/forge/db/project——运营真源在 core 桩行集
    const ctx = integratedCtx({ forgeProjects: core.face, workspaceRegistry: fakeRegistry() })
    const dispose = projectPlugin(ctx, {})
    try {
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () => stubProjectsService())
      const result = await projects.registerProject({ workspaceDir: repo, name: 'repo', forgeDir: join(repo, '.forge', 'docs') })
      expect(core.registerCalls, 'register 委托 core 服务（真实服务非兜底）').toBe(1)
      expect(result.projectId).toBe('core-p-1')
      const list = await projects.listProjects()
      expect(list.map((r) => r.wsPath), 'projects list 投影 core 行集（非空）').toContain(repo)
    } finally {
      dispose()
    }
  })

  it('真 git 仓（core 行集登记）forge.worktrees list 非 empty（isGit:true）——非恒兜底签名', { timeout: 30_000 }, async () => {
    process.env.DSH_HOME = home
    const ctx = integratedCtx({ forgeProjects: core.face, workspaceRegistry: fakeRegistry() })
    const dispose = projectPlugin(ctx, {})
    try {
      const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, () => {
        throw new Error('forge.worktrees seam missing')
      })
      let last: unknown
      const norm = (p: string): string => p.replaceAll('\\', '/')
      for (let i = 0; i < 50; i++) {
        const r = await worktrees.list({ projectRoot: repo })
        if (r.isGit && r.entries.length > 0) {
          expect(r.entries.map((e) => norm(e.path))).toContain(norm(repo))
          return
        }
        last = r
        await sleep(200)
      }
      throw new Error(`forge.worktrees 10s 内未解析出真 git 清单（恒兜底签名铁证）：${JSON.stringify(last)}`)
    } finally {
      dispose()
    }
  })
})
