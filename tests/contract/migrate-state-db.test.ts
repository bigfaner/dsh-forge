// plugin-project 1.18 契约测试——一次性迁移脚本 scripts/migrate-state-db.mjs（真脚本子进程执行）。
// 判例库 fixture 快照入仓：fixtures/migrate-state-db/{state-db-fixture.sql, forge-db-fixture.sql}。
// 断言面（验收判据 4 + dba 圆桌处方全清单）：
//   ① projects 拆两表：实体行 + main 关系行，workspace_id 原值照搬，project_key = f(ws_path)；
//   ② 在场性对账：registry 缺席 → degraded + diag 留痕（禁删禁自动重挂——行照插）；
//   ③ bugs 搬行：行数/判例链抽样比对一致（recurrence 整链 / fixed·unresolved 两态 /
//      source_task_id 空·非空 / container_slug 空·非空 四类各预置）；
//   ④ project_key 回填失败 → 隔离区（原行 JSON 留档）；
//   ⑤ source_task_id 逐条核验失败 → 人工清单（原值照搬，禁置 NULL）；
//   ⑥ 幂等重跑安全（marker + NOT EXISTS——计数零漂移）；
//   ⑦ forge-workspaces 搬迁：staged copy + 文件数/字节/哈希校验 + 原目录改名保留 + 同卷断言。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveDirName } from '../../lib/path/src/index.js'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPT = join(REPO_ROOT, 'scripts', 'migrate-state-db.mjs')
const FIXTURES = join(REPO_ROOT, 'tests', 'contract', 'fixtures', 'migrate-state-db')

// 与 fixture SQL 逐字对齐的判例常量（ws_path 静态字面量——对账走 registry 快照，不依赖本机 fs）
const WS_ALPHA = 'C:\\ws\\alpha'
const WS_GAMMA = 'C:\\ws\\gamma'
const DIR_ALPHA = deriveDirName(WS_ALPHA)
const DIR_GAMMA = deriveDirName(WS_GAMMA)

const roots: string[] = []
function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'migrate-state-db-'))
  roots.push(home)
  return home
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function openFixtureDb(file: string, fixture: string): void {
  const db = new Database(file)
  db.pragma('foreign_keys = OFF') // b-gonesrc 判例 = 悬空 source_task_id（真实成因：tasks 行后被删）——夹具预置绕写时 FK
  db.exec(readFileSync(fixture, 'utf8'))
  db.close()
}

