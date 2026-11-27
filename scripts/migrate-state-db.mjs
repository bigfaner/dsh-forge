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
//   ②b task-loop 搬行段（plugin-task-loop 1.16——proposal plugin-task-loop §二迁移段 +
//      entities.md 迁移映射终态）：旧工作区库 tasks + task_edges + task_records +
//      task_session_links + implementation_checkpoints 五表搬行进 task-loop.db 新线六表。
//      断代表注记（退役列/表处置——列映射留痕单源 = TASK_LOOP_COLUMN_MAP_DOC，随每次运行落
//      manifest JSON，脚本头部注释同源）：
//      · tasks.blocked_reason：退役不建列——旧值回填该任务最新非 submit 动词 records 行 note
//        （blocked 语境前缀）；无可挂流水行 → 人工清单禁丢弃；
//      · tasks.source_kind / source_id / mode：退役不建（容器语义 slug 化）——manifest 处置留痕；
//      · tasks.e2e_attribution（旧 v8 列）：退役随旧库归档——新线无对应列；
//      · task_records.ac_json / commit_hash（含 gate_json/files_json/record_fields_json 镜像三列）：
//        退役随旧库归档——结算数据单源 = task_settlements；历史 submit 行整体不搬（断代），
//        不回填 task_settlements（结算单源自新线起记）；
//      · tasks_surface_archive：surface 概念整体退役——不迁入新线、旧表随旧库只读归档；
//      · app_key_logs：不搬——task-loop 零写入面，旧表随旧库归档；
//      · goal_id：不建（注记：旧库无此列；新线零 goal 概念词——task 唯一验收承接面 = 自带 AC 判据）。
//      列映射：task_desc→brief、vars_json→context_json、coverage→coverage_threshold（改名直搬）；
//      source_task_id→fix_of_task_id（值随 UUID 改写映射改写）；旧 `{slug}:{local_id}` id 与各表
//      INTEGER 自增 id → 纯 UUID 一次性改写，edges/tsl/records 的 task_id 值随迁（回填失败禁 NULL
//      留人工清单）；fix 判别三段回填：source_task_id 非空直搬 / `fix-%` 前缀经 task_edges
//      (origin='fix-chain') 反查（恰一候选直判）/ 不可判入人工清单禁自动置 NULL；checkpoints 经
//      旧库 proposals.id→slug 查表回填（slug UNIQUE 一一映射；未命中 fail-loud 中断——迁移回填
//      禁悬空，与运行期弱引用可悬空两口径显式区分）。
//      copy-out 语义：旧库以 readonly 打开（WAL 只读快照——零写零改名零替换，旧库原地只读归档），
//      SELECT 判例行 → INSERT 新 task-loop.db（与持句柄进程共存可跑）。行数/判例链抽样校验门 +
//      幂等标记（task_migrate_state 逐 dir fingerprint；新库行已存在即跳过——tasks 以
//      (project_key, slug, local_id) 判据复用既有新 id，edges/tsl/records/checkpoints 以唯一键
//      /存在判据去重）+ 新线 schema version>1 拒绝重跑。宿主进程在场仅观察留痕不阻断
//      （observeHostProcesses）。旧库任务域 per-workspace 单库封闭
//      （零跨库引用），逐 dir 独立 UUID 映射域。
//   ③ 存量 {home}/forge-workspaces/ 目录搬迁：staged copy + 文件数/字节/哈希校验 +
//      原目录改名保留 + 同卷断言（staged 与目标同卷 → rename 原子）。
//   ④ 观察项：dsh-forge-dev / dsh-forge 进程在场清单留痕（不阻断执行——copy-out 与持句柄进程共存）。
//
// ── bundle 搬行段（forge-aggregate-bundle 1.43——旧 dsh-forge home → forge-bundle 桌面 home，
//    --bundle 门控启用，与①-④旧路径互斥）──
//   目标 = {home}/forge/db/forge/forge.db（forge-bundle 现行全局库）；源 = --source 旧 home
//   （缺省 %APPDATA%\dsh-forge）的 post-migration 布局：
//   ⑤ bugs：{source}/forge/db/project/project.db project_bugs → forge.db project_bugs
//      （两库列同构直迁；project_key 不在目标 project_projects → 隔离区留档）。
//   ⑥ tasks：{source}/forge/db/task-loop/task-loop.db task_tasks（schema 与目标同构 v1）+
//      task_edges/task_records/task_session_links/task_settlements → forge.db 同名表：
//      · feature 容器任务剔除（用户裁定 2026-11-22：不迁跟 features 关联的任务——
//        容器 slug 集 = 源各工作区库 features 表 slug 全集）；
//      · project_key 不在目标 project_projects → 剔除留档（annotutor 等）；
//      · fix_of_task_id 前驱不在迁移全集 → 置 NULL + 人工清单（禁悬空）；
//      · edges 双端点须都在迁移全集（缺端 → 人工清单）；records/tsl/settlements 随迁移集
//        同迁，剔除容器关联行计数留痕（用户裁定的整体剔除面，非静默丢弃）。
//   ⑦ proposals → specs（用户裁定 2026-11-22：proposal 转 spec；rejected/superseded 不迁移）：
//      {source}/forge/workspaces/<dir>/forge.db proposals → forge.db spec_specs +
//      spec_docs（rel_path 非空 1:1）+ spec_transitions（draft→映射态留痕行，note 携
//      proposal_status/mode/superseded_by/author 降档信息，created_at=decided_at）。
//      状态映射：draft→draft / under-review→awaiting_approval / accepted→approved；
//      project_key 无目标项目行或 slug 冲突 → 人工清单跳过。
//   bundle 段纪律同①-④：staged VACUUM INTO 快照搬行 → 复验 → 原子替换（原库改名保留
//   回滚点）；bundle_migrate_state 标记表逐步 fingerprint 幂等；行级 NOT EXISTS 守卫；
//   目标库排他打开兜底（desktop 宿主在场时 open 即抛——迁移前须关闭 dsh desktop）。
//
// 幂等（dba 处方「staged 临时 + NOT EXISTS + 原子改名」）：
//   · project.db 写入全程走 staged 快照（VACUUM INTO）→ 单事务搬行 → 计数/判例链复验 →
//     原子替换（原库先改名保留，WAL 侧车随旧文件清除）；
//   · project_migrate_state 标记表记录每步 fingerprint，已完成且源未变 → 跳过；
//   · 行级 NOT EXISTS 守卫（id 已在场跳过）——标记缺失也不会写重。
//
// 用法：
//   node scripts/migrate-state-db.mjs [--home <DSH_HOME>] [--registry <snapshot.json>]
//        [--workspaces-to <dir>] [--skip-db] [--skip-task-loop] [--skip-workspaces] [--skip-process-check]
//        [--bundle] [--source <旧home>] [--home <桌面home>] [--skip-bundle-bugs] [--skip-bundle-tasks] [--skip-bundle-specs]
//   bundle 一参速用（缺省目标 = %APPDATA%\dsh-desktop\harness，缺省源 = %APPDATA%\dsh-forge）：
//   node scripts/migrate-state-db.mjs --bundle
// forge-dirs 段（forge-dirs-unification §2.8——独立模式，一参即可跑；人工执行，执行前须关闭 dsh desktop）：
//   node scripts/migrate-state-db.mjs --forge-dirs [--home <DSH_HOME>] [--registry <snapshot.json>] [--stamp <YYYYMMDDTHHmmss>]
// 诊断：JSONL 追加 {home}/forge/db/project/migrate-state-db-diag.log（emitDiag 等价面——
// 脚本态无 cordis ctx，落盘 JSONL + stdout；字段与 DIAG_EVENT 同形）。
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from '@dsh-forge/lib-db'
// 归属键单源（lib/path——forge-dirs-unification §2.6）：projectKeyOf / resolveMainCheckoutRoot
// 从构建产物 dist 引入（脚本态纯 node 无法加载 TS src——node 类型剥离不重写 .js 说明符），
// dist = lib/path/src 的 tsc 产物（pnpm -C lib/path build），键派生算法与 src 单源同锚。
import { projectKeyOf as libProjectKeyOf } from '../lib/path/dist/index.js'
import { resolveMainCheckoutRoot } from '../lib/path/dist/project-root.js'

// ── SQLite 驱动（1.40：better-sqlite3 退役——node:sqlite 适配层 @dsh-forge/lib-db
//    Database，transaction/readonly/fileMustExist 形状兼容，零原生模块） ──

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
    skipTaskLoop: false,
    skipWorkspaces: false,
    skipProcessCheck: false,
    bundle: false,
    source: null,
    homeExplicit: false,
    skipBundleBugs: false,
    skipBundleTasks: false,
    skipBundleSpecs: false,
    forgeDirs: false,
    stamp: null,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--home') { args.home = resolve(argv[++i]); args.homeExplicit = true }
    else if (a === '--registry') args.registry = resolve(argv[++i])
    else if (a === '--workspaces-to') args.workspacesTo = resolve(argv[++i])
    else if (a === '--skip-db') args.skipDb = true
    else if (a === '--skip-task-loop') args.skipTaskLoop = true
    else if (a === '--skip-workspaces') args.skipWorkspaces = true
    else if (a === '--skip-process-check') args.skipProcessCheck = true
    else if (a === '--bundle') args.bundle = true
    else if (a === '--source') args.source = resolve(argv[++i])
    else if (a === '--skip-bundle-bugs') args.skipBundleBugs = true
    else if (a === '--skip-bundle-tasks') args.skipBundleTasks = true
    else if (a === '--skip-bundle-specs') args.skipBundleSpecs = true
    else if (a === '--forge-dirs') args.forgeDirs = true
    else if (a === '--stamp') args.stamp = argv[++i]
    else throw new Error(`未知参数：${a}`)
  }
  args.source = args.source ?? join(homedir(), 'AppData', 'Roaming', 'dsh-forge')
  // bundle 段缺省目标 = forge-bundle 桌面 home（--bundle 一参即可跑；①-④旧段缺省语义不变）
  if (args.bundle && !args.homeExplicit) args.home = join(homedir(), 'AppData', 'Roaming', 'dsh-desktop', 'harness')
  args.stateDb = join(args.home, 'state.db')
  args.projectDbDir = join(args.home, 'forge', 'db', 'project')
  args.projectDb = join(args.projectDbDir, 'project.db')
  args.workspacesFrom = join(args.home, 'forge-workspaces')
  args.workspacesTo = args.workspacesTo ?? join(args.home, 'forge', 'workspaces')
  // bundle 段路径（目标 = forge-bundle 现行全局库；源 = 旧 home post-migration 布局）
  args.bundleDb = join(args.home, 'forge', 'db', 'forge', 'forge.db')
  args.sourceProjectDb = join(args.source, 'forge', 'db', 'project', 'project.db')
  args.sourceTaskLoopDb = join(args.source, 'forge', 'db', 'task-loop', 'task-loop.db')
  args.sourceWorkspaces = join(args.source, 'forge', 'workspaces')
  return args
}

// ── 诊断（emitDiag 等价面：DIAG_EVENT 同形 JSONL 落盘 + stdout） ──
let diagFile = null
function emitDiag(level, event, message, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, message, ...data })
  console.log(`[${level}] ${event}: ${message}`)
  if (diagFile !== null) appendFileSync(diagFile, line + '\n', 'utf8')
}

