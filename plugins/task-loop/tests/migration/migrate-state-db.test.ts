// 迁移脚本 task-loop 搬行段——判例 fixture 驱动测试（plugin-task-loop 1.16）。
// 被测脚本 = scripts/migrate-state-db.mjs（task-loop 搬行段）；判例库 = tests/db/fixtures/
// 六类预置判例（plugin-task-loop 1.6 入仓基座）。搬行口径 = proposal §二迁移段 +
// entities.md 迁移映射终态；判例链抽样门 / 断代 / fix 判别三段 / checkpoints slug 回填 /
// 幂等 + 新线版本门 / staged 临时区 + 原子替换逐项覆盖。
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveDirName } from "@dsh-forge/lib-path";
import { TASK_LOOP_MIGRATIONS } from "../../host/db/migrations/version-1.js";

const testsDir = dirname(fileURLToPath(import.meta.url)); // .../plugins/task-loop/tests/migration
const pkgDir = resolve(testsDir, "..", "..");
const repoRoot = resolve(pkgDir, "..", "..");
const SCRIPT_PATH = join(repoRoot, "scripts", "migrate-state-db.mjs");
const FIXTURES_DIR = join(pkgDir, "tests", "db", "fixtures");

const mod = (await import(pathToFileURL(SCRIPT_PATH).href)) as Record<string, any>;
const RUN = Object.keys(mod).find((k) => k.startsWith("runTask"));
const STATEMENTS_KEY = Object.keys(mod).find((k) => /STATEMENTS/.test(k));
const COLUMN_MAP_KEY = Object.keys(mod).find((k) => /COLUMN_MAP/.test(k));
if (!RUN || !STATEMENTS_KEY || !COLUMN_MAP_KEY) {
  throw new Error(`script exports missing: ${Object.keys(mod).join(",")}`);
}
const runMigration = mod[RUN] as (args: unknown, map: Map<string, string>, nowIso: string) => Promise<MigrateSummary>;
const v1Statements = mod[STATEMENTS_KEY] as string[];
const columnMap = mod[COLUMN_MAP_KEY] as Record<string, any>;

const Database = createRequire(join(repoRoot, "package.json"))("better-sqlite3");

interface LegacyRow {
  [k: string]: unknown;
}
interface Fixture {
  category: string;
  description: string;
  expectation: string;
  oldDb: Record<string, LegacyRow[]>;
}
interface MigrateSummary {
  moved: Record<string, number>;
  quarantined: number;
  submitArchived: number;
  manualList: Array<{ table: string; legacyId: string; field: string; value: string; reason: string }>;
  migratedDirs: string[];
  skippedDirs: string[];
}

/** 旧库终态 harness DDL（v8 终态列集；测试库关 FK 由搬行侧人工清单守卫兜底）。 */
const LEGACY_DDL: Record<string, string> = {
  tasks: `CREATE TABLE tasks (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, local_id TEXT NOT NULL, title TEXT NOT NULL,
    task_type TEXT NOT NULL, task_status TEXT, task_desc TEXT, ac_json TEXT, priority TEXT,
    estimated_time TEXT, vars_json TEXT, source_task_id TEXT, blocked_reason TEXT,
    breaking INTEGER DEFAULT 0, coverage REAL, complexity TEXT DEFAULT 'medium',
    surface_key TEXT, surface_type TEXT, source_kind TEXT, source_id TEXT, mode TEXT,
    e2e_attribution INTEGER, created_at TEXT, updated_at TEXT)`,
  task_edges: `CREATE TABLE task_edges (
    task_id TEXT NOT NULL, prerequisite_id TEXT NOT NULL, origin TEXT NOT NULL,
    created_at TEXT, updated_at TEXT, PRIMARY KEY (task_id, prerequisite_id))`,
  task_records: `CREATE TABLE task_records (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, verb TEXT NOT NULL,
    from_status TEXT, to_status TEXT, reason TEXT, summary TEXT, files_json TEXT, ac_json TEXT,
    record_fields_json TEXT, gate_json TEXT, commit_hash TEXT, dispatch_digest TEXT,
    loop_sourced INTEGER DEFAULT 0, actor TEXT, session_id TEXT, created_at TEXT, updated_at TEXT)`,
  task_session_links: `CREATE TABLE task_session_links (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
    created_at TEXT, updated_at TEXT)`,
  proposals: `CREATE TABLE proposals (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT)`,
  implementation_checkpoints: `CREATE TABLE implementation_checkpoints (
    id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, mark TEXT NOT NULL,
    wave_seq INTEGER, created_at TEXT, base_commit_hash TEXT NOT NULL, tasks_total INTEGER NOT NULL,
    commits_total INTEGER NOT NULL, fixes_total INTEGER NOT NULL, evidence_debts_total INTEGER NOT NULL)`,
};

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as Fixture;
}

