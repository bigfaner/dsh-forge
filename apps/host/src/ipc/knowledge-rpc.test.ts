// forge:knowledge/* 五通道经 1.4 ipc/ 机制注册端到端（双层自证；1.7 A2 服务切换后
// 实层句柄来源 = knowledge 插件服务域）：
//   双层之一（替身层）：fake 浏览面服务（browse 聚合 + 浏览四法）× 五通道 → typed 结果 + 负载映射；
//   双层之二（实层）  ：knowledge 插件服务真身（自持库 + 注册表 + 两级解析）→ 五通道
//                      实跑（含 browse 聚合真值与过滤参数）+ 知识域三码 typed error 过真实注册
//                      机制入信封保真 + 在场/缺席双态（main wiring 判定缝同构）。
// AC 对照：AC1 五通道端到端 / AC2 三码边界往返 / AC3 通道名仅出自 contracts + 未知通道拒绝 /
// AC4 search/readAbstract 不在 web RPC 面（双门分工——注入面类型收窄 + 注册面负样例）。
// 注：实层经相对路径引插件源码仅限测试文件（结构 pin 豁免 *.test.*；生产面 host 经
// @dsh-forge/knowledge 类型 + boot 桥服务注入，禁 import 实现源码）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { KNOWLEDGE_CHANNELS, type EntryDetail, type KnowledgeCard, type RecallGroup } from '@dsh-forge/contracts'
// 插件源码相对引入（测试面专用——见文件头注）
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../../packages/plugins/knowledge/src/service/index.js'
import type { BrowseKnowledgeService } from '../../../../packages/plugins/knowledge/src/service/index.js'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { registerKnowledgeChannels, type KnowledgeChannelService } from './knowledge-rpc.js'

// ── ipc 替身（ipcMain.handle 语义：注册表存储，invoke 直调 handler）──

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