// ── 观察项：dsh-forge-dev / dsh-forge 进程在场清单留痕（不阻断——精确进程名，禁通配——AGENTS §2 判例） ──
function observeHostProcesses() {
  const present = []
  for (const image of ['dsh-forge-dev.exe', 'dsh-forge.exe']) {
    const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    const out = r.stdout ?? ''
    if (out.toLowerCase().includes(image.toLowerCase())) present.push(image)
  }
  if (present.length > 0) {
    emitDiag('info', 'task-loop-migrate', `宿主进程在场（观察留痕，不阻断——copy-out 与持句柄进程共存）：${present.join(', ')}`)
  }
  return present
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


// ════════ task-loop 搬行段（plugin-task-loop 1.16） ════════
// 断代表注记 + 逐表列映射留痕单源 = TASK_LOOP_COLUMN_MAP_DOC（随每次运行落 manifest JSON，
// 脚本头部注释同源）。DDL 单源锚 = plugins/task-loop/host/db/migrations/version-1.ts
// TASK_LOOP_MIGRATIONS[0].statements 逐字镜像——DDL pin 测试断言两侧逐语句等价，漂移即测试红。

/** task-loop.db 新线 v1 DDL（version-1.ts 逐字镜像——patch 由 version-1.ts 机械抽取生成）；
 * schema_meta 锚表由 ensureTaskLoopSchema 显式建立（不入语句集——version-1.ts 旧形状
 * schema_meta 死语句已清，镜像随批对齐）。 */
export const TASK_LOOP_V1_STATEMENTS = [
`CREATE TABLE task_tasks (
    id              TEXT PRIMARY KEY,                      -- 纯 UUID（写入点 addTask/batchAddTasks 生成；业务唯一由 uq_task_tasks_project_slug_local 承担）
    slug            TEXT NOT NULL,                         -- 容器键（通用执行容器，无容器主表）
    local_id        TEXT NOT NULL,
    title           TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    task_status     TEXT NOT NULL DEFAULT 'pending'
                    CONSTRAINT ck_task_tasks_status CHECK (task_status IN
                      ('pending', 'in_progress', 'completed', 'blocked',
                       'suspended', 'interrupted', 'skipped', 'rejected')),
    brief           TEXT,                                  -- 任务简报正文内容源（worker 简报 TITLE 后裸文本段）
    ac_json         TEXT,                                  -- AC 承担面（任务定义侧清单）——task 唯一验收承接面
    priority        TEXT CONSTRAINT ck_task_tasks_priority CHECK (priority IN ('P0', 'P1', 'P2')),
    estimated_time  TEXT,                                  -- 未来 UI 消费预留；当前读取面 = list/query 卡片透传
    scope_json      TEXT,                                  -- 受影响文件范围（结构化对象 JSON）
    context_json    TEXT,                                  -- 附加上下文注入（KEY=VALUE JSON）
    fix_of_task_id  TEXT REFERENCES task_tasks(id),        -- fix 链前驱（域内 FK 可空）——fix 判别单源
    breaking        INTEGER NOT NULL DEFAULT 0
                    CONSTRAINT ck_task_tasks_breaking CHECK (breaking IN (0, 1)),
    coverage_threshold REAL,                               -- 验收阈值期望值（0–1；实测面在 settlements gate_coverage）
    complexity      TEXT NOT NULL DEFAULT 'medium'
                    CONSTRAINT ck_task_tasks_complexity CHECK (complexity IN ('low', 'medium', 'high')),
    project_key       TEXT NOT NULL,                       -- 行级归属键（cwd 纯函数派生，无 default）
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    CONSTRAINT uq_task_tasks_project_slug_local UNIQUE (project_key, slug, local_id)
)`,
`CREATE INDEX idx_task_tasks_container ON task_tasks(project_key, slug, task_status)`,
`CREATE INDEX idx_task_tasks_fix       ON task_tasks(fix_of_task_id)`,
`CREATE TABLE task_settlements (
    id            TEXT PRIMARY KEY,                        -- 定位键（纯 UUID）——全局单调性由 (created_at, seq) 承担，id 仅 tiebreaker
    task_id       TEXT NOT NULL REFERENCES task_tasks(id), -- 任务定位；归属/容器维度经 JOIN tasks 传导
    seq           INTEGER NOT NULL,                        -- 同 task_id 链内单调递增
    fix_root_id   TEXT,                                    -- fix 链身份列：链首结算行 id（可空 = 非 fix 链）
    result        TEXT NOT NULL CONSTRAINT ck_task_settle_result
                    CHECK (result IN ('success', 'blocked')),
    ac_results_json TEXT NOT NULL DEFAULT '[]',            -- AC 核销快照（[{criterion, met, evidence?}] 单列同位）
    commit_hash   TEXT,                                    -- fix density 口径消费列
    evidence_json TEXT,                                    -- submit 全语义载荷终态聚合（success/blocked 两形同构）
    created_at    TEXT NOT NULL                            -- 原结算时戳
)`,
`CREATE UNIQUE INDEX uq_task_settle_seq ON task_settlements(task_id, seq)`,
`CREATE TRIGGER trg_task_settlements_no_update BEFORE UPDATE ON task_settlements
BEGIN SELECT RAISE(ABORT, 'task_settlements: append-only violation (update)'); END`,
`CREATE TRIGGER trg_task_settlements_no_delete BEFORE DELETE ON task_settlements
BEGIN SELECT RAISE(ABORT, 'task_settlements: append-only violation (delete)'); END`,
`CREATE TABLE task_checkpoints (
    id                    TEXT PRIMARY KEY,                -- 纯 UUID（定位键）
    project_key             TEXT NOT NULL,
    slug        TEXT NOT NULL,                             -- 弱引用锚，零 FK
    mark                  TEXT NOT NULL
                          CONSTRAINT ck_task_cp_mark CHECK (mark IN
                            ('first-pass-complete', 'retro-done', 'review-wave-N',
                             'stabilized', 'merged', 'derived-to-child')),
    wave_seq              INTEGER,
    created_at            TEXT NOT NULL,
    base_commit_hash      TEXT NOT NULL,
    tasks_total           INTEGER NOT NULL,
    commits_total         INTEGER NOT NULL,
    fixes_total           INTEGER NOT NULL,
    evidence_debts_total  INTEGER NOT NULL
)`,
`CREATE UNIQUE INDEX uq_task_cp_milestone ON task_checkpoints(project_key, slug, mark, wave_seq)
  WHERE mark IN ('first-pass-complete', 'retro-done', 'review-wave-N', 'stabilized', 'merged')`,
`CREATE INDEX idx_task_cp_container ON task_checkpoints(project_key, slug, created_at)`,
`CREATE TRIGGER trg_task_checkpoints_no_update BEFORE UPDATE ON task_checkpoints
BEGIN SELECT RAISE(ABORT, 'task_checkpoints: append-only violation (update)'); END`,
`CREATE TRIGGER trg_task_checkpoints_no_delete BEFORE DELETE ON task_checkpoints
BEGIN SELECT RAISE(ABORT, 'task_checkpoints: append-only violation (delete)'); END`,
`CREATE TABLE task_edges (
    task_id          TEXT NOT NULL REFERENCES task_tasks(id),
    prerequisite_id  TEXT NOT NULL REFERENCES task_tasks(id),
    origin           TEXT NOT NULL
                     CONSTRAINT ck_task_edges_origin CHECK (origin IN ('manual', 'fix-chain', 'autoconfig')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (task_id, prerequisite_id)
)`,
`CREATE INDEX idx_task_edges_prerequisite ON task_edges(prerequisite_id)`,
`CREATE TABLE task_session_links (
    id          TEXT PRIMARY KEY,                      -- 纯 UUID（定位键）
    task_id     TEXT NOT NULL REFERENCES task_tasks(id),
    session_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CONSTRAINT uq_task_tsl_task_session UNIQUE (task_id, session_id)
)`,
`CREATE INDEX idx_task_tsl_session ON task_session_links(session_id)`,
`CREATE TABLE task_records (
    id                 TEXT PRIMARY KEY,               -- 纯 UUID（定位键）
    task_id            TEXT NOT NULL REFERENCES task_tasks(id),
    verb               TEXT NOT NULL,
    from_status        TEXT,
    to_status          TEXT,
    note               TEXT,                           -- 非 submit 动词语境载荷（reason+summary 归一）
    payload_json       TEXT,                           -- 非 submit 动词的结构化载荷位
    dispatch_digest    TEXT,
    loop_sourced       INTEGER NOT NULL DEFAULT 0
                       CONSTRAINT ck_task_records_loop CHECK (loop_sourced IN (0, 1)),
    actor              TEXT NOT NULL
                       CONSTRAINT ck_task_records_actor CHECK (actor IN ('plugin-tool', 'ui', 'core')),
    session_id         TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
)`,
`CREATE INDEX idx_task_records_task    ON task_records(task_id, created_at)`,
`CREATE INDEX idx_task_records_session ON task_records(session_id)`,
`CREATE TRIGGER trg_task_records_no_update BEFORE UPDATE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (update)'); END`,
`CREATE TRIGGER trg_task_records_no_delete BEFORE DELETE ON task_records
BEGIN SELECT RAISE(ABORT, 'task_records: append-only violation (delete)'); END`,
];

/** 列映射留痕（断代表注记详见脚本头部注释，与此同源）。 */
export const TASK_LOOP_COLUMN_MAP_DOC = {
  task_tasks: {
    direct: ['slug', 'local_id', 'title', 'task_type', 'task_status', 'ac_json', 'priority', 'estimated_time', 'breaking', 'complexity', 'created_at', 'updated_at'],
    renamed: { task_desc: 'brief', vars_json: 'context_json', coverage: 'coverage_threshold', source_task_id: 'fix_of_task_id' },
    added: {
      id: '旧 {slug}:{local_id} → 纯 UUID 一次性改写',
      project_key: 'cwd 纯函数派生（state.db ws_path 映射 / 目录名自证）——派生失败落隔离区禁 NULL',
      scope_json: '旧库无对应列——全 NULL（未声明触点）',
    },
    retired: {
      blocked_reason: '退役不建列——旧值回填该任务最新非 submit 动词 records 行 note（blocked 语境）；无可挂流水行 → 人工清单',
      source_kind: '退役不建（容器语义 slug 化）——manifest 留痕',
      source_id: '退役不建（容器语义 slug 化）——manifest 留痕',
      mode: '退役不建（容器语义 slug 化）——manifest 留痕',
      e2e_attribution: '退役随旧库归档（旧 v8 列——新线无对应列）',
      surface_key: 'v4 已摘除（旧库终态无此列）——surface 概念整体退役',
      surface_type: 'v4 已摘除（旧库终态无此列）——surface 概念整体退役',
    },
  },
  task_edges: {
    direct: ['origin', 'created_at', 'updated_at'],
    rewritten: { task_id: 'UUID 改写映射随迁', prerequisite_id: 'UUID 改写映射随迁' },
    orphan: '端点任务不在迁移全集 → 人工清单（禁 NULL）',
  },
  task_session_links: {
    direct: ['session_id', 'created_at', 'updated_at'],
    rewritten: { id: '旧自增 → 纯 UUID', task_id: 'UUID 改写映射随迁' },
    orphan: 'task_id 无任务行 → 人工清单（禁 NULL）',
  },
  task_records: {
    direct: ['verb', 'from_status', 'to_status', 'dispatch_digest', 'loop_sourced', 'actor', 'session_id', 'created_at', 'updated_at'],
    fused: { note: '旧 reason+summary 融合（非 submit 行）；blocked_reason 退役值按 blocked 语境回填最新动词行' },
    rewritten: { id: '旧自增 → 纯 UUID', task_id: 'UUID 改写映射随迁' },
    generationGap: 'verb=submit 行整体不搬（断代）——不回填 task_settlements（结算单源自新线起记）',
    retired: {
      ac_json: '退役随旧库归档——结算数据单源 = task_settlements',
      commit_hash: '退役随旧库归档——结算数据单源 = task_settlements',
      files_json: '退役随旧库归档——submit 结构化证据全族归 settlements.evidence_json',
      gate_json: '退役随旧库归档——submit 结构化证据全族归 settlements.evidence_json',
      record_fields_json: '退役随旧库归档——submit 结构化证据全族归 settlements.evidence_json',
    },
    added: { payload_json: '旧库无对应列——全 NULL' },
  },
  task_checkpoints: {
    direct: ['mark', 'wave_seq', 'created_at', 'base_commit_hash', 'tasks_total', 'commits_total', 'fixes_total', 'evidence_debts_total'],
    rewritten: { id: '旧自增 → 纯 UUID（新线零外部 FK 指向 checkpoints，无引用值随迁）' },
    backfilled: {
      slug: '旧 proposal_id 经旧库 proposals.id→slug 查表回填（slug UNIQUE 一一映射；未命中 fail-loud 中断——迁移回填禁悬空）',
      project_key: 'cwd 纯函数派生回填',
    },
  },
  notMigrated: {
    task_settlements: '全新表——历史 submit 行不回填（旧容器指标断代明示）',
    tasks_surface_archive: 'surface 概念整体退役——不迁入新线、旧表随旧库只读归档',
    app_key_logs: '不搬——task-loop 零写入面，旧表随旧库归档',
    goal_id: '不建（注记：旧库无此列；新线零 goal 概念词——task 唯一验收承接面 = 自带 AC 判据）',
  },
}

/** 幂等标记表 + tasks 隔离区（project_migrate_state / project_bugs_quarantine 同构）。 */
function ensureTaskLoopMigrateTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS task_migrate_state (
    step          TEXT PRIMARY KEY,
    fingerprint   TEXT NOT NULL,
    done_at       TEXT NOT NULL,
    summary_json  TEXT NOT NULL
)`)
  db.exec(`CREATE TABLE IF NOT EXISTS task_migrate_quarantine (
    source_dir     TEXT NOT NULL,
    legacy_id      TEXT NOT NULL,
    reason         TEXT NOT NULL,
    source_db      TEXT NOT NULL,
    row_json       TEXT NOT NULL,
    quarantined_at TEXT NOT NULL,
    PRIMARY KEY (source_dir, legacy_id)
)`)
}

/** v1 DDL 装配（全新 copy-out 目标库首见 schema_meta 时整套落地——已迁移库幂等跳过）。 */
function ensureTaskLoopSchema(db) {
  // schema_meta 版本线锚表（本脚本自持旧形状全局线——openDatabase domain 机制开库时升级认领）；
  // 域表语句集仅在未锚定库整套落地（已迁移库幂等跳过）。
  const fresh = !hasTable(db, 'schema_meta')
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL
)`)
  if (fresh) {
    for (const s of TASK_LOOP_V1_STATEMENTS) db.exec(s)
  }
  // 版本线锚行：全新库落 v1（schema_meta 缺行 = 未锚定——补写，门禁由此可判）
  const cur = db.prepare(`SELECT MAX(version) AS v FROM schema_meta`).get()
  if ((cur?.v ?? 0) < 1) {
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (1, ?)`).run(new Date().toISOString())
  }
  ensureTaskLoopMigrateTables(db)
}

/** 新线版本门：task-loop.db schema version>1 = 已进入新线演化——迁移脚本拒绝重跑。 */
function assertTaskLoopVersionGate(db) {
  if (!hasTable(db, 'schema_meta')) return
  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_meta`).get()
  if (row.v > 1) {
    throw new Error(`task-loop.db 新线 schema version=${row.v} > 1——迁移脚本拒绝重跑（版本漂移需人工核验）`)
  }
}

