// fix-bug forge:bugs/* 注册 pin：三通道（list + commitFiles/fileDiff——列表读面与 fixed
// 证据读面）+ 面分治（recordBug/resolveBug = agent tool 专属恒不上 RPC）+ 负载映射端到端
// （替身层）：ListBugsQuery 查询参透传（search/status/sort + offset/limit 分页参——
// bug-recurrence-chain 随动）+ 链上下文读面（行载 recurrenceOf 前驱指针透传）+ 错误面（typed 六码信封 / 非 typed fail-loud）。
// 本测试面只行使 list 读法——commitFiles/fileDiff 证据读法语义在 core bugs 域测试，
// 此处以 no-op 桩补齐 BugsChannelService 全面（d4644b86 扩面后的类型补齐）。
import { describe, expect, it, vi } from 'vitest'
import { BUGS_CHANNELS } from '@dsh-forge/contracts'
import type { BugCard } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerBugsChannels, type BugsChannelService } from './bugs-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

/** 本面只行使 list——证据两读法 no-op 桩补齐（注册面类型全面） */
function bugsService(listBugs: BugsChannelService['listBugs']): BugsChannelService {
  return {
    listBugs,
    commitFiles: vi.fn(async () => []),
    fileDiff: vi.fn(async () => ({ diff: '' })),
  }
}

const bugCard: BugCard = {
  bugId: 'bg-1',
  summary: '登录接口 500',
  bugDesc: '登录接口偶发 500',
  triggerDesc: 'POST /login 空 body',
  expected: '400 参数错误',
  actual: '500 内部错误',
  bugStatus: 'open',
  reporter: 'faner',
  createdAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
}

describe('fix-bug forge:bugs/* 注册面（Bug 子 tab 列表读面）', () => {
  function setup(service: BugsChannelService) {
    const { ipcMain, handlers } = fakeIpcMain()
    registerBugsChannels(createForgeIpc(ipcMain), service)
    return handlers
  }

  it('注册面恰三通道 = BUGS_CHANNELS 全集（list/commitFiles/fileDiff——无多无少）', () => {
    const handlers = setup(bugsService(vi.fn().mockResolvedValue([])))
    expect([...handlers.keys()].sort()).toEqual(Object.values(BUGS_CHANNELS).sort())
  })

  it('面分治：recordBug/resolveBug 写动词无通道（agent tool 专属）', () => {
    const handlers = setup(bugsService(vi.fn().mockResolvedValue([])))
    expect(handlers.has('forge:bugs/recordBug' as never)).toBe(false)
    expect(handlers.has('forge:bugs/resolveBug' as never)).toBe(false)
  })

  it('list：ListBugsQuery 全参透传（search/status/sort）→ BugCard[] typed 返回', async () => {
    const listBugs = vi.fn().mockResolvedValue([bugCard])
    const handlers = setup(bugsService(listBugs))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    const q = { projectId: 'p-1', search: '游标', status: ['open'] as const, sort: 'created' as const }
    await expect(handler(undefined, q)).resolves.toEqual({ ok: true, data: [bugCard] })
    expect(listBugs).toHaveBeenCalledWith(q)
  })

  it('list：分页查询参 offset/limit 原样透传（服务端排序后切片——bug-recurrence-chain 查询参随动）', async () => {
    const listBugs = vi.fn().mockResolvedValue([])
    const handlers = setup(bugsService(listBugs))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    const q = { projectId: 'p-1', sort: 'created' as const, offset: 20, limit: 50 }
    await expect(handler(undefined, q)).resolves.toEqual({ ok: true, data: [] })
    expect(listBugs).toHaveBeenCalledWith(q)
  })

  it('list：链上下文读面——行载 recurrenceOf 前驱指针原样透传（列表链折叠共载体，零服务端改写）', async () => {
    const relapse: BugCard = { ...bugCard, bugId: 'bg-2', summary: '又犯了', recurrenceOf: 'bg-1' }
    const listBugs = vi.fn().mockResolvedValue([bugCard, relapse])
    const handlers = setup(bugsService(listBugs))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1' })).resolves.toEqual({
      ok: true,
      data: [bugCard, relapse],
    })
    expect((await listBugs.mock.results[0]!.value as BugCard[])[1]!.recurrenceOf).toBe('bg-1')
    expect('recurrenceOf' in bugCard).toBe(false) // 链根 = 键缺席
  })

  it('list：缺省查询（仅 projectId）原样透传——键缺席语义不变', async () => {
    const listBugs = vi.fn().mockResolvedValue([])
    const handlers = setup(bugsService(listBugs))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1' })).resolves.toEqual({ ok: true, data: [] })
    expect(listBugs).toHaveBeenCalledWith({ projectId: 'p-1' })
  })

  it('typed 错误（code ∈ contracts 六码）→ 带 code 的 RpcErr 信封（fail-soft 带内）', async () => {
    const typed = Object.assign(new Error('bug 未命中'), { code: 'ERR_BUG_NOT_FOUND' })
    const handlers = setup(bugsService(vi.fn().mockRejectedValue(typed)))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1' })).resolves.toEqual({
      ok: false,
      error: { code: 'ERR_BUG_NOT_FOUND', message: 'bug 未命中' },
    })
  })

  it('非 typed 错误 fail-loud 原样上抛（不捏造 RpcErr 伪码信封）', async () => {
    const plain = new Error('db closed')
    const handlers = setup(bugsService(vi.fn().mockRejectedValue(plain)))
    const handler = handlers.get(BUGS_CHANNELS.list)!
    await expect(handler(undefined, { projectId: 'p-1' })).rejects.toBe(plain)
  })
})
