// addTask 域写动词随迁测试（plugin-task-loop 1.7——v1 schema + slug 容器化改造面）。
import { beforeEach, describe, expect, it } from "vitest";
import { addTask, allocateLocalId, canonicalContext } from "../../host/domain/tasks/add.js";
import { ContainerSlugInvalidError } from "../../host/domain/tasks/errors.js";
import { createTasksHarness, seedTask, type TasksHarness } from "./harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

describe("addTask 基本语义（slug 容器终态）", () => {
  it("建行：UUID id + localId 数值顺延（空库 1.1 → 1.2）+ pending/medium 缺省族 + add 记录", async () => {
    const r1 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const r2 = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature" });
    expect(r1.localId).toBe("1.1");
    expect(r2.localId).toBe("1.2");
    expect(r1.taskId).not.toContain("alpha");
    const row = h.db.prepare(`SELECT task_status, complexity, breaking, project_key FROM task_tasks WHERE id = ?`).get(r1.taskId) as {
      task_status: string;
      complexity: string;
      breaking: number;
      project_key: string;
    };
    expect(row.task_status).toBe("pending");
    expect(row.complexity).toBe("medium");
    expect(row.breaking).toBe(0);
    expect(row.project_key).toBe(h.projectKey);
    const verb = h.db.prepare(`SELECT verb FROM task_records WHERE task_id = ?`).get(r1.taskId) as { verb: string };
    expect(verb.verb).toBe("add");
    expect(h.events.emitted).toEqual([h.projectKey, h.projectKey]);
  });

  it("localId 混合分配：数值跨段顺延（2.7 → 2.8）/ fix-N、disc-N 语义前缀 max+1", () => {
    seedTask(h, "alpha", "2.7");
    seedTask(h, "alpha", "fix-1");
    expect(allocateLocalId(h.db, h.projectKey, "alpha", "numeric")).toBe("2.8");
    expect(allocateLocalId(h.db, h.projectKey, "alpha", "fix")).toBe("fix-2");
    expect(allocateLocalId(h.db, h.projectKey, "alpha", "disc")).toBe("disc-1");
  });

  it("容器 slug 形制守卫：裸 fix-% 前缀 slug 拒收（fix 判别单源化）", async () => {
    await expect(
      addTask(h.verbDeps, { projectKey: h.projectKey, slug: "fix-9", title: "X", type: "coding-feature" }),
    ).rejects.toBeInstanceOf(ContainerSlugInvalidError);
  });

  it("UNIQUE 冲突映射 → ERR_TASK_EXISTS（manual 边 PK 重复声明防御面）", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await expect(
      addTask(h.verbDeps, {
        projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature",
        dependsOn: [t.localId, t.localId], // 同边重复声明 → task_edges PK 冲突
      }),
    ).rejects.toMatchObject({ code: "ERR_TASK_EXISTS" });
  });
});

describe("任务级去重判据（判例 fix-11 硬约束——brief + context 合取，键序无关）", () => {
  const sourceOf = async (): Promise<string> => {
    const src = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    return src.taskId;
  };

  it("同源同型 + brief + context 全等 → reused=true（纯读零变更，零新行零事件）", async () => {
    const srcId = await sourceOf();
    const r1 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "F",
      type: "coding-fix",
      brief: "修 X",
      context: { A: "1", B: "2" },
      sourceTask: { slug: "alpha", localId: "1.1" },
      blockSource: true,
    });
    expect(r1.reused).toBe(false);
    const r2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey,
      slug: "alpha",
      title: "F",
      type: "coding-fix",
      brief: "修 X",
      context: { A: "1", B: "2" },
      sourceTask: { slug: "alpha", localId: "1.1" },
      blockSource: true,
    });
    expect(r2).toMatchObject({ taskId: r1.taskId, reused: true });
    expect(countFixRows()).toBe(1);
    expect(h.db.prepare(`SELECT task_status FROM task_tasks WHERE id = ?`).get(srcId)).toMatchObject({ task_status: "blocked" });
    expect(h.events.emitted).toHaveLength(2); // 建行两单各发射一次；复用命中零事件
  });

  it("context 键序无关：{A,B} vs {B,A} 规范化相等 → reused", async () => {
    await sourceOf();
    const r1 = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 X", context: { A: "1", B: "2" }, sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    const r2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 X", context: { B: "2", A: "1" }, sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    expect(r2.taskId).toBe(r1.taskId);
    expect(r2.reused).toBe(true);
  });

  it("异 brief 第二单不被吞并（fix-11 反例——正常建行）", async () => {
    await sourceOf();
    const r1 = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 X", sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    const r2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 Y", sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    expect(r2.reused).toBe(false);
    expect(r2.taskId).not.toBe(r1.taskId);
    expect(countFixRows()).toBe(2);
  });

  it("异 context 第二单不被吞并（fix-11 硬约束——禁回退同源同型即吞并旧判据）", async () => {
    await sourceOf();
    await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 X", context: { A: "1" }, sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    const r2 = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      brief: "修 X", context: { A: "2" }, sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
    });
    expect(r2.reused).toBe(false);
    expect(countFixRows()).toBe(2);
  });

  it("canonicalContext 键序无关规范化单点（null/非法串原样区分）", () => {
    expect(canonicalContext('{"b":1,"a":2}')).toBe(canonicalContext('{"a":2,"b":1}'));
    expect(canonicalContext(null)).toBeNull();
    expect(canonicalContext("not-json")).toBe("not-json");
  });

  function countFixRows(): number {
    return (h.db.prepare(`SELECT COUNT(*) AS n FROM task_tasks WHERE fix_of_task_id IS NOT NULL`).get() as { n: number }).n;
  }
});