/** dir → project_key（state.db ws_path 映射优先；`{flatten}@{hash8}` 孤目录名自证兜底；不可得 = null）。 */
function taskLoopProjectKeyOf(dirName, dirNameToWsPath) {
  const mapped = dirNameToWsPath.get(dirName)
  if (mapped !== undefined) return projectKeyOf(mapped)
  if (DIR_NAME_RE.test(dirName)) return dirName
  return null
}

/** reason+summary 融合（非空段以「 ｜ 」连接——note 归一单点）。 */
function fuseNote(...parts) {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' ｜ ') || null
}

/** 人工清单条目登记（禁置 NULL 的不可判值原样照搬）。 */
function manualEntry(acc, table, legacyId, field, value, reason) {
  acc.manualList.push({ table, legacyId: String(legacyId), field, value: value === null ? '(null)' : String(value), reason })
}

/** tasks 行隔离区（project_key 派生失败——原行 JSON 全量留档，禁丢弃禁置 NULL）。 */
function quarantineTaskRow(db, acc, dirName, legacyFile, legacyId, reason, row, nowIso) {
  db.prepare(
    `INSERT OR IGNORE INTO task_migrate_quarantine (source_dir, legacy_id, reason, source_db, row_json, quarantined_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(dirName, String(legacyId), reason, legacyFile, JSON.stringify(row), nowIso)
  acc.quarantined += 1
}

/** 旧库是否含 task-loop 搬行面数据（五表任一在场即处理）。 */
function legacyHasTaskLoopTables(legacyFile) {
  const legacy = openReadonly(legacyFile)
  try {
    return (
      hasTable(legacy, 'tasks') ||
      hasTable(legacy, 'task_edges') ||
      hasTable(legacy, 'task_records') ||
      hasTable(legacy, 'task_session_links') ||
      hasTable(legacy, 'implementation_checkpoints')
    )
  } finally {
    legacy.close()
  }
}

/**
 * 单旧库搬行（tasks + task_edges + task_records + task_session_links + implementation_checkpoints
 * 五表，单事务由调用方圈定）：UUID 改写映射 + fix 判别三段 + checkpoints slug 回填。
 * projectKey = null（归属不可派生）时 tasks 行落隔离区，其余表行入人工清单。
 */
function migrateLegacyTaskDb(db, legacyFile, projectKey, dirName, nowIso, acc) {
  const legacy = openReadonly(legacyFile)
  try {
    const hasTasks = hasTable(legacy, 'tasks')
    const hasEdges = hasTable(legacy, 'task_edges')
    const hasRecords = hasTable(legacy, 'task_records')
    const hasTsl = hasTable(legacy, 'task_session_links')
    const hasCps = hasTable(legacy, 'implementation_checkpoints')
    if (!hasTasks && !hasEdges && !hasRecords && !hasTsl && !hasCps) return

    // ── tasks：pass1 建 UUID 映射 + fix 判别预判；pass2 落行（前驱/后继行序容错） ──
    const idMap = new Map()
    const quarantinedIds = new Set() // 隔离区任务——附属行随迁转人工清单
    const deferredFix = [] // fix_of 延迟回填（FK 插入序无关——环/前驱后行序均安全） // 旧 task id → 新 UUID
    const fixDecision = new Map() // 旧 task id → { kind: 'direct'|'reverse'|'none', value?|candidates? }
    const blockedByTask = new Map() // 旧 task id → blocked_reason（退役列事实归流水）
    if (hasTasks) {
      const cols = tableColumns(legacy, 'tasks')
      const rows = legacy.prepare(`SELECT * FROM tasks ORDER BY id ASC`).all().map((r) => readLegacyRow(cols, r))
      // 幂等判据：新库行已存在（同 project_key+slug+local_id）→ 跳过且复用既有新 id（附属行随迁可闭合）
      const existingTaskId = db.prepare(`SELECT id FROM task_tasks WHERE project_key = ? AND slug = ? AND local_id = ?`)
      const existingIds = new Set()
      // fix 反查候选集（task_edges origin='fix-chain'——旧 {slug}:{local_id} 键域）
      const fixCandidates = new Map()
      if (hasEdges) {
        for (const e of legacy.prepare(`SELECT task_id, prerequisite_id FROM task_edges WHERE origin = 'fix-chain'`).all()) {
          const list = fixCandidates.get(e.task_id) ?? []
          list.push(e.prerequisite_id)
          fixCandidates.set(e.task_id, list)
        }
      }
      for (const r of rows) {
        const landed = projectKey !== null ? existingTaskId.get(projectKey, r.slug, r.local_id) : undefined
        if (landed !== undefined) {
          idMap.set(r.id, landed.id)
          existingIds.add(r.id)
          acc.movedSkipped.tasks += 1
          continue
        }
        idMap.set(r.id, randomUUID())
        if (r.blocked_reason !== null && r.blocked_reason !== '') blockedByTask.set(r.id, r.blocked_reason)
        if (r.source_task_id !== null && r.source_task_id !== '') {
          fixDecision.set(r.id, { kind: 'direct', value: r.source_task_id })
        } else if ((r.local_id ?? '').startsWith('fix-')) {
          fixDecision.set(r.id, { kind: 'reverse', candidates: fixCandidates.get(r.id) ?? [] })
        } else {
          fixDecision.set(r.id, { kind: 'none' })
        }
      }
      const insertTask = db.prepare(
        `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority, estimated_time,
         scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity, project_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const r of rows) {
        if (projectKey === null) {
          quarantineTaskRow(db, acc, dirName, legacyFile, r.id, 'project-key-derive-failed', r, nowIso)
          quarantinedIds.add(r.id)
          continue
        }
        if (existingIds.has(r.id)) continue // 新库行存在即跳过（幂等——不重放不重写）
        const d = fixDecision.get(r.id)
        let fixOf = null
        if (d.kind === 'direct') {
          const mapped = idMap.get(d.value)
          if (mapped === undefined) {
            manualEntry(acc, 'task_tasks', r.id, 'fix_of_task_id', d.value, 'fix 前驱不在迁移全集（悬空引用）——人工核验，禁静默置 NULL')
          } else {
            fixOf = mapped
          }
        } else if (d.kind === 'reverse') {
          const resolvable = d.candidates.filter((c) => idMap.has(c))
          if (resolvable.length === 1) {
            fixOf = idMap.get(resolvable[0])
          } else if (resolvable.length === 0) {
            manualEntry(acc, 'task_tasks', r.id, 'fix_of_task_id', '(task_edges 反查零候选)', 'fix-% 行反查零候选——人工核验，禁自动置 NULL')
          } else {
            manualEntry(acc, 'task_tasks', r.id, 'fix_of_task_id', JSON.stringify(d.candidates), 'fix-% 行反查多候选——禁任取，人工核验')
          }
        }
        if (fixOf !== null) deferredFix.push([idMap.get(r.id), fixOf])
        insertTask.run(
          idMap.get(r.id), r.slug, r.local_id, r.title, r.task_type, r.task_status ?? 'pending',
          r.task_desc ?? null, r.ac_json ?? null, r.priority ?? null, r.estimated_time ?? null,
          null /* scope_json——旧库无对应列，全 NULL */, r.vars_json ?? null, null /* fix_of 延迟回填 */,
          r.breaking ?? 0, r.coverage ?? null, r.complexity ?? 'medium', projectKey, r.created_at, r.updated_at,
        )
        acc.moved.tasks += 1
      }
    }

    // ── task_edges：两端随 UUID 映射改写；孤儿端 → 人工清单 ──
    // fix_of 延迟回填（前驱未落库——隔离区等）→ 人工清单，禁静默置 NULL
    for (const [newId, fixOf] of deferredFix) {
      const landed = db.prepare('SELECT 1 FROM task_tasks WHERE id = ?').get(fixOf)
      if (landed === undefined) {
        manualEntry(acc, 'task_tasks', newId, 'fix_of_task_id', '(fix 前驱未落库)', 'fix 前驱不在新线任务集（隔离区/缺行）——人工核验，禁自动置 NULL')
        continue
      }
      db.prepare('UPDATE task_tasks SET fix_of_task_id = ? WHERE id = ?').run(fixOf, newId)
    }

    // ── fix 链环检测（WITH RECURSIVE 自环可达）——环成员入人工清单，禁自动置 NULL ──
    {
      const cycleRows = db.prepare(
        `WITH RECURSIVE walk(start, node) AS (
          SELECT id, fix_of_task_id FROM task_tasks WHERE fix_of_task_id IS NOT NULL
          UNION
          SELECT w.start, t.fix_of_task_id FROM walk w JOIN task_tasks t ON t.id = w.node WHERE w.node IS NOT NULL
        )
        SELECT DISTINCT start AS id FROM walk WHERE start = node`,
      ).all()
      for (const c of cycleRows) {
        manualEntry(acc, 'task_tasks', c.id, 'fix_of_task_id', '(fix 链环检测命中)', 'fix 链环（recursive CTE 自环可达）——人工核验，禁自动置 NULL')
      }
    }
    if (hasEdges) {
      for (const e of legacy.prepare(`SELECT * FROM task_edges ORDER BY task_id ASC, prerequisite_id ASC`).all()) {
        const t = idMap.get(e.task_id)
        const p = idMap.get(e.prerequisite_id)
        if (t === undefined || p === undefined || quarantinedIds.has(e.task_id) || quarantinedIds.has(e.prerequisite_id)) {
          manualEntry(acc, 'task_edges', `${e.task_id}→${e.prerequisite_id}`, 'task_id', `${e.task_id}→${e.prerequisite_id}`, '边端点任务不在迁移全集——人工核验（原值留清单）')
          continue
        }
        const res = db.prepare(`INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
          .run(t, p, e.origin, e.created_at, e.updated_at)
        if (res.changes > 0) acc.moved.edges += 1
        else acc.movedSkipped.edges += 1
      }
    }

    // ── task_session_links：id UUID 化 + task_id 随迁；孤儿行 → 人工清单 ──
    if (hasTsl) {
      for (const l of legacy.prepare(`SELECT * FROM task_session_links ORDER BY id ASC`).all()) {
        const t = idMap.get(l.task_id)
        if (t === undefined || quarantinedIds.has(l.task_id)) {
          manualEntry(acc, 'task_session_links', l.id, 'task_id', l.task_id, 'session link 任务不在迁移全集（孤儿行）——人工核验，禁静默丢弃')
          continue
        }
        const res = db.prepare(`INSERT OR IGNORE INTO task_session_links (id, task_id, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
          .run(randomUUID(), t, l.session_id, l.created_at, l.updated_at)
        if (res.changes > 0) acc.moved.sessionLinks += 1
        else acc.movedSkipped.sessionLinks += 1
      }
    }

    // ── task_records：非 submit 行搬行（note 融合）；submit 行断代不搬；blocked_reason 归流水 ──
    if (hasRecords) {
      const cols = tableColumns(legacy, 'task_records')
      const rows = legacy.prepare(`SELECT * FROM task_records ORDER BY id ASC`).all().map((r) => readLegacyRow(cols, r))
      // blocked_reason 回填锚：每任务最新非 submit 流水行（禁 UPDATE append-only 表——构造期融合）
      const latestNonSubmit = new Map()
      for (const r of rows) {
        if (r.verb !== 'submit') latestNonSubmit.set(r.task_id, r.id)
      }
      const insertRecord = db.prepare(
        `INSERT INTO task_records (id, task_id, verb, from_status, to_status, note, payload_json, dispatch_digest, loop_sourced, actor, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const recordExists = db.prepare(`SELECT 1 FROM task_records WHERE task_id = ? AND verb = ? AND actor = ? AND created_at = ? AND session_id IS ?`)
      for (const r of rows) {
        if (r.verb === 'submit') {
          acc.submitArchived += 1 // 断代：submit 行随旧库归档——不回填 task_settlements
          continue
        }
        const t = idMap.get(r.task_id)
        if (t === undefined || quarantinedIds.has(r.task_id)) {
          manualEntry(acc, 'task_records', r.id, 'task_id', r.task_id, '非 submit 流水行任务不在迁移全集——人工核验（原值留清单）')
          continue
        }
        let note = fuseNote(r.reason, r.summary)
        const br = blockedByTask.get(r.task_id)
        if (br !== undefined && latestNonSubmit.get(r.task_id) === r.id) {
          note = fuseNote(note, `blocked: ${br}`) // 退役列事实归流水——blocked 语境回填最新动词行
          blockedByTask.delete(r.task_id)
          acc.dispositions.push({ table: 'task_records', legacyId: String(r.id), disposition: 'blocked_reason→note', value: br })
        }
        if (recordExists.get(t, r.verb, r.actor, r.created_at, r.session_id ?? null) !== undefined) {
          acc.movedSkipped.records += 1 // 新库行存在即跳过
          continue
        }
        insertRecord.run(
          randomUUID(), t, r.verb, r.from_status ?? null, r.to_status ?? null, note, null /* payload_json 无源 */,
          r.dispatch_digest ?? null, r.loop_sourced ?? 0, r.actor, r.session_id ?? null, r.created_at, r.updated_at,
        )
        acc.moved.records += 1
      }
    }

    // ── implementation_checkpoints：proposal_id→slug 查表回填（未命中 fail-loud 中断） ──
    // blocked_reason 无可挂流水行 → 人工清单（禁丢弃）
    for (const [tid, br] of blockedByTask) {
      manualEntry(acc, 'task_tasks', tid, 'blocked_reason', br, 'blocked_reason 退役且无可挂动词流水行——人工核验')
    }

    if (hasCps) {
      if (projectKey === null) {
        throw new Error(`checkpoints 搬行中止（fail-loud）：${legacyFile} 的 project_key 不可派生（目录名不自证且无 ws_path 映射）——人工归属后重跑`)
      }
      const slugById = new Map()
      if (hasTable(legacy, 'proposals')) {
        for (const p of legacy.prepare(`SELECT id, slug FROM proposals`).all()) slugById.set(p.id, p.slug)
      }
      const cpExists = db.prepare(`SELECT 1 FROM task_checkpoints WHERE project_key = ? AND slug = ? AND mark = ? AND created_at = ? AND wave_seq IS ?`)
      for (const c of legacy.prepare(`SELECT * FROM implementation_checkpoints ORDER BY id ASC`).all()) {
        const slug = slugById.get(c.proposal_id)
        if (slug === undefined || slug === null) {
          throw new Error(
            `checkpoints slug 回填失败（fail-loud 中断）：${legacyFile} 的 implementation_checkpoints.id=${c.id} ` +
            `proposal_id=${c.proposal_id} 在旧库 proposals 表无 slug 映射——迁移回填禁悬空（与运行期弱引用可悬空两口径显式区分）`,
          )
        }
        if (cpExists.get(projectKey, slug, c.mark, c.created_at, c.wave_seq ?? null) !== undefined) {
          acc.movedSkipped.checkpoints += 1 // 新库行存在即跳过
          continue
        }
        db.prepare(
          `INSERT INTO task_checkpoints (id, project_key, slug, mark, wave_seq, created_at, base_commit_hash, tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), projectKey, slug, c.mark, c.wave_seq ?? null, c.created_at, c.base_commit_hash, c.tasks_total, c.commits_total, c.fixes_total, c.evidence_debts_total)
        acc.moved.checkpoints += 1
      }
    }
  } finally {
    legacy.close()
  }
}

