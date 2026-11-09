// 1.18 服务面 limit 截断与召回落账同源 pin：q.limit 携带时 admitted 全量只落前 limit 行
// （recall_logs 该 call_id 命中行数 = 返回 hits 数——工具出参与落账双层一致）；
// q.limit 缺省 = 服务面不截断（legacy 可选语义保留，截断责任在调用方）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let service: BrowseKnowledgeService
let db: import('better-sqlite3').Database
const projectId = 'p-limit-pin'
const ADMITTED = 19

const entryMd = (i: number): string =>
  `---\ntitle: limitpin ${i}\nid: kb-limitpin-${i}\nstatus: confirmed\nsummary: limitpin 截断语料条目 ${i}\nkeywords: [limitpin]\n---\n正文 ${i}`

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-limitpin-'))
  const wsDir = join(home, 'ws')
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(join(knowledgeDir, 'pin'), { recursive: true })
  for (let i = 0; i < ADMITTED; i += 1) {
    writeFileSync(join(knowledgeDir, 'pin', `e${i}.md`), entryMd(i), 'utf8')
  }
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir, projectId)
  service = createKnowledgeService({ db, resolveWsPath: () => wsDir })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const hitRowsOf = (callId: string): Record<string, unknown>[] =>
  (db.prepare(`SELECT entry_id FROM knowledge_recall_logs WHERE call_id = ? AND entry_id IS NOT NULL`).all(callId) as Record<string, unknown>[])

describe('search 服务面 limit 截断与召回落账同源（1.18）', () => {
  it('q.limit=3：admitted 19 条只返回 3 条、只落 3 行（落账 hits ≤ limit）', async () => {
    const hits = await service.search({ projectId, sessionId: 's-pin', text: 'limitpin', callId: 'call-limit-pin-1', limit: 3 })
    expect(hits).toHaveLength(3)
    const rows = hitRowsOf('call-limit-pin-1')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r['entry_id']).sort()).toEqual(hits.map((h) => h.entryId).sort())
  })

  it('q.limit=5：显式 limit 透传生效（返回与落账同步放大）', async () => {
    const hits = await service.search({ projectId, sessionId: 's-pin', text: 'limitpin', callId: 'call-limit-pin-2', limit: 5 })
    expect(hits).toHaveLength(5)
    expect(hitRowsOf('call-limit-pin-2')).toHaveLength(5)
  })

  it('q.limit 缺省：服务面不截断——admitted 全量落账（legacy 可选语义保留）', async () => {
    const hits = await service.search({ projectId, sessionId: 's-pin', text: 'limitpin', callId: 'call-limit-pin-3' })
    expect(hits).toHaveLength(ADMITTED)
    expect(hitRowsOf('call-limit-pin-3')).toHaveLength(ADMITTED)
  })
})
