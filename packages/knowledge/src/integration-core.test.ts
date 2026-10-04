// 3.4 集成自证（AC4）—— tool 调用链穿透 core 服务并落 recall_logs。
// 宿主形态（Implementation Notes）：临时 Cordis runtime 装配 core 真身（corePlugin 源码
// 相对引入，host 测试同型豁免——生产面 knowledge 禁 import core）+ 本插件；断言：
// search → hits → 日志行（sessionRecall 服务面读回：search 命中行 + read-abstract 行，
// sessionId 分组）；真实链路 e2e（dogfood 模型）归 4.2。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// core 源码相对引入（测试面专用）；插件生产面仅依赖 forgeKnowledge 服务类型（AC3）
import corePlugin from '../../core/src/service.js'
import type { CoreContextFace } from '../../core/src/service.js'
import knowledgePlugin from './index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'
import type { EntryAbstract, KnowledgeService, ProjectService, SearchHit } from '@dsh-forge/contracts'

// ── 测试环境 ──

const tempRoots: string[] = []
const disposers: Array<() => void> = []

afterAll(() => {
  for (const d of disposers) d()
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true })
})

/** dsh workspaceRegistry 桩（corePlugin inject 面——create 幂等语义最小实现） */
function registryStub() {
  const rows = new Map<string, { id: string; path: string }>()
  return {
    list: () => [...rows.values()],
    get: (id: string) => rows.get(id),
    create: async (path: string) => {
      for (const w of rows.values()) if (w.path === path) return w
      const w = { id: randomUUID(), path }
      rows.set(w.id, w)
      return w
    },
    delete: async (id: string) => rows.delete(id),
  }
}

/** 临时 runtime 夹具：core 真身（双服务）+ 真实注册链落 projects 行 + 插件装配 */
async function mount(corpus: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn3x-'))
  tempRoots.push(root)
  const wsDir = join(root, 'ws')
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const [rel, body] of Object.entries(corpus)) {
    const target = join(knowledgeDir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }

  // ① core 真身装配（真 SQLite 句柄 + reflect.provide 双服务）
  const provided = new Map<string, unknown>()
  const coreCtx: CoreContextFace = {
    workspaceRegistry: registryStub(),
    workspaceController: { rename: async () => ({}) }, // fix-24 ② 桩（标题对齐面——本域不消费返回）
    reflect: { provide: (name: string, value: unknown) => void provided.set(name, value) },
  }
  disposers.push(corePlugin(coreCtx, { dbFile: join(root, 'state.db') }))
  const forgeProjects = provided.get('forgeProjects') as ProjectService
  const forgeKnowledge = provided.get('forgeKnowledge') as KnowledgeService

  // ② 真实注册链路落 projects 行（四步补偿链真身；绑定表数据源）
  const registered = await forgeProjects.registerProject({
    workspaceDir: wsDir,
    name: 'demo',
    forgeDir: join(wsDir, '.forge'),
    knowledgeDir,
  })
  void forgeKnowledge.rebuildIndex(registered.projectId) // better-sqlite3 全同步，调用即落库

  // ③ 插件装配（绑定表 = 注册结果；tools/systemPrompt 桩捕获注册面）
  const registeredTools: KnowledgeToolDefinition[] = []
  const sections: KnowledgePromptSection[] = []
  disposers.push(
    knowledgePlugin(
      {
        forgeKnowledge,
        tools: { register: (d) => (registeredTools.push(d), () => undefined) },
        systemPrompt: { section: (s) => (sections.push(s), () => undefined) },
      },
      { projects: [{ wsPath: wsDir, projectId: registered.projectId }] },
    ),
  )
  return {
    forgeKnowledge,
    tools: registeredTools,
    sections,
    projectId: registered.projectId,
    sessionId: 'sess-int-1',
    wsDir,
    exec: { agent: { session: { id: 'sess-int-1', header: { cwd: wsDir } } } },
  }
}

// ── 用例 ──

