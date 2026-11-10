// state.db 拆行搬库 + forge-workspaces 目录搬迁——一次性迁移脚本（plugin-project 1.18）。
//
// 职责（proposal plugin-project 验收判据 4 + dba 圆桌处方全清单）：
//   ① 旧 state.db projects 行拆两表：实体行（project_projects）+ main 关系行（project_workspaces），
//      workspace_id 原值照搬 + 在场性对账（--registry 快照 JSON；缺席 → fallback ws_path 目录存在性），
//      消失 → degraded + emitDiag 留痕，禁删禁自动重挂（交 reconcile 运行期消化）。
//   ② 旧工作区库（forge.db）bugs 表搬行进 project_bugs：
//      · project_key 回填（dirName ↔ state.db ws_path 映射；孤目录名 `{flatten}@{hash8}` 自证），
//        回填失败 → 隔离区表 project_bugs_quarantine（原行 JSON 全量留档，禁丢弃）；
//      · source_task_id 逐条核验（ATTACH 旧库查 tasks 表），失败 → 人工清单（禁置 NULL，原值照搬）；
//      · recurrence_of 链闭合校验（迁移全集内查前驱），断链 → 人工清单（原值照搬）。
//   ③ 存量 {home}/forge-workspaces/ 目录搬迁：staged copy + 文件数/字节/哈希校验 +
//      原目录改名保留 + 同卷断言（staged 与目标同卷 → rename 原子）。
//   ④ 前置：dsh-forge-dev / dsh-forge 双进程持句柄检查（任一在场即中止）。
//
// 幂等（dba 处方「staged 临时 + NOT EXISTS + 原子改名」）：
//   · project.db 写入全程走 staged 快照（VACUUM INTO）→ 单事务搬行 → 计数/判例链复验 →
//     原子替换（原库先改名保留，WAL 侧车随旧文件清除）；
//   · project_migrate_state 标记表记录每步 fingerprint，已完成且源未变 → 跳过；
//   · 行级 NOT EXISTS 守卫（id 已在场跳过）——标记缺失也不会写重。
//
// 用法：
//   node scripts/migrate-state-db.mjs [--home <DSH_HOME>] [--registry <snapshot.json>]
//        [--workspaces-to <dir>] [--skip-db] [--skip-workspaces] [--skip-process-check]
// 诊断：JSONL 追加 {home}/forge/db/project/migrate-state-db-diag.log（emitDiag 等价面——
// 脚本态无 cordis ctx，落盘 JSONL + stdout；字段与 DIAG_EVENT 同形）。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// ── better-sqlite3 解析（根 node_modules → packages/core 闭包——pnpm 非提升兜底） ──
function loadBetterSqlite3() {
  const require = createRequire(import.meta.url)
  const candidates = ['better-sqlite3', resolve('packages/core/node_modules/better-sqlite3')]
  for (const c of candidates) {
    try {
      return require(c)
    } catch {
      /* 下一个候选 */
    }
  }
  throw new Error('better-sqlite3 无法解析（根与 packages/core 均缺席）')
}

// ── 归属键派生（单源锚 = lib/path/src/derive-dir.ts deriveDirName——flatten@hash8 逐字同算法） ──
function normalizeDirSpelling(path) {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}
function flattenWorkspacePath(workspaceDir) {
  return normalizeDirSpelling(workspaceDir).replace(/^([A-Za-z]):/, '$1').replaceAll('\\', '-')
}
function hash8OfPath(workspaceDir) {
  return createHash('sha256').update(workspaceDir, 'utf8').digest('hex').slice(0, 8)
}
/** 项目归属键 = f(ws_path) = `{flatten}@{hash8}`（project_workspaces main 行路径纯函数投影）。 */
function projectKeyOf(wsPath) {
  return `${flattenWorkspacePath(wsPath)}@${hash8OfPath(wsPath)}`
}
/** 工作区库目录名自证（`{flatten}@{hash8}` 名制——孤目录名可直接充当 project_key）。 */
const DIR_NAME_RE = /^[^@]+@[0-9a-f]{8}$/

