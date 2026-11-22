// 分域版本线（R3-dba「锚域不锚表集合」——bug e62f3458 机制处方）：
// domain 选项下 schema_meta / migration_digests 行按域隔离，版本门只判读本域版本线；
// 旧全局单版本线库升级走整表重建 + 指纹认领（指纹缺失库走空指纹兜底）。
// 临时库执行（vitest，Node 直跑 better-sqlite3）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from '@dsh-forge/lib-db'
import { openDatabase, type Migration } from './open.js'

let dir: string
let seq = 0
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-db-domain-'))), `shared-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** 极简域迁移序列构造（v1 单语句建一张 `${prefix}_t` 表 + 锚表——与插件迁移形态同构）。 */
function singleMigrations(prefix: string): Migration[] {
  return [
    {
      version: 1,
      statements: [
        `CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS ${prefix}_t (id TEXT PRIMARY KEY)`,
      ],
    },
  ]
}

/** 模拟异域先行抬升的共库初态：旧形状 schema_meta 预置异域 v1/v2 行 + 对应指纹行。 */
function seedForeignDomain(file: string): void {
  const db = new Database(file)
  try {
    db.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`)
    db.exec(`CREATE TABLE migration_digests (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)`)
    db.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(1, '2026-01-01T00:00:00.000Z')
    db.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(2, '2026-01-02T00:00:00.000Z')
    db.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(1, 'foreign-digest-v1')
    db.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(2, 'foreign-digest-v2')
  } finally {
    db.close()
  }
}

describe('分域版本线（domain 选项）', () => {
  it('共库预置异域高版本行（v2 > 本域上限 1）→ 本域照常开库建表，异域行不动（bug e62f3458 回归锚）', () => {
    const file = dbPath()
    seedForeignDomain(file)
    const db = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1, domain: 'alpha' })
    try {
      db.prepare(`INSERT INTO alpha_t (id) VALUES ('r1')`).run()
      const rows = db
        .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta ORDER BY domain, version`)
        .all()
      expect(rows).toEqual([
        { domain: '', version: 1 },
        { domain: '', version: 2 },
        { domain: 'alpha', version: 1 },
      ])
    } finally {
      db.close()
    }
    // 重开幂等：本域版本线 = 1，不重复迁移
    const again = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1, domain: 'alpha' })
    expect(again.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM alpha_t`).get()?.n).toBe(1)
    again.close()
  })

  it('本域版本超上限仍拒开（域内版本门不放松——真实损坏/新库拒开语义保留）', () => {
    const file = dbPath()
    const db = openDatabase(file, { migrations: singleMigrations('beta'), schemaVersion: 1, domain: 'beta' })
    db.prepare(`INSERT INTO schema_meta VALUES ('beta', 2, '2026-01-01T00:00:00.000Z')`).run()
    db.close()
    expect(() =>
      openDatabase(file, { migrations: singleMigrations('beta'), schemaVersion: 1, domain: 'beta' }),
    ).toThrowError(/schema 版本 2/)
  })

  it('两域同版本号共库共存（复合主键 domain+version 不冲突）', () => {
    const file = dbPath()
    const a = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1, domain: 'alpha' })
    a.close()
    const b = openDatabase(file, { migrations: singleMigrations('gamma'), schemaVersion: 1, domain: 'gamma' })
    b.close()
    const raw = new Database(file)
    try {
      const rows = raw
        .prepare<unknown[], { domain: string }>(`SELECT DISTINCT domain FROM schema_meta WHERE domain != '' ORDER BY domain`)
        .all()
      expect(rows.map((r) => r.domain)).toEqual(['alpha', 'gamma'])
    } finally {
      raw.close()
    }
  })

  it('旧全局单版本线单装库升级：指纹认领归位本域，零重迁移（行数据保留）', () => {
    const file = dbPath()
    // 先以非 domain 模式开库（旧形状 schema_meta + 全局指纹行——旧线单装库初态）
    const legacy = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1 })
    legacy.prepare(`INSERT INTO alpha_t (id) VALUES ('legacy-row')`).run()
    legacy.close()
    // 以 domain 模式重开：重建 + 指纹认领 → 本域版本线 = 1，不重迁移、行保留
    const db = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1, domain: 'alpha' })
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM alpha_t`).get()?.n).toBe(1)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta WHERE domain='alpha'`).get()?.v).toBe(1)
    } finally {
      db.close()
    }
  })

  it('无指纹历史库升级：空指纹兜底按版本号归位（迁移脚本直建库初态）', () => {
    const file = dbPath()
    const raw = new Database(file)
    try {
      raw.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`)
      raw.exec(`CREATE TABLE alpha_t (id TEXT PRIMARY KEY)`)
      raw.prepare(`INSERT INTO schema_meta VALUES (1, '2026-01-01T00:00:00.000Z')`).run()
      raw.prepare(`INSERT INTO alpha_t VALUES ('script-row')`).run()
    } finally {
      raw.close()
    }
    const db = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1, domain: 'alpha' })
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM alpha_t`).get()?.n).toBe(1)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta WHERE domain='alpha'`).get()?.v).toBe(1)
    } finally {
      db.close()
    }
  })

  it('缺席 domain 选项 = 全局单版本线既有语义零变化', () => {
    const file = dbPath()
    const db = openDatabase(file, { migrations: singleMigrations('alpha'), schemaVersion: 1 })
    try {
      const cols = (db.pragma(`table_info('schema_meta')`) as Array<{ name: string }>).map((c) => c.name)
      expect(cols).toEqual(['version', 'applied_at'])
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v).toBe(1)
    } finally {
      db.close()
    }
  })
})