/** copy-out 校验门：行数对账 + 判例链抽样 + FK 全库零违例——任一不达即 fail-loud。 */
function verifyTaskLoopMigration(db) {
  const counts = {
    tasks: db.prepare(`SELECT COUNT(*) AS c FROM task_tasks`).get().c,
    edges: db.prepare(`SELECT COUNT(*) AS c FROM task_edges`).get().c,
    sessionLinks: db.prepare(`SELECT COUNT(*) AS c FROM task_session_links`).get().c,
    records: db.prepare(`SELECT COUNT(*) AS c FROM task_records`).get().c,
    checkpoints: db.prepare(`SELECT COUNT(*) AS c FROM task_checkpoints`).get().c,
    settlements: db.prepare(`SELECT COUNT(*) AS c FROM task_settlements`).get().c,
  }
  // 幂等口径：对照值 = task_migrate_state 逐 dir 标记累计（含本轮 movedDelta，重跑安全）
  const expected = { tasks: 0, edges: 0, sessionLinks: 0, records: 0, checkpoints: 0 }
  for (const row of db.prepare(`SELECT summary_json FROM task_migrate_state WHERE step LIKE 'task-loop:%' AND step != 'task-loop:section'`).all()) {
    const m = JSON.parse(row.summary_json).moved ?? {}
    for (const k of Object.keys(expected)) expected[k] += m[k] ?? 0
  }
  for (const k of Object.keys(expected)) {
    if (counts[k] !== expected[k]) throw new Error(`校验门失败：${k} 行数 ${counts[k]} ≠ 累计搬行 ${expected[k]}`)
  }
  // 判例链抽样：fix 链闭合（fix_of_task_id 全指在场任务）
  const danglingFix = db.prepare(`SELECT COUNT(*) AS c FROM task_tasks t WHERE t.fix_of_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM task_tasks p WHERE p.id = t.fix_of_task_id)`).get().c
  if (danglingFix !== 0) throw new Error(`判例链抽样失败：fix_of_task_id 悬空引用 ${danglingFix} 行——禁悬空`)
  // 判例链抽样：submit 断代（新线 records 内零 submit 行）
  const submitInTarget = db.prepare(`SELECT COUNT(*) AS c FROM task_records WHERE verb = 'submit'`).get().c
  if (submitInTarget !== 0) throw new Error(`断代门失败：新线 task_records 混入 submit 行 ${submitInTarget} 条（应随旧库归档）`)
  // 判例链抽样：checkpoints slug 全回填
  const cpNoSlug = db.prepare(`SELECT COUNT(*) AS c FROM task_checkpoints WHERE slug IS NULL OR slug = ''`).get().c
  if (cpNoSlug !== 0) throw new Error(`判例链抽样失败：task_checkpoints 空 slug ${cpNoSlug} 行——回填禁悬空`)
  // FK 全库复验（foreign_keys 开启连接上插入，双保险）
  const fkIssues = db.prepare(`PRAGMA foreign_key_check`).all()
  if (fkIssues.length !== 0) throw new Error(`FK 复验失败：foreign_key_check 非空（${JSON.stringify(fkIssues.slice(0, 3))}）`)
  return counts
}

