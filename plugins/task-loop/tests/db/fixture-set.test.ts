// 迁移判例库 fixture 入仓机检（plugin-task-loop 1.6）：六类预置判例齐备 + 类别唯一 +
// 各判例关键不变量在位——搬行动词消费前的事实基座（entities.md §6.1 迁移口径）。
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturesDir = join(resolve(dirname(fileURLToPath(import.meta.url))), "fixtures");

const EXPECTED_CATEGORIES = [
  "fix-chain-complete",
  "fix-backfill-reverse-lookup",
  "fix-unjudgeable-manual-list",
  "checkpoints-backfill",
  "session-links-orphans",
  "submit-generation-gap",
] as const;

interface Fixture {
  category: string;
  description: string;
  expectation: string;
  oldDb: Record<string, Array<Record<string, unknown>>>;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as Fixture;
}

describe("判例库 fixture 六类预置", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).sort();

  it("恰六类，类别名与预期集一致且唯一", () => {
    expect(files).toHaveLength(6);
    const categories = files.map((f) => loadFixture(f).category);
    expect([...categories].sort()).toEqual([...EXPECTED_CATEGORIES].sort());
    expect(new Set(categories).size).toBe(6);
  });

  it("每判例自描述：description + expectation 非空、oldDb 非空", () => {
    for (const file of files) {
      const fx = loadFixture(file);
      expect(fx.description.trim(), file).not.toBe("");
      expect(fx.expectation.trim(), file).not.toBe("");
      expect(Object.keys(fx.oldDb).length, file).toBeGreaterThan(0);
    }
  });
});

describe("判例① fix 链完整", () => {
  it("三跳链 source_task_id 直搬在册、edges fix-chain 全程、submit 流水 blocked→success→success", () => {
    const fx = loadFixture("fix-chain-complete.json");
    const [t1, t2, t3] = fx.oldDb.tasks!;
    expect(t2!.source_task_id).toBe(t1!.id);
    expect(t3!.source_task_id).toBe(t2!.id);
    expect(fx.oldDb.task_edges!.map((e) => e.origin)).toEqual(["fix-chain", "fix-chain"]);
    expect(fx.oldDb.task_records!.map((r) => r.to_status)).toEqual(["blocked", "completed", "completed"]);
  });
});

describe("判例② 反查回填", () => {
  it("fix-% 行 source_task_id 空 + edges 反查恰一候选", () => {
    const fx = loadFixture("fix-backfill-reverse-lookup.json");
    const fixRow = fx.oldDb.tasks!.find((t) => t.local_id === "fix-3")!;
    expect(fixRow.source_task_id).toBeNull();
    const candidates = fx.oldDb.task_edges!.filter((e) => e.task_id === fixRow.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.prerequisite_id).toBe("beta:1.2");
  });
});

describe("判例③ 不可判人工清单", () => {
  it("多候选与零候选各一行，禁自动置 NULL 的两类形态均在", () => {
    const fx = loadFixture("fix-unjudgeable-manual-list.json");
    const fix4 = fx.oldDb.tasks!.find((t) => t.local_id === "fix-4")!;
    const fix5 = fx.oldDb.tasks!.find((t) => t.local_id === "fix-5")!;
    expect(fix4.source_task_id).toBeNull();
    expect(fix5.source_task_id).toBeNull();
    expect(fx.oldDb.task_edges!.filter((e) => e.task_id === fix4.id)).toHaveLength(2); // 多候选
    expect(fx.oldDb.task_edges!.filter((e) => e.task_id === fix5.id)).toHaveLength(0); // 零候选
  });
});

describe("判例④ checkpoints 回填命中与未命中", () => {
  it("proposals 查表一命中一未命中", () => {
    const fx = loadFixture("checkpoints-backfill.json");
    const proposalIds = new Set(fx.oldDb.proposals!.map((p) => p.id));
    const [hit, miss] = fx.oldDb.implementation_checkpoints!;
    expect(proposalIds.has(hit!.proposal_id as string)).toBe(true);
    expect(proposalIds.has(miss!.proposal_id as string)).toBe(false);
  });
});

describe("判例⑤ session_links 孤儿", () => {
  it("一行在册一孤儿（task_id 无任务行）", () => {
    const fx = loadFixture("session-links-orphans.json");
    const taskIds = new Set(fx.oldDb.tasks!.map((t) => t.id));
    const [ok, orphan] = fx.oldDb.task_session_links!;
    expect(taskIds.has(ok!.task_id as string)).toBe(true);
    expect(taskIds.has(orphan!.task_id as string)).toBe(false);
  });
});

describe("判例⑥ submit 断代", () => {
  it("旧 submit 行携镜像列（ac_json/commit_hash/gate_json）不搬；非 submit 行照常搬", () => {
    const fx = loadFixture("submit-generation-gap.json");
    const submitRows = fx.oldDb.task_records!.filter((r) => r.verb === "submit");
    expect(submitRows.length).toBeGreaterThanOrEqual(2);
    for (const row of submitRows) {
      expect(row).toHaveProperty("ac_json");
      expect(row).toHaveProperty("gate_json");
    }
    expect(fx.oldDb.task_records!.some((r) => r.verb !== "submit")).toBe(true);
  });
});
