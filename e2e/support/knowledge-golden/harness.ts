// knowledge-stage1-foundation 1.3 —— forge:knowledge/* 五通道 golden 载荷录制/比对 harness。
// 定位：e2e 支撑件（纯 Node 面，e2e-support vitest 池）——SC-8「契约与响应形状零变化」的
// 唯一断言载体。录制时点 = 任何供数切换前：core 现役供数（packages/core
// createKnowledgeService → ctx.forgeKnowledge，迁移前形态）在位断言 + 五通道
// （KNOWLEDGE_CHANNELS 全集）典型载荷捕获。
// 通道分发镜像 apps/host/src/ipc/knowledge-rpc.ts 的注册行 1:1（browse/listEntries/
// entryDetail/heat/sessionRecall → 服务法调用同形）；通道响应载荷 = 通道 handler 的域
// 返回体（RpcResult 信封为全通道统一外层，不属域载荷，不录入）。
// 依赖口径：core/contracts 一律相对源引（e2e/support/replay/db-insert.ts 先例）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { KnowledgeChannel } from '../../../packages/contracts/src/channels.js'
import { openDatabase } from '../../../packages/core/src/db/index.js'
import { createKnowledgeService } from '../../../packages/core/src/knowledge/knowledge-service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/index.js'

/** golden 语料（六条目 / 三域 + 根域；全部显式 updated——录制/比对确定性口径） */
export interface GoldenCorpusEntry {
  relPath: string
  frontmatter: string
  body?: string
}

export const GOLDEN_CORPUS: readonly GoldenCorpusEntry[] = [
  {
    relPath: '前端/框架选型.md',
    frontmatter: [
      'title: 框架选型', 'id: kb-fe-001', 'status: published',
      'summary: 前端框架选型基线', 'keywords: [react, frontend]',
      'updated: "2026-01-15T00:00:00.000Z"',
    ].join('\n'),
  },
  {
    relPath: '前端/样式令牌.md',
    frontmatter: 'summary: 设计令牌与主题联动\nkeywords: [css, frontend]\nupdated: "2026-01-20T00:00:00.000Z"',
  },
  {
    relPath: '后端/API规范.md',
    frontmatter: [
      'title: API 规范', 'id: kb-be-001', 'status: draft', 'authors: 平台组',
      'summary: 接口设计规范', 'keywords: [api, backend]',
      'updated: "2026-02-01T00:00:00.000Z"',
    ].join('\n'),
    body: '正文-接口细则',
  },
  { relPath: '后端/网关.md', frontmatter: 'summary: API 网关路由规则\nkeywords: [api, backend]\nupdated: "2026-02-05T00:00:00.000Z"' },
  { relPath: '编程/java/并发手册.md', frontmatter: 'summary: Java 并发实践\nkeywords: [java, concurrency]\nupdated: "2026-02-10T00:00:00.000Z"' },
  { relPath: '指南.md', frontmatter: 'summary: 新手指引\nkeywords: [guide]\nupdated: "2026-01-01T00:00:00.000Z"' },
]

/** 召回场景会话 id（sessionRecall/heat 典型载荷的确定性分组键） */
export const GOLDEN_SESSION_ID = 'golden-sess-1'

/** core 供数在位断言面（第八法全集——迁移前现役 core 供数形状） */
const CORE_SUPPLY_METHODS = [
  'browse', 'getEntryDetail', 'heatByEntry', 'listEntries',
  'readAbstract', 'rebuildIndex', 'search', 'sessionRecall',
] as const

/** 挂载产物：core 供数服务 + 库 + 项目 id + 条目 id 解析 */
export interface GoldenMount {
  service: BrowseKnowledgeService
  db: Database.Database
  projectId: string
  knowledgeDir: string
  /** title → entryId（detail 请求载荷确定性解析——不依赖 SQLite 自增次序） */
  entryIdByTitle: (title: string) => number
  dispose: () => void
}

/**
 * 挂载 core 现役供数（迁移前形态）：临时 SQLite（openDatabase 迁移即建表）+ golden 语料
 * + projects 行直插 + createKnowledgeService 八法服务 + 召回场景落账。
 */
export async function mountGoldenSupply(home: string): Promise<GoldenMount> {
  const db = openDatabase(join(home, 'state.db'))
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const entry of GOLDEN_CORPUS) {
    const abs = join(knowledgeDir, ...entry.relPath.split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, `---\n${entry.frontmatter}\n---\n${entry.body ?? '正文'}`, 'utf8')
  }
  const projectId = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
  ).run(projectId, randomUUID(), 'C:\\golden-ws', 'golden', join(home, '.forge'), knowledgeDir, now, now)

  const service = createKnowledgeService({ db })

  // 录制时点断言：core 供数在位（第八法全集 + 索引可重建）——迁移前现役形态的机械自证。
  await assertCoreSupplyInPlace(service, db, projectId)

  // 召回场景（agent 面动词落账——heat/sessionRecall 典型载荷的数据面）：
  // search 前端（2 命中）/ readAbstract 框架选型 / 零命中哨兵 / text search api（2 命中）。
  const 框架选型Id = entryIdOf(db, projectId, '框架选型')
  void service.search({ projectId, domainPrefix: '前端', sessionId: GOLDEN_SESSION_ID })
  void service.readAbstract({ projectId, entryId: 框架选型Id, sessionId: GOLDEN_SESSION_ID })
  void service.search({ projectId, keywords: ['不存在的词'], sessionId: GOLDEN_SESSION_ID })
  void service.search({ projectId, text: 'api', sessionId: GOLDEN_SESSION_ID })

  return {
    service,
    db,
    projectId,
    knowledgeDir,
    entryIdByTitle: (title) => entryIdOf(db, projectId, title),
    dispose: () => db.close(),
  }
}