/** 隔离区判例库（broken-db：目录名不含 @hash8 后缀 → project_key 回填失败） */
function openQuarantineFixtureDb(file: string): void {
  const db = new Database(file)
  db.exec(`CREATE TABLE bugs (id TEXT PRIMARY KEY, summary TEXT NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  db.prepare(`INSERT INTO bugs (id, summary, reporter, created_at, updated_at) VALUES ('q-1', 'orphan bug', 'frank', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z')`).run()
  db.close()
}

/** 构造完整旧形态 home：state.db + forge-workspaces/{DIR_ALPHA, DIR_GAMMA, broken-db} + registry 快照 */
function buildLegacyHome(): string {
  const home = tmpHome()
  const wsRoot = join(home, 'forge-workspaces')
  mkdirSync(wsRoot, { recursive: true })
  openFixtureDb(join(home, 'state.db'), join(FIXTURES, 'state-db-fixture.sql'))
  for (const [i, dir] of [DIR_ALPHA, DIR_GAMMA].entries()) {
    mkdirSync(join(wsRoot, dir), { recursive: true })
    const file = join(wsRoot, dir, 'forge.db')
    openFixtureDb(file, join(FIXTURES, 'forge-db-fixture.sql'))
    if (i === 1) {
      // gamma 判例库：同 schema 独立 bug id（g-1）——多源搬行 + 跨 dir project_key 回填判例
      const db = new Database(file)
      db.exec(`DELETE FROM bugs`)
      db.prepare(
        `INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, bug_status, source_task_id, reporter, created_at, updated_at, container_slug)
         VALUES ('g-1', 'gamma bug', 'd', 't', 'e', 'a', 'open', 'task-b', 'grace', '2026-01-07T00:00:00Z', '2026-01-07T00:00:00Z', 'feat-b')`,
      ).run()
      db.close()
    }
  }
  mkdirSync(join(wsRoot, 'broken-db'), { recursive: true })
  openQuarantineFixtureDb(join(wsRoot, 'broken-db', 'forge.db'))
  // 搬迁校验判例文件（alpha 任务库内容）
  writeFileSync(join(wsRoot, DIR_ALPHA, 'notes.txt'), 'hello-migrate', 'utf8')
  // registry 在场性快照（ws-gone 刻意缺席 → beta degraded）
  writeFileSync(
    join(home, 'registry-snapshot.json'),
    JSON.stringify([{ id: 'ws-alpha', path: WS_ALPHA }, { id: 'ws-gamma', path: WS_GAMMA }]),
    'utf8',
  )
  return home
}

function runScript(home: string, extra: readonly string[] = []): string {
  return execFileSync(
    process.execPath,
    // --skip-task-loop：task-loop 搬行段 fixture 驱动测试归 plugins/task-loop/tests/migration/
    //（本 fixture 为 project 段最小合成 schema，不含 task-loop 搬行面列集——不在此混跑）
    [SCRIPT, '--home', home, '--registry', join(home, 'registry-snapshot.json'), '--skip-process-check', '--skip-task-loop', ...extra],
    { encoding: 'utf8', cwd: REPO_ROOT },
  )
}

function openProjectDb(home: string): Database.Database {
  return new Database(join(home, 'forge', 'db', 'project', 'project.db'))
}

function walkCount(root: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else {
        files += 1
        bytes += statSync(p).size
      }
    }
  }
  walk(root)
  return { files, bytes }
}