// ── CLI ──
function parseArgs(argv) {
  const args = {
    home: process.env.DSH_FORGE_HOME ?? join(homedir(), 'AppData', 'Roaming', 'dsh-forge'),
    registry: null,
    workspacesTo: null,
    skipDb: false,
    skipWorkspaces: false,
    skipProcessCheck: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--home') args.home = resolve(argv[++i])
    else if (a === '--registry') args.registry = resolve(argv[++i])
    else if (a === '--workspaces-to') args.workspacesTo = resolve(argv[++i])
    else if (a === '--skip-db') args.skipDb = true
    else if (a === '--skip-workspaces') args.skipWorkspaces = true
    else if (a === '--skip-process-check') args.skipProcessCheck = true
    else throw new Error(`未知参数：${a}`)
  }
  args.stateDb = join(args.home, 'state.db')
  args.projectDbDir = join(args.home, 'forge', 'db', 'project')
  args.projectDb = join(args.projectDbDir, 'project.db')
  args.workspacesFrom = join(args.home, 'forge-workspaces')
  args.workspacesTo = args.workspacesTo ?? join(args.home, 'forge', 'workspaces')
  return args
}

// ── 诊断（emitDiag 等价面：DIAG_EVENT 同形 JSONL 落盘 + stdout） ──
let diagFile = null
function emitDiag(level, event, message, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, message, ...data })
  console.log(`[${level}] ${event}: ${message}`)
  if (diagFile !== null) appendFileSync(diagFile, line + '\n', 'utf8')
}

// ── 前置：dsh-forge-dev / dsh-forge 双进程持句柄检查（精确进程名，禁通配——AGENTS §2 判例） ──
function assertNoHostProcesses() {
  for (const image of ['dsh-forge-dev.exe', 'dsh-forge.exe']) {
    const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    const out = r.stdout ?? ''
    if (out.toLowerCase().includes(image.toLowerCase())) {
      throw new Error(`检测到宿主进程 ${image} 在场（持 state.db/forge.db 句柄）——请先退出 dsh-forge 应用后重试`)
    }
  }
}

// ── SQLite 帮手 ──
function tableColumns(db, table) {
  return new Set(db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name))
}
function hasTable(db, table) {
  return db.prepare(`SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name = ?`).get(table).c > 0
}
/** 旧行列值读取（谱系宽容：后加列缺席 → NULL）。 */
function readLegacyRow(columns, row) {
  const out = {}
  for (const c of Object.keys(row)) out[c] = columns.has(c) ? row[c] : null
  return out
}

