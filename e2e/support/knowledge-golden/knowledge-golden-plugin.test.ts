// knowledge-stage1-foundation 1.7 —— A2 服务切换后 golden 对照：插件服务面（自持库供数）
// 通道响应与 fixture（core 迁移前现役供数录制）逐通道结构等价比对（SC-8：
// 供数切换前后「契约与响应形状零变化」）。供数装配 = 插件域同构（自持库 + 注册表种子 +
// 两级解析 config 静态绑定表）；通道分发镜像 knowledge-rpc.ts 注册行 1:1（harness 共用）。
// stage④（knowledge-stage4-recall-scope 1.9 脚本任务）：readAbstract/read slug 身份键 +
// 词面 text + recallFeedback 第七通道——对照面 = legacy fixture（browse/entryDetail/heat，
// stage④ 形状零变化）+ stage④ overlay（listEntries/sessionRecall/recallFeedback，
// fixtures/stage4/——契约正本 J1/J2/J3 §1，实现落地后录制复核锚值回填）。
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
const STAGE4_FIXTURES_DIR = join(FIXTURES_DIR, 'stage4')

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
    // v4：entries 全局 slug id 键——entryId = rowid（getEntryDetail 按行键取）
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

/** read 调用行 rowid（confirmed 条目——recallFeedback 对照的合法作用行） */
function feedbackTargetRowId(): number {
  const row = db
    .prepare(
      `SELECT rowid AS rid FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ? AND verb = 'read' ORDER BY rowid LIMIT 1`,
    )
    .get(projectId, GOLDEN_SESSION_ID) as { rid: number } | undefined
  if (row === undefined) throw new Error('read 调用行未落账')
  return row.rid
}

// ── 对照：fixture（core 现役录制）↔ 插件服务面实时响应，逐通道结构等价 ──

describe('SC-8 golden ↔ 插件服务面（A2 切换后）结构等价比对', () => {
  it('九法在位自证：插件服务面全集（迁移后供数形态）', () => {
    for (const method of ['rebuildIndex', 'search', 'read', 'readAbstract', 'listEntries', 'getEntryDetail', 'heatByEntry', 'sessionRecall', 'browse', 'recallFeedback']) {
      expect(typeof (service as Record<string, unknown>)[method], `knowledge.${method}`).toBe('function')
    }
  })

  it('通道全量：自持库供数响应与 fixture 逐通道结构等价（切换零形状变化）', async () => {
    // 召回场景落账（stage④ 词面/身份面：text 词面 + slug 键 read/readAbstract +
    // browseEntries 页内锚——sessionRecall/recallFeedback 典型载荷数据面）
    await service.rebuildIndex(projectId)
    void service.search({ projectId, domainPrefix: '前端', text: 'api', sessionId: GOLDEN_SESSION_ID })
    void service.readAbstract({ projectId, id: 'kb-fe-001', sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId, text: '不存在的词', sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId, text: 'api', sessionId: GOLDEN_SESSION_ID })
    void service.browseEntries({ projectId, domain: '后端', offset: 0, limit: 20, order: 'status', sessionId: GOLDEN_SESSION_ID })
    void service.read({ projectId, id: 'kb-fe-001', sessionId: GOLDEN_SESSION_ID })
    // v7 热度终式对齐（stage④ 1.3——判例 293aecba/44bd7579 夹具同步）：过程动词零计热，
    // heat 通道形状（4 组 [entryId, heat] 数值对）由采纳事件（verb='read'，score 1.0）直插承载。
    const insertRead = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, hit_count, score, created_at)
       VALUES (?, ?, 'golden-heat-seed', 'read', ?, ?, 1, 1.0, '2026-01-01T00:00:00Z')`,
    )
    for (const [title, count] of [['框架选型', 1], ['样式令牌', 2], ['API 规范', 1], ['网关', 1]] as const) {
      const rowid = entryIdByTitle(title)
      for (let i = 0; i < count; i += 1) insertRead.run(projectId, `golden-read-${title}-${i}`, rowid, title)
    }

    const requests: Record<string, GoldenChannelRequest> = {
      [KNOWLEDGE_CHANNELS.browse]: { projectId },
      [KNOWLEDGE_CHANNELS.listEntries]: { projectId, domainPrefix: '后端' },
      [KNOWLEDGE_CHANNELS.entryDetail]: { projectId, entryId: entryIdByTitle('框架选型') },
      [KNOWLEDGE_CHANNELS.heat]: { projectId },
      [KNOWLEDGE_CHANNELS.sessionRecall]: { projectId, sessionId: GOLDEN_SESSION_ID },
      [KNOWLEDGE_CHANNELS.recallFeedback]: { projectId, action: 'row', rowId: feedbackTargetRowId(), feedback: 1 },
    }
    // legacy fixture（browse/entryDetail/heat——stage④ 形状零变化）+ stage④ overlay
    //（listEntries/sessionRecall/recallFeedback——契约正本 J1/J2/J3 §1）
    const stage4Overlay: readonly string[] = [
      KNOWLEDGE_CHANNELS.listEntries,
      KNOWLEDGE_CHANNELS.sessionRecall,
      KNOWLEDGE_CHANNELS.recallFeedback,
    ]
    for (const channel of [
      KNOWLEDGE_CHANNELS.browse,
      KNOWLEDGE_CHANNELS.listEntries,
      KNOWLEDGE_CHANNELS.entryDetail,
      KNOWLEDGE_CHANNELS.heat,
      KNOWLEDGE_CHANNELS.sessionRecall,
      KNOWLEDGE_CHANNELS.recallFeedback,
    ]) {
      const fixture = stage4Overlay.includes(channel)
        ? loadGoldenFixture(STAGE4_FIXTURES_DIR, channel)
        : loadGoldenFixture(FIXTURES_DIR, channel)
      const raw = await invokeGoldenChannel(channel, service, requests[channel]!)
      const response = channel === KNOWLEDGE_CHANNELS.heat
        ? [...(raw as Map<number, number>).entries()].sort((a, b) => a[0] - b[0])
        : raw
      expect(() => assertSameStructure(fixture.response, response), `${channel} 结构比对`).not.toThrow()
    }
  })
})