describe('AC4 tool 调用链穿透 core 服务并落 recall_logs（集成自证）', () => {
  const CORPUS = {
    'backend/api-spec.md': '---\ntitle: API 规范\nid: kb-api\nsummary: 接口设计规范\nkeywords: [api, backend]\n---\n正文',
    'backend/auth.md': '---\ntitle: 认证基线\nid: kb-auth\nsummary: 会话与令牌认证基线\nkeywords: [api, security]\n---\n正文',
    'frontend/theme.md': '---\ntitle: 主题令牌\nsummary: 设计令牌与主题联动\nkeywords: [css, frontend]\n---\n正文',
  }

  it('search → hits（域前缀 + 关键词过滤，摘要先行）→ sessionRecall 读回 search 日志行', async () => {
    const { tools, forgeKnowledge, projectId, sessionId, exec } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    if (search === undefined) throw new Error('knowledge_search 未注册')

    const hits = (await search.execute({ domain_prefix: 'backend', keywords: ['api'] }, exec)) as SearchHit[]
    expect(hits.length).toBe(2)
    expect(hits.every((h) => h.domainPath.startsWith('backend'))).toBe(true) // 域前缀过滤（场景④）
    expect(hits.map((h) => h.title).sort()).toEqual(['API 规范', '认证基线'])

    // 日志行读回（服务面单表同源）：本会话 search 分组 ≥1、命中快照展开、verb = search
    const groups = await forgeKnowledge.sessionRecall({ projectId, sessionId })
    const searchGroups = groups.filter((g) => g.verb === 'search')
    expect(searchGroups.length).toBe(1)
    expect(searchGroups[0]?.hitCount).toBe(2)
    expect(searchGroups[0]?.hits.map((h) => h.title).sort()).toEqual(['API 规范', '认证基线'])
    expect(searchGroups[0]?.query).toMatchObject({ domainPrefix: 'backend', keywords: ['api'] })
  })

  it('read-abstract → EntryAbstract（不含正文）→ 同会话追加 read-abstract 日志行', async () => {
    const { tools, forgeKnowledge, projectId, sessionId, exec } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    const readAbstract = tools.find((t) => t.name === 'knowledge_read_abstract')
    if (search === undefined || readAbstract === undefined) throw new Error('双 tool 未注册')

    const hits = (await search.execute({}, exec)) as SearchHit[]
    const target = hits.find((h) => h.frontmatterId === 'kb-api')
    if (target === undefined) throw new Error('语料命中缺失')

    const abstract = (await readAbstract.execute({ entry_id: target.entryId }, exec)) as EntryAbstract
    expect(abstract.title).toBe('API 规范')
    expect(abstract).not.toHaveProperty('body') // 场景⑤：不含正文

    const groups = await forgeKnowledge.sessionRecall({ projectId, sessionId })
    const raGroup = groups.find((g) => g.verb === 'read-abstract')
    expect(raGroup).toBeDefined()
    expect(raGroup?.hitCount).toBe(1)
    expect(raGroup?.query).toMatchObject({ entryId: target.entryId })
    // agentic search 多步链留痕：同会话内 search 与 read-abstract 两组并存
    expect(groups.map((g) => g.verb).sort()).toEqual(['read-abstract', 'search'])
  })

  it('绑定缺席（cwd ≠ 任何注册工作区）→ 可读失败，不落日志不炸链路', async () => {
    const { tools, forgeKnowledge, projectId } = await mount(CORPUS)
    const search = tools.find((t) => t.name === 'knowledge_search')
    if (search === undefined) throw new Error('knowledge_search 未注册')
    await expect(
      search.execute({}, { agent: { session: { id: 'sess-x', header: { cwd: 'C:\\definitely\\not\\bound' } } } }),
    ).rejects.toThrow(/not bound/)
    const groups = await forgeKnowledge.sessionRecall({ projectId, sessionId: 'sess-x' })
    expect(groups).toHaveLength(0) // 失败于解析点，未触服务——无日志行
  })
})
