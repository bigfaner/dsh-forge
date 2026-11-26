// queries 测试（plugin-project 1.10）：四键字典序读面 + 归档过滤 + 标题对齐（registry 读面）+
// 读路径自证 suspected-move warn 拒自动改（fake registry / onDiag 构造注入）。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalizePath, deriveDirName, projectKeyOf } from '@dsh-forge/lib-path'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import type { ProjectRow, WorkspaceRow } from '../db/row-types.js'
import { ProjectsQueryService } from './queries.js'
import type { ProjectRegistryPort, RegistryEntryMutable } from './registry-adapter.js'

const NOW = '2026-01-01T00:00:00.000Z'

function mem(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

function fakeRegistry(
  entries: { workspaceId: string; wsPath: string; title: string }[] = [],
): ProjectRegistryPort {
  const byId = new Map(entries.map((e) => [e.workspaceId, { ...e } as RegistryEntryMutable]))
  return {
    list: async () => [...byId.values()],
    get: async (workspaceId) => byId.get(workspaceId),
    create: async () => {
      throw new Error('queries 读面不落 create')
    },
    delete: async () => {
      throw new Error('queries 读面不落 delete')
    },
    resolveByPath: async () => undefined,
  }
}

function seedProject(domain: DomainDb, patch: Partial<ProjectRow> = {}): ProjectRow {
  const row: ProjectRow = {
    id: patch.id ?? `p-${Math.random().toString(36).slice(2)}`,
    projectKey: 'k',
    title: 'proj',
    forgeDir: 'Z:\\forge\\x',
    forgeDirExternal: false,
    worktreeDir: '',
    sortOrder: null,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
  domain.repos.projects.insert(row)
  return row
}

function seedMain(domain: DomainDb, projectId: string, wsPath: string, workspaceId: string): WorkspaceRow {
  const row: WorkspaceRow = {
    id: null,
    projectId,
    workspaceId,
    wsPath,
    memberRole: 'main',
    boundAt: NOW,
    createdAt: NOW,
  }
  domain.repos.workspaces.insert(row)
  return row
}

describe('ProjectsQueryService（查询面）', () => {
  it('四键字典序 + 默认滤归档（repo ORDER BY 单源透传）', () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'pa', projectKey: 'ka', sortOrder: 2, createdAt: '2026-01-02' })
      seedProject(domain, { id: 'pb', projectKey: 'kb', sortOrder: 1, createdAt: '2026-01-03' })
      seedProject(domain, { id: 'pc', projectKey: 'kc', sortOrder: null, createdAt: '2026-01-01' })
      seedProject(domain, { id: 'pd', projectKey: 'kd', sortOrder: null, createdAt: '2026-01-01', archived: true })
      const svc = new ProjectsQueryService({ projects: domain.repos.projects, workspaces: domain.repos.workspaces })
      expect(svc.listProjects().map((p) => p.id)).toEqual(['pb', 'pa', 'pc'])
    } finally {
      domain.db.close()
    }
  })

  it('summary 映射：main 行投影 workspaceId/wsPath；标题对齐 = 库 title', () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1', projectKey: 'k1', title: 'alpha', sortOrder: 3 })
      seedMain(domain, 'p1', 'Z:\\ws\\alpha', 'ws-1')
      const svc = new ProjectsQueryService({ projects: domain.repos.projects, workspaces: domain.repos.workspaces })
      expect(svc.listProjects()).toEqual([
        { id: 'p1', workspaceId: 'ws-1', name: 'alpha', wsPath: 'Z:\\ws\\alpha', archived: false, sortOrder: 3 },
      ])
    } finally {
      domain.db.close()
    }
  })

  it('读路径自证：project_key ≠ f(main ws_path) → suspected-move warn + 拒自动改（行零写）', () => {
    const domain = mem()
    try {
      // 人为制造不一致：库内 key 与 f(wsPath) 投影漂移（迁移半途/外部改名遗留态）
      seedProject(domain, { id: 'p1', projectKey: 'stale-key@00000000' })
      seedMain(domain, 'p1', 'Z:\\ws\\moved', 'ws-1')
      const diags: unknown[] = []
      const svc = new ProjectsQueryService({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        onDiag: (p) => diags.push(p),
      })
      svc.listProjects()
      expect(diags).toMatchObject([
        { level: 'warn', event: 'project-suspected-move', projectId: 'p1', cwd: 'Z:\\ws\\moved' },
      ])
      // 拒自动改：读面零写——project_key 原样（更新走显式迁移动词）
      expect(domain.repos.projects.get('p1')!.projectKey).toBe('stale-key@00000000')
    } finally {
      domain.db.close()
    }
  })

  it('读路径自证口径（bug 24954442）：注册拼写与磁盘大小写不同 → 规范化后同键，不发 suspected-move 警告', async () => {
    const real = mkdtempSync(join(tmpdir(), 'query-case-'))
    try {
      // 造与磁盘大小写不同的拼写段（realpathSync.native 收敛真实大小写）
      const base = basename(real)
      const flipped = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase()
      const spelled = join(dirname(real), flipped)
      expect(realpathSync.native(spelled)).not.toBe(spelled) // 前置：拼写确与真实路径不同
      const domain = mem()
      try {
        // 库行键 = register 写行口径（canonicalizePath 规范化后派生——bug 3467e146）
        seedProject(domain, { id: 'p1', projectKey: projectKeyOf(canonicalizePath(spelled)) })
        seedMain(domain, 'p1', spelled, 'ws-1')
        const diags: unknown[] = []
        const svc = new ProjectsQueryService({
          projects: domain.repos.projects,
          workspaces: domain.repos.workspaces,
          onDiag: (p) => diags.push(p),
        })
        svc.listProjects()
        await svc.getProject('p1')
        expect(diags).toEqual([])
      } finally {
        domain.db.close()
      }
    } finally {
      rmSync(real, { recursive: true, force: true })
    }
  })

  it('getProject：DTO 映射 + registry 标题对齐读面（registry 为准，库侧不被改写）', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1', projectKey: deriveDirName('Z:\\ws\\alpha'), title: 'db-title', forgeDirExternal: true })
      seedMain(domain, 'p1', 'Z:\\ws\\alpha', 'ws-1')
      const svc = new ProjectsQueryService({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\alpha', title: 'registry-title' }]),
      })
      const p = await svc.getProject('p1')
      expect(p).toEqual({
        id: 'p1',
        workspaceId: 'ws-1',
        wsPath: 'Z:\\ws\\alpha',
        name: 'registry-title',
        forgeDir: 'Z:\\forge\\x',
        forgeDirExternal: true,
        worktreeDir: '',
        archived: false,
        createdAt: NOW,
        updatedAt: NOW,
      })
      // 库侧 title 不被读面改写
      expect(domain.repos.projects.get('p1')!.title).toBe('db-title')
      expect(await svc.getProject('missing')).toBeNull()
    } finally {
      domain.db.close()
    }
  })

  it('getProject workspaceId 别名（bug a99a7293 读面）：官方语境 projectId = workspace_id 形态经 main 行锚解析行真值', async () => {
    const domain = mem()
    try {
      // 单装注册形态：行 id = randomUUID、main 行 workspace_id = 官方 workspace id
      seedProject(domain, { id: 'uuid-1', projectKey: deriveDirName('Z:\\ws\\alpha'), title: 'alpha' })
      seedMain(domain, 'uuid-1', 'Z:\\ws\\alpha', 'Z-project-dsh-dsh-forge@dadf6b04')
      const svc = new ProjectsQueryService({ projects: domain.repos.projects, workspaces: domain.repos.workspaces })
      const p = await svc.getProject('Z-project-dsh-dsh-forge@dadf6b04')
      expect(p).not.toBeNull()
      expect(p!.id).toBe('uuid-1')
      expect(p!.workspaceId).toBe('Z-project-dsh-dsh-forge@dadf6b04')
      expect(p!.wsPath).toBe('Z:\\ws\\alpha')
      // 行 id 直读形态不受影响
      expect((await svc.getProject('uuid-1'))?.id).toBe('uuid-1')
    } finally {
      domain.db.close()
    }
  })

  it('getProject project_key 别名：forge 语境归属键直投形态（bug a99a7293 未命中实锚）同链解析', async () => {
    const domain = mem()
    try {
      const key = deriveDirName('Z:\\ws\\alpha')
      seedProject(domain, { id: 'uuid-2', projectKey: key, title: 'alpha' })
      seedMain(domain, 'uuid-2', 'Z:\\ws\\alpha', 'ws-2')
      const svc = new ProjectsQueryService({ projects: domain.repos.projects, workspaces: domain.repos.workspaces })
      const p = await svc.getProject(key)
      expect(p).not.toBeNull()
      expect(p!.id).toBe('uuid-2')
      expect(p!.wsPath).toBe('Z:\\ws\\alpha')
    } finally {
      domain.db.close()
    }
  })
})