/** 构建旧工作区库（判例 oldDb 合并 + extra 种子行）。 */
function buildLegacyDb(file: string, oldDb: Record<string, LegacyRow[]>): void {
  const db = new Database(file);
  try {
    for (const [table, ddl] of Object.entries(LEGACY_DDL)) {
      if (!oldDb[table]) continue;
      db.exec(ddl);
      for (const row of oldDb[table]!) {
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c]));
      }
    }
  } finally {
    db.close();
  }
}

interface Scenario {
  home: string;
  dirName: string;
  wsPath: string;
  workspacesFrom: string;
  target: string;
}

/** 场景装配：临时 home + 判例旧库 + 跑搬行段。dirNameToWsPath 缺省空映射（目录名自证口径）。 */
async function scenario(
  fixtureNames: string[],
  opts: {
    dirName?: string;
    map?: Map<string, string>;
    extraOldDb?: Record<string, LegacyRow[]>;
  } = {},
): Promise<Scenario> {
  const home = mkdtempSync(join(tmpdir(), "task-loop-mig-"));
  const wsPath = join(home, "ws", "proj");
  const dirName = opts.dirName ?? deriveDirName(wsPath);
  const workspacesFrom = join(home, "forge-workspaces");
  const legacyDir = join(workspacesFrom, dirName);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(legacyDir, { recursive: true });
  const oldDb: Record<string, LegacyRow[]> = {};
  for (const name of fixtureNames) {
    const fx = loadFixture(name);
    for (const [table, rows] of Object.entries(fx.oldDb)) {
      oldDb[table] = [...(oldDb[table] ?? []), ...rows];
    }
  }
  for (const [table, rows] of Object.entries(opts.extraOldDb ?? {})) {
    oldDb[table] = [...(oldDb[table] ?? []), ...rows];
  }
  buildLegacyDb(join(legacyDir, "forge.db"), oldDb);
  return { home, dirName, wsPath, workspacesFrom, target: join(home, "forge", "db", "task-loop", "task-loop.db") };
}

function run(scenarioOpts: Scenario, map: Map<string, string> = new Map()): Promise<MigrateSummary> {
  return Promise.resolve().then(() =>
    runMigration({ home: scenarioOpts.home, workspacesFrom: scenarioOpts.workspacesFrom }, map, "2026-11-16T10:00:00.000Z"),
  );
}

