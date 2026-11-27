// bundle 搬行段测试——scripts/migrate-state-db.mjs `--bundle` 三步（bugs/tasks/proposals→specs）。
// fixture = 旧 home post-migration 布局最小形状（project.db + task-loop.db + workspaces forge.db）
// 对目标 forge.db 最小形状跑 runBundleMigration；覆盖：同构直迁、feature/无项目剔除、
// fix 前驱 FK 闭合、edges 端点守卫、状态映射、rejected/superseded 跳过、slug 冲突、幂等跳过。
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, afterAll } from "vitest";
import Database from "@dsh-forge/lib-db";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "..", "..", "..");
const SCRIPT_PATH = join(repoRoot, "scripts", "migrate-state-db.mjs");
const mod = (await import(pathToFileURL(SCRIPT_PATH).href)) as Record<string, any>;
const runBundle = mod.runBundleMigration as (args: Record<string, any>, nowIso: string) => Record<string, any>;

const NOW = "2026-11-22T00:00:00.000Z";

// ── 目标 forge.db 最小形状（列集覆盖搬行 INSERT 面列清单） ──
function buildTargetDb(file: string): void {
  const db = new Database(file);
  try {
    db.exec(`
      CREATE TABLE project_projects (id TEXT PRIMARY KEY, project_key TEXT NOT NULL, title TEXT);
      CREATE TABLE project_workspaces (id TEXT PRIMARY KEY, project_id TEXT, workspace_id TEXT, ws_path TEXT, member_role TEXT, bound_at TEXT, created_at TEXT);
      CREATE TABLE project_bugs (
        id TEXT PRIMARY KEY, project_key TEXT, summary TEXT, bug_desc TEXT, trigger_desc TEXT, expected TEXT, actual TEXT,
        suspected TEXT, error_type TEXT, bug_status TEXT, commit_hash TEXT, worktree TEXT, branch TEXT,
        unresolved_reason TEXT, fix_approach TEXT, source_task_id TEXT, recurrence_of TEXT, container_slug TEXT,
        report_session_id TEXT, fix_session_id TEXT, fixer TEXT, reporter TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE task_tasks (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL, local_id TEXT NOT NULL, title TEXT NOT NULL, task_type TEXT NOT NULL,
        task_status TEXT NOT NULL DEFAULT 'pending', brief TEXT, ac_json TEXT, priority TEXT, estimated_time TEXT,
        scope_json TEXT, context_json TEXT, fix_of_task_id TEXT REFERENCES task_tasks(id), breaking INTEGER NOT NULL DEFAULT 0,
        coverage_threshold REAL, complexity TEXT NOT NULL DEFAULT 'medium', project_key TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE task_settlements (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, seq INTEGER NOT NULL, fix_root_id TEXT, result TEXT NOT NULL, ac_results_json TEXT NOT NULL DEFAULT '[]', commit_hash TEXT, evidence_json TEXT, created_at TEXT NOT NULL);
      CREATE TABLE task_edges (task_id TEXT NOT NULL, prerequisite_id TEXT NOT NULL, origin TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE task_session_links (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL, created_at TEXT, updated_at TEXT);
      CREATE TABLE task_records (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, verb TEXT NOT NULL, from_status TEXT, to_status TEXT, note TEXT, payload_json TEXT, dispatch_digest TEXT, loop_sourced INTEGER, actor TEXT, session_id TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE spec_specs (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, spec_status TEXT NOT NULL DEFAULT 'draft',
        tiers_json TEXT NOT NULL DEFAULT '[]', project_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, milestone_id TEXT);
      CREATE TABLE spec_docs (spec_id TEXT PRIMARY KEY REFERENCES spec_specs(id), rel_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE spec_transitions (id TEXT PRIMARY KEY, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL, note TEXT, actor TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    db.prepare(`INSERT INTO project_projects (id, project_key, title) VALUES ('p1', 'Z-project-demo@dadf6b04', 'demo')`).run();
    // 既有 spec 行（slug 冲突判据用——UNIQUE(project_key, slug)）
    db.prepare(`INSERT INTO spec_specs (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at) VALUES ('sp-exist', 'expert-builtin-redistribution', '既有', 'completed', '[]', 'Z-project-demo@dadf6b04', ?, ?)`).run(T, T);
    // 既有 spec 的文档行停在旧 proposal 口径（v1 迁移照搬 rel_path 的遗留）——重跑须自愈为 spec 口径
    db.prepare(`INSERT INTO spec_docs (spec_id, rel_path, created_at, updated_at) VALUES ('sp-exist', 'proposals/expert-builtin-redistribution/proposal.md', ?, ?)`).run(T, T);
  } finally {
    db.close();
  }
}

interface TempHomes {
  root: string;
  args: Record<string, any>;
}

function buildHomes(): TempHomes {
  const root = mkdtempSync(join(tmpdir(), "bundle-mig-"));
  const targetHome = join(root, "desktop-home");
  const source = join(root, "old-home");
  mkdirSync(join(targetHome, "forge", "db", "forge"), { recursive: true });
  buildTargetDb(join(targetHome, "forge", "db", "forge", "forge.db"));
  mkdirSync(join(source, "forge", "db", "project"), { recursive: true });
  mkdirSync(join(source, "forge", "db", "task-loop"), { recursive: true });
  mkdirSync(join(source, "forge", "workspaces", "Z-project-demo@dadf6b04"), { recursive: true });
  const args = {
    home: targetHome,
    source,
    bundleDb: join(targetHome, "forge", "db", "forge", "forge.db"),
    sourceProjectDb: join(source, "forge", "db", "project", "project.db"),
    sourceTaskLoopDb: join(source, "forge", "db", "task-loop", "task-loop.db"),
    sourceWorkspaces: join(source, "forge", "workspaces"),
    skipBundleBugs: false,
    skipBundleTasks: false,
    skipBundleSpecs: false,
    skipProcessCheck: true,
    skipDb: true,
    skipTaskLoop: true,
    skipWorkspaces: true,
  };
  return { root, args };
}

const PK = "Z-project-demo@dadf6b04";
const T = "2026-01-01T00:00:00.000Z";

describe("bundle 搬行段（migrate-state-db.mjs --bundle）", () => {
  const homes = buildHomes();
  afterAll(() => rmSync(homes.root, { recursive: true, force: true }));

  // ── 源 fixture 装配 ──
  {
    // project.db：bugs 两行（一在目标项目、一无）+ 断链 recurrence 一行
    const db = new Database(homes.args.sourceProjectDb);
    db.exec(`CREATE TABLE project_bugs (id TEXT PRIMARY KEY, project_key TEXT, summary TEXT, bug_desc TEXT, trigger_desc TEXT, expected TEXT, actual TEXT, suspected TEXT, error_type TEXT, bug_status TEXT, commit_hash TEXT, worktree TEXT, branch TEXT, unresolved_reason TEXT, fix_approach TEXT, source_task_id TEXT, recurrence_of TEXT, container_slug TEXT, report_session_id TEXT, fix_session_id TEXT, fixer TEXT, reporter TEXT, created_at TEXT, updated_at TEXT)`);
    const bugCols = "id, project_key, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type, bug_status, commit_hash, worktree, branch, unresolved_reason, fix_approach, source_task_id, recurrence_of, container_slug, report_session_id, fix_session_id, fixer, reporter, created_at, updated_at";
    const insertBug = db.prepare(`INSERT INTO project_bugs (${bugCols}) VALUES (${bugCols.split(", ").map(() => "?").join(",")})`);
    insertBug.run("b1", PK, "s1", null, null, null, null, null, null, "open", null, null, null, null, null, null, null, null, null, null, null, "rep", T, T);
    insertBug.run("b2", "Z-project-absent@99999999", "s2", null, null, null, null, null, null, "open", null, null, null, null, null, null, null, null, null, null, null, "rep", T, T);
    insertBug.run("b3", PK, "s3", null, null, null, null, null, null, "open", null, null, null, null, null, null, "b-missing", null, null, null, null, "rep", T, T);
    db.close();

    // task-loop.db：四任务（普通+fix 链两条 / feature 容器 / 无项目）+ 边两条 + 流水一条
    const tl = new Database(homes.args.sourceTaskLoopDb);
    tl.exec(`CREATE TABLE task_tasks (id TEXT PRIMARY KEY, slug TEXT NOT NULL, local_id TEXT NOT NULL, title TEXT NOT NULL, task_type TEXT NOT NULL, task_status TEXT NOT NULL DEFAULT 'pending', brief TEXT, ac_json TEXT, priority TEXT, estimated_time TEXT, scope_json TEXT, context_json TEXT, fix_of_task_id TEXT, breaking INTEGER NOT NULL DEFAULT 0, coverage_threshold REAL, complexity TEXT NOT NULL DEFAULT 'medium', project_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    tl.exec(`CREATE TABLE task_edges (task_id TEXT NOT NULL, prerequisite_id TEXT NOT NULL, origin TEXT, created_at TEXT, updated_at TEXT)`);
    tl.exec(`CREATE TABLE task_records (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, verb TEXT NOT NULL, from_status TEXT, to_status TEXT, note TEXT, payload_json TEXT, dispatch_digest TEXT, loop_sourced INTEGER, actor TEXT, session_id TEXT, created_at TEXT, updated_at TEXT)`);
    tl.exec(`CREATE TABLE task_session_links (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
    tl.exec(`CREATE TABLE task_settlements (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, seq INTEGER NOT NULL, fix_root_id TEXT, result TEXT NOT NULL, ac_results_json TEXT NOT NULL DEFAULT '[]', commit_hash TEXT, evidence_json TEXT, created_at TEXT NOT NULL)`);
    const tCols = "id, slug, local_id, title, task_type, task_status, brief, ac_json, priority, estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity, project_key, created_at, updated_at";
    const insertTask = tl.prepare(`INSERT INTO task_tasks (${tCols}) VALUES (${tCols.split(", ").map(() => "?").join(",")})`);
    const mk = (id: string, slug: string, fixOf: string | null, pk: string) => insertTask.run(id, slug, "1.1", "t", "coding-fix", "pending", null, "[]", "P1", null, null, null, fixOf, 0, null, "low", pk, T, T);
    mk("t1", "demo-proposal", null, PK); // 普通迁
    mk("t2", "demo-proposal", "t1", PK); // fix 链前驱在迁 → 原值直搬
    mk("t3", "mobile-ui", null, PK); // feature 容器 → 剔除
    mk("t4", "annotutor-proposal", null, "Z-project-absent@99999999"); // 无项目行 → 剔除
    mk("t5", "demo-proposal", "t3", PK); // fix 前驱在剔除集 → 置 NULL + 人工清单
    tl.prepare(`INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES (?,?,?,?,?)`).run("t2", "t1", "manual", T, T); // 双端在迁 → 迁
    tl.prepare(`INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES (?,?,?,?,?)`).run("t1", "t3", "manual", T, T); // 前驱剔除 → 人工清单
    tl.prepare(`INSERT INTO task_records (id, task_id, verb, created_at, updated_at) VALUES (?,?,?,?,?)`).run("r1", "t1", "claim", T, T); // 随迁
    tl.prepare(`INSERT INTO task_records (id, task_id, verb, created_at, updated_at) VALUES (?,?,?,?,?)`).run("r2", "t3", "claim", T, T); // 随剔除容器丢弃（计数）
    tl.close();

    // workspaces forge.db：features（容器 slug 集）+ proposals 五态 + 冲突 slug + 无文档提案
    const ws = new Database(join(homes.args.sourceWorkspaces, "Z-project-demo@dadf6b04", "forge.db"));
    ws.exec(`CREATE TABLE features (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT, feature_status TEXT, summary TEXT, proposal_id TEXT, created_at TEXT, updated_at TEXT)`);
    ws.prepare(`INSERT INTO features (id, slug, title, feature_status, created_at, updated_at) VALUES ('f1', 'mobile-ui', 'm', 'in-progress', ?, ?)`).run(T, T);
    ws.exec(`CREATE TABLE proposals (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT, proposal_status TEXT, rel_path TEXT, author TEXT, mode TEXT, superseded_by TEXT, decided_at TEXT, created_at TEXT, updated_at TEXT)`);
    const pCols = "id, slug, title, proposal_status, rel_path, author, mode, superseded_by, decided_at, created_at, updated_at";
    const insertP = ws.prepare(`INSERT INTO proposals (${pCols}) VALUES (${pCols.split(", ").map(() => "?").join(",")})`);
    insertP.run("pa", "prop-accepted", "已裁决", "accepted", "docs/proposals/prop-accepted/proposal.md", "alice", "blitz", null, "2026-02-01T00:00:00.000Z", T, T);
    insertP.run("pu", "prop-under-review", "待裁决", "under-review", null, null, "expedition", null, null, T, T);
    insertP.run("pd", "prop-draft", "草稿", "draft", null, null, null, null, null, T, T);
    insertP.run("pr", "prop-rejected", "拒收", "rejected", null, null, null, null, null, T, T);
    insertP.run("ps", "prop-superseded", "被取代", "superseded", null, null, null, "pa", null, T, T);
    insertP.run("pc", "expert-builtin-redistribution", "slug 冲突", "accepted", null, null, null, null, null, T, T);
    ws.close();
  }

  const summary = runBundle(homes.args, NOW);

  it("bugs：同项目行直迁、无项目行进隔离区、断链 recurrence 留人工清单", () => {
    expect(summary.bugs).toMatchObject({ skipped: false, moved: 2, quarantined: 1 });
    const db = new Database(homes.args.bundleDb, { readonly: true });
    expect(db.prepare(`SELECT count(*) c FROM project_bugs`).get().c).toBe(2);
    expect(db.prepare(`SELECT count(*) c FROM project_bugs_quarantine`).get().c).toBe(1);
    db.close();
    const manual = readFileSync(join(dirname(homes.args.bundleDb), "bundle-migrate-manual-review.md"), "utf8");
    expect(manual).toContain("b3");
  });

  it("tasks：feature/无项目剔除、fix 前驱闭合、edges 端点守卫、records 随迁", () => {
    expect(summary.tasks).toMatchObject({ skipped: false, moved: 3, skippedFeature: 1, skippedProject: 1 });
    const db = new Database(homes.args.bundleDb, { readonly: true });
    expect(db.prepare(`SELECT fix_of_task_id FROM task_tasks WHERE id = 't2'`).get().fix_of_task_id).toBe("t1");
    expect(db.prepare(`SELECT fix_of_task_id FROM task_tasks WHERE id = 't5'`).get().fix_of_task_id).toBeNull(); // 前驱在剔除集 → NULL
    expect(db.prepare(`SELECT count(*) c FROM task_edges`).get().c).toBe(1); // 仅 t2→t1
    expect(db.prepare(`SELECT count(*) c FROM task_records`).get().c).toBe(1); // 仅 r1
    db.close();
  });

  it("proposals→specs：三态映射 + transition 留痕 + doc 挂载；rejected/superseded 跳过；冲突跳过", () => {
    expect(summary.specs).toMatchObject({ skipped: false, moved: 3, skippedTerminal: 2, skippedConflict: 1, docsHealed: 1 });
    const db = new Database(homes.args.bundleDb, { readonly: true });
    const statusOf = (slug: string) => db.prepare(`SELECT spec_status FROM spec_specs WHERE slug = ?`).get(slug)?.spec_status;
    expect(statusOf("prop-accepted")).toBe("approved");
    expect(statusOf("prop-under-review")).toBe("awaiting_approval");
    expect(statusOf("prop-draft")).toBe("draft");
    // slug 冲突的既有 spec：旧 proposalDir 根相对口径自愈（检出根不在盘 → 按前缀规则）
    expect(db.prepare(`SELECT rel_path FROM spec_docs WHERE spec_id = 'sp-exist'`).get().rel_path).toBe(".forge/docs/proposals/expert-builtin-redistribution/proposal.md");
    const tr = db.prepare(`SELECT note, created_at, actor FROM spec_transitions WHERE entity_id = 'pa'`).get() as any;
    expect(tr.note).toContain("proposal_status=accepted");
    expect(tr.note).toContain("mode=blitz");
    expect(tr.actor).toBe("plugin-tool");
    expect(tr.created_at).toBe("2026-02-01T00:00:00.000Z"); // decided_at 优先
    expect(db.prepare(`SELECT rel_path FROM spec_docs WHERE spec_id = 'pa'`).get().rel_path).toBe(".forge/docs/proposals/prop-accepted/proposal.md"); // .forge 根相对旧值 → 项目根相对
    expect(db.prepare(`SELECT count(*) c FROM spec_docs`).get().c).toBe(2); // rel_path null 不挂；既有 spec 的旧口径行自愈 1
    db.close();
  });

  it("幂等：同 fingerprint 重跑三步全跳过", () => {
    const again = runBundle(homes.args, NOW);
    expect(again.bugs.skipped).toBe(true);
    expect(again.tasks.skipped).toBe(true);
    expect(again.specs.skipped).toBe(true);
  });

  it("原子替换：原库改名保留回滚点 + staged 侧车清场", () => {
    const files = readdirSync(dirname(homes.args.bundleDb));
    expect(files.some((f) => f.startsWith("forge.db.pre-bundle-migrate-"))).toBe(true);
    expect(files.some((f) => f.includes("staged-bundle-migrate"))).toBe(false);
  });
});