/** core 供数在位断言（录制时点）：第八法全集在场 + 索引重建成功（六条目全入索引） */
export async function assertCoreSupplyInPlace(service: BrowseKnowledgeService, db: Database.Database, projectId: string): Promise<void> {
  for (const method of CORE_SUPPLY_METHODS) {
    if (typeof service[method] !== 'function') {
      throw new Error(`core 供数不在位：forgeKnowledge 缺方法 ${method}（迁移前现役形态断言失败）`)
    }
  }
  const report = await service.rebuildIndex(projectId)
  if (report.indexed !== GOLDEN_CORPUS.length || report.skipped !== 0) {
    throw new Error(`core 供数不在位：索引重建 ${JSON.stringify(report)}（预期六条目全入索引）`)
  }
  const n = (db.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE project_id = ?').get(projectId) as { n: number }).n
  if (n !== GOLDEN_CORPUS.length) throw new Error(`core 供数不在位：knowledge_entries ${n} 行`)
}

function entryIdOf(db: Database.Database, projectId: string, title: string): number {
  const row = db
    .prepare('SELECT id FROM knowledge_entries WHERE project_id = ? AND title = ?')
    .get(projectId, title) as { id: number } | undefined
  if (row === undefined) throw new Error(`条目不在索引：${title}`)
  return row.id
}

/** 通道典型请求载荷（entryId 经 title 确定性解析） */
export type GoldenChannelRequest = Record<string, unknown> & { projectId: string }

export function goldenRequests(mount: GoldenMount): Record<KnowledgeChannel, GoldenChannelRequest> {
  return {
    [KNOWLEDGE_CHANNELS.browse]: { projectId: mount.projectId },
    [KNOWLEDGE_CHANNELS.listEntries]: { projectId: mount.projectId, domainPrefix: '后端' },
    [KNOWLEDGE_CHANNELS.entryDetail]: { projectId: mount.projectId, entryId: mount.entryIdByTitle('框架选型') },
    [KNOWLEDGE_CHANNELS.heat]: { projectId: mount.projectId },
    [KNOWLEDGE_CHANNELS.sessionRecall]: { projectId: mount.projectId, sessionId: GOLDEN_SESSION_ID },
  }
}

/** 通道分发（镜像 knowledge-rpc.ts 注册行 1:1——通道名 → 服务法调用同形） */
export async function invokeGoldenChannel(
  channel: KnowledgeChannel,
  service: BrowseKnowledgeService,
  request: GoldenChannelRequest,
): Promise<unknown> {
  switch (channel) {
    case KNOWLEDGE_CHANNELS.browse:
      return service.browse({ projectId: request.projectId as string })
    case KNOWLEDGE_CHANNELS.listEntries:
      return service.listEntries({
        projectId: request.projectId as string,
        ...(request.domainPrefix !== undefined ? { domainPrefix: request.domainPrefix as string } : {}),
      })
    case KNOWLEDGE_CHANNELS.entryDetail:
      return service.getEntryDetail({ projectId: request.projectId as string, entryId: request.entryId as number })
    case KNOWLEDGE_CHANNELS.heat:
      return service.heatByEntry(request.projectId as string)
    case KNOWLEDGE_CHANNELS.sessionRecall:
      return service.sessionRecall({ projectId: request.projectId as string, sessionId: request.sessionId as string })
  }
}

/**
 * 捕获单通道响应载荷（JSON 化）：heat Map → [entryId, count] 升序数组（Map 不可序列化，
 * 序列化形制即 golden 记录形制）。返回 { request, response } —— request 为实际发出的请求。
 */
export async function captureChannelPayload(
  channel: KnowledgeChannel,
  mount: GoldenMount,
): Promise<{ request: GoldenChannelRequest; response: unknown }> {
  const request = goldenRequests(mount)[channel]
  const raw = await invokeGoldenChannel(channel, mount.service, request)
  const response = channel === KNOWLEDGE_CHANNELS.heat
    ? [...(raw as Map<number, number>).entries()].sort((a, b) => a[0] - b[0])
    : raw
  return { request, response }
}

/** 五通道全集捕获（录制与比对共用同一入口——同源口径） */
export async function captureAllChannels(mount: GoldenMount): Promise<Array<{ channel: KnowledgeChannel; request: GoldenChannelRequest; response: unknown }>> {
  const out: Array<{ channel: KnowledgeChannel; request: GoldenChannelRequest; response: unknown }> = []
  for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
    const { request, response } = await captureChannelPayload(channel, mount)
    out.push({ channel, request, response })
  }
  return out
}
