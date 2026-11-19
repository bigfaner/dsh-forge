// fix-8 单装装配补全 RED 锚（009-blocked 实证残余，真机走查 1.21/009）：
//   ① registry 取法——cordis inject 门：ctx.workspaceRegistry 属性访问仅当 inject 声明
//     后才可达（inject=[] 被 cordis inject 门守卫拒恒 undefined——009 探针实证服务真身在场
//     而 face 属性读取为空）。本测试以「门守卫代理 ctx」复现该形态：未声明 inject 的服务名
//     属性访问恒 undefined，register 全链（projects 行 + workspaces main 关系行落库、
//     projectKey 产生）只有具名服务注入修正后才绿。
//   ② worktrees 常驻工厂——单装装配缺位：forge.worktrees 恒独立兜底（真机实测真 git 仓
//     list={isGit:false,entries:[]} 即铁证）。真 git 仓下 list 非 empty（isGit=true）、
//     create/delete 动词可用（WorktreeServicePort 契约补列）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDomainDb } from './db/connection.js'
import { injectProjectSeam, PROJECT_SEAM_KEYS, stubProjectsService, type SeamCtxFace } from './assembly/seams.js'
import type { OfficialRegistryFace } from './projects/registry-adapter.js'
import projectPlugin from './index.js'

/** fake registry（同形 OfficialRegistryFace——Map 承载） */
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

/** cordis inject 门守卫代理 ctx：插件 inject 声明之外的具名服务属性访问恒 undefined
 * （复现 009 实证形态——服务真身在场但 inject=[] 门拒）；reflect 面直通（五缝注册/消费）。 */
function gateCtx(
  services: Record<string, unknown>,
): SeamCtxFace & Record<string, unknown> {
  const provided = new Map<string, unknown>()
  const target: Record<string, unknown> = { ...services, reflect: undefined }
  const ctx: SeamCtxFace & Record<string, unknown> = new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === 'provide') {
        return (name: string, value?: unknown) => {
          provided.set(name, value)
        }
      }
      if (prop === 'reflect') {
        return {
          provide: (name: string, value?: unknown) => {
            provided.set(name, value)
          },
          get: (name: string) => provided.get(name),
        }
      }
      // inject 门：仅插件 inject 声明过的服务名放行（cordis get handler 同判据）
      if (typeof prop === 'string' && !(projectPlugin.inject as readonly string[]).includes(prop)) {
        return undefined
      }
      return Reflect.get(t, prop, receiver)
    },
  })
  return ctx
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 真机 git 仓 fixture：init.defaultBranch=main + 首提交（unborn HEAD 无 branch 行不可用） */
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

describe('fix-8 ① registry 具名服务注入（cordis inject 门下 register 全链）', () => {
  const home = mkdtempSync(join(tmpdir(), 'fix8-registry-'))

  afterAll(() => {
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // db 句柄 Windows 锁文件——临时目录留盘不判失败
    }
  })

  it('inject 声明含 workspaceRegistry（具名服务取法前置）', () => {
    expect(projectPlugin.inject).toContain('workspaceRegistry')
  })

  it('inject 门 ctx 下 registerProject 全链成功（projects 行 + main 关系行落库、projectKey 产生）', async () => {
    process.env.DSH_HOME = home
    const ctx = gateCtx({ workspaceRegistry: fakeRegistry() })
    const dispose = projectPlugin(ctx, {})
    try {
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () => stubProjectsService())
      const result = await projects.registerProject({
        workspaceDir: 'Z:\\tmp\\fix8-ws',
        name: 'fix8-ws',
        forgeDir: 'Z:\\tmp\\fix8-ws\\.forge\\docs',
      })
      expect(result.attachedToExisting).toBe(false)
      const dbFile = join(home, 'forge', 'db', 'project', 'project.db')
      expect(existsSync(dbFile)).toBe(true)
      const db = openDomainDb(home, { prefix: 'project', file: dbFile })
      const row = db.repos.projects.get(result.projectId)
      expect(row?.title).toBe('fix8-ws')
      expect(row?.projectKey).toBeTruthy()
      expect(db.repos.workspaces.getMain(result.projectId)?.wsPath).toBeTruthy()
      db.db.close()
    } finally {
      dispose()
    }
  })
})

