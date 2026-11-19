// registry-adapter 测试（plugin-project 1.10）：官方 face 窄面 → ProjectRegistryPort 映射——
// id→workspaceId / path→wsPath 驼列投影、setTitle 透传、resolveByPath 缺席降级 undefined。
import { describe, expect, it } from 'vitest'
import { createRegistryAdapter, type OfficialRegistryFace, type OfficialWorkspaceFace } from './registry-adapter.js'

function fakeFace(entries: OfficialWorkspaceFace[] = []): OfficialRegistryFace & { deleted: string[] } {
  const state = { deleted: [] as string[] }
  return {
    deleted: state.deleted,
    list: async () => entries,
    get: async (id) => entries.find((e) => e.id === id),
    create: async (path, title) => {
      const hit = entries.find((e) => e.path === path)
      if (hit !== undefined) return hit
      const entry: OfficialWorkspaceFace = { id: `ws-${entries.length + 1}`, path, title: title ?? 'ws', setTitle: async () => {} }
      entries.push(entry)
      return entry
    },
    delete: async (id) => {
      state.deleted.push(id)
    },
    resolveByPath: async (path) => entries.find((e) => e.path === path),
  }
}

describe('createRegistryAdapter（官方 face → 端口适配）', () => {
  it('list/get/create/delete/resolveByPath 全动词映射（驼列投影）', async () => {
    const face = fakeFace([{ id: 'ws-1', path: 'Z:\\ws\\a', title: 'a' }])
    const port = createRegistryAdapter(face)
    expect(await port.list()).toEqual([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\a', title: 'a' }])
    expect(await port.get('ws-1')).toMatchObject({ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\a' })
    expect(await port.get('missing')).toBeUndefined()
    // find-or-create 幂等：同路径复用既有实体
    const created = await port.create('Z:\\ws\\a')
    expect(created.workspaceId).toBe('ws-1')
    const fresh = await port.create('Z:\\ws\\b', 'b')
    expect(fresh).toMatchObject({ workspaceId: expect.any(String), wsPath: 'Z:\\ws\\b', title: 'b' })
    // 标题对齐透传
    await fresh.setTitle!('aligned')
    await port.delete(fresh.workspaceId)
    expect(face.deleted).toEqual([fresh.workspaceId])
    expect(await port.resolveByPath('Z:\\ws\\a')).toMatchObject({ workspaceId: 'ws-1' })
    expect(await port.resolveByPath('Z:\\ws\\absent')).toBeUndefined()
  })

  it('resolveByPath 缺席（旧替身面）→ 端口返回 undefined（降级零抛）', async () => {
    const port = createRegistryAdapter({
      list: async () => [],
      get: async () => undefined,
      create: async (path) => ({ id: 'ws-x', path, title: 'x' }),
      delete: async () => {},
    })
    expect(await port.resolveByPath('Z:\\anything')).toBeUndefined()
  })
})