describe('migrate-state-db.mjs（plugin-project 1.18）', () => {
  it('① projects 拆两表 + ② degraded 对账 + ③④⑤ bugs 搬行四类判例 + 隔离区 + 人工清单', () => {
    const home = buildLegacyHome()
    runScript(home, ['--skip-workspaces'])

    const db = openProjectDb(home)
    // ① 实体行 + main 关系行，workspace_id 原值照搬，project_key = f(ws_path)
    const alpha = db.prepare(`SELECT * FROM project_projects WHERE id = 'proj-alpha'`).get() as { project_key: string; title: string }
    expect(alpha.project_key).toBe(DIR_ALPHA) // f(ws_path) 与 lib/path deriveDirName 同源
    expect(alpha.title).toBe('Alpha')
    const mainRow = db.prepare(`SELECT * FROM project_workspaces WHERE project_id = 'proj-alpha'`).get() as { workspace_id: string; ws_path: string; member_role: string }
    expect(mainRow.workspace_id).toBe('ws-alpha') // 原值照搬
    expect(mainRow.ws_path).toBe(WS_ALPHA)
    expect(mainRow.member_role).toBe('main')
    // ① 字段承袭（gamma：归档 + 手动排序）
    const gamma = db.prepare(`SELECT * FROM project_projects WHERE id = 'proj-gamma'`).get() as { archived: number; sort_order: number | null }
    expect(gamma.archived).toBe(1)
    expect(gamma.sort_order).toBe(2)

    // ② degraded：ws-gone 不在 registry → 行照插（禁删）+ diag warn 留痕
    const beta = db.prepare(`SELECT * FROM project_projects WHERE id = 'proj-beta'`).get() as { project_key: string }
    expect(beta.project_key).toBe(deriveDirName('C:\\ws\\beta'))
    const betaMain = db.prepare(`SELECT workspace_id FROM project_workspaces WHERE project_id = 'proj-beta'`).get() as { workspace_id: string }
    expect(betaMain.workspace_id).toBe('ws-gone') // 禁自动重挂——原弱引用值保留
    const diag = readFileSync(join(home, 'forge', 'db', 'project', 'migrate-state-db-diag.log'), 'utf8')
    expect(diag).toContain('"level":"warn"')
    expect(diag).toContain('degraded')
    expect(diag).toContain('proj-beta')

    // ③ bugs 搬行：行数一致（alpha 5 行 + gamma 1 行全部迁入）+ 判例链抽样
    const bugs = db.prepare(`SELECT * FROM project_bugs ORDER BY id`).all() as Array<Record<string, unknown>>
    expect(bugs).toHaveLength(6)
    const byId = new Map(bugs.map((b) => [b.id as string, b]))
    for (const b of bugs) {
      expect(b.project_key).toBe(b.id === 'g-1' ? DIR_GAMMA : DIR_ALPHA) // project_key 回填（映射自 state.db ws_path）
    }
    // 判例① recurrence 整链
    expect(byId.get('b-child')?.recurrence_of).toBe('b-root')
    expect(byId.get('b-grand')?.recurrence_of).toBe('b-child')
    // 判例② 两态
    expect(byId.get('b-child')?.bug_status).toBe('fixed')
    expect(byId.get('b-child')?.commit_hash).toBe('c0ffee01')
    expect(byId.get('b-grand')?.bug_status).toBe('unresolved')
    expect(byId.get('b-grand')?.unresolved_reason).toBe('三次复现修不好')
    // 判例③④ 空·非空
    expect(byId.get('b-nosrc')?.source_task_id).toBeNull()
    expect(byId.get('b-root')?.source_task_id).toBe('task-a')
    expect(byId.get('b-nosrc')?.container_slug).toBeNull()
    expect(byId.get('b-root')?.container_slug).toBe('feat-a')
    // ⑤ source_task_id 核验失败：人工清单 + 原值照搬禁置 NULL
    expect(byId.get('b-gonesrc')?.source_task_id).toBe('task-gone')
    const manual = readFileSync(join(home, 'forge', 'db', 'project', 'migrate-manual-review.md'), 'utf8')
    expect(manual).toContain('b-gonesrc (source_task_id)')
    expect(manual).not.toContain('b-root (source_task_id)') // 在场引用不进清单

    // ④ 隔离区：project_key 回填失败（broken-db 目录名无 @hash8）
    const q = db.prepare(`SELECT * FROM project_bugs_quarantine WHERE id = 'q-1'`).get() as { reason: string; row_json: string }
    expect(q.reason).toBe('project-key-derive-failed')
    expect(JSON.parse(q.row_json)).toMatchObject({ id: 'q-1', summary: 'orphan bug' })
    expect(db.prepare(`SELECT count(*) AS c FROM project_bugs WHERE id = 'q-1'`).get()).toMatchObject({ c: 0 })

    // staged/原子替换：staged 中间物已清、幂等标记在场
    expect(existsSync(join(home, 'forge', 'db', 'project', 'project.db.staged-migrate'))).toBe(false)
    const markers = db.prepare(`SELECT step FROM project_migrate_state ORDER BY step`).all()
    expect(markers.map((m) => (m as { step: string }).step)).toEqual(['bugs-move', 'projects-split'])
    db.close()
  })

  it('⑥ 幂等重跑安全：全计数零漂移 + marker 跳过', () => {
    const home = buildLegacyHome()
    runScript(home, ['--skip-workspaces'])
    const counts = (): { projects: number; workspaces: number; bugs: number; quarantine: number } => {
      const db = openProjectDb(home)
      const c = {
        projects: (db.prepare(`SELECT count(*) AS c FROM project_projects`).get() as { c: number }).c,
        workspaces: (db.prepare(`SELECT count(*) AS c FROM project_workspaces`).get() as { c: number }).c,
        bugs: (db.prepare(`SELECT count(*) AS c FROM project_bugs`).get() as { c: number }).c,
        quarantine: (db.prepare(`SELECT count(*) AS c FROM project_bugs_quarantine`).get() as { c: number }).c,
      }
      db.close()
      return c
    }
    const before = counts()
    const out = runScript(home, ['--skip-workspaces']) // 重跑
    const after = counts()
    expect(after).toEqual(before) // 计数零漂移
    expect(out).toContain('跳过')
    const manual = readFileSync(join(home, 'forge', 'db', 'project', 'migrate-manual-review.md'), 'utf8')
    expect(manual.match(/b-gonesrc/g)).toHaveLength(1) // 人工清单去重
  })

  it('⑦ forge-workspaces 目录搬迁：staged 校验 + 原目录改名保留 + 同卷 + 重跑跳过', () => {
    const home = buildLegacyHome()
    runScript(home, ['--skip-workspaces']) // 先完成 db 面（bugs 搬行以 workspaces 源为输入）
    const from = join(home, 'forge-workspaces')
    const to = join(home, 'forge', 'workspaces')
    const srcStat = walkCount(from)

    const out = runScript(home) // 搬迁
    expect(existsSync(to)).toBe(true)
    expect(walkCount(to)).toEqual(srcStat) // 文件数/字节一致
    expect(existsSync(`${to}.staged-migrate`)).toBe(false)
    const kept = readdirSync(home).filter((n) => n.startsWith('forge-workspaces.pre-migrate-'))
    expect(kept).toHaveLength(1) // 原目录改名保留
    expect(existsSync(from)).toBe(false)
    const manifest = JSON.parse(readFileSync(join(home, 'forge', 'db', 'project', 'migrate-workspaces-manifest.json'), 'utf8')) as {
      fileCount: number
      totalBytes: number
    }
    expect(manifest.fileCount).toBe(srcStat.files)
    expect(manifest.totalBytes).toBe(srcStat.bytes)
    expect(out).toContain('搬迁完成')

    // 同卷断言 + 重跑安全（marker 在场 → 跳过，不再搬迁）
    const out2 = runScript(home)
    expect(out2).not.toContain('搬迁完成')
    expect(readdirSync(home).filter((n) => n.startsWith('forge-workspaces.pre-migrate-'))).toHaveLength(1)
  })

  it('⑧ 旧谱系 bugs 表列缺席（无 recurrence_of/container_slug）→ named 绑定键齐全迁入 NULL（真机 005 轮回归判例）', () => {
    const home = tmpHome()
    const wsRoot = join(home, 'forge-workspaces')
    const dir = deriveDirName('C:\\ws\\legacy')
    mkdirSync(join(wsRoot, dir), { recursive: true })
    const db = new Database(join(wsRoot, dir, 'forge.db'))
    // 旧谱系 schema：无 recurrence_of / container_slug 列
    db.exec(`CREATE TABLE bugs (
      id TEXT PRIMARY KEY, summary TEXT NOT NULL, bug_desc TEXT, trigger_desc TEXT, expected TEXT, actual TEXT,
      suspected TEXT, error_type TEXT, bug_status TEXT NOT NULL, commit_hash TEXT, worktree TEXT, branch TEXT,
      unresolved_reason TEXT, source_task_id TEXT, report_session_id TEXT, fix_session_id TEXT, reporter TEXT,
      fixer TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, fix_approach TEXT)`)
    db.prepare(
      `INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, bug_status, source_task_id, reporter, created_at, updated_at)
       VALUES ('lg-1', 'legacy bug', 'd', 't', 'e', 'a', 'open', NULL, 'old', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    ).run()
    db.close()
    writeFileSync(
      join(home, 'registry-snapshot.json'),
      JSON.stringify([{ id: 'ws-legacy', path: 'C:\\ws\\legacy' }]),
      'utf8',
    )
    const out = runScript(home, ['--skip-task-loop', '--skip-workspaces'])
    expect(out).not.toContain('Missing named parameter')
    const conn = openProjectDb(home)
    const row = conn.prepare(`SELECT * FROM project_bugs WHERE id = 'lg-1'`).get() as Record<string, unknown>
    expect(row.summary).toBe('legacy bug')
    expect(row.recurrence_of).toBeNull()
    expect(row.container_slug).toBeNull()
    conn.close()
  })
})