describe('fix-8 ② worktrees 常驻工厂进独立装配 + Port 补 create/delete', () => {
  const gitHome = mkdtempSync(join(tmpdir(), 'fix8-wt-'))
  const repo = realGitRepo(gitHome, 'repo')
  const previousDshHome = process.env.DSH_HOME

  /** 归属解析链消费 projects 关系行——repo 须先注册（identity 同锚命中才 isGit:true） */
  async function setupRegistered(): Promise<{ ctx: ReturnType<typeof gateCtx>; dispose: () => void }> {
    process.env.DSH_HOME = gitHome
    const ctx = gateCtx({ workspaceRegistry: fakeRegistry() })
    const dispose = projectPlugin(ctx, {})
    const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () => stubProjectsService())
    await projects.registerProject({ workspaceDir: repo, name: 'repo', forgeDir: join(repo, '.forge', 'docs') })
    return { ctx, dispose }
  }

  afterAll(() => {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    try {
      rmSync(gitHome, { recursive: true, force: true })
    } catch {
      // git 文件句柄 Windows 锁文件——临时目录留盘不判失败
    }
  })

  it('真 git 仓下 forge.worktrees list 非 empty（isGit=true）——非恒兜底', { timeout: 30_000 }, async () => {
    const { ctx, dispose } = await setupRegistered()
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
      throw new Error(`forge.worktrees 10s 内未解析出真 git 清单（恒兜底铁证）：${JSON.stringify(last)}`)
    } finally {
      dispose()
    }
  })

  it('WorktreeServicePort 补 create/delete 动词：真 git 仓创建 → 清单在册 → 删除', { timeout: 30_000 }, async () => {
    const { ctx, dispose } = await setupRegistered()
    try {
      const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, () => {
        throw new Error('forge.worktrees seam missing')
      })
      // 能力解析等待（gitWorktree 探测异步 provide）
      for (let i = 0; i < 50; i++) {
        const r = await worktrees.list({ projectRoot: repo })
        if (r.isGit) break
        await sleep(200)
      }
      expect(typeof (worktrees as { create?: unknown }).create).toBe('function')
      expect(typeof (worktrees as { delete?: unknown }).delete).toBe('function')
      const wtPath = join(gitHome, 'repo-wt-fix8')
      const created = await (worktrees as {
        create(request: { projectRoot: string; branch: string; base: string; path: string }): Promise<{ entry: { path: string } }>
      }).create({ projectRoot: repo, branch: 'fix8-wt', base: 'main', path: wtPath })
      const norm2 = (p: string): string => p.replaceAll('\\', '/')
      expect(created.entry.path).toBe(norm2(wtPath))
      const afterCreate = await worktrees.list({ projectRoot: repo })
      expect(afterCreate.entries.map((e) => norm2(e.path))).toContain(norm2(wtPath))
      const removed = await (worktrees as {
        delete(request: { projectRoot: string; path: string }): Promise<{ removed: boolean }>
      }).delete({ projectRoot: repo, path: wtPath })
      expect(removed.removed).toBe(true)
    } finally {
      dispose()
    }
  })
})

describe('b5707fe4 集成钉：core 代 projectId 经归属键解析链 bugs 读缝全链', () => {
  const home = mkdtempSync(join(tmpdir(), 'fix8-bugkey-'))

  afterAll(() => {
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // db 句柄 Windows 锁文件——临时目录留盘不判失败
    }
  })

  it('register 委托缝落 core（本库零行）→ forge.bugs registerBug/listBugs 归属键派生成功（回写归属行）', async () => {
    process.env.DSH_HOME = home
    const ws = join(home, 'ws')
    mkdirSync(ws)
    const coreId = 'core-uuid-fix8-1'
    const ctx = gateCtx({ workspaceRegistry: fakeRegistry() })
    const dispose = projectPlugin(ctx, {})
    try {
      // core 服务在場（宿主集成态模拟）：register 委托 core、core projectId = randomUUID
      //（≠ workspace id——project-service.ts:442 实证）
      const coreStub = {
        registerProject: async () => ({ projectId: coreId, workspaceId: 'ws-reg-1', attachedToExisting: false }),
        listProjects: async () => [],
        getProject: async (id: string) =>
          id === coreId
            ? { id, workspaceId: 'ws-reg-1', wsPath: ws, name: 'ws', forgeDir: '', forgeDirExternal: false, worktreeDir: '', archived: false, createdAt: '', updatedAt: '' }
            : null,
        updateProject: async () => {
          throw new Error('not used')
        },
        reconcileAtStartup: async () => ({ repaired: [], orphans: [] }),
      }
      ctx.reflect?.provide?.('forgeProjects', coreStub)
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () => {
        throw new Error('forge.projects seam missing')
      })
      const reg = await projects.registerProject({ workspaceDir: ws, name: 'ws', forgeDir: join(ws, '.forge') })
      expect(reg.projectId).toBe(coreId)
      // 本库零行实证（core 委托缝——两库零交汇前置形态）
      const dbFile = join(home, 'forge', 'db', 'project', 'project.db')
      const db = openDomainDb(home, { prefix: 'project', file: dbFile })
      expect(db.repos.projects.get(coreId)).toBeUndefined()
      db.db.close()
      // forge.bugs 读缝：派生失败修复前 ERR_BUG_PROJECT_KEY_REQUIRED 恒红——修复后派生成功
      const bugs = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.bugs, () => {
        throw new Error('forge.bugs seam missing')
      })
      const { card } = await (bugs as {
        registerBug(input: Record<string, string>): Promise<{ card: { bugId: string; bugStatus: string } }>
      }).registerBug({
        projectId: coreId,
        summary: 'core 代 projectId 可登记',
        bugDesc: 'b5707fe4 装配集成钉',
        triggerDesc: 'core 委托缝注册后登记',
        expected: '登记成功',
        actual: '修复前 ERR_BUG_PROJECT_KEY_REQUIRED',
      })
      expect(card.bugStatus).toBe('open')
      // 回写归属行在库（惰性补建——后续链全绿）
      const db2 = openDomainDb(home, { prefix: 'project', file: dbFile })
      expect(db2.repos.projects.get(coreId)?.projectKey).toBeTruthy()
      expect(db2.repos.workspaces.getMain(coreId)?.wsPath).toBe(ws)
      db2.db.close()
      // 行集读面命中登记行（修复前恒空）
      const rows = await bugs.listBugs({ projectId: coreId })
      expect(rows.map((r) => r.bugId)).toContain(card.bugId)
    } finally {
      dispose()
    }
  })
})