function openTarget(s: Scenario) {
  const db = new Database(s.target);
  return {
    db,
    q: (sql: string, ...args: unknown[]) => db.prepare(sql).all(...args) as Array<Record<string, unknown>>,
    close: () => db.close(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("DDL pin：脚本镜像 v1 statements 与 version-1.ts 逐语句等价", () => {
  const normalize = (s: string) =>
    s
      .replace(/--[^\n]*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  it("归一化后逐语句一致（漂移即测试红）", () => {
    const ts = TASK_LOOP_MIGRATIONS[0]!.statements.map((s) => normalize(typeof s === "string" ? s : s.sql));
    const script = v1Statements.map(normalize);
    expect(script).toEqual(ts);
  });
});

describe("断代表注记在册（脚本头部注释 + COLUMN_MAP_DOC）", () => {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  it("脚本头部注记：records 两列退役 / surface / app_key_logs / goal_id 不建", () => {
    for (const token of ["blocked_reason", "source_kind", "e2e_attribution", "ac_json", "commit_hash", "gate_json", "files_json", "record_fields_json", "tasks_surface_archive", "app_key_logs", "goal_id", "task_settlements"]) {
      expect(src, `脚本头部缺 ${token} 注记`).toContain(token);
    }
  });
  it("COLUMN_MAP_DOC 断代表键齐备", () => {
    expect(Object.keys(columnMap.notMigrated).sort()).toEqual(["app_key_logs", "goal_id", "task_settlements", "tasks_surface_archive"].sort());
    expect(Object.keys(columnMap.task_tasks.retired)).toContain("blocked_reason");
    expect(Object.keys(columnMap.task_tasks.retired)).toEqual(expect.arrayContaining(["source_kind", "source_id", "mode", "e2e_attribution"]));
    expect(Object.keys(columnMap.task_records.retired)).toEqual(expect.arrayContaining(["ac_json", "commit_hash", "files_json", "gate_json", "record_fields_json"]));
    expect(columnMap.task_checkpoints.backfilled.slug).toContain("fail-loud");
  });
});

describe("判例① fix 链完整", () => {
  it("三跳直搬 + edges/tsl 随 UUID 改写 + submit 断代（结算零回填）", async () => {
    const s = await scenario(["fix-chain-complete.json"]);
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const tasks = t.q(`SELECT id, local_id, fix_of_task_id, project_key, brief FROM task_tasks ORDER BY local_id`);
      expect(tasks).toHaveLength(3);
      const byLocal = new Map(tasks.map((r) => [r.local_id as string, r]));
      const root = byLocal.get("1.1")!;
      const f1 = byLocal.get("fix-1")!;
      const f2 = byLocal.get("fix-2")!;
      for (const r of [root, f1, f2]) {
        expect(UUID_RE.test(r.id as string)).toBe(true);
        expect(r.project_key).toBe(s.dirName);
      }
      expect(f1.fix_of_task_id).toBe(root.id);
      expect(f2.fix_of_task_id).toBe(f1.id);
      const edges = t.q(`SELECT * FROM task_edges`);
      expect(edges).toHaveLength(2);
      const edgeEnds = edges.flatMap((e) => [e.task_id, e.prerequisite_id]);
      for (const end of edgeEnds) expect(UUID_RE.test(end as string)).toBe(true);
      const ids = new Set(tasks.map((r) => r.id));
      for (const end of edgeEnds) expect(ids.has(end)).toBe(true);
      expect(t.q(`SELECT * FROM task_records`)).toHaveLength(0); // 全 submit 行断代不搬
      expect(summary.submitArchived).toBe(3);
      expect(t.q(`SELECT * FROM task_settlements`)).toHaveLength(0); // 历史 submit 行不回填结算
    } finally {
      t.close();
    }
  });
});

describe("判例② 反查回填", () => {
  it("fix-3 经 edges 反查唯一候选回填 fix_of_task_id", async () => {
    const s = await scenario(["fix-backfill-reverse-lookup.json"]);
    await run(s);
    const t = openTarget(s);
    try {
      const tasks = t.q(`SELECT id, local_id, fix_of_task_id FROM task_tasks`);
      const src = tasks.find((r) => r.local_id === "1.2")!;
      const fix3 = tasks.find((r) => r.local_id === "fix-3")!;
      expect(fix3.fix_of_task_id).toBe(src.id);
    } finally {
      t.close();
    }
  });
});

describe("判例③ 不可判入人工清单", () => {
  it("fix-4 多候选 / fix-5 零候选均入人工清单且 fix_of_task_id 保持 NULL", async () => {
    const s = await scenario(["fix-unjudgeable-manual-list.json"]);
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const fixTasks = t.q(`SELECT id, local_id, fix_of_task_id FROM task_tasks WHERE local_id LIKE 'fix-%'`);
      expect(fixTasks).toHaveLength(2);
      for (const r of fixTasks) expect(r.fix_of_task_id).toBeNull();
      const fields = summary.manualList.filter((m) => m.field === "fix_of_task_id");
      expect(fields).toHaveLength(2);
      expect(new Set(fields.map((m) => m.legacyId))).toEqual(new Set(["gamma:fix-4", "gamma:fix-5"]));
      const manualMd = join(s.home, "forge", "db", "task-loop", "migrate-task-loop-manual-review.md");
      expect(existsSync(manualMd)).toBe(true);
      const mdText = readFileSync(manualMd, "utf8");
      expect(mdText).toContain("gamma:fix-4");
      expect(mdText).toContain("gamma:fix-5");
    } finally {
      t.close();
    }
  });
});

describe("判例④ checkpoints slug 回填命中与未命中", () => {
  it("cp-1 命中回填；cp-2 未命中 fail-loud 中断（目标库不落地）", async () => {
    const s = await scenario(["checkpoints-backfill.json"]);
    await expect(run(s)).rejects.toThrow(/p-9/);
    expect(existsSync(s.target)).toBe(false); // fail-loud：staged 不替换
    // 对照组：仅命中行（剔除未命中判例）——slug/project_key/id 逐列核验
    const fx = loadFixture("checkpoints-backfill.json");
    const s2 = await scenario([], {
      extraOldDb: { proposals: fx.oldDb.proposals!, implementation_checkpoints: [fx.oldDb.implementation_checkpoints![0]!] },
    });
    const summary = await run(s2);
    const t = openTarget(s2);
    try {
      const cps = t.q(`SELECT * FROM task_checkpoints`);
      expect(cps).toHaveLength(1);
      expect(cps[0]!.slug).toBe("alpha-slug");
      expect(cps[0]!.project_key).toBe(s2.dirName);
      expect(UUID_RE.test(cps[0]!.id as string)).toBe(true);
      expect(cps[0]!.mark).toBe("first-pass-complete");
      expect(summary.manualList).toHaveLength(0);
    } finally {
      t.close();
    }
  });
});

describe("判例⑤ session_links 孤儿", () => {
  it("sl-1 随迁（UUID 改写）；sl-2 孤儿入人工清单不静默丢弃", async () => {
    const s = await scenario(["session-links-orphans.json"]);
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const links = t.q(`SELECT * FROM task_session_links`);
      expect(links).toHaveLength(1);
      expect(UUID_RE.test(links[0]!.id as string)).toBe(true);
      const taskIds = t.q(`SELECT id FROM task_tasks`);
      expect(links[0]!.task_id).toBe(taskIds[0]!.id);
      expect(summary.manualList.filter((m) => m.table === "task_session_links")).toHaveLength(1);
      expect(summary.manualList[0]!.value).toBe("t-ghost");
    } finally {
      t.close();
    }
  });
});

describe("判例⑥ submit 断代", () => {
  it("submit 行不搬不回填结算；非 submit 行照搬且 note 融合", async () => {
    const s = await scenario(["submit-generation-gap.json"], {
      extraOldDb: {
        tasks: [
          { id: "epsilon:4.1", slug: "epsilon", local_id: "4.1", title: "t", task_type: "coding-feature", task_status: "completed", source_task_id: null, source_kind: "proposal", source_id: "p", mode: null, created_at: "2026-11-06T07:00:00.000Z", updated_at: "2026-11-06T07:00:00.000Z" },
        ],
      },
    });
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const records = t.q(`SELECT verb, note, payload_json FROM task_records`);
      expect(records).toHaveLength(1);
      expect(records[0]!.verb).toBe("pause");
      expect(String(records[0]!.note)).toContain("waiting on baseline");
      expect(String(records[0]!.note)).toContain("paused by user");
      expect(records[0]!.payload_json).toBeNull();
      expect(summary.submitArchived).toBe(2);
      expect(t.q(`SELECT * FROM task_settlements`)).toHaveLength(0);
    } finally {
      t.close();
    }
  });
});

