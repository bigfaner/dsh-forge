// 归属键真源解析测试（bug b5707fe4——register 委托缝落 core 库后本库行缺席，bugs keyOf
// 恒抛 ERR_BUG_PROJECT_KEY_REQUIRED 行集恒空）：core 代 projectId 经 registry 官方锚
// （get(id).path）→ projectKeyOf 派生 + 惰性回写归属行（attachExisting 同语义）。
import { describe, expect, it } from 'vitest'
import { basename, dirname, join } from 'node:path'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { projectKeyOf, resolveProjectKey } from '@dsh-forge/lib-path'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import type { OfficialRegistryFace } from '../projects/registry-adapter.js'
import { createBugsService } from '../bugs/service.js'
import { createProjectKeyResolver } from './project-key.js'

/** fake registry（get 命中表驱动；抛错注入面 + 调用记录） */
function fakeRegistry(
  entries: Record<string, { path: string; title?: string }>,
  opts: { throwOnGet?: boolean } = {},
): OfficialRegistryFace & { getCalls: string[] } {
  const getCalls: string[] = []
  return {
    getCalls,
    list: async () => [],
    get: async (id: string) => {
      getCalls.push(id)
      if (opts.throwOnGet === true) throw new Error('registry unavailable')
      const e = entries[id]
      return e === undefined ? undefined : { id, path: e.path, title: e.title ?? '' }
    },
    create: async () => {
      throw new Error('not implemented')
    },
    delete: async () => undefined,
  }
}

