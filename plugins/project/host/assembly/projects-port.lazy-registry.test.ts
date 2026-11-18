// bug e6351546 RED 锚：官方 web 宿主 workspaceRegistry face provide 晚于插件装配——
// 装配期快照取法恒缺 → absentRegistry typed 拒绝「registry face 缺席」。修口断言面：
// face 取法改调用期现查（惰性取法注入——port 装配时 face 缺席，注册调用时 face 在场
// 即注册成功，同宿主 knowledge 插件消费点现查口径对齐）。
import { describe, expect, it } from 'vitest'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import { createProjectsServicePort } from './projects-port.js'
import type { OfficialRegistryFace } from '../projects/registry-adapter.js'

let idSeq = 0

/** 官方 workspaceRegistry 窄面替身（find-or-create by path——register 链消费形状）。 */
function fakeRegistry(): OfficialRegistryFace {
  const entries = new Map<string, { id: string; path: string; title: string }>()
  return {
    list: async () => [...entries.values()],
    get: async (id) => [...entries.values()].find((e) => e.id === id),
    create: async (path, title) => {
      const hit = entries.get(path)
      if (hit !== undefined) return hit
      idSeq += 1
      const entry = { id: `ws-${idSeq}`, path, title: title ?? `ws-${idSeq}` }
      entries.set(path, entry)
      return entry
    },
    delete: async (id) => {
      for (const [path, e] of entries) if (e.id === id) entries.delete(path)
    },
    resolveByPath: async (path) => entries.get(path),
  }
}

function mem(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

describe('projects port——workspaceRegistry face 调用期现查（bug e6351546）', () => {
  it('port 装配时 face 缺席、注册调用时 face 在场——registerProject 成功（惰性取法不缓存装配期快照）', async () => {
    const domainDb = mem()
    let face: OfficialRegistryFace | undefined
    const port = createProjectsServicePort({
      domainDb,
      registry: () => face,
      tasksHome: undefined,
    })
    // face 尚未 provide（官方宿主装配序：workspaceRegistry 晚于插件装配）
    expect(face).toBeUndefined()
    face = fakeRegistry()
    const result = await port.registerProject({
      name: '惰性注册项目',
      workspaceDir: 'Z:/tmp/lazy-reg-project',
      forgeDir: 'Z:/tmp/lazy-reg-project/.forge',
    })
    expect(result.projectId).not.toBe('')
    expect(result.workspaceId).not.toBe('')
    const listed = await port.listProjects()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.name).toBe('惰性注册项目')
  })

  it('face 始终缺席——create typed 拒绝语义不变（装配降级零副作用保留）', async () => {
    const port = createProjectsServicePort({ domainDb: mem(), registry: () => undefined })
    await expect(
      port.registerProject({
        name: 'x',
        workspaceDir: 'Z:/tmp/absent-face-project',
        forgeDir: 'Z:/tmp/absent-face-project/.forge',
      }),
    ).rejects.toThrow(/registry/)
  })
})