/** 人工清单 md 落盘（追加去重——同 table#id 同 field 不重写，重跑安全）。 */
function writeTaskLoopManualList(dbDir, manualList) {
  if (manualList.length === 0) return
  const manualPath = join(dbDir, 'migrate-task-loop-manual-review.md')
  let existing = ''
  try {
    existing = readFileSync(manualPath, 'utf8')
  } catch {
    /* 首次创建 */
  }
  for (const m of manualList) {
    const line = `- [ ] ${m.table}#${m.legacyId} (${m.field}) = ${m.value} —— ${m.reason}\n`
    if (existing.includes(line)) continue
    appendFileSync(manualPath, line, 'utf8')
    existing += line
  }
  emitDiag('warn', 'task-loop-migrate', `人工清单 ${manualList.length} 条（fix 判别不可判 / 孤儿行 / blocked_reason 无可挂流水——原值照搬禁置 NULL）：${manualPath}`)
}

/**
 * task-loop copy-out 主流程：新 task-loop.db 直写（缺席即建；在场走幂等判据与版本门）→
 * 逐旧库只读快照搬行 → 校验门 → 幂等标记 → 人工清单/manifest 留痕。
 * 旧库零写零改名零替换（原地只读归档）。返回搬行汇总。
 */
export function runTaskLoopMigration(args, dirNameToWsPath, nowIso) {
  const dbDir = join(args.home, 'forge', 'db', 'task-loop')
  const target = join(dbDir, 'task-loop.db')
  mkdirSync(dbDir, { recursive: true })

  const acc = {
    moved: { tasks: 0, edges: 0, sessionLinks: 0, records: 0, checkpoints: 0 },
    movedSkipped: { tasks: 0, edges: 0, sessionLinks: 0, records: 0, checkpoints: 0 },
    quarantined: 0,
    submitArchived: 0,
    manualList: [],
    dispositions: [],
    migratedDirs: [],
    skippedDirs: [],
  }
  const db = openExclusive(target) // copy-out 写面目标（被占用即抛——旧库不受影响）
  try {
    db.pragma('foreign_keys = ON')
    ensureTaskLoopSchema(db)
    assertTaskLoopVersionGate(db)
    const dirs = existsSync(args.workspacesFrom)
      ? readdirSync(args.workspacesFrom, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
      : []
    for (const dirName of dirs) {
      const legacyFile = join(args.workspacesFrom, dirName, 'forge.db')
      if (!existsSync(legacyFile)) continue
      if (!legacyHasTaskLoopTables(legacyFile)) continue
      const fp = `${statSync(legacyFile).size}:${statSync(legacyFile).mtimeMs}`
      const step = `task-loop:${dirName}`
      const done = db.prepare(`SELECT fingerprint FROM task_migrate_state WHERE step = ?`).get(step)
      if (done !== undefined && done.fingerprint === fp) {
        acc.skippedDirs.push(dirName)
        emitDiag('info', 'task-loop-migrate', `旧库已迁移且源未变（fingerprint 同）——跳过：${dirName}`)
        continue
      }
      const projectKey = taskLoopProjectKeyOf(dirName, dirNameToWsPath)
      const before = { ...acc.moved }
      const apply = db.transaction(() => migrateLegacyTaskDb(db, legacyFile, projectKey, dirName, nowIso, acc))
      apply()
      const movedDelta = Object.fromEntries(
        Object.entries(acc.moved).map(([k, v]) => [k, v - before[k] + acc.movedSkipped[k]]),
      ) // 口径 = 该 dir 在新库的在库行数（新搬 + 跳过既有）——校验门「行数 = 累计搬行」跨重跑稳定
      db.prepare(`INSERT OR REPLACE INTO task_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
        .run(step, fp, nowIso, JSON.stringify({ projectKey, moved: movedDelta }))
      acc.migratedDirs.push(dirName)
    }
    acc.counts = verifyTaskLoopMigration(db)
    db.prepare(`INSERT OR REPLACE INTO task_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
      .run('task-loop:section', dirs.join(','), nowIso, JSON.stringify({ migratedDirs: acc.migratedDirs }))
  } finally {
    db.close()
  }

  // 留痕：列映射 manifest + 人工清单（均落 db 侧同位目录）
  const manifestPath = join(dbDir, `migrate-manifest-${nowIso.replace(/[:.]/g, '-')}.json`)
  writeFileSync(manifestPath, JSON.stringify({ columnMap: TASK_LOOP_COLUMN_MAP_DOC, ...acc }, null, 2), 'utf8')
  writeTaskLoopManualList(dbDir, acc.manualList)

  emitDiag('info', 'task-loop-migrate', `task-loop copy-out 完成（旧库原地只读归档）：tasks=${acc.moved.tasks} edges=${acc.moved.edges} tsl=${acc.moved.sessionLinks} records=${acc.moved.records}（submit 断代归档 ${acc.submitArchived}）checkpoints=${acc.moved.checkpoints}（隔离区 ${acc.quarantined}，人工清单 ${acc.manualList.length}）；manifest：${manifestPath}`)
  return acc
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
          ).run({
            // 谱系宽容：旧 bugs 表后加列（recurrence_of/container_slug 等）缺席 → NULL
            // （named 绑定要求键齐全——缺键即 SqliteError，不能依赖行对象自带全键）
            id: null, summary: null, bug_desc: null, trigger_desc: null, expected: null, actual: null,
            suspected: null, error_type: null, bug_status: null, commit_hash: null, worktree: null, branch: null,
            unresolved_reason: null, fix_approach: null, source_task_id: null, recurrence_of: null, container_slug: null,
            report_session_id: null, fix_session_id: null, fixer: null, reporter: null, created_at: null, updated_at: null,
            ...r,
            project_key: projectKey,
          })
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
/**
 * 递归列出普通文件（rel 正斜杠相对路径 + 字节数）。skipDir(relPath) 命中的条目整棵不入结果
 * （先于类型判断——目标已失效的目录链接在 Dirent 里不是目录，同样按路径名跳过）。
 * 子目录结果逐个追加——`push(...子结果)` 在十万级文件的目录上超出单次调用实参上限（RangeError）。
 */
function walkFiles(root, rel = '', skipDir = null) {
  const out = []
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const relPath = rel === '' ? e.name : `${rel}/${e.name}`
    if (skipDir !== null && skipDir(relPath)) continue
    if (e.isDirectory()) {
      for (const f of walkFiles(root, relPath, skipDir)) out.push(f)
    } else out.push({ rel: relPath, size: statSync(join(root, ...relPath.split('/'))).size })
  }
  return out
}
/**
 * ③ 段不随迁的目录：logs 祖先目录下的 node_modules（历次验证遗留的依赖树——非状态数据，
 * 含大量 pnpm 目录链接；原目录改名保留，不丢）。
 */
function isSkippedWorkspaceDir(relPath) {
  const segments = relPath.split('/')
  return segments[segments.length - 1] === 'node_modules' && segments.includes('logs')
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

  // staged copy + manifest（文件数/字节；logs 下 node_modules 不随迁——跳过项记入 manifest）
  const skippedDirs = []
  const manifest = []
  for (const f of walkFiles(args.workspacesFrom, '', (relPath) => {
    if (!isSkippedWorkspaceDir(relPath)) return false
    skippedDirs.push(relPath)
    return true
  })) {
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
    skippedDirs,
    files: manifest,
  }, null, 2), 'utf8')
  db.prepare(`INSERT OR REPLACE INTO project_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
    .run(step, `${manifest.length}:${sourceBytes}`, nowIso, JSON.stringify({ from: args.workspacesFrom, to: args.workspacesTo, keptOriginal: keepOriginal, skippedDirs }))
  if (skippedDirs.length > 0) {
    emitDiag('warn', 'project-migrate', `forge-workspaces 搬迁跳过 ${skippedDirs.length} 个 logs 下 node_modules 目录（未随迁，原目录改名保留）：${skippedDirs.join('; ')}`)
  }
  emitDiag('info', 'project-migrate', `forge-workspaces 搬迁完成：${manifest.length} 文件 / ${sourceBytes} 字节，${args.workspacesFrom} → ${args.workspacesTo}（原目录改名保留 ${keepOriginal}）`)
  return { skipped: false, fileCount: manifest.length, totalBytes: sourceBytes, keptOriginal: keepOriginal }
}

/** 排他打开（写面目标被占用 → 抛错中止）。 */
function openExclusive(file) {
  return new Database(file) // 被占用时 open 即抛
}

/** 旧库只读打开（WAL 只读快照——零写零改名零替换，与持句柄进程共存）。 */
function openReadonly(file) {
  return new Database(file, { readonly: true, fileMustExist: true })
}

// ── 主流程 ──
export function main(argv) {
  const args = parseArgs(argv)
  const nowIso = new Date().toISOString()
  if (args.forgeDirs) return runForgeDirsMigration(args)
  if (args.bundle) return runBundleMigration(args, nowIso)
  mkdirSync(args.projectDbDir, { recursive: true })
  diagFile = join(args.projectDbDir, 'migrate-state-db-diag.log')
  emitDiag('info', 'project-migrate', `迁移开始：home=${args.home}`)

  // 观察项：宿主进程在场清单留痕（不阻断）+ project 搬行写面目标排他打开兜底
  if (!args.skipProcessCheck) observeHostProcesses()
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
      // ②b task-loop 搬行（五表 + UUID 改写 + checkpoints slug 回填——须先于 ③ 目录搬迁：
      // 搬行消费旧库 forge.db，搬迁后源目录已改名）
      summary.taskLoop = args.skipTaskLoop
        ? { skipped: true }
        : runTaskLoopMigration(args, dirNameToWsPath, nowIso)
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
    taskLoop: summary.taskLoop === undefined || summary.taskLoop?.skipped ? 'skipped' : `tasks=${summary.taskLoop.moved.tasks} records=${summary.taskLoop.moved.records}（submit 断代 ${summary.taskLoop.submitArchived}）cp=${summary.taskLoop.moved.checkpoints}`,
    workspaces: summary.workspaces?.skipped ? 'skipped' : `${summary.workspaces.fileCount} 文件 / ${summary.workspaces.totalBytes} 字节`,
  })}`)
  return summary
}

// ════════ bundle 搬行段（forge-aggregate-bundle 1.43——旧 home → forge-bundle 桌面 forge.db） ════════