// project.db 新线 v1 DDL（单源锚 = plugins/project/host/db/migrations.ts makeProjectMigrations('project')——
// 脚本态无 TS 编译面，逐字镜像；快照锚测试 pin-金 sample 断言两侧等价）。
function ensureProjectSchema(db) {
  const t = { projects: 'project_projects', workspaces: 'project_workspaces', bugs: 'project_bugs' }
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ${t.projects} (
    id                   TEXT PRIMARY KEY,
    project_key          TEXT NOT NULL UNIQUE,
    title                TEXT NOT NULL,
    forge_dir            TEXT NOT NULL,
    forge_dir_external   INTEGER NOT NULL DEFAULT 0 CHECK (forge_dir_external IN (0, 1)),
    worktree_dir         TEXT NOT NULL DEFAULT '',
    sort_order           INTEGER DEFAULT NULL,
    archived             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ${t.workspaces} (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id           TEXT NOT NULL REFERENCES ${t.projects}(id) ON DELETE CASCADE,
    workspace_id         TEXT NOT NULL,
    ws_path              TEXT NOT NULL,
    member_role          TEXT NOT NULL CHECK (member_role IN ('main', 'worktree')),
    bound_at             TEXT NOT NULL,
    created_at           TEXT NOT NULL,
    UNIQUE (project_id, member_role, ws_path),
    UNIQUE (ws_path)
)`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_workspaces_main ON ${t.workspaces}(project_id) WHERE member_role = 'main'`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_workspaces_ws ON ${t.workspaces}(workspace_id, project_id)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ${t.bugs} (
    id                 TEXT PRIMARY KEY,
    project_key        TEXT NOT NULL,
    summary            TEXT NOT NULL,
    bug_desc           TEXT NOT NULL,
    trigger_desc       TEXT NOT NULL,
    expected           TEXT NOT NULL,
    actual             TEXT NOT NULL,
    suspected          TEXT,
    error_type         TEXT,
    bug_status         TEXT NOT NULL DEFAULT 'open'
                       CHECK (bug_status IN ('open', 'fixed', 'unresolved')),
    commit_hash        TEXT,
    worktree           TEXT,
    branch             TEXT,
    unresolved_reason  TEXT,
    fix_approach       TEXT,
    source_task_id     TEXT,
    recurrence_of      TEXT,
    container_slug     TEXT,
    report_session_id  TEXT,
    fix_session_id     TEXT,
    fixer              TEXT,
    reporter           TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_bugs_status ON ${t.bugs}(bug_status, created_at)`)
  db.exec(`CREATE TABLE IF NOT EXISTS project_bugs_quarantine (
    id              TEXT PRIMARY KEY,
    reason          TEXT NOT NULL,
    source_db       TEXT NOT NULL,
    row_json        TEXT NOT NULL,
    quarantined_at  TEXT NOT NULL
)`)
  db.exec(`CREATE TABLE IF NOT EXISTS project_migrate_state (
    step          TEXT PRIMARY KEY,
    fingerprint   TEXT NOT NULL,
    done_at       TEXT NOT NULL,
    summary_json  TEXT NOT NULL
)`)
  return t
}

// ── ① projects 拆两表（实体行 + main 关系行，同事务双写——R4 语义） ──
function migrateProjects(db, stateDb, presenceOf) {
  if (!existsSync(stateDb)) {
    emitDiag('info', 'project-migrate', 'state.db 缺席——projects 拆行跳过')
    return { skipped: true }
  }
  const t = { projects: 'project_projects', workspaces: 'project_workspaces' }
  const legacy = openExclusive(stateDb)
  let rows
  try {
    if (!hasTable(legacy, 'projects')) return { skipped: true }
    const cols = tableColumns(legacy, 'projects')
    rows = legacy
      .prepare(`SELECT * FROM projects ORDER BY created_at ASC, id ASC`)
      .all()
      .map((r) => readLegacyRow(cols, r))
  } finally {
    legacy.close()
  }

  const degraded = []
  const inserted = []
  const apply = db.transaction(() => {
    const hasEntity = db.prepare(`SELECT 1 FROM ${t.projects} WHERE id = ?`)
    for (const r of rows) {
      if (hasEntity.get(r.id) !== undefined) continue // NOT EXISTS 幂等守卫
      const wsPath = r.ws_path
      const projectKey = projectKeyOf(wsPath)
      db.prepare(
        `INSERT INTO ${t.projects} (id, project_key, title, forge_dir, forge_dir_external, worktree_dir, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(r.id, projectKey, r.name, r.forge_dir, r.forge_dir_external, r.worktree_dir ?? '', r.sort_order ?? null, r.archived, r.created_at, r.updated_at)
      // main 关系行：workspace_id 原值照搬（弱引用——registry 行消失 ≠ id 失效）
      db.prepare(
        `INSERT INTO ${t.workspaces} (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
         VALUES (?, ?, ?, 'main', ?, ?)`,
      ).run(r.id, r.workspace_id, wsPath, r.created_at, r.created_at)
      inserted.push(r.id)
      // 在场性对账：消失 → degraded + emitDiag（禁删禁自动重挂——行照插，交 reconcile 运行期消化）
      if (!presenceOf(r.workspace_id, wsPath)) {
        degraded.push({ projectId: r.id, workspaceId: r.workspace_id, wsPath })
        emitDiag('warn', 'project-migrate', `workspace 在场性对账失败（degraded）：项目 ${r.id} 的 workspace_id ${r.workspace_id}（${wsPath}）不在 registry——行已照搬，禁删禁自动重挂`, {
          projectId: r.id,
          workspaceId: r.workspace_id,
          wsPath,
          disposition: 'degraded——交 reconcile 运行期消化',
        })
      }
    }
  })
  apply()
  return { skipped: false, total: rows.length, inserted, degraded }
}

// ── ② bugs 搬行（ATTACH 旧库逐条核验 + 隔离区 + 人工清单） ──

