// 5.1 备选通道单测（AC2）：forge.db 直插——core testutil 形制（openDatabase + 工作区迁移
// 序列参数化传入，零私有 schema SQL 拷贝）+ 派生目录单源 + core harness 种行同源复用 +
// proposals 种行。建库/迁移/种行/活写兼容（busy_timeout）四锚。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { deriveTaskStoreDir } from '../../../packages/core/src/forge/workspace/derive-dir.js'
import { forgeDbPath, openForgeDb, seedProposalRow } from './db-insert.js'
import { seedEdge, seedFeature, seedLink, seedRecord, seedTask } from './db-insert.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function freshPair(): { tasksHome: string; workspaceDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-replay-db-'))
  roots.push(root)
  return { tasksHome: join(root, 'forge-workspaces'), workspaceDir: join(root, 'ws', 'demo') }
}

describe('5.1 openForgeDb · core testutil 形制建库（派生目录单源）', () => {
  it('缺席建库：{tasksHome}/{flatten}@{hash8}/forge.db 落位 + 十表（M3 八域表）+ schema v1 + busy_timeout', () => {
    const { tasksHome, workspaceDir } = freshPair()
    const db = openForgeDb(tasksHome, workspaceDir)
    try {
      const expected = join(deriveTaskStoreDir(tasksHome, workspaceDir), 'forge.db')
      expect(forgeDbPath(tasksHome, workspaceDir)).toBe(expected)
      expect(existsSync(expected)).toBe(true)
      const tables = db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((r) => r.name)
      expect(tables).toEqual([
        'app_key_logs',
        'feature_documents',
        'feature_records',
        'features',
        'proposals',
        'schema_meta',
        'task_edges',
        'task_records',
        'task_session_links',
        'tasks',
      ])
      expect(db.prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      db.close()
    }
  })

  it('重复打开幂等（已建库直开不重迁移——app 在场同库共存）', () => {
    const { tasksHome, workspaceDir } = freshPair()
    const first = openForgeDb(tasksHome, workspaceDir)
    first.close()
    const second = openForgeDb(tasksHome, workspaceDir)
    try {
      expect(second.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM schema_meta`).get()?.c).toBe(1)
    } finally {
      second.close()
    }
  })
})

describe('5.1 直插种行 · core harness 同源 + proposals 补位', () => {
  function seeded(): { db: Database.Database; taskId: string } {
    const { tasksHome, workspaceDir } = freshPair()
    const db = openForgeDb(tasksHome, workspaceDir)
    const featureId = seedFeature(db, { slug: 'demo-feature' })
    const taskId = seedTask(db, 'demo-feature', '1')
    const taskId2 = seedTask(db, 'demo-feature', '2', { status: 'completed' })
    seedEdge(db, taskId2, taskId, 'manual')
    seedLink(db, taskId, 'sess-1')
    seedRecord(db, taskId, { verb: 'claim', digest: 'abc123def456' })
    expect(featureId).toBe('f-demo-feature')
    return { db, taskId }
  }

  it('features/tasks/edges/links/records 五表种行落位（直读可见）', () => {
    const { db, taskId } = seeded()
    try {
      expect(db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM features`).get()?.c).toBe(1)
      expect(db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM tasks`).get()?.c).toBe(2)
      expect(db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM task_edges`).get()?.c).toBe(1)
      expect(db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM task_session_links`).get()?.c).toBe(1)
      expect(db.prepare<unknown[], { digest: string | null }>(`SELECT dispatch_digest AS digest FROM task_records WHERE task_id = ?`).get(taskId)?.digest).toBe('abc123def456')
    } finally {
      db.close()
    }
  })

  it('seedProposalRow：全列受控初值（status/relPath/decidedAt/createdAt）', () => {
    const { db } = seeded()
    try {
      const id = seedProposalRow(db, { slug: 'demo-proposal', title: '提案', status: 'under-review', relPath: 'docs/proposals/demo/proposal.md' })
      const row = db
        .prepare<unknown[], { proposal_status: string; rel_path: string | null; decided_at: string | null }>(
          `SELECT proposal_status, rel_path, decided_at FROM proposals WHERE id = ?`,
        )
        .get(id)
      expect(row).toMatchObject({ proposal_status: 'under-review', rel_path: 'docs/proposals/demo/proposal.md', decided_at: null })
      expect(db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM proposals`).get()?.c).toBe(1)
    } finally {
      db.close()
    }
  })
})
