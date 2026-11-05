// A2 并发纪律单测（总纲 §2.10）：BEGIN IMMEDIATE 短事务（事务内可见 inTransaction、
// 抛错回滚）+ rebuild 单飞（进程内 mutex——同键串行不重叠、异键并行、失败不毒化队列）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSingleFlightMutex, withImmediateTransaction } from './concurrency.js'
import { openKnowledgeDatabase } from './open.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-concurrency-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe('BEGIN IMMEDIATE 短事务', () => {
  it('fn 内处于写事务（BEGIN IMMEDIATE 取 RESERVED 锁），出口闭合', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      let inTx = false
      withImmediateTransaction(db, () => {
        inTx = db.inTransaction
      })
      expect(inTx).toBe(true)
      expect(db.inTransaction).toBe(false)
    } finally {
      db.close()
    }
  })

  it('fn 抛错整体回滚（原子边界——半写不落库）', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      expect(() =>
        withImmediateTransaction(db, () => {
          db.prepare(`INSERT INTO knowledge_registry (ws_path, knowledge_dir, created_at, updated_at) VALUES ('x', 'y', '1', '1')`).run()
          throw new Error('boom')
        }),
      ).toThrow('boom')
      expect(db.prepare(`SELECT COUNT(*) AS c FROM knowledge_registry`).get()).toEqual({ c: 0 })
      expect(db.inTransaction).toBe(false)
    } finally {
      db.close()
    }
  })

  it('并发写者跨句柄提交不丢失（双句柄各一事务——busy_timeout PRAGMA 值钉在 open.test）', () => {
    const file = join(tmpRoot(), 'knowledge.db')
    const a = openKnowledgeDatabase(file)
    const b = openKnowledgeDatabase(file)
    try {
      withImmediateTransaction(a, () => dbInsert(a, 'a-1'))
      withImmediateTransaction(b, () => dbInsert(b, 'b-1'))
      const rows = a.prepare(`SELECT ws_path FROM knowledge_registry ORDER BY ws_path`).all() as Array<{ ws_path: string }>
      expect(rows.map((r) => r.ws_path)).toEqual(['a-1', 'b-1'])
    } finally {
      a.close()
      b.close()
    }
  })
})

function dbInsert(db: Parameters<typeof withImmediateTransaction>[0], ws: string): void {
  db.prepare(`INSERT INTO knowledge_registry (ws_path, knowledge_dir, created_at, updated_at) VALUES (?, 'd', '1', '1')`).run(ws)
}

describe('rebuild 单飞（进程内 mutex）', () => {
  it('同键并发串行（临界区零重叠）：后入等先出', async () => {
    const mutex = createSingleFlightMutex()
    let active = 0
    let maxActive = 0
    const job = () =>
      mutex.run('rebuild:ws-1', async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 15))
        active -= 1
      })
    await Promise.all([job(), job(), job()])
    expect(maxActive).toBe(1) // 单飞：任一时点至多一个在临界区
  })

  it('异键并行（键粒度互斥不扩大到全局）', async () => {
    const mutex = createSingleFlightMutex()
    let active = 0
    let maxActive = 0
    const job = (key: string) =>
      mutex.run(key, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 15))
        active -= 1
      })
    await Promise.all([job('rebuild:ws-1'), job('rebuild:ws-2')])
    expect(maxActive).toBe(2)
  })

  it('前驱失败不毒化队列：后续同键调用正常执行', async () => {
    const mutex = createSingleFlightMutex()
    const first = mutex.run('k', async () => {
      throw new Error('first-fails')
    })
    await expect(first).rejects.toThrow('first-fails')
    await expect(mutex.run('k', async () => 'ok')).resolves.toBe('ok')
  })
})