/** bundle 段标记表（目标 forge.db 内——逐 step fingerprint 幂等，纪律同 project_migrate_state）。 */
function ensureBundleStateTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS bundle_migrate_state (
    step          TEXT PRIMARY KEY,
    fingerprint   TEXT NOT NULL,
    done_at       TEXT NOT NULL,
    summary_json  TEXT NOT NULL
  )`)
  // 隔离区（目标库首见时补建——桌面新库无此表，形状同①段 project.db 隔离区）
  db.exec(`CREATE TABLE IF NOT EXISTS project_bugs_quarantine (
    id            TEXT PRIMARY KEY,
    reason        TEXT NOT NULL,
    source_db     TEXT NOT NULL,
    row_json      TEXT NOT NULL,
    quarantined_at TEXT NOT NULL
  )`)
}
function bundleStateGet(db, step) {
  return db.prepare(`SELECT fingerprint FROM bundle_migrate_state WHERE step = ?`).get(step)
}
function bundleStatePut(db, step, fingerprint, nowIso, summaryJson) {
  db.prepare(`INSERT OR REPLACE INTO bundle_migrate_state (step, fingerprint, done_at, summary_json) VALUES (?, ?, ?, ?)`)
    .run(step, fingerprint, nowIso, summaryJson)
}
function fileFingerprint(file) {
  return existsSync(file) ? `${statSync(file).size}:${statSync(file).mtimeMs}` : 'absent'
}
/** bundle 段人工清单（追加去重——同键不重写，重跑安全；口径同 migrateBugs 人工清单）。 */
function appendBundleManualList(manualPath, entries) {
  if (entries.length === 0) return 0
  let existing = ''
  try {
    existing = readFileSync(manualPath, 'utf8')
  } catch {
    /* 首次创建 */
  }
  let appended = 0
  for (const m of entries) {
    const line = `- [ ] ${m.key} = ${JSON.stringify(m.value)} —— ${m.reason}\n`
    if (existing.includes(line)) continue
    appendFileSync(manualPath, line, 'utf8')
    appended += 1
  }
  return appended
}

// ── ⑤ bugs 搬行：源 project.db → 目标 forge.db project_bugs（同构直迁 + 项目行守卫） ──
function bundleMigrateBugs(db, args, nowIso) {
  const step = 'bundle:bugs'
  const fp = fileFingerprint(args.sourceProjectDb)
  const done = bundleStateGet(db, step)
  if (done !== undefined && done.fingerprint === fp) {
    emitDiag('info', 'bundle-migrate', `bugs 搬行已完成且源未变（fingerprint 同）——跳过`)
    return { skipped: true }
  }
  if (!existsSync(args.sourceProjectDb)) {
    emitDiag('warn', 'bundle-migrate', `源 project.db 缺席（${args.sourceProjectDb}）——bugs 搬行跳过`)
    return { skipped: true, absent: true }
  }
  const targetProjects = new Set(db.prepare(`SELECT project_key FROM project_projects`).all().map((r) => r.project_key))
  const src = openReadonly(args.sourceProjectDb)
  const rows = src.prepare(`SELECT * FROM project_bugs ORDER BY created_at ASC, id ASC`).all()
  src.close()
  const manualPath = join(dirname(args.bundleDb), 'bundle-migrate-manual-review.md')
  const manualList = []
  let moved = 0
  let quarantined = 0
  const apply = db.transaction(() => {
    for (const r of rows) {
      if (db.prepare(`SELECT 1 FROM project_bugs WHERE id = ?`).get(r.id) !== undefined) continue
      if (!targetProjects.has(r.project_key)) {
        db.prepare(`INSERT OR IGNORE INTO project_bugs_quarantine (id, reason, source_db, row_json, quarantined_at) VALUES (?, ?, ?, ?, ?)`)
          .run(r.id, 'project-key-absent-in-target', args.sourceProjectDb, JSON.stringify(r), nowIso)
        quarantined += 1
        continue
      }
      if (r.recurrence_of !== null && r.recurrence_of !== '') {
        const universe = new Set(rows.map((x) => x.id))
        if (!universe.has(r.recurrence_of)) {
          manualList.push({ key: `bug ${r.id} (recurrence_of)`, value: r.recurrence_of, reason: '复发链前驱不在迁移全集——人工核验（原值照搬，禁置 NULL）' })
        }
      }
      db.prepare(
        `INSERT INTO project_bugs (id, project_key, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type,
         bug_status, commit_hash, worktree, branch, unresolved_reason, fix_approach, source_task_id, recurrence_of,
         container_slug, report_session_id, fix_session_id, fixer, reporter, created_at, updated_at)
         VALUES (@id, @project_key, @summary, @bug_desc, @trigger_desc, @expected, @actual, @suspected, @error_type,
         @bug_status, @commit_hash, @worktree, @branch, @unresolved_reason, @fix_approach, @source_task_id, @recurrence_of,
         @container_slug, @report_session_id, @fix_session_id, @fixer, @reporter, @created_at, @updated_at)`,
      ).run({
        id: null, project_key: null, summary: null, bug_desc: null, trigger_desc: null, expected: null, actual: null,
        suspected: null, error_type: null, bug_status: null, commit_hash: null, worktree: null, branch: null,
        unresolved_reason: null, fix_approach: null, source_task_id: null, recurrence_of: null, container_slug: null,
        report_session_id: null, fix_session_id: null, fixer: null, reporter: null, created_at: null, updated_at: null,
        ...r,
      })
      moved += 1
    }
  })
  apply()
  const appended = appendBundleManualList(manualPath, manualList)
  if (appended > 0) emitDiag('warn', 'bundle-migrate', `人工清单 ${appended} 条（recurrence_of 断链）：${manualPath}`)
  bundleStatePut(db, step, fp, nowIso, JSON.stringify({ moved, quarantined, manual: manualList.length }))
  return { skipped: false, moved, quarantined, manual: manualList.length }
}

// ── ⑥ tasks 搬行：源 task-loop.db → 目标 forge.db（feature 容器剔除 + 项目行守卫 + 同迁四表） ──
const TASK_COMPANION_TABLES = ['task_edges', 'task_records', 'task_session_links', 'task_settlements']

/** 源 feature 容器 slug 全集（源各工作区库 features 表——用户裁定：关联任务不迁移）。 */
function sourceFeatureSlugs(args) {
  const slugs = new Set()
  if (!existsSync(args.sourceWorkspaces)) return slugs
  for (const e of readdirSync(args.sourceWorkspaces, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const f = join(args.sourceWorkspaces, e.name, 'forge.db')
    if (!existsSync(f)) continue
    const w = openReadonly(f)
    try {
      if (hasTable(w, 'features')) {
        for (const r of w.prepare(`SELECT slug FROM features`).all()) slugs.add(r.slug)
      }
    } finally {
      w.close()
    }
  }
  return slugs
}

function bundleMigrateTasks(db, args, nowIso) {
  const step = 'bundle:tasks'
  const fp = fileFingerprint(args.sourceTaskLoopDb)
  const done = bundleStateGet(db, step)
  if (done !== undefined && done.fingerprint === fp) {
    emitDiag('info', 'bundle-migrate', `tasks 搬行已完成且源未变（fingerprint 同）——跳过`)
    return { skipped: true }
  }
  if (!existsSync(args.sourceTaskLoopDb)) {
    emitDiag('warn', 'bundle-migrate', `源 task-loop.db 缺席（${args.sourceTaskLoopDb}）——tasks 搬行跳过`)
    return { skipped: true, absent: true }
  }
  const targetProjects = new Set(db.prepare(`SELECT project_key FROM project_projects`).all().map((r) => r.project_key))
  const featureSlugs = sourceFeatureSlugs(args)
  const src = openReadonly(args.sourceTaskLoopDb)
  const TASK_COLS = ['id', 'slug', 'local_id', 'title', 'task_type', 'task_status', 'brief', 'ac_json', 'priority',
    'estimated_time', 'scope_json', 'context_json', 'fix_of_task_id', 'breaking', 'coverage_threshold', 'complexity',
    'project_key', 'created_at', 'updated_at']
  const taskColsSql = TASK_COLS.join(', ')
  const srcTasks = src.prepare(`SELECT ${taskColsSql} FROM task_tasks ORDER BY created_at ASC, id ASC`).all()
  const manualPath = join(dirname(args.bundleDb), 'bundle-migrate-manual-review.md')
  const manualList = []
  const migratedIds = new Set()
  let moved = 0
  let skippedFeature = 0
  let skippedProject = 0
  let skippedDuplicate = 0
  // 阶段一：迁移集划定（剔除 + 去重判据，零写入）
  for (const r of srcTasks) {
    if (featureSlugs.has(r.slug)) {
      skippedFeature += 1
      continue
    }
    if (!targetProjects.has(r.project_key)) {
      skippedProject += 1
      continue
    }
    if (db.prepare(`SELECT 1 FROM task_tasks WHERE project_key = ? AND slug = ? AND local_id = ?`)
      .get(r.project_key, r.slug, r.local_id) !== undefined) {
      skippedDuplicate += 1
      continue
    }
    migratedIds.add(r.id)
  }
  const apply = db.transaction(() => {
    // 阶段二：按迁移集插行——fix_of_task_id 前驱必须在迁移集内（FK 闭合；缺前驱 → 置 NULL + 人工清单）
    for (const r of srcTasks) {
      if (!migratedIds.has(r.id)) continue
      let fixOf = r.fix_of_task_id
      if (fixOf !== null && fixOf !== '') {
        if (!migratedIds.has(fixOf)) {
          manualList.push({ key: `task ${r.id} (fix_of_task_id)`, value: fixOf, reason: 'fix 前驱不在迁移全集（feature/无项目剔除）——已置 NULL，原值留档人工核验' })
          fixOf = null
        }
      }
      db.prepare(
        `INSERT INTO task_tasks (${taskColsSql}) VALUES (${TASK_COLS.map((c) => `@${c}`).join(', ')})`,
      ).run({ ...r, fix_of_task_id: fixOf })
      moved += 1
    }
    // 四张伴表：随迁移集同迁（fix_of_task_id 引用闭合由上一段保证）；edges 缺端 → 人工清单
    for (const table of TASK_COMPANION_TABLES) {
      if (!hasTable(src, table) || !hasTable(db, table)) continue
      const cols = [...tableColumns(src, table)]
      const colsSql = cols.join(', ')
      let dropped = 0
      for (const row of src.prepare(`SELECT ${colsSql} FROM ${table}`).all()) {
        if (!migratedIds.has(row.task_id)) {
          dropped += 1
          continue
        }
        if (table === 'task_edges') {
          // edges 无 id 列（复合键表）——存在判据按 (task_id, prerequisite_id, origin)
          if (db.prepare(`SELECT 1 FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin IS ?`)
            .get(row.task_id, row.prerequisite_id, row.origin ?? null) !== undefined) continue
          if (!migratedIds.has(row.prerequisite_id)) {
            manualList.push({ key: `edge ${row.task_id}→${row.prerequisite_id}`, value: row.prerequisite_id, reason: '前驱端点不在迁移全集（feature/无项目剔除）——人工核验' })
            continue
          }
        } else if (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(row.id) !== undefined) continue
        db.prepare(`INSERT INTO ${table} (${colsSql}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(row)
      }
      if (dropped > 0) emitDiag('info', 'bundle-migrate', `${table}：${dropped} 行随剔除容器不迁（计数留痕——用户裁定整体剔除面）`)
    }
  })
  apply()
  src.close()
  const appended = appendBundleManualList(manualPath, manualList)
  if (appended > 0) emitDiag('warn', 'bundle-migrate', `人工清单 ${appended} 条（fix 前驱/edge 端点）：${manualPath}`)
  // 覆盖率复验：源 tasks 每行 ∈ 目标迁移集 ∪ 三类剔除计数（行数硬判据）
  const total = moved + skippedFeature + skippedProject + skippedDuplicate
  if (total !== srcTasks.length) throw new Error(`tasks 搬行复验失败：源 ${srcTasks.length} 行 ≠ 迁移 ${moved} + 剔除 ${skippedFeature}/${skippedProject} + 去重 ${skippedDuplicate}`)
  bundleStatePut(db, step, fp, nowIso, JSON.stringify({ moved, skippedFeature, skippedProject, skippedDuplicate, manual: manualList.length }))
  return { skipped: false, moved, skippedFeature, skippedProject, skippedDuplicate, manual: manualList.length }
}

