// 集成自证（1.7 A2 服务切换后形态）—— tool 调用链穿透插件自有服务（自持库供数）
// 并落 recall_logs。宿主形态：临时 runtime 装配本插件（自持库 dbFile + 注册表种子 +
// config 静态绑定表）——零 core（SC-2 结构自证由 boundaries.test 钉）；断言：
// search → hits → 日志行（sessionRecall 服务面读回：search 命中行 + read-abstract 行，
// sessionId 分组）；真实链路 e2e（dogfood 模型）归 4.2。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from './storage/index.js'
import knowledgePlugin from './index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'
import type { EntryAbstract, SearchHit } from './service/index.js'
import type { BrowseKnowledgeService } from './service/index.js'

// ── 测试环境 ──

const tempRoots: string[] = []
const disposers: Array<() => void> = []

afterAll(() => {
  for (const d of disposers) d()
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** 临时装配：自持库 + 注册表种子（wsPath → knowledge_dir）+ 插件装配（静态绑定表） */
async function mount(corpus: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-int-'))
  tempRoots.push(root)
  const wsDir = join(root, 'ws')
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const [rel, body] of Object.entries(corpus)) {
    const target = join(knowledgeDir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }

  // ① 自持库 + 注册行（种子迁移径等价：wsPath canonical 键 → knowledge_dir）
  const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  registry.upsert(wsDir, knowledgeDir)

  // ② 插件装配（config 静态绑定表 = 两级解析第一级；tools/systemPrompt 桩捕获注册面；
  //    provide 捕获 'knowledge' 服务——host 桥面世消费面同构）
  const registeredTools: KnowledgeToolDefinition[] = []
  const sections: KnowledgePromptSection[] = []
  const provided = new Map<string, unknown>()
  const projectId = 'p-int-1'
  disposers.push(() => db.close())
  disposers.push(
    knowledgePlugin(
      {
        tools: { register: (d) => (registeredTools.push(d), () => undefined) },
        systemPrompt: { section: (s) => (sections.push(s), () => undefined) },
        reflect: {
          get: () => undefined,
          provide: (name: string, value: unknown) => (provided.set(name, value), () => provided.delete(name)),
        },
      },
      { dbFile: join(root, 'knowledge.db'), projects: [{ wsPath: wsDir, projectId }] },
    ),
  )
  const service = provided.get('knowledge') as BrowseKnowledgeService

  return {
    service,
    db,
    tools: registeredTools,
    sections,
    projectId,
    sessionId: 'sess-int-1',
    wsDir,
    knowledgeDir,
    exec: { agent: { session: { id: 'sess-int-1', header: { cwd: wsDir } } } },
  }
}

// ── 用例 ──

describe('tool 调用链穿透插件自有服务并落 recall_logs（集成自证——零 core）', () => {
  const CORPUS = {
    'backend/api-spec.md': '---\ntitle: API 规范\nid: kb-api\nstatus: confirmed\nsummary: 接口设计规范\nkeywords: [api, backend]\n---\n正文',
    'backend/auth.md': '---\ntitle: 认证基线\nid: kb-auth\nstatus: confirmed\nsummary: 会话与令牌认证基线\nkeywords: [api, security]\n---\n正文',
    'frontend/theme.md': '---\ntitle: 主题令牌\nsummary: 设计令牌与主题联动\nkeywords: [css, frontend]\n---\n正文',
  }

  it('search → hits（域前缀 + 关键词过滤，摘要先行）→ sessionRecall 读回 search 日志行', async () => {
    const { tools, service, projectId, sessionId, exec } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    if (search === undefined) throw new Error('knowledge_search 未注册')

    const hits = (await search.execute({ domain_prefix: 'backend', keywords: ['api'] }, exec)) as SearchHit[]
    expect(hits.length).toBe(2)
    expect(hits.every((h) => h.domainPath.startsWith('backend'))).toBe(true) // 域前缀过滤（场景④）
    expect(hits.map((h) => h.title).sort()).toEqual(['API 规范', '认证基线'])

    // 日志行读回（服务面单表同源）：本会话 search 分组 ≥1、命中快照展开、verb = search
    const groups = await service.sessionRecall({ projectId, sessionId })
    const searchGroups = groups.filter((g) => g.verb === 'search')
    expect(searchGroups.length).toBe(1)
    expect(searchGroups[0]?.hitCount).toBe(2)
    expect(searchGroups[0]?.hits.map((h) => h.title).sort()).toEqual(['API 规范', '认证基线'])
    expect(searchGroups[0]?.query).toMatchObject({ domainPrefix: 'backend', keywords: ['api'] })
  })

  it('read-abstract → EntryAbstract（不含正文）→ 同会话追加 read-abstract 日志行', async () => {
    const { tools, service, projectId, sessionId, exec } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    const readAbstract = tools.find((t) => t.name === 'knowledge_read_abstract')
    if (search === undefined || readAbstract === undefined) throw new Error('双 tool 未注册')

    const hits = (await search.execute({}, exec)) as SearchHit[]
    const target = hits.find((h) => h.frontmatterId === 'kb-api')
    if (target === undefined) throw new Error('语料命中缺失')

    const abstract = (await readAbstract.execute({ entry_id: target.entryId }, exec)) as EntryAbstract
    expect(abstract.title).toBe('API 规范')
    expect(abstract).not.toHaveProperty('body') // 场景⑤：不含正文

    const groups = await service.sessionRecall({ projectId, sessionId })
    const raGroup = groups.find((g) => g.verb === 'read-abstract')
    expect(raGroup).toBeDefined()
    expect(raGroup?.hitCount).toBe(1)
    expect(raGroup?.query).toMatchObject({ entryId: target.entryId })
    // agentic search 多步链留痕：同会话内 search 与 read-abstract 两组并存
    expect(groups.map((g) => g.verb).sort()).toEqual(['read-abstract', 'search'])
  })

  it('绑定缺席（cwd ≠ 任何绑定行）→ 可读失败，不落日志不炸链路', async () => {
    const { tools, service, projectId } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    if (search === undefined) throw new Error('knowledge_search 未注册')
    await expect(
      search.execute({}, { agent: { session: { id: 'sess-x', header: { cwd: 'C:\\definitely\\not\\bound' } } } }),
    ).rejects.toThrow(/not bound/)
    const groups = await service.sessionRecall({ projectId, sessionId: 'sess-x' })
    expect(groups).toHaveLength(0) // 失败于解析点，未触服务——无日志行
  })

  it('服务面未绑定 projectId（两级解析第一级缺席）→ fail-loud 裸错', async () => {
    const { service } = await mount(CORPUS)
    await expect(service.listEntries({ projectId: 'p-not-bound' })).rejects.toThrow(/项目不存在/)
  })
})