describe("blocked_reason 退役归流水", () => {
  it("旧值回填最新非 submit 动词行 note（blocked 语境）；无流水行入人工清单", async () => {
    const s = await scenario([], {
      extraOldDb: {
        tasks: [
          { id: "eta:9.1", slug: "eta", local_id: "9.1", title: "blocked task", task_type: "coding-feature", task_status: "blocked", source_task_id: null, source_kind: "proposal", source_id: "p", mode: null, blocked_reason: "deploy failed", created_at: "2026-11-07T08:00:00.000Z", updated_at: "2026-11-07T09:00:00.000Z" },
        ],
        task_records: [
          { id: 1, task_id: "eta:9.1", verb: "transition", from_status: "in_progress", to_status: "in_progress", reason: "ok step", summary: null, files_json: null, ac_json: null, record_fields_json: null, gate_json: null, commit_hash: null, dispatch_digest: null, loop_sourced: 0, actor: "core", session_id: null, created_at: "2026-11-07T08:30:00.000Z", updated_at: "2026-11-07T08:30:00.000Z" },
        ],
      },
    });
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const records = t.q(`SELECT note FROM task_records`);
      expect(records).toHaveLength(1);
      expect(String(records[0]!.note)).toContain("blocked: deploy failed");
      expect(summary.manualList.filter((m) => m.field === "blocked_reason")).toHaveLength(0);
    } finally {
      t.close();
    }
    // 无可挂流水行 → 人工清单禁丢弃
    const s2 = await scenario([], {
      extraOldDb: {
        tasks: [
          { id: "eta:9.2", slug: "eta", local_id: "9.2", title: "blocked no records", task_type: "coding-feature", task_status: "blocked", source_task_id: null, source_kind: "proposal", source_id: "p", mode: null, blocked_reason: "lint red", created_at: "2026-11-07T08:00:00.000Z", updated_at: "2026-11-07T09:00:00.000Z" },
        ],
      },
    });
    const summary2 = await run(s2);
    expect(summary2.manualList.filter((m) => m.field === "blocked_reason")).toHaveLength(1);
  });
});