// ── ⑦ proposals → specs（rejected/superseded 不迁移；状态映射 + transition 留痕） ──
const PROPOSAL_STATUS_TO_SPEC = {
  draft: 'draft',
  'under-review': 'awaiting_approval',
  accepted: 'approved',
}
const PROPOSAL_STATUS_SKIP = new Set(['rejected', 'superseded'])

function bundleMigrateProposals(db, args, nowIso) {
  const step = 'bundle:specs'
  const dirs = existsSync(args.sourceWorkspaces)
    ? readdirSync(args.sourceWorkspaces, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : []
  const fp = dirs.map((d) => fileFingerprint(join(args.sourceWorkspaces, d, 'forge.db'))).join(',')
  const done = bundleStateGet(db, step)
  if (done !== undefined && done.fingerprint === fp) {
    emitDiag('info', 'bundle-migrate', `proposals→specs 搬行已完成且源未变（fingerprint 同）——跳过`)
    return { skipped: true }
  }
  if (dirs.length === 0) {
    emitDiag('warn', 'bundle-migrate', `源 workspaces 缺席（${args.sourceWorkspaces}）——proposals→specs 跳过`)
    return { skipped: true, absent: true }
  }
  const targetProjects = new Set(db.prepare(`SELECT project_key FROM project_projects`).all().map((r) => r.project_key))
  const manualPath = join(dirname(args.bundleDb), 'bundle-migrate-manual-review.md')
  const manualList = []
  let moved = 0
  let skippedTerminal = 0
  let skippedProject = 0
  let skippedConflict = 0
  const apply = db.transaction(() => {
    for (const dirName of dirs) {
      const forgeDb = join(args.sourceWorkspaces, dirName, 'forge.db')
      if (!existsSync(forgeDb)) continue
      const legacy = openReadonly(forgeDb)
      try {
        if (!hasTable(legacy, 'proposals')) continue
        // project_key：孤目录名 `{flatten}@{hash8}` 自证（DIR_NAME_RE 同①段判据）
        if (!DIR_NAME_RE.test(dirName)) continue
        const projectKey = dirName
        for (const p of legacy.prepare(`SELECT * FROM proposals ORDER BY created_at ASC, id ASC`).all()) {
          if (PROPOSAL_STATUS_SKIP.has(p.proposal_status)) {
            skippedTerminal += 1
            continue
          }
          const toStatus = PROPOSAL_STATUS_TO_SPEC[p.proposal_status]
          if (toStatus === undefined) {
            manualList.push({ key: `proposal ${p.id} (${p.slug})`, value: p.proposal_status, reason: '未知 proposal_status——状态映射缺席，人工裁决' })
            continue
          }
          if (!targetProjects.has(projectKey)) {
            skippedProject += 1
            continue
          }
          if (db.prepare(`SELECT 1 FROM spec_specs WHERE project_key = ? AND slug = ?`).get(projectKey, p.slug) !== undefined) {
            skippedConflict += 1
            continue
          }
          db.prepare(
            `INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, milestone_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, '[]', ?, NULL, ?, ?)`,
          ).run(p.id, p.slug, p.title, toStatus, projectKey, p.created_at, p.updated_at)
          // spec_docs（1:1 PK spec_id——rel_path 非空才挂）
          if (p.rel_path !== null && p.rel_path !== '') {
            db.prepare(`INSERT OR IGNORE INTO spec_docs (spec_id, rel_path, created_at, updated_at) VALUES (?, ?, ?, ?)`)
              .run(p.id, p.rel_path, p.created_at, nowIso)
          }
          // transition 留痕行（降档信息 note 全量携带——mode/superseded_by/author 无承载列）
          const noteBits = [`legacy proposal 迁移：proposal_status=${p.proposal_status}`]
          if (p.mode !== null && p.mode !== undefined) noteBits.push(`mode=${p.mode}`)
          if (p.superseded_by !== null && p.superseded_by !== undefined && p.superseded_by !== '') noteBits.push(`superseded_by=${p.superseded_by}`)
          if (p.author !== null && p.author !== undefined && p.author !== '') noteBits.push(`author=${p.author}`)
          db.prepare(
            `INSERT INTO spec_transitions (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
             VALUES (?, 'spec', ?, 'draft', ?, ?, 'plugin-tool', ?)`,
          ).run(randomUUID(), p.id, toStatus, noteBits.join('; '), p.decided_at ?? p.updated_at)
          moved += 1
        }
      } finally {
        legacy.close()
      }
    }
  })
  apply()
  const appended = appendBundleManualList(manualPath, manualList)
  if (appended > 0) emitDiag('warn', 'bundle-migrate', `人工清单 ${appended} 条：${manualPath}`)
  bundleStatePut(db, step, fp, nowIso, JSON.stringify({ moved, skippedTerminal, skippedProject, skippedConflict, manual: manualList.length }))
  return { skipped: false, moved, skippedTerminal, skippedProject, skippedConflict, manual: manualList.length }
}

// ── bundle 段主流程（staged 快照 → 三步搬行 → 复验 → 原子替换） ──
export function runBundleMigration(args, nowIso) {
  if (!existsSync(args.bundleDb)) throw new Error(`目标 forge.db 缺席（${args.bundleDb}）——先在 dsh desktop 安装并启动一次 forge-bundle 再迁移`)
  const dbDir = dirname(args.bundleDb)
  mkdirSync(dbDir, { recursive: true })
  diagFile = join(dbDir, 'migrate-bundle-diag.log')
  emitDiag('info', 'bundle-migrate', `bundle 迁移开始：target=${args.bundleDb} source=${args.source}`)
  if (!args.skipProcessCheck) observeHostProcesses()
  // 目标库排他打开兜底（desktop 宿主在场持句柄 → open 即抛——迁移前须关闭 dsh desktop）
  openExclusive(args.bundleDb).close()

  // staged 快照（VACUUM INTO——一致快照 + 零 WAL 侧车）
  const stagedDb = `${args.bundleDb}.staged-bundle-migrate`
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${stagedDb}${suffix}`
    if (existsSync(p)) rmSync(p, { force: true })
  }
  {
    const srcConn = openExclusive(args.bundleDb)
    try {
      srcConn.pragma('wal_checkpoint(TRUNCATE)')
      srcConn.exec(`VACUUM INTO '${stagedDb.replaceAll("'", "''")}'`)
    } finally {
      srcConn.close()
    }
  }
  const summary = {}
  {
    const db = openExclusive(stagedDb)
    try {
      ensureBundleStateTable(db)
      summary.bugs = args.skipBundleBugs ? { skipped: true } : bundleMigrateBugs(db, args, nowIso)
      summary.tasks = args.skipBundleTasks ? { skipped: true } : bundleMigrateTasks(db, args, nowIso)
      summary.specs = args.skipBundleSpecs ? { skipped: true } : bundleMigrateProposals(db, args, nowIso)
    } finally {
      db.close()
    }
    // 原子替换（原库改名保留为回滚点；WAL 侧车随旧文件清除——staged 无 WAL）
    const keepDb = `${args.bundleDb}.pre-bundle-migrate-${nowIso.replace(/[:.]/g, '-')}`
    renameSync(args.bundleDb, keepDb)
    for (const suffix of ['-wal', '-shm']) {
      const p = `${args.bundleDb}${suffix}`
      if (existsSync(p)) unlinkSync(p)
    }
    try {
      renameSync(stagedDb, args.bundleDb)
    } catch (cause) {
      renameSync(keepDb, args.bundleDb)
      throw new Error(`staged forge.db 换回失败（已回滚）：${cause.message}`)
    }
    emitDiag('info', 'bundle-migrate', `forge.db 原子替换完成（原库改名保留 ${keepDb}）`)
  }
  emitDiag('info', 'bundle-migrate', `bundle 迁移完成：${JSON.stringify({
    bugs: summary.bugs?.skipped ? 'skipped' : `moved=${summary.bugs.moved} quarantined=${summary.bugs.quarantined}`,
    tasks: summary.tasks?.skipped ? 'skipped' : `moved=${summary.tasks.moved} feature=${summary.tasks.skippedFeature} project=${summary.tasks.skippedProject} dup=${summary.tasks.skippedDuplicate}`,
    specs: summary.specs?.skipped ? 'skipped' : `moved=${summary.specs.moved} terminal=${summary.specs.skippedTerminal} project=${summary.specs.skippedProject} conflict=${summary.specs.skippedConflict}`,
  })}`)
  return summary
}

// ════════ forge-dirs 段（forge-dirs-unification §2.8——--forge-dirs 门控启用，独立模式） ════════
// 人工执行；执行前须关闭 dsh desktop（observeHostProcesses 留痕不阻断）。处理两样：
//   (a) {home}/experts → {home}/forge/experts（staged copy + 校验 + 原目录改名保留，做法同 ③ relocateWorkspaces）；
//   (b) {home}/forge/projects/ 下按工作树路径派生命名（{flatten}@{hash8}）的运行时目录，
//       日志并入以项目 projectKey 命名的目录——projectKey = lib/path projectKeyOf 对主检出路径
//       （git worktree list 现查归拢 resolveMainCheckoutRoot + realpath 规范化）算出。
// 规则（Spec §2.8 规则表）：
//   · 完成标记 = 文件 {home}/forge/migrate-forge-dirs.json，逐项记录已完成的搬迁；
//   · 时间戳格式 YYYYMMDDTHHmmss（本地时间；--stamp 显式覆盖为测试缝）；
//   · 完成标记在旧目录改名之前写入——写入后中断重跑跳过该项，旧目录原地留着不丢数据；
//   · 旧目录成功后改名 原目录名.pre-migrate-<时间戳> 保留，不删除；
//   · 重跑：已完成项跳过；目标目录在场且无完成标记 → 拒绝执行并报错；
//   · 改名失败 → 中止，不删除任何目录；
//   · 日志同名冲突：不覆盖也不跳过——被并入的那份改名 原文件名.conflict-<时间戳> 保留，数量写入标记文件；
//   · 不处理 {home}/knowledge/knowledge.db（旧库 291 条已全在现行库）。
// 工作树路径解析链（目录名 → 工作树路径）：state.db projects 行映射 → --registry 快照
// （deriveDirName 同算法键对齐）→ flatten 反构重建（含 '-' 路径名歧义，以目录在场性裁决）。
// 归属键单源：projectKeyOf / resolveMainCheckoutRoot 从 lib/path 构建产物 dist 引入（脚本态
// 纯 node 无法加载 TS src——node 类型剥离不重写 .js 说明符；dist = src 的 tsc 产物）。

/** 时间戳 YYYYMMDDTHHmmss（本地时间；--stamp 测试缝显式覆盖）。 */
function forgeDirsStamp(override) {
  if (override !== null) return override
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
}

