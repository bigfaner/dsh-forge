// knowledge-stage1-foundation 1.7 —— A2 服务切换后 golden 对照：插件服务面（自持库供数）
// 五通道响应与 1.3 fixture（core 迁移前现役供数录制）逐通道结构等价比对（SC-8：
// 供数切换前后「契约与响应形状零变化」）。供数装配 = 插件域同构（自持库 + 注册表种子 +
// 两级解析 config 静态绑定表）；通道分发镜像 knowledge-rpc.ts 注册行 1:1（harness 共用）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import type Database from 'better-sqlite3'
import { GOLDEN_CORPUS, GOLDEN_SESSION_ID, invokeGoldenChannel } from './harness.js'
import type { GoldenChannelRequest } from './harness.js'
import { assertSameStructure, loadGoldenFixture } from './compare.js'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

// ── 插件供数装配（迁移后形态：自持库 + 注册行 + config 静态绑定表） ──

let home: string
let db: Database.Database
let service: BrowseKnowledgeService
let projectId: string
let wsDir: string
let entryIdByTitle: (title: string) => number

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kgolden-plug-'))
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const entry of GOLDEN_CORPUS) {
    const abs = join(knowledgeDir, ...entry.relPath.split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, `---\n${entry.frontmatter}\n---\n${entry.body ?? '正文'}`, 'utf8')
  }
  wsDir = join(home, 'ws')
  projectId = 'p-golden-plugin'
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir)
  service = createKnowledgeService({
    db,
    resolveWsPath: (id) => (id === projectId ? wsDir : undefined),
  })
  entryIdByTitle = (title: string) => {
    // v4：entries 全局 slug id 键——entryId = rowid（readAbstract/getEntryDetail 按行键取）
    const row = db
      .prepare(`SELECT rowid AS id FROM knowledge_entries WHERE title = ?`)
      .get(title) as { id: number } | undefined
    if (row === undefined) throw new Error(`条目不在索引：${title}`)
    return row.id
  }
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

// ── 对照：fixture（core 现役录制）↔ 插件服务面实时响应，逐通道结构等价 ──

describe('SC-8 golden ↔ 插件服务面（A2 切换后）结构等价比对', () => {
  it('八法在位自证：插件服务面全集（迁移后供数形态）', () => {
    for (const method of ['rebuildIndex', 'search', 'readAbstract', 'listEntries', 'getEntryDetail', 'heatByEntry', 'sessionRecall', 'browse']) {
      expect(typeof (service as Record<string, unknown>)[method], `knowledge.${method}`).toBe('function')
    }
  })

  it('五通道全量：自持库供数响应与 core 录制 fixture 逐通道结构等价（切换零形状变化）', async () => {
    // 召回场景落账（harness.mountGoldenSupply 同序：search 前端 / readAbstract 框架选型 /
    // 零命中哨兵 / text search api——heat/sessionRecall 典型载荷数据面）
    await service.rebuildIndex(projectId)
    void service.search({ projectId, domainPrefix: '前端', sessionId: GOLDEN_SESSION_ID })
    void service.readAbstract({ projectId, entryId: entryIdByTitle('框架选型'), sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId, keywords: ['不存在的词'], sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId, text: 'api', sessionId: GOLDEN_SESSION_ID })

    const requests: Record<string, GoldenChannelRequest> = {
      [KNOWLEDGE_CHANNELS.browse]: { projectId },
      [KNOWLEDGE_CHANNELS.listEntries]: { projectId, domainPrefix: '后端' },
      [KNOWLEDGE_CHANNELS.entryDetail]: { projectId, entryId: entryIdByTitle('框架选型') },
      [KNOWLEDGE_CHANNELS.heat]: { projectId },
      [KNOWLEDGE_CHANNELS.sessionRecall]: { projectId, sessionId: GOLDEN_SESSION_ID },
    }
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      const fixture = loadGoldenFixture(FIXTURES_DIR, channel)
      const raw = await invokeGoldenChannel(channel, service, requests[channel]!)
      const response = channel === KNOWLEDGE_CHANNELS.heat
        ? [...(raw as Map<number, number>).entries()].sort((a, b) => a[0] - b[0])
        : raw
      expect(() => assertSameStructure(fixture.response, response), `${channel} 结构比对`).not.toThrow()
    }
  })
})