function migrateBugs(db, workspacesFrom, dirNameToWsPath, nowIso) {
  const t = { bugs: 'project_bugs', quarantine: 'project_bugs_quarantine' }
  if (!existsSync(workspacesFrom)) {
    emitDiag('info', 'project-migrate', `forge-workspaces 缺席（${workspacesFrom}）——bugs 搬行跳过`)
    return { skipped: true }
  }
  const dirs = readdirSync(workspacesFrom, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  // 迁移全集 bug id（recurrence 链闭合校验域——含已迁行，重跑幂等）
  const knownBugIds = new Set(db.prepare(`SELECT id FROM ${t.bugs}`).all().map((r) => r.id))

  const quarantined = []
  const manualList = [] // {bugId, sourceDb, field, value, reason}
  const moved = []
  const apply = db.transaction(() => {
    for (const dirName of dirs) {
      const forgeDb = join(workspacesFrom, dirName, 'forge.db')
      if (!existsSync(forgeDb)) continue
      // project_key 回填：state.db ws_path 映射优先；孤目录名 `{flatten}@{hash8}` 自证兜底；
      // 两者皆不可得 → 隔离区（原行 JSON 全量留档，禁丢弃禁置 NULL）
      let projectKey = null
      const mapped = dirNameToWsPath.get(dirName)
      if (mapped !== undefined) projectKey = projectKeyOf(mapped)
      else if (DIR_NAME_RE.test(dirName)) projectKey = dirName
      const legacy = openExclusive(forgeDb)
      try {
        if (!hasTable(legacy, 'bugs')) continue
        const cols = tableColumns(legacy, 'bugs')
        const rows = legacy.prepare(`SELECT * FROM bugs ORDER BY created_at ASC, id ASC`).all().map((r) => readLegacyRow(cols, r))
        for (const r of rows) {
          knownBugIds.add(r.id)
          if (projectKey === null) {
            db.prepare(`INSERT OR IGNORE INTO ${t.quarantine} (id, reason, source_db, row_json, quarantined_at) VALUES (?, ?, ?, ?, ?)`)
              .run(r.id, 'project-key-derive-failed', forgeDb, JSON.stringify(r), nowIso)
            quarantined.push({ bugId: r.id, dirName })
            continue
          }
          // source_task_id 逐条核验（ATTACH 语义 = 本连接直查旧库 tasks 表；空值跳过）
          if (r.source_task_id !== null && r.source_task_id !== '') {
            const tasksPresent = hasTable(legacy, 'tasks')
            const hit = tasksPresent
              ? legacy.prepare(`SELECT 1 FROM tasks WHERE id = ?`).get(r.source_task_id) !== undefined
              : false
            if (!hit) {
              manualList.push({ bugId: r.id, sourceDb: forgeDb, field: 'source_task_id', value: r.source_task_id, reason: '旧库 tasks 表无此 id——人工核验（原值照搬，禁置 NULL）' })
            }
          }
          // recurrence_of 链闭合校验（迁移全集查前驱——弱引用，断链留人工清单原值照搬）
          if (r.recurrence_of !== null && !knownBugIds.has(r.recurrence_of)) {
            manualList.push({ bugId: r.id, sourceDb: forgeDb, field: 'recurrence_of', value: r.recurrence_of, reason: '复发链前驱不在迁移全集——人工核验（原值照搬，禁置 NULL）' })
          }
          const hasBug = db.prepare(`SELECT 1 FROM ${t.bugs} WHERE id = ?`).get(r.id) !== undefined
          if (hasBug) continue // NOT EXISTS 幂等守卫
          db.prepare(
            `INSERT INTO ${t.bugs} (id, project_key, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type,
             bug_status, commit_hash, worktree, branch, unresolved_reason, fix_approach, source_task_id, recurrence_of,
             container_slug, report_session_id, fix_session_id, fixer, reporter, created_at, updated_at)
             VALUES (@id, @project_key, @summary, @bug_desc, @trigger_desc, @expected, @actual, @suspected, @error_type,
             @bug_status, @commit_hash, @worktree, @branch, @unresolved_reason, @fix_approach, @source_task_id, @recurrence_of,
             @container_slug, @report_session_id, @fix_session_id, @fixer, @reporter, @created_at, @updated_at)`,
          ).run({ ...r, project_key: projectKey })
          moved.push({ bugId: r.id, dirName })
        }
      } finally {
        legacy.close()
      }
    }
  })
  apply()

  // 覆盖率复验：每个旧 bug id ∈ project_bugs ∪ 隔离区（行数/判例链搬行一致性硬判据）
  const targetIds = new Set(db.prepare(`SELECT id FROM ${t.bugs}`).all().map((r) => r.id))
  const quarantineIds = new Set(db.prepare(`SELECT id FROM ${t.quarantine}`).all().map((r) => r.id))
  for (const dirName of dirs) {
    const forgeDb = join(workspacesFrom, dirName, 'forge.db')
    if (!existsSync(forgeDb)) continue
    const legacy = openExclusive(forgeDb)
    try {
      if (!hasTable(legacy, 'bugs')) continue
      for (const r of legacy.prepare(`SELECT id FROM bugs`).all()) {
        if (!targetIds.has(r.id) && !quarantineIds.has(r.id)) {
          throw new Error(`搬行覆盖率复验失败：${forgeDb} 的 bug ${r.id} 未落 project_bugs 也未进隔离区`)
        }
      }
    } finally {
      legacy.close()
    }
  }

  // 人工清单落盘（追加去重——bug id 已在清单则不重写，重跑安全）
  const manualPath = join(dirname(db.name), 'migrate-manual-review.md')
  if (manualList.length > 0) {
    let existing = ''
    try {
      existing = readFileSync(manualPath, 'utf8')
    } catch {
      /* 首次创建 */
    }
    for (const m of manualList) {
      if (existing.includes(`- [ ] ${m.bugId} (${m.field})`)) continue
      appendFileSync(
        manualPath,
        `- [ ] ${m.bugId} (${m.field}) = ${JSON.stringify(m.value)} —— ${m.reason}；源库：${m.sourceDb}\n`,
        'utf8',
      )
    }
    emitDiag('warn', 'project-migrate', `人工清单 ${manualList.length} 条（source_task_id / recurrence_of 核验失败——原值照搬禁置 NULL）：${manualPath}`)
  }
  return { skipped: false, moved, quarantined, manualList }
}

// ── ③ forge-workspaces 目录搬迁（staged copy + 校验 + 原目录改名保留 + 同卷断言） ──
function volumeRootOf(p) {
  const r = resolve(p)
  return r.startsWith('\\\\') ? r.split(sep).slice(0, 4).join(sep) : r.slice(0, r.indexOf(sep) + 1)
}
function walkFiles(root, rel = '') {
  const out = []
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const relPath = rel === '' ? e.name : `${rel}/${e.name}`
    if (e.isDirectory()) out.push(...walkFiles(root, relPath))
    else out.push({ rel: relPath, size: statSync(join(root, ...relPath.split('/'))).size })
  }
  return out
}
function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function relocateWorkspaces(args, db, nowIso) {
  const step = 'workspaces-move'
  const done = db.prepare(`SELECT fingerprint FROM project_migrate_state WHERE step = ?`).get(step)
  if (done !== undefined) {
    emitDiag('info', 'project-migrate', `目录搬迁已完成（marker 在场）——跳过：${args.workspacesFrom} → ${args.workspacesTo}`)
    return { skipped: true }
  }
  if (!existsSync(args.workspacesFrom)) {
    emitDiag('info', 'project-migrate', `源目录缺席（${args.workspacesFrom}）——目录搬迁跳过`)
    return { skipped: true }
  }
  if (existsSync(args.workspacesTo)) {
    throw new Error(`目标目录已在场且无完成标记：${args.workspacesTo}——请人工确认后处理（禁覆盖）`)
  }
  const staged = `${args.workspacesTo}.staged-migrate`
  rmSync(staged, { recursive: true, force: true })
  mkdirSync(dirname(args.workspacesTo), { recursive: true })
  mkdirSync(staged, { recursive: true })
  // 同卷断言：staged 与目标同卷（staged 邻接目标构造）→ rename 原子；源跨卷允许（copy 语义）
  const volTarget = volumeRootOf(args.workspacesTo)
  const volStaged = volumeRootOf(staged)
  if (volTarget.toLowerCase() !== volStaged.toLowerCase()) {
    throw new Error(`同卷断言失败：staged ${volStaged} ≠ 目标 ${volTarget}`)
  }

  // staged copy + manifest（文件数/字节）
  const manifest = []
  for (const f of walkFiles(args.workspacesFrom)) {
    const src = join(args.workspacesFrom, ...f.rel.split('/'))
    const dst = join(staged, ...f.rel.split('/'))
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
    const hash = sha256File(src)
    manifest.push({ rel: f.rel, size: f.size, sha256: hash })
    if (statSync(dst).size !== f.size) throw new Error(`staged copy 字节数不一致：${f.rel}`)
  }
  // 校验：文件数 / 字节 / 哈希逐件比对
  const stagedFiles = walkFiles(staged)
  if (stagedFiles.length !== manifest.length) throw new Error(`staged 校验失败：文件数 ${stagedFiles.length} ≠ ${manifest.length}`)
  let stagedBytes = 0
  for (const f of stagedFiles) stagedBytes += statSync(join(staged, ...f.rel.split('/'))).size
  const sourceBytes = manifest.reduce((s, f) => s + f.size, 0)
  if (stagedBytes !== sourceBytes) throw new Error(`staged 校验失败：字节 ${stagedBytes} ≠ ${sourceBytes}`)
  for (const f of manifest) {
    if (sha256File(join(staged, ...f.rel.split('/'))) !== f.sha256) throw new Error(`staged 校验失败：哈希不一致 ${f.rel}`)
  }

  // 原子替换：原目录改名保留（回滚点）→ staged 改名就位
  const keepOriginal = `${args.workspacesFrom}.pre-migrate-${nowIso.replace(/[:.]/g, '-')}`
  renameSync(args.workspacesFrom, keepOriginal)
  try {
    renameSync(staged, args.workspacesTo)
  } catch (cause) {
    renameSync(keepOriginal, args.workspacesTo === '' ? keepOriginal : args.workspacesFrom) // 回滚
    throw new Error(`staged → 目标改名失败（已回滚原目录）：${cause.message}`)
  }
  writeFileSync(join(args.projectDbDir, 'migrate-workspaces-manifest.json'), JSON.stringify({
    from: args.workspacesFrom,
    to: args.workspacesTo,
    keptOriginal: keepOriginal,
    fileCount: manifest.length,
    totalBytes: sourceBytes,
    files: manifest,
  }, null, 2), 'utf8')
  db.prepare(`INSERT OR REPLACE INTO project_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
    .run(step, `${manifest.length}:${sourceBytes}`, nowIso, JSON.stringify({ from: args.workspacesFrom, to: args.workspacesTo, keptOriginal: keepOriginal }))
  emitDiag('info', 'project-migrate', `forge-workspaces 搬迁完成：${manifest.length} 文件 / ${sourceBytes} 字节，${args.workspacesFrom} → ${args.workspacesTo}（原目录改名保留 ${keepOriginal}）`)
  return { skipped: false, fileCount: manifest.length, totalBytes: sourceBytes, keptOriginal: keepOriginal }
}

/** 排他打开（宿主持句柄 → 抛错中止）。 */
function openExclusive(file) {
  const Database = loadBetterSqlite3()
  return new Database(file) // 被占用时 open 即抛
}

// ── 主流程 ──
export function main(argv) {
  const args = parseArgs(argv)
  const nowIso = new Date().toISOString()
  mkdirSync(args.projectDbDir, { recursive: true })
  diagFile = join(args.projectDbDir, 'migrate-state-db-diag.log')
  emitDiag('info', 'project-migrate', `迁移开始：home=${args.home}`)

  // 前置：双进程持句柄检查 + SQLite 排他打开兜底
  if (!args.skipProcessCheck) assertNoHostProcesses()
  if (existsSync(args.stateDb)) openExclusive(args.stateDb).close()
  if (existsSync(args.projectDb)) openExclusive(args.projectDb).close()

  // registry 在场性快照（{ id, path }[]——workspace_id 精确对账；缺席 → ws_path 目录存在性 fallback）
  let registry = null
  if (args.registry !== null) {
    registry = JSON.parse(readFileSync(args.registry, 'utf8'))
    if (!Array.isArray(registry)) throw new Error('--registry 快照非数组（期望 [{ id, path }]）')
  }
  const presenceOf = (workspaceId, wsPath) => {
    if (registry !== null) return registry.some((e) => e.id === workspaceId)
    return existsSync(wsPath) // fallback 代理：目录在场即视为在场
  }

  const summary = {}
  if (!args.skipDb) {
    // staged 快照 + 原子替换：VACUUM INTO 出一致快照 → 快照上搬行 → 复验 → 原子换回
    const stagedDb = `${args.projectDb}.staged-migrate`
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${stagedDb}${suffix}`
      if (existsSync(p)) rmSync(p, { force: true })
    }
    if (existsSync(args.projectDb)) {
      const src = openExclusive(args.projectDb)
      try {
        src.pragma('wal_checkpoint(TRUNCATE)')
        src.exec(`VACUUM INTO '${stagedDb.replaceAll("'", "''")}'`)
      } finally {
        src.close()
      }
    } else {
      const fresh = openExclusive(stagedDb)
      fresh.close()
    }
    const db = openExclusive(stagedDb)
    ensureProjectSchema(db)
    try {
      // ① projects 拆两表
      const projectsStep = 'projects-split'
      const stateFp = existsSync(args.stateDb)
        ? `${statSync(args.stateDb).size}:${statSync(args.stateDb).mtimeMs}`
        : 'absent'
      const done = db.prepare(`SELECT fingerprint FROM project_migrate_state WHERE step = ?`).get(projectsStep)
      if (done !== undefined && done.fingerprint === stateFp) {
        summary.projects = { skipped: true }
        emitDiag('info', 'project-migrate', `projects 拆行已完成且源未变（fingerprint 同）——跳过`)
      } else {
        summary.projects = migrateProjects(db, args.stateDb, presenceOf)
        db.prepare(`INSERT OR REPLACE INTO project_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
          .run(projectsStep, stateFp, nowIso, JSON.stringify(summary.projects))
      }

      // ② bugs 搬行（dirName → ws_path 映射自 state.db）
      const bugsStep = 'bugs-move'
      const dirNameToWsPath = new Map()
      if (existsSync(args.stateDb)) {
        const legacy = openExclusive(args.stateDb)
        try {
          if (hasTable(legacy, 'projects')) {
            for (const r of legacy.prepare(`SELECT ws_path FROM projects`).all()) {
              dirNameToWsPath.set(`${flattenWorkspacePath(r.ws_path)}@${hash8OfPath(r.ws_path)}`, r.ws_path)
            }
          }
        } finally {
          legacy.close()
        }
      }
      const bugsFp = existsSync(args.workspacesFrom)
        ? readdirSync(args.workspacesFrom, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().join(',')
        : 'absent'
      const bugsDone = db.prepare(`SELECT fingerprint FROM project_migrate_state WHERE step = ?`).get(bugsStep)
      if (bugsDone !== undefined && bugsDone.fingerprint === bugsFp) {
        summary.bugs = { skipped: true }
        emitDiag('info', 'project-migrate', `bugs 搬行已完成且源未变——跳过`)
      } else {
        summary.bugs = migrateBugs(db, args.workspacesFrom, dirNameToWsPath, nowIso)
        db.prepare(`INSERT OR REPLACE INTO project_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
          .run(bugsStep, bugsFp, nowIso, JSON.stringify({ moved: summary.bugs.moved?.length ?? 0, quarantined: summary.bugs.quarantined?.length ?? 0 }))
      }

      // ③ forge-workspaces 目录搬迁（在 staged 连接上记账 marker；原子换回前完成）
      summary.workspaces = args.skipWorkspaces ? { skipped: true } : relocateWorkspaces(args, db, nowIso)
    } finally {
      db.close()
    }

    // 原子替换 staged → 正本（原库改名保留为回滚点；旧 WAL 侧车随正本清除——staged 无 WAL）
    if (existsSync(args.projectDb)) {
      const keepDb = `${args.projectDb}.pre-migrate-${nowIso.replace(/[:.]/g, '-')}`
      renameSync(args.projectDb, keepDb)
      for (const suffix of ['-wal', '-shm']) {
        const p = `${args.projectDb}${suffix}`
        if (existsSync(p)) unlinkSync(p)
      }
      try {
        renameSync(stagedDb, args.projectDb)
      } catch (cause) {
        renameSync(keepDb, args.projectDb)
        throw new Error(`staged project.db 换回失败（已回滚）：${cause.message}`)
      }
      emitDiag('info', 'project-migrate', `project.db 原子替换完成（原库改名保留 ${keepDb}）`)
    } else {
      renameSync(stagedDb, args.projectDb)
    }
  }

  emitDiag('info', 'project-migrate', `迁移完成：${JSON.stringify({
    projects: summary.projects?.skipped ? 'skipped' : `${summary.projects.inserted?.length ?? 0} 行拆两表（degraded ${summary.projects.degraded?.length ?? 0}）`,
    bugs: summary.bugs?.skipped ? 'skipped' : `${summary.bugs.moved?.length ?? 0} 行搬入（隔离区 ${summary.bugs.quarantined?.length ?? 0}，人工清单 ${summary.bugs.manualList?.length ?? 0}）`,
    workspaces: summary.workspaces?.skipped ? 'skipped' : `${summary.workspaces.fileCount} 文件 / ${summary.workspaces.totalBytes} 字节`,
  })}`)
  return summary
}

// 直接执行（被测试 import 时不自跑）
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main(process.argv)
  } catch (cause) {
    console.error(`迁移失败：${cause.message}`)
    process.exit(1)
  }
}