/** renderer invoke 语义替身：handler(event, payload) → 结果（信封由 handler 自带） */
const invoke = (handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>, channel: string, payload?: unknown) => {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for '${channel}'`)
  return Promise.resolve(handler(undefined, payload))
}

// ── 替身层：fake 浏览面服务（缺 search/readAbstract = AC4 注入面收窄的编译级自证）──

const cards: KnowledgeCard[] = [
  { entryId: 1, title: '框架选型', summary: '前端框架选型基线', keywords: ['react', 'frontend'], status: 'draft', domainPath: '前端', updated: '2026-10-01T00:00:00.000Z', heat: 2 },
  { entryId: 2, title: 'API 规范', summary: '接口设计规范', keywords: ['api', 'backend'], status: 'draft', domainPath: '后端', updated: '2026-10-01T00:00:00.000Z', heat: 0 },
]
const domainNodes = [
  { domainPath: '前端', label: '前端', depth: 1, entryCount: 1 },
  { domainPath: '后端', label: '后端', depth: 1, entryCount: 1 },
]
const detail: EntryDetail = {
  entryId: 1, title: '框架选型', summary: '前端框架选型基线', keywords: ['react', 'frontend'], status: 'draft',
  domainPath: '前端', authors: null, updated: '2026-10-01T00:00:00.000Z', body: '正文',
}
const heatMap = new Map([[1, 2]])
const groups: RecallGroup[] = [
  { callId: 'call-1', verb: 'search', query: { keywords: ['react'] }, hitCount: 1, durationMs: 5, createdAt: '2026-10-01T00:00:00.000Z', hits: [{ entryId: 1, frontmatterId: null, title: '框架选型', domainPath: '前端', heat: 2 }] },
]

function fakeKnowledgeService() {
  return {
    browse: vi.fn().mockResolvedValue(domainNodes),
    listEntries: vi.fn().mockResolvedValue(cards),
    getEntryDetail: vi.fn().mockResolvedValue(detail),
    heatByEntry: vi.fn().mockResolvedValue(heatMap),
    sessionRecall: vi.fn().mockResolvedValue(groups),
  } satisfies KnowledgeChannelService
}

// ── AC3/AC4：注册面 = contracts 常量全集；双门分工负样例 ──

describe('3.5 五通道注册（AC3/AC4）', () => {
  it('注册面 = contracts KNOWLEDGE_CHANNELS 全集五通道（无多无少）', () => {
    const { ipcMain } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    registerKnowledgeChannels(ipc, fakeKnowledgeService())
    expect([...ipc.registered()].sort()).toEqual(Object.values(KNOWLEDGE_CHANNELS).slice().sort())
  })

  it('AC4 双门分工：search/readAbstract 通道不在面且不可注册（agent 面唯一门 = 插件 tool）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    registerKnowledgeChannels(ipc, fakeKnowledgeService())
    expect(handlers.has('forge:knowledge/search')).toBe(false)
    expect(handlers.has('forge:knowledge/read-abstract')).toBe(false)
    expect(handlers.has('forge:knowledge/readAbstract')).toBe(false)
    expect([...ipc.registered()].filter((c) => /search|read/.test(c))).toEqual([])
    // allowlist 增列后未知通道依旧拒绝（AC3 后半——伪知识通道不落 ipcMain.handle）
    expect(() => ipc.register('forge:knowledge/search' as never, () => 1)).toThrow(/allowlist/)
    expect(() => ipc.register('forge:knowledge/drop-table' as never, () => 1)).toThrow(/allowlist/)
    expect(handlers.has('forge:knowledge/drop-table')).toBe(false)
  })
})

// ── 1.7 在场/缺席双态（A2 服务切换——main.ts wiring 判定缝同构，判例 2ffb0a82 反例核验） ──

describe('1.7 在场/缺席双态：knowledge 服务缺席 = 五通道整体不挂', () => {
  it('服务在场 → 五通道注册齐备；服务缺席（插件行未装载/降级）→ 通道整体不注册（invoke 无 handler）', () => {
    // 在场态（main.ts if 分支同构：service !== undefined 才注册）
    const present = fakeIpcMain()
    const presentIpc = createForgeIpc(present.ipcMain)
    const service = fakeKnowledgeService()
    if (service !== undefined) registerKnowledgeChannels(presentIpc, service)
    expect([...presentIpc.registered()].sort()).toEqual(Object.values(KNOWLEDGE_CHANNELS).slice().sort())

    // 缺席态（main.ts else 分支同构：仅 warn，不注册——判例 2ffb0a82 的通道面语义）
    const absent = fakeIpcMain()
    const absentIpc = createForgeIpc(absent.ipcMain)
    const missing: KnowledgeChannelService | undefined = undefined
    if (missing !== undefined) registerKnowledgeChannels(absentIpc, missing)
    expect(absentIpc.registered()).toEqual([])
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      expect(absent.handlers.has(channel), `${channel} 不应有 handler`).toBe(false)
    }
  })
})

// ── AC1：五通道端到端（替身层：typed 结果 + 负载映射 = dto/rpc.ts 键键对应）──

describe('3.5 AC1 五通道端到端（替身层）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    const service = fakeKnowledgeService()
    registerKnowledgeChannels(ipc, service)
    return { handlers, service, call: (channel: string, payload?: unknown) => invoke(handlers, channel, payload) }
  }

  it('browse：{projectId} 负载 → DomainNode[] typed 返回（聚合面）', async () => {
    const { service, call } = setup()
    await expect(call(KNOWLEDGE_CHANNELS.browse, { projectId: 'p-1' })).resolves.toEqual({ ok: true, data: domainNodes })
    expect(service.browse).toHaveBeenCalledWith({ projectId: 'p-1' })
  })

  it('listEntries：过滤参数（domainPrefix × keyword）原样透传 → KnowledgeCard[]', async () => {
    const { service, call } = setup()
    const q = { projectId: 'p-1', domainPrefix: '前端', keyword: 'react' }
    await expect(call(KNOWLEDGE_CHANNELS.listEntries, q)).resolves.toEqual({ ok: true, data: cards })
    expect(service.listEntries).toHaveBeenCalledWith(q)
  })

  it('entryDetail：{projectId, entryId} → getEntryDetail 服务法 → EntryDetail（通道键 ↔ 服务法名解耦）', async () => {
    const { service, call } = setup()
    const q = { projectId: 'p-1', entryId: 1 }
    await expect(call(KNOWLEDGE_CHANNELS.entryDetail, q)).resolves.toEqual({ ok: true, data: detail })
    expect(service.getEntryDetail).toHaveBeenCalledWith(q)
  })

  it('heat：{projectId} 解包 → heatByEntry(projectId) → Map 保真返回', async () => {
    const { service, call } = setup()
    await expect(call(KNOWLEDGE_CHANNELS.heat, { projectId: 'p-1' })).resolves.toEqual({ ok: true, data: heatMap })
    expect(service.heatByEntry).toHaveBeenCalledWith('p-1')
  })

  it('sessionRecall：{projectId, sessionId} → RecallGroup[]', async () => {
    const { service, call } = setup()
    const q = { projectId: 'p-1', sessionId: 'sess-1' }
    await expect(call(KNOWLEDGE_CHANNELS.sessionRecall, q)).resolves.toEqual({ ok: true, data: groups })
    expect(service.sessionRecall).toHaveBeenCalledWith(q)
  })

  it('AC2 替身层速证：typed error → RpcErr 信封（code/message/data 三元组）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const service = fakeKnowledgeService()
    service.getEntryDetail.mockRejectedValue(
      Object.assign(new Error('知识条目未命中：projectId=p-9 entryId=99'), {
        code: 'ERR_ENTRY_NOT_FOUND',
        data: { projectId: 'p-9', entryId: 99 },
      }),
    )
    registerKnowledgeChannels(createForgeIpc(ipcMain), service)
    await expect(invoke(handlers, KNOWLEDGE_CHANNELS.entryDetail, { projectId: 'p-9', entryId: 99 })).resolves.toEqual({
      ok: false,
      error: { code: 'ERR_ENTRY_NOT_FOUND', message: expect.stringContaining('未命中'), data: { projectId: 'p-9', entryId: 99 } },
    })
  })
})

// ── 实层：core 知识域真身 × 真实注册组合 ──

const dirs: string[] = []

afterAll(() => {
  // Windows 句柄释放延迟容错（断言失败路径可能跳过 close——重试兜底防 EPERM 掩盖真因）
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function writeMd(knowledgeDir: string, relPath: string, frontmatter: string, body = '正文'): void {
  const abs = join(knowledgeDir, ...relPath.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, `---\n${frontmatter}\n---\n${body}`, 'utf8')
}

/**
 * 实层素材：每用例独占临时自持库 + 知识目录语料（前端 2 / 后端 1）+ 注册行种子
 * （registry.upsert——种子迁移径等价）。rebuild 注入缝：failRebuild = 重建器替身恒炸
 * （ERR_INDEX_STALE 实层素材）；absentDir = 知识目录非法（ERR_INVALID_KNOWLEDGE_DIR——
 * 路径为普通文件）。
 */
function realFixture(opts: { absentDir?: boolean; failRebuild?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-knrpc-'))
  dirs.push(home)
  const db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  const knowledgeDir = join(home, 'knowledge')
  if (opts.absentDir) {
    writeFileSync(join(home, 'absent'), '占位文件', 'utf8') // 路径为普通文件 → scan 前置门现行六码面
  } else {
    mkdirSync(knowledgeDir)
    // stage② v4：id 缺席不入实体表——夹具全部带 id（正本 frontmatter 契约）
    writeMd(knowledgeDir, '前端/框架选型.md', 'title: 框架选型\nid: kb-fe-framework\nsummary: 前端框架选型基线\nkeywords: [react, frontend]')
    writeMd(knowledgeDir, '前端/样式令牌.md', 'id: kb-fe-tokens\nsummary: 设计令牌与主题联动\nkeywords: [css, frontend]')
    writeMd(knowledgeDir, '后端/API规范.md', 'title: API 规范\nid: kb-be-api\nsummary: 接口设计规范\nkeywords: [api, backend]')
  }
  const projectId = 'p-knrpc'
  const dirUsed = opts.absentDir ? join(home, 'absent') : knowledgeDir
  const wsDir = join(home, 'ws')
  createKnowledgeRegistry(db).upsert(wsDir, dirUsed)

  // 结构面 ⊇ KnowledgeChannelService（search/readAbstract 在场但通道面不触及——双门分工）
  const service: BrowseKnowledgeService = createKnowledgeService({
    db,
    resolveWsPath: (id) => (id === projectId ? wsDir : undefined),
    ...(opts.failRebuild ? { rebuild: () => { throw new Error('重建器内部异常') } } : {}),
  })
  const { ipcMain, handlers } = fakeIpcMain()
  registerKnowledgeChannels(createForgeIpc(ipcMain), service)
  const call = (channel: string, payload?: unknown) => invoke(handlers, channel, payload)
  return { db, service, projectId, wsDir, knowledgeDir: dirUsed, call }
}

describe('3.5 AC1 实层：五通道真身实跑', () => {
  it('五通道全通：search 播种热度后 browse/listEntries/entryDetail/heat/sessionRecall typed 真值', async () => {
    const f = realFixture()
    // 播种：agent 面（search）写 recall_logs——heat/sessionRecall 数据源（单表同源）
    await f.service.search({ projectId: f.projectId, sessionId: 'sess-1', domainPrefix: '前端' })

    const browse = await f.call(KNOWLEDGE_CHANNELS.browse, { projectId: f.projectId })
    expect(browse).toEqual({
      ok: true,
      data: [
        { domainPath: '前端', label: '前端', depth: 1, entryCount: 2 },
        { domainPath: '后端', label: '后端', depth: 1, entryCount: 1 },
      ],
    })

    const list = await f.call(KNOWLEDGE_CHANNELS.listEntries, { projectId: f.projectId, domainPrefix: '前端', keyword: 'css' })
    expect(list).toMatchObject({ ok: true })
    expect((list as { data: KnowledgeCard[] }).data.map((c) => c.title)).toEqual(['样式令牌']) // 过滤参数端到端

    // entryDetail 用后端条目（实索引行 rowid——v4 entries 主键 = slug id，浏览面 entryId = rowid）
    const entries = f.db.prepare<unknown[], { rid: number; title: string }>(
      `SELECT rowid AS rid, title FROM knowledge_entries WHERE title = 'API 规范'`,
    ).all()
    const detail = await f.call(KNOWLEDGE_CHANNELS.entryDetail, { projectId: f.projectId, entryId: entries[0]!.rid })
    expect(detail).toMatchObject({ ok: true, data: { title: 'API 规范', body: '正文', domainPath: '后端' } })

    const heat = await f.call(KNOWLEDGE_CHANNELS.heat, { projectId: f.projectId })
    expect(heat).toMatchObject({ ok: true })
    const heatData = (heat as { data: Map<number, number> }).data
    expect(heatData.size).toBe(2) // 前端两卡各召回一次（后端 0 计不入 Map）
    expect([...heatData.values()].every((h) => h === 1)).toBe(true)

    const recall = await f.call(KNOWLEDGE_CHANNELS.sessionRecall, { projectId: f.projectId, sessionId: 'sess-1' })
    expect(recall).toMatchObject({ ok: true })
    const recallData = (recall as { data: RecallGroup[] }).data
    expect(recallData).toHaveLength(1) // 单 call 分组
    expect(recallData[0]).toMatchObject({ verb: 'search', hitCount: 2 })
    expect(recallData[0]!.hits.every((h) => h.heat === 1)).toBe(true) // 分组行热度徽章 = heat 同源
    f.db.close()
  })
})

describe('3.5 AC2 实层：知识域三码 typed error 过 RPC 边界保真', () => {
  it('ERR_ENTRY_NOT_FOUND：entryDetail 未命中 → 真类入信封（code/message/data 保真）', async () => {
    const f = realFixture()
    const envelope = (await f.call(KNOWLEDGE_CHANNELS.entryDetail, { projectId: f.projectId, entryId: 999999 })) as {
      ok: boolean
      error: { code: string; message: string; data: unknown }
    }
    expect(envelope).toEqual({
      ok: false,
      error: {
        code: 'ERR_ENTRY_NOT_FOUND',
        message: `知识条目未命中：projectId=${f.projectId} entryId=999999`,
        data: { projectId: f.projectId, entryId: 999999 },
      },
    })
    f.db.close()
  })

  it('ERR_INVALID_KNOWLEDGE_DIR：listEntries 目录非法（路径为普通文件——fix-39 后缺失态自愈）→ 真类入信封（静默重建失败按因透传）', async () => {
    const f = realFixture({ absentDir: true })
    const envelope = (await f.call(KNOWLEDGE_CHANNELS.listEntries, { projectId: f.projectId })) as {
      ok: boolean
      error: { code: string; message: string; data: unknown }
    }
    expect(envelope.ok).toBe(false)
    expect(envelope.error.code).toBe('ERR_INVALID_KNOWLEDGE_DIR')
    expect(envelope.error.message).toBe(`知识目录不可达或非法：${f.knowledgeDir}`)
    expect(envelope.error.data).toEqual({ knowledgeDir: f.knowledgeDir })
    f.db.close()
  })

  it('ERR_INDEX_STALE：静默重建失败（非目录因）→ 真类入信封（IndexStaleError 包装）', async () => {
    const f = realFixture({ failRebuild: true })
    const envelope = (await f.call(KNOWLEDGE_CHANNELS.listEntries, { projectId: f.projectId })) as {
      ok: boolean
      error: { code: string; message: string; data: Record<string, unknown> }
    }
    expect(envelope.ok).toBe(false)
    expect(envelope.error.code).toBe('ERR_INDEX_STALE')
    expect(envelope.error.message).toContain('索引缺失或过期')
    expect(envelope.error.data).toMatchObject({ projectId: f.projectId, reason: '重建器内部异常' })
    f.db.close()
  })
})