describe("project_key 派生", () => {
  it("映射优先 / 目录名自证兜底 / 不可得落隔离区禁 NULL", async () => {
    const s = await scenario(["session-links-orphans.json"]);
    const map = new Map([[s.dirName, s.wsPath]]);
    await run(s, map);
    const t = openTarget(s);
    try {
      expect(t.q(`SELECT DISTINCT project_key FROM task_tasks`)[0]!.project_key).toBe(deriveDirName(s.wsPath));
    } finally {
      t.close();
    }
    const s2 = await scenario(["session-links-orphans.json"]);
    await run(s2); // 空映射 → 目录名自证
    const t2 = openTarget(s2);
    try {
      expect(t2.q(`SELECT DISTINCT project_key FROM task_tasks`)[0]!.project_key).toBe(s2.dirName);
    } finally {
      t2.close();
    }
    const s3 = await scenario(["session-links-orphans.json"], { dirName: "legacy-plain" });
    const summary3 = await run(s3);
    const t3 = openTarget(s3);
    try {
      expect(t3.q(`SELECT * FROM task_tasks`)).toHaveLength(0);
      expect(summary3.quarantined).toBe(1);
      const quarantined = t3.q(`SELECT * FROM task_migrate_quarantine`);
      expect(quarantined).toHaveLength(1);
      expect(String(quarantined[0]!.row_json)).toContain("delta:3.1");
    } finally {
      t3.close();
    }
  });
});

