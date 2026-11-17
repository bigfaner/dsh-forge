// host/db/connection.ts 行为面（plugin-task-loop 1.6）：
// RED 锚 = foreign_keys 逐连接断言（I4 处方①——per-connection PRAGMA 写入不等于生效，
// 回读非 1 即不可用）+ FK 实际拒写 + 三参数在场 + task_ 前缀域装配 + project_key
// 派生注入（NOT NULL 拒写路径）。
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { domainDbFileName, openDomainDb } from "../../host/db/connection.js";
import { ProjectKeyDerivationError } from "../../host/db/repositories/project-key.js";

const NOW = "2026-11-10T00:00:00.000Z";

function insertTask(domain: ReturnType<typeof openDomainDb>, overrides: Record<string, unknown> = {}): void {
  const row = {
    id: "t-1",
    slug: "alpha",
    localId: "1.1",
    title: "T1",
    taskType: "coding-feature",
    taskStatus: "pending",
    brief: null,
    acJson: null,
    priority: null,
    estimatedTime: null,
    scopeJson: null,
    contextJson: null,
    fixOfTaskId: null,
    breaking: 0,
    coverageThreshold: null,
    complexity: "medium",
    projectKey: "Z-project-x@aaaaaaaa",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  domain.db
    .prepare(
      `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
         estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity,
         project_key, created_at, updated_at)
       VALUES (@id, @slug, @localId, @title, @taskType, @taskStatus, @brief, @acJson, @priority,
         @estimatedTime, @scopeJson, @contextJson, @fixOfTaskId, @breaking, @coverageThreshold, @complexity,
         @projectKey, @createdAt, @updatedAt)`,
    )
    .run(row);
}

function withMemoryDomain(run: (domain: ReturnType<typeof openDomainDb>) => void): void {
  const domain = openDomainDb(".", { file: ":memory:" });
  try {
    run(domain);
  } finally {
    domain.db.close();
  }
}

describe("foreign_keys 逐连接断言（RED 锚）", () => {
  it("openDomainDb 打开的连接：PRAGMA foreign_keys 回读 = 1", () => {
    withMemoryDomain((domain) => {
      expect(domain.db.pragma("foreign_keys", { simple: true })).toBe(1);
    });
  });

  it("FK 实际生效：task_edges 悬空 task_id 拒写（非静默）", () => {
    withMemoryDomain((domain) => {
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
             VALUES ('no-such-task', 'also-missing', 'manual', ?, ?)`,
          )
          .run(NOW, NOW),
      ).toThrowError(/FOREIGN KEY/);
    });
  });

  it("FK 实际生效：task_settlements 悬空 task_id 拒写", () => {
    withMemoryDomain((domain) => {
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO task_settlements (id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at)
             VALUES ('s-x', 'no-such-task', 1, NULL, 'blocked', '[]', NULL, '{}', ?)`,
          )
          .run(NOW),
      ).toThrowError(/FOREIGN KEY/);
    });
  });
});

describe("三参数随连接在场", () => {
  it("WAL + busy_timeout=5000 随连接生效（WAL 需文件库——:memory: 不支持，落盘库断言）", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-db-pragma-"));
    const domain = openDomainDb(domainDbFileName(home));
    try {
      expect(domain.db.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(domain.db.pragma("busy_timeout", { simple: true })).toBe(5000);
    } finally {
      domain.db.close();
    }
  });

  it(":memory: 连接 busy_timeout=5000 在场", () => {
    withMemoryDomain((domain) => {
      expect(domain.db.pragma("busy_timeout", { simple: true })).toBe(5000);
    });
  });
});

describe("task_ 前缀域装配", () => {
  it("六表 task_ 全名在库，tables 名单与库内表逐一同构", () => {
    withMemoryDomain((domain) => {
      const names = (
        domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
          name: string;
        }>
      )
        .map((r) => r.name)
        .filter((n) => !n.startsWith("schema_") && n !== "migration_digests" && n !== "sqlite_sequence");
      expect(names).toEqual([
        "task_checkpoints",
        "task_edges",
        "task_records",
        "task_session_links",
        "task_settlements",
        "task_tasks",
      ]);
      expect(domain.tables).toEqual({
        tasks: "task_tasks",
        settlements: "task_settlements",
        checkpoints: "task_checkpoints",
        edges: "task_edges",
        sessionLinks: "task_session_links",
        records: "task_records",
      });
    });
  });

  it("19 棵 B-tree（5 TEXT PK 隐式 + 1 复合自然键 PK 隐式 + 2 表级 UNIQUE 隐式 + 9 CREATE + schema_meta/migration_digests 分域锚复合主键隐式 ×2——R3-dba 分域版本线）", () => {
    withMemoryDomain((domain) => {
      const indexes = domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{
        name: string | null;
      }>;
      expect(indexes).toHaveLength(19);
      for (const expected of [
        "idx_task_tasks_container",
        "idx_task_tasks_fix",
        "uq_task_settle_seq",
        "uq_task_cp_milestone",
        "idx_task_cp_container",
        "idx_task_edges_prerequisite",
        "idx_task_tsl_session",
        "idx_task_records_task",
        "idx_task_records_session",
      ]) {
        expect(indexes.some((i) => i.name === expected), `${expected} 缺席`).toBe(true);
      }
    });
  });
});

describe("project_key 派生注入（NOT NULL 拒写路径）", () => {
  it("projectKeyOf = lib-path 单源 f（同 cwd 恒同键）", () => {
    withMemoryDomain((domain) => {
      const k1 = domain.projectKeyOf("Z:\\project\\dsh\\dsh-forge");
      const k2 = domain.projectKeyOf("Z:\\project\\dsh\\dsh-forge");
      expect(k1).toBe(k2);
      expect(k1).toMatch(/^[A-Za-z0-9-]+@[0-9a-f]{8}$/);
    });
  });

  it("空 cwd 派生失败 fail-loud（ERR_PROJECT_KEY_DERIVATION）", () => {
    withMemoryDomain((domain) => {
      expect(() => domain.projectKeyOf("")).toThrowError(ProjectKeyDerivationError);
      expect(() => domain.projectKeyOf("   ")).toThrowError(/ERR_PROJECT_KEY_DERIVATION/);
    });
  });

  it("NULL project_key 直写被建表级 NOT NULL 拒绝（拒写即建表级保证）", () => {
    withMemoryDomain((domain) => {
      expect(() => insertTask(domain, { projectKey: null })).toThrowError(/NOT NULL/);
    });
  });

  it("派生注入正常路径：projectKeyOf 产物可落库", () => {
    withMemoryDomain((domain) => {
      insertTask(domain, { projectKey: domain.projectKeyOf("Z:\\ws\\alpha") });
      const row = domain.db
        .prepare<[string], { project_key: string }>(`SELECT project_key FROM task_tasks WHERE id = ?`)
        .get("t-1");
      expect(row?.project_key).toBe(domain.projectKeyOf("Z:\\ws\\alpha"));
    });
  });
});

describe("库文件落点", () => {
  it("home → {home}/forge/db/task-loop/task-loop.db（开库即落盘）", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-db-conn-"));
    const file = domainDbFileName(home);
    expect(file).toBe(join(home, "forge", "db", "task-loop", "task-loop.db"));
    const domain = openDomainDb(home);
    try {
      expect(existsSync(file)).toBe(true);
    } finally {
      domain.db.close();
    }
  });
});