describe("fix 链 / 环 / before 守卫", () => {
  it("blockSource：等待边（fix-chain）+ 源 auto-block + auto-block 记录（actor='core'）", async () => {
    const src = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    const fix = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      sourceTask: { slug: "alpha", localId: src.localId }, blockSource: true,
    });
    expect(fix.localId).toBe("fix-1");
    const edge = h.db
      .prepare(`SELECT origin FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`)
      .get(src.taskId, fix.taskId) as { origin: string } | undefined;
    expect(edge?.origin).toBe("fix-chain");
    const rec = h.db.prepare(`SELECT verb, to_status, actor FROM task_records WHERE task_id = ? AND verb = 'auto-block'`).get(src.taskId) as {
      verb: string;
      to_status: string;
      actor: string;
    };
    expect(rec.actor).toBe("core");
  });

  it("blocked 源 + blockSource 缺省 → ERR_BLOCK_SOURCE_REQUIRED（零写残留）", async () => {
    const src = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    h.db.prepare(`UPDATE task_tasks SET task_status = 'blocked' WHERE id = ?`).run(src.taskId);
    await expect(
      addTask(h.verbDeps, {
        projectKey: h.projectKey, slug: "alpha", title: "D", type: "coding-enhancement",
        sourceTask: { slug: "alpha", localId: src.localId },
      }),
    ).rejects.toMatchObject({ code: "ERR_BLOCK_SOURCE_REQUIRED" });
    expect(
      (h.db.prepare(`SELECT COUNT(*) AS n FROM task_tasks WHERE task_type = 'coding-enhancement'`).get() as { n: number }).n,
    ).toBe(0);
  });

  it("dependsOn × blockSource 成环 → ERR_CYCLE_DETECTED（完整环路径回报，整体回滚）", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "S", type: "coding-feature" });
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "D", type: "coding-feature", dependsOn: ["1.1"] });
    // 环：D 依赖 S；F 依赖 D；F blockSource 锁 S → S ← F ← D ← S
    await expect(
      addTask(h.verbDeps, {
        projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
        dependsOn: ["1.2"], sourceTask: { slug: "alpha", localId: "1.1" }, blockSource: true,
      }),
    ).rejects.toMatchObject({ code: "ERR_CYCLE_DETECTED" });
  });

  it("before：单事务建任务 + 后继补 dependsOn 新边；in_progress 后继拒挂（ERR_BEFORE_SUCCESSOR_INVALID）", async () => {
    const succ = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature" });
    const r = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature",
      before: [succ.localId],
    });
    expect(r.beforeSuccessors).toEqual([`alpha/${succ.localId}`]);
    const edge = h.db.prepare(`SELECT origin FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`).get(succ.taskId, r.taskId);
    expect(edge).toBeDefined();

    h.db.prepare(`UPDATE task_tasks SET task_status = 'in_progress' WHERE id = ?`).run(succ.taskId);
    await expect(
      addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "C", type: "coding-feature", before: ["1.1"] }),
    ).rejects.toMatchObject({ code: "ERR_BEFORE_SUCCESSOR_INVALID" });
  });
});
