// busy_timeout 开库钉（bug 65e7a104 H-B）：openDatabase 打开的连接 busy_timeout 回读 =
// BUSY_TIMEOUT_MS——外部连接持写锁（BEGIN IMMEDIATE）期间写者排队等持有者落盘，
// 而非即时 SQLITE_BUSY 失败误触发补偿链。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BUSY_TIMEOUT_MS, openDatabase } from './open.js'

let dir: string

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('busy_timeout 开库 PRAGMA（65e7a104 H-B）', () => {
  it('openDatabase 打开的连接：PRAGMA busy_timeout 回读 = BUSY_TIMEOUT_MS', () => {
    dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-db-busy-'))
    const db = openDatabase(join(dir, 'busy-timeout.db'))
    try {
      expect(db.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS)
    } finally {
      db.close()
    }
  })
})
