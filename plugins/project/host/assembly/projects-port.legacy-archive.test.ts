// fix-3 B 面（bug 897ad81a）RED 锚：主 home legacy project.db（schema_meta domain='' v1 +
// 旧指纹）开库退兜底 → forgeProjectsController 不注册。修口断言面：legacy 窗口库识别 →
// 只读归档（.legacy-<ts>，不删不改）→ 新库重建开库成功（本域版本线 1 在座）。
import { mkdtempSync, existsSync, mkdirSync, readdirSync, chmodSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from '@dsh-forge/lib-db'
import { openReadonlyDatabase } from '@dsh-forge/lib-db'
import { isLegacyWindowDb, openDomainDb } from '../db/connection.js'
import { openProjectsDomainDb } from './projects-port.js'

const cleanups: string[] = []
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hif-fix3-legacy-'))
  cleanups.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of cleanups) {
    try {
      for (const f of readdirSync(dir, { recursive: true })) {
        const p = join(dir, f as string)
        if (statSync(p, { throwIfNoEntry: false })?.isFile()) chmodSync(p, 0o666)
      }
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch {
      // Windows 只读归档位清理竞态——tmp 残留无害（系统临时区自清理），不红测试
    }
  }
})

/** legacy 窗口库夹具（主 home 实测形态逐位：本域表在座 + schema_meta domain='' v1 + 旧指纹） */
function seedLegacyWindowDb(file: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.exec(`CREATE TABLE project_projects (
    id TEXT PRIMARY KEY,
    project_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    forge_dir TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`)
  db.exec(`CREATE TABLE schema_meta (
    domain TEXT NOT NULL,
    version INTEGER NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (domain, version)
  )`)
  db.exec(`CREATE TABLE migration_digests (
    domain TEXT NOT NULL,
    version INTEGER NOT NULL,
    digest TEXT NOT NULL,
    PRIMARY KEY (domain, version)
  )`)
  db.prepare(`INSERT INTO schema_meta (domain, version, applied_at) VALUES ('', 1, '2026-11-11T06:10:06.766Z')`).run()
  db.prepare(`INSERT INTO migration_digests (domain, version, digest) VALUES ('', 1, 'e71a719e594c890347437785a0f58f3dd5a942eba689cf9238a1064ebf7e04')`).run()
  db.prepare(`INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at) VALUES ('p1', 'k1', '旧库项目', 'd', 't', 't')`).run()
  db.close()
}

describe('isLegacyWindowDb（legacy 窗口库签名判定）', () => {
  it('domain 版本线 0 + project_* 表在座 = legacy；缺失文件/现役库 = 非 legacy', () => {
    const home = tempHome()
    const file = join(home, 'forge', 'db', 'project', 'project.db')
    expect(isLegacyWindowDb(file)).toBe(false) // 文件不存在
    seedLegacyWindowDb(file)
    expect(isLegacyWindowDb(file)).toBe(true) // legacy 签名命中
    const current = join(home, 'forge', 'db', 'project', 'current.db')
    openDomainDb(home, { prefix: 'project', file: current }) // 现役库（domain='project' v1）
    expect(isLegacyWindowDb(current)).toBe(false)
  })
})

describe('openProjectsDomainDb legacy 归档重建缝（bug 897ad81a）', () => {
  it('legacy 窗口库 → 归档（.legacy-<ts> 在盘可读、含种子行）+ 新库重建开库成功', () => {
    const home = tempHome()
    const file = join(home, 'forge', 'db', 'project', 'project.db')
    seedLegacyWindowDb(file)
    const diagLines: string[] = []
    const domain = openProjectsDomainDb(home, undefined, (line) => diagLines.push(line))
    // 新库重建：本域版本线 1 在座（ migrations 已应用）
    const v = domain.db.prepare<unknown[], { v: number | null }>('SELECT MAX(version) AS v FROM schema_meta WHERE domain = ?').get('project')
    expect(v?.v).toBe(1)
    // 归档在盘、只读、种子行可读（旧事实不删不改——提案「迁移复制输出语义」）
    const archived = readdirSync(join(home, 'forge', 'db', 'project')).filter(
      (n) => n.startsWith('project.db.legacy-') && !n.endsWith('-wal') && !n.endsWith('-shm'),
    )
    expect(archived).toHaveLength(1)
    const archivedFile = join(home, 'forge', 'db', 'project', archived[0]!)
    expect((statSync(archivedFile).mode & 0o200)).toBe(0) // 只读位（owner write 清零）
    const legacy = openReadonlyDatabase(archivedFile)
    const row = legacy.prepare(`SELECT title FROM project_projects WHERE id = 'p1'`).get() as { title: string }
    expect(row.title).toBe('旧库项目')
    legacy.close()
    expect(diagLines.join('\n')).toContain('legacy')
  })

  it('现役库正常开库零归档（无 .legacy- 残留）', () => {
    const home = tempHome()
    openProjectsDomainDb(home)
    const names = readdirSync(join(home, 'forge', 'db', 'project'))
    expect(names.some((n) => n.includes('.legacy-'))).toBe(false)
    expect(existsSync(join(home, 'forge', 'db', 'project', 'project.db'))).toBe(true)
  })
})
