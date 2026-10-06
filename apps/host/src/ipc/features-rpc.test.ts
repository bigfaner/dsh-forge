// 3.1 forge:features/* 五通道注册 pin：注册面 = FEATURES_CHANNELS 全集（UI 直调——
// Interface 7 裁决：feature 域三写法为人类表单动作）+ 负载映射端到端（替身层）。
// fix-2 增 listDocs（feature_documents 列举读面——文档行数据源）。
import { describe, expect, it, vi } from 'vitest'
import { FEATURES_CHANNELS, type FeatureRow, type ForgeFeaturesService } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerFeaturesChannels } from './features-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

const invoke = (handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>, channel: string, payload?: unknown) => {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for '${channel}'`)
  return Promise.resolve(handler(undefined, payload))
}

const featureRow: FeatureRow = {
  featureId: 'f-1',
  slug: 'demo-feature',
  title: '演示',
  featureStatus: 'design',
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
}

function fakeService(): ForgeFeaturesService {
  return {
    registerFeature: vi.fn().mockResolvedValue(featureRow),
    transitionFeature: vi.fn().mockResolvedValue({ ...featureRow, featureStatus: 'archived' }),
    upsertFeatureDoc: vi.fn().mockResolvedValue({
      featureId: 'f-1',
      docKind: 'tech-design',
      relPath: 'features/demo-feature/tech-design.md',
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    }),
    listFeatures: vi.fn().mockResolvedValue([]),
    listFeatureDocs: vi.fn().mockResolvedValue([]),
  }
}

describe('3.1 forge:features/* 注册与负载映射（UI 直调五法）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const service = fakeService()
    registerFeaturesChannels(createForgeIpc(ipcMain), service)
    return { service, handlers, call: (channel: string, payload?: unknown) => invoke(handlers, channel, payload) }
  }

  it('注册面 = contracts FEATURES_CHANNELS 全集五通道（无多无少）', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(Object.values(FEATURES_CHANNELS).slice().sort())
  })

  it('register / transition / upsertDoc / list / listDocs：负载透传 typed 返回', async () => {
    const { service, call } = setup()
    const registerInput = { projectId: 'p-1', slug: 'demo-feature', title: '演示' }
    await expect(call(FEATURES_CHANNELS.register, registerInput)).resolves.toEqual({ ok: true, data: featureRow })
    expect(service.registerFeature).toHaveBeenCalledWith(registerInput)
    const transitionInput = { projectId: 'p-1', featureId: 'f-1', toStatus: 'archived' as const, reason: '弃案收纳' }
    await expect(call(FEATURES_CHANNELS.transition, transitionInput)).resolves.toEqual({
      ok: true,
      data: { ...featureRow, featureStatus: 'archived' },
    })
    expect(service.transitionFeature).toHaveBeenCalledWith(transitionInput)
    const upsertInput = { projectId: 'p-1', featureSlug: 'demo-feature', docKind: 'tech-design' as const, relPath: 'features/demo-feature/tech-design.md' }
    await expect(call(FEATURES_CHANNELS.upsertDoc, upsertInput)).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ docKind: 'tech-design' }),
    })
    expect(service.upsertFeatureDoc).toHaveBeenCalledWith(upsertInput)
    await expect(call(FEATURES_CHANNELS.list, { projectId: 'p-1', search: 'demo' })).resolves.toEqual({ ok: true, data: [] })
    expect(service.listFeatures).toHaveBeenCalledWith({ projectId: 'p-1', search: 'demo' })
    await expect(call(FEATURES_CHANNELS.listDocs, { projectId: 'p-1' })).resolves.toEqual({ ok: true, data: [] })
    expect(service.listFeatureDocs).toHaveBeenCalledWith({ projectId: 'p-1' })
  })
})