function makeDb(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

describe('createProjectKeyResolver：归属键真源解析链（b5707fe4）', () => {
  it('本库行在 → 直读 project_key（registry 零调用——既有路径零变化）', async () => {
    const db = makeDb()
    db.repos.projects.insert({
      id: 'p-own',
      projectKey: 'key-own',
      title: 'own',
      forgeDir: 'Z:\\ws\\own',
      forgeDirExternal: false,
      worktreeDir: '',
      sortOrder: null,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const registry = fakeRegistry({})
    const resolve = createProjectKeyResolver({ domainDb: db, registry })
    await expect(resolve('p-own')).resolves.toBe('key-own')
    expect(registry.getCalls).toEqual([])
    db.db.close()
  })

  it('core 代 projectId（本库无行）+ registry 命中 → 派生成功 + 归属行惰性补建（projects 行 + main 关系行）', async () => {
    const db = makeDb()
    const registry = fakeRegistry({ 'ws-core-1': { path: 'Z:\\ws\\alpha', title: 'alpha' } })
    const resolve = createProjectKeyResolver({ domainDb: db, registry })
    const expected = projectKeyOf('Z:\\ws\\alpha')
    await expect(resolve('ws-core-1')).resolves.toBe(expected)
    // 惰性回写：本库行 + main 关系行在库（attachExisting 同语义——后续链全绿）
    expect(db.repos.projects.get('ws-core-1')?.projectKey).toBe(expected)
    expect(db.repos.workspaces.getMain('ws-core-1')?.wsPath).toBe('Z:\\ws\\alpha')
    // 二次调用直读（回写生效，不重复触锚补建径——幂等）
    await expect(resolve('ws-core-1')).resolves.toBe(expected)
    expect(db.repos.projects.list({ includeArchived: true }).filter((r) => r.id === 'ws-core-1')).toHaveLength(1)
    db.db.close()
  })

  it('core 行真值锚：projectId = core randomUUID（≠ workspace id）经 getProject().wsPath 派生成功', async () => {
    const db = makeDb()
    // registry 只认 workspace id——core projectId（randomUUID）在 registry 必 MISS
    const registry = fakeRegistry({ 'reg-ws-1': { path: 'Z:\\other', title: 'other' } })
    const coreProjects = (): unknown => ({
      getProject: async (id: string) =>
        id === 'core-uuid-1'
          ? { id, workspaceId: 'reg-ws-1', wsPath: 'Z:\\ws\\core-ws', name: 'core-ws' }
          : null,
    })
    const resolve = createProjectKeyResolver({
      domainDb: db,
      coreProjects: coreProjects as () => undefined,
      registry,
    })
    const expected = projectKeyOf('Z:\\ws\\core-ws')
    await expect(resolve('core-uuid-1')).resolves.toBe(expected)
    // 回写 main 关系行 workspaceId = core 行 workspaceId（关系真值保留）
    expect(db.repos.workspaces.getMain('core-uuid-1')?.workspaceId).toBe('reg-ws-1')
    db.db.close()
  })

  it('core 优先序：core 行命中时不触 registry（锚序 ②→③）', async () => {
    const db = makeDb()
    const registry = fakeRegistry({ 'core-uuid-2': { path: 'Z:\\ws\\registry-path', title: 'r' } })
    const coreProjects = (): unknown => ({
      getProject: async () => ({ id: 'core-uuid-2', workspaceId: 'reg-x', wsPath: 'Z:\\ws\\core-path', name: 'c' }),
    })
    const resolve = createProjectKeyResolver({
      domainDb: db,
      coreProjects: coreProjects as () => undefined,
      registry,
    })
    await expect(resolve('core-uuid-2')).resolves.toBe(projectKeyOf('Z:\\ws\\core-path'))
    expect(registry.getCalls).toEqual([])
    db.db.close()
  })

  it('core 抛错 fail-soft → registry 锚接力；双缺 → null', async () => {
    const db = makeDb()
    const throwingCore = (): unknown => ({
      getProject: async () => {
        throw new Error('core unavailable')
      },
    })
    const registry = fakeRegistry({ 'core-uuid-3': { path: 'Z:\\ws\\fallback', title: '' } })
    const resolve = createProjectKeyResolver({
      domainDb: db,
      coreProjects: throwingCore as () => undefined,
      registry,
    })
    await expect(resolve('core-uuid-3')).resolves.toBe(projectKeyOf('Z:\\ws\\fallback'))
    const bothAbsent = createProjectKeyResolver({ domainDb: db, coreProjects: () => undefined, registry: fakeRegistry({}) })
    await expect(bothAbsent('core-uuid-4')).resolves.toBeNull()
    db.db.close()
  })

  it('同路径已有他 id main 行 → 键空间合流取既有 project_key，库零新行', async () => {
    const db = makeDb()
    const stamp = '2026-01-01T00:00:00.000Z'
    db.repos.projects.insert({
      id: 'p-native',
      projectKey: projectKeyOf('Z:\\ws\\alpha'),
      title: 'alpha-native',
      forgeDir: 'Z:\\ws\\alpha',
      forgeDirExternal: false,
      worktreeDir: '',
      sortOrder: null,
      archived: false,
      createdAt: stamp,
      updatedAt: stamp,
    })
    db.repos.workspaces.insert({
      id: null,
      projectId: 'p-native',
      workspaceId: 'reg-native',
      wsPath: 'Z:\\ws\\alpha',
      memberRole: 'main',
      boundAt: stamp,
      createdAt: stamp,
    })
    const registry = fakeRegistry({ 'ws-core-2': { path: 'Z:\\ws\\alpha' } })
    const resolve = createProjectKeyResolver({ domainDb: db, registry })
    await expect(resolve('ws-core-2')).resolves.toBe(projectKeyOf('Z:\\ws\\alpha'))
    expect(db.repos.projects.get('ws-core-2')).toBeUndefined()
    db.db.close()
  })

  it('registry 抛错 / 缺席 / 未命中 → null（I5 派生失败拒写语义不变，fail-soft 不炸）', async () => {
    const db = makeDb()
    const throwing = createProjectKeyResolver({ domainDb: db, registry: fakeRegistry({}, { throwOnGet: true }) })
    await expect(throwing('ws-x')).resolves.toBeNull()
    const absent = createProjectKeyResolver({ domainDb: db, registry: undefined })
    await expect(absent('ws-x')).resolves.toBeNull()
    const missing = createProjectKeyResolver({ domainDb: db, registry: fakeRegistry({}) })
    await expect(missing('ws-unknown')).resolves.toBeNull()
    db.db.close()
  })

  it('集成钉：core 代 projectId 经 resolver 注入 bugs 服务 → registerBug 成功（行集不再恒空）', async () => {
    const db = makeDb()
    const registry = fakeRegistry({ 'ws-core-3': { path: 'Z:\\ws\\beta', title: 'beta' } })
    const notify: string[] = []
    const service = createBugsService({
      bugs: db.repos.bugs,
      resolveProjectKey: createProjectKeyResolver({ domainDb: db, registry }),
      resolveMainPath: () => 'Z:/ws/beta',
      execFile: (_c, _a, _o, cb) => cb(null, 'faner\n', ''),
      notify: (id) => notify.push(id),
    })
    const { card } = await service.registerBug({
      projectId: 'ws-core-3',
      summary: 'core 代注册项目可登记 bug',
      bugDesc: 'b5707fe4 回归钉',
      triggerDesc: 'register 走 core 委托缝后登记',
      expected: '登记成功',
      actual: '修复前 ERR_BUG_PROJECT_KEY_REQUIRED',
    })
    expect(card.bugStatus).toBe('open')
    expect(notify).toEqual(['ws-core-3'])
    // 行集读面：listBugs 命中登记行（修复前恒空）
    await expect(service.listBugs({ projectId: 'ws-core-3' })).resolves.toHaveLength(1)
    db.db.close()
  })

  it('写行/派生键口径（bug 3467e146）：锚路径拼写与磁盘大小写不同 → 派生键 = resolveProjectKey 规范化后同键', async () => {
    const real = mkdtempSync(join(tmpdir(), 'projkey-resolver-case-'))
    try {
      const base = basename(real)
      const flipped = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase()
      const spelled = join(dirname(real), flipped)
      expect(realpathSync.native(spelled)).not.toBe(spelled)
      const db = makeDb()
      try {
        const registry = fakeRegistry({ 'ws-case-1': { path: spelled, title: 'case' } })
        const resolve = createProjectKeyResolver({ domainDb: db, registry })
        const consumed = resolveProjectKey(spelled, { registryQuery: () => spelled }).key
        const key = await resolve('ws-case-1')
        expect(key).toBe(consumed)
        // 回写归属行同键
        expect(db.repos.projects.get('ws-case-1')?.projectKey).toBe(consumed)
      } finally {
        db.db.close()
      }
    } finally {
      rmSync(real, { recursive: true, force: true })
    }
  })
})