/** realpath 规范化（真实路径与大小写——projectKey 大小写敏感；不可达原样返回）。 */
function canonicalizeRealPath(p) {
  try {
    return realpathSync.native(p)
  } catch {
    return p
  }
}

function readForgeDirsMarker(markerPath) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && parsed.items !== null && typeof parsed.items === 'object') return parsed
  } catch {
    /* 首次运行——标记文件缺席 */
  }
  return { items: {} }
}

function writeForgeDirsMarker(markerPath, marker) {
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf8')
}

/** (a) {home}/experts → {home}/forge/experts（staged copy + 校验 + 标记先写 + 改名保留）。 */
function migrateExpertsDir(args, ts, marker, markerPath) {
  const step = 'experts'
  const from = join(args.home, 'experts')
  const to = join(args.home, 'forge', 'experts')
  if (marker.items[step] !== undefined) {
    emitDiag('info', 'forge-dirs-migrate', `experts 搬迁已完成（标记在场）——跳过：${from} → ${to}`)
    return { status: 'skipped' }
  }
  if (!existsSync(from)) {
    emitDiag('info', 'forge-dirs-migrate', `源目录缺席（${from}）——experts 搬迁跳过`)
    marker.items[step] = { status: 'absent-source', done_at: ts, from, to }
    writeForgeDirsMarker(markerPath, marker)
    return { status: 'absent-source' }
  }
  if (existsSync(to)) {
    throw new Error(`目标目录已在场且无完成标记：${to}——请人工确认后处理（禁覆盖）`)
  }
  const staged = `${to}.staged-migrate`
  rmSync(staged, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  mkdirSync(staged, { recursive: true })
  const volTarget = volumeRootOf(to)
  const volStaged = volumeRootOf(staged)
  if (volTarget.toLowerCase() !== volStaged.toLowerCase()) {
    throw new Error(`同卷断言失败：staged ${volStaged} ≠ 目标 ${volTarget}`)
  }
  // staged copy + 校验（文件数 / 字节 / 哈希逐件比对——做法同 ③ relocateWorkspaces）
  const manifest = []
  for (const f of walkFiles(from)) {
    const src = join(from, ...f.rel.split('/'))
    const dst = join(staged, ...f.rel.split('/'))
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(src, dst)
    const hash = sha256File(src)
    manifest.push({ rel: f.rel, size: f.size, sha256: hash })
    if (statSync(dst).size !== f.size) throw new Error(`staged copy 字节数不一致：${f.rel}`)
  }
  const stagedFiles = walkFiles(staged)
  if (stagedFiles.length !== manifest.length) throw new Error(`staged 校验失败：文件数 ${stagedFiles.length} ≠ ${manifest.length}`)
  let stagedBytes = 0
  for (const f of stagedFiles) stagedBytes += statSync(join(staged, ...f.rel.split('/'))).size
  const sourceBytes = manifest.reduce((s, f) => s + f.size, 0)
  if (stagedBytes !== sourceBytes) throw new Error(`staged 校验失败：字节 ${stagedBytes} ≠ ${sourceBytes}`)
  for (const f of manifest) {
    if (sha256File(join(staged, ...f.rel.split('/'))) !== f.sha256) throw new Error(`staged 校验失败：哈希不一致 ${f.rel}`)
  }
  // 完成标记在旧目录改名之前写入（写入后中断 → 重跑跳过，旧目录原地留着不丢数据）
  const keptOriginal = `${from}.pre-migrate-${ts}`
  marker.items[step] = { status: 'done', done_at: ts, from, to, keptOriginal, fileCount: manifest.length, totalBytes: sourceBytes, conflicts: 0 }
  writeForgeDirsMarker(markerPath, marker)
  renameSync(from, keptOriginal) // 改名失败 → 中止（标记已写，重跑跳过），不删除任何目录
  try {
    renameSync(staged, to)
  } catch (cause) {
    renameSync(keptOriginal, from) // 回滚
    throw new Error(`staged → 目标改名失败（已回滚原目录）：${cause.message}`)
  }
  emitDiag('info', 'forge-dirs-migrate', `experts 搬迁完成：${manifest.length} 文件 / ${sourceBytes} 字节，${from} → ${to}（原目录改名保留 ${keptOriginal}）`)
  return { status: 'done', fileCount: manifest.length, totalBytes: sourceBytes, keptOriginal }
}

/** 目录名 → 工作树路径解析链：ws_path 映射 → flatten 反构重建（在场性裁决；不可得 = null）。 */
function resolveWsPathForDirName(dirName, dirNameToWsPath) {
  const mapped = dirNameToWsPath.get(dirName)
  if (mapped !== undefined && existsSync(mapped)) return mapped
  const at = dirName.lastIndexOf('@')
  if (at <= 0) return null
  const flat = dirName.slice(0, at)
  const withDrive = /^[A-Za-z]/.test(flat) ? `${flat[0]}:${flat.slice(1)}` : flat
  const rebuilt = withDrive.replaceAll('-', sep)
  return existsSync(rebuilt) ? rebuilt : null
}

/** 冲突名唯一化（同名 .conflict-<ts> 已在场 → 追加 -2/-3 序号——跨轮中断重跑防覆盖）。 */
function conflictPathFor(targetFile, ts) {
  let candidate = `${targetFile}.conflict-${ts}`
  let n = 2
  while (existsSync(candidate)) {
    candidate = `${targetFile}.conflict-${ts}-${n}`
    n += 1
  }
  return candidate
}

/**
 * (b) {home}/forge/projects/ 下按工作树路径派生命名的运行时目录 → 日志并入 projectKey 目录。
 * 逐文件拷贝并入（同名冲突改名保留），完成标记先写，源目录改名 .pre-migrate-<ts> 保留。
 */
function mergeProjectRuntimeDirs(args, ts, marker, markerPath, dirNameToWsPath) {
  const projectsRoot = join(args.home, 'forge', 'projects')
  if (!existsSync(projectsRoot)) {
    emitDiag('info', 'forge-dirs-migrate', `projects 根缺席（${projectsRoot}）——运行时目录并入跳过`)
    return []
  }
  const summaries = []
  const dirs = readdirSync(projectsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const dirName of dirs) {
    const step = `project-runtime:${dirName}`
    if (marker.items[step] !== undefined) {
      emitDiag('info', 'forge-dirs-migrate', `运行时目录并入已完成（标记在场）——跳过：${dirName}`)
      continue
    }
    if (!DIR_NAME_RE.test(dirName)) {
      emitDiag('warn', 'forge-dirs-migrate', `目录名非 {flatten}@{hash8} 派生制——跳过：${dirName}`)
      continue
    }
    const srcDir = join(projectsRoot, dirName)
    const wsPath = resolveWsPathForDirName(dirName, dirNameToWsPath)
    if (wsPath === null) {
      emitDiag('warn', 'forge-dirs-migrate', `工作树路径不可解析（无 ws_path 映射且 flatten 反构不在场）——跳过：${dirName}`)
      continue
    }
    const probe = resolveMainCheckoutRoot(wsPath)
    if (probe.entries === undefined || probe.entries.length === 0) {
      emitDiag('warn', 'forge-dirs-migrate', `主检出归拢失败（${probe.reason ?? 'porcelain 清单为空'}）——跳过：${dirName}`)
      continue
    }
    const mainRoot = canonicalizeRealPath(probe.entries[0].path)
    let projectKey
    try {
      projectKey = libProjectKeyOf(mainRoot)
    } catch {
      emitDiag('warn', 'forge-dirs-migrate', `projectKey 派生失败（主检出根空）——跳过：${dirName}`)
      continue
    }
    const targetDir = join(projectsRoot, projectKey)
    if (projectKey === dirName) {
      // 目录本身即以 projectKey 命名（主检出运行时目录）——无并入面
      marker.items[step] = { status: 'already-project-key', done_at: ts, dir: srcDir, projectKey }
      writeForgeDirsMarker(markerPath, marker)
      emitDiag('info', 'forge-dirs-migrate', `目录已以 projectKey 命名——跳过：${dirName}`)
      continue
    }
    // 逐文件并入（拷贝 + 字节校验；同名冲突 → 被并入那份改名 .conflict-<ts> 保留，不覆盖不跳过）
    let conflicts = 0
    let files = 0
    for (const f of walkFiles(srcDir)) {
      const src = join(srcDir, ...f.rel.split('/'))
      const dst = join(targetDir, ...f.rel.split('/'))
      const finalDst = existsSync(dst) ? conflictPathFor(dst, ts) : dst
      if (finalDst !== dst) conflicts += 1
      mkdirSync(dirname(finalDst), { recursive: true })
      copyFileSync(src, finalDst)
      if (statSync(finalDst).size !== f.size) throw new Error(`并入拷贝字节数不一致：${f.rel}`)
      files += 1
    }
    // 完成标记在旧目录改名之前写入
    const keptOriginal = join(projectsRoot, `${dirName}.pre-migrate-${ts}`)
    marker.items[step] = { status: 'done', done_at: ts, from: srcDir, to: targetDir, projectKey, mainRoot, keptOriginal, fileCount: files, conflicts }
    writeForgeDirsMarker(markerPath, marker)
    renameSync(srcDir, keptOriginal) // 改名失败 → 中止（不删除任何目录；标记已写，重跑跳过）
    emitDiag('info', 'forge-dirs-migrate', `运行时目录并入完成：${dirName} → ${projectKey}（${files} 文件，同名冲突 ${conflicts}；原目录改名保留 ${keptOriginal}）`)
    summaries.push({ dirName, projectKey, fileCount: files, conflicts })
  }
  return summaries
}

/** forge-dirs 段主流程（--forge-dirs 独立模式——只跑本段，不触①-④与 bundle 段）。 */
export function runForgeDirsMigration(args) {
  const forgeDir = join(args.home, 'forge')
  mkdirSync(join(forgeDir, 'db', 'project'), { recursive: true })
  diagFile = join(forgeDir, 'db', 'project', 'migrate-state-db-diag.log')
  emitDiag('info', 'forge-dirs-migrate', `forge-dirs 迁移开始：home=${args.home}`)
  if (!args.skipProcessCheck) observeHostProcesses()
  const ts = forgeDirsStamp(args.stamp)
  const markerPath = join(forgeDir, 'migrate-forge-dirs.json')
  const marker = readForgeDirsMarker(markerPath)
  // ws_path 映射（state.db projects 行——判据同 ② 段）+ --registry 快照（deriveDirName 同算法键对齐）
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
  if (args.registry !== null) {
    const snapshot = JSON.parse(readFileSync(args.registry, 'utf8'))
    if (!Array.isArray(snapshot)) throw new Error('--registry 快照非数组（期望 [{ id, path }]）')
    for (const e of snapshot) {
      const key = libProjectKeyOf(e.path)
      if (!dirNameToWsPath.has(key)) dirNameToWsPath.set(key, e.path)
    }
  }
  const summary = {
    experts: migrateExpertsDir(args, ts, marker, markerPath),
    projects: mergeProjectRuntimeDirs(args, ts, marker, markerPath, dirNameToWsPath),
  }
  emitDiag('info', 'forge-dirs-migrate', `forge-dirs 迁移完成：experts=${summary.experts.status}，运行时目录并入 ${summary.projects.length} 项（标记：${markerPath}）`)
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