describe("fix 链环检测（recursive CTE）", () => {
  it("两任务互指成环 → 环成员入人工清单（禁自动置 NULL，FK 保持闭合）", async () => {
    const s = await scenario([], {
      extraOldDb: {
        tasks: [
          { id: "zet:fix-6", slug: "zet", local_id: "fix-6", title: "fix six", task_type: "coding-fix", task_status: "completed", source_task_id: "zet:fix-7", source_kind: "task", source_id: "zet:fix-7", mode: null, created_at: "2026-11-08T08:00:00.000Z", updated_at: "2026-11-08T08:30:00.000Z" },
          { id: "zet:fix-7", slug: "zet", local_id: "fix-7", title: "fix seven", task_type: "coding-fix", task_status: "completed", source_task_id: "zet:fix-6", source_kind: "task", source_id: "zet:fix-6", mode: null, created_at: "2026-11-08T09:00:00.000Z", updated_at: "2026-11-08T09:30:00.000Z" },
        ],
      },
    });
    const summary = await run(s);
    const t = openTarget(s);
    try {
      const cycleEntries = summary.manualList.filter((m) => m.reason.includes("CTE"));
      expect(cycleEntries).toHaveLength(2);
      expect(t.q(`SELECT COUNT(*) AS c FROM task_tasks WHERE fix_of_task_id IS NOT NULL`)[0]!.c).toBe(2);
      const dangling = t.q(`SELECT COUNT(*) AS c FROM task_tasks t WHERE t.fix_of_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM task_tasks p WHERE p.id = t.fix_of_task_id)`);
      expect(dangling[0]!.c).toBe(0);
    } finally {
      t.close();
    }
  });
});

describe("staged 临时区 + 原子替换 + 幂等 + 新线版本门", () => {
  it("staged 落 forge/tmp 禁入数据树；重跑跳过零重写；版本>1 拒绝重跑", async () => {
    const s = await scenario(["fix-chain-complete.json"]);
    const first = await run(s);
    expect(first.migratedDirs).toHaveLength(1);
    const tmpDir = join(s.home, "forge", "tmp", "task-loop-migrate");
    expect(existsSync(tmpDir)).toBe(true);
    expect(readdirSync(tmpDir).some((f) => f.startsWith("manifest-"))).toBe(true);
    // 第二跑：fingerprint 未变 → 跳过 + 计数不变 + 原库备份保留
    const tBefore = openTarget(s);
    const countBefore = tBefore.q(`SELECT COUNT(*) AS c FROM task_tasks`)[0]!.c;
    tBefore.close();
    const second = await run(s);
    expect(second.skippedDirs).toEqual([s.dirName]);
    expect(second.moved.tasks).toBe(0);
    const t = openTarget(s);
    const countAfter = t.q(`SELECT COUNT(*) AS c FROM task_tasks`)[0]!.c;
    t.close();
    expect(countAfter).toBe(countBefore);
    const dbDirFiles = readdirSync(join(s.home, "forge", "db", "task-loop"));
    expect(dbDirFiles.some((f) => f.startsWith("task-loop.db.pre-migrate-"))).toBe(true);
    // staged 临时文件用后清除（不入数据树残留）
    expect(existsSync(join(tmpDir, "task-loop.db.staged-migrate"))).toBe(false);
    // 版本门：新线 version>1 拒绝重跑（fail-loud 保留 staged 现场供取证）
    const db = new Database(s.target);
    try {
      db.prepare(`UPDATE schema_meta SET version = 2`).run();
    } finally {
      db.close();
    }
    await expect(run(s)).rejects.toThrow(/version=2/);
    rmSync(s.home, { recursive: true, force: true });
  });
});
