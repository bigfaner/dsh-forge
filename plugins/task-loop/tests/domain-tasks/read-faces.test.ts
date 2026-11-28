// 读面（list/query/stats/graph/detail/session-links）+ phase-gate 随迁测试（plugin-task-loop 1.7）。
import { beforeEach, describe, expect, it } from "vitest";
import { TASK_STATUS_LABELS } from "@dsh-forge/lib-api/labels";
import { addTask } from "../../host/domain/tasks/add.js";
import { claimTask } from "../../host/domain/tasks/claim.js";
import {
  countGatedPending,
  readUnsettledChain as readUnsettledChainRows,
} from "../../host/domain/tasks/phase-gate.js";
import {
  listTasks,
  taskGraph,
  taskSettlements,
  taskStats,
} from "../../host/domain/tasks/list.js";
import { markE2eAttribution } from "../../host/domain/tasks/mark-e2e-attribution.js";
import { queryTask } from "../../host/domain/tasks/query.js";
import { readUnsettledChain } from "../../host/domain/tasks/read-unsettled-chain.js";
import { sessionLinks } from "../../host/domain/tasks/session-links.js";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { taskDetail } from "../../host/domain/tasks/detail.js";
import { createTasksHarness, seedLink, seedRecord, type TasksHarness } from "./harness.js";

let h: TasksHarness;
beforeEach(() => {
  h = createTasksHarness();
});

const claim = () => claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });

describe("listTasks search（关键词筛选——大小写不敏感子串；匹配键 = 标题/slug/localId/复合键 + 类型/状态中英标签）", () => {
  let gateway = "";
  let docs = "";
  let other = "";

  beforeEach(async () => {
    gateway = (await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "spec-pay", title: "网关重试 Gateway Retry", type: "coding-fix" })).localId;
    docs = (await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "spec-pay", title: "文档补全", type: "doc" })).localId;
    other = (await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "spec-search", title: "另一个 spec 的任务", type: "coding-feature" })).localId;
  });

  const search = (q: string | undefined) => listTasks(h.verbDeps, { projectKey: h.projectKey, ...(q === undefined ? {} : { search: q }) });
  const byLocalId = async (q: string | undefined) => (await search(q)).map((c) => c.localId).sort();

  it("标题子串（中/英、大小写不敏感）", async () => {
    expect((await search("网关")).map((c) => c.title)).toEqual(["网关重试 Gateway Retry"]);
    expect((await search("GATEWAY")).map((c) => c.title)).toEqual(["网关重试 Gateway Retry"]);
  });

  it("slug / localId / 复合键 / 类型与状态中英标签", async () => {
    expect(await byLocalId("spec-pay")).toEqual([docs, gateway].sort());
    // localId 跨容器可重号（1.1）——裸 localId 命中多容器，复合键 slug/localId 才唯一
    expect(await byLocalId(gateway)).toEqual([gateway, other].sort());
    expect(await byLocalId(`spec-pay/${gateway}`)).toEqual([gateway]);
    expect((await search("coding-fix")).map((c) => c.localId)).toEqual([gateway]);
    expect(await byLocalId(TASK_STATUS_LABELS.pending.en)).toEqual([docs, gateway, other].sort());
    expect(await byLocalId(TASK_STATUS_LABELS.pending.zh)).toEqual([docs, gateway, other].sort());
  });

  it("空/纯空白 = 全量放行；无命中 = 空；与容器 slug 作用域正交叠加", async () => {
    expect(await search(undefined)).toHaveLength(3);
    expect(await search("   ")).toHaveLength(3);
    expect(await search("不存在词")).toEqual([]);
    const scoped = await listTasks(h.verbDeps, { projectKey: h.projectKey, slug: "spec-pay", search: "文档" });
    expect(scoped.map((c) => c.localId)).toEqual([docs]);
  });
});

describe("listTasks / taskStats / taskGraph", () => {
  it("TaskCard 水化：prerequisites/sessionCount/sourceTask/containerSlug（run-dag 判别面 slug 化）", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const b = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature", dependsOn: [a.localId],
    });
    seedLink(h, b.taskId, "sess-1");
    const cards = await listTasks(h.verbDeps, { projectKey: h.projectKey, slug: "alpha" });
    expect(cards).toHaveLength(2);
    const cardB = cards.find((c) => c.localId === b.localId)!;
    expect(cardB.containerSlug).toBe("alpha");
    expect(cardB.prerequisites).toEqual([{ slug: "alpha", localId: a.localId, taskStatus: "pending" }]);
    expect(cardB.sessionCount).toBe(1);
    // active 序：pending 在前，completed 殿后
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE id = ?`).run(a.taskId);
    const cards2 = await listTasks(h.verbDeps, { projectKey: h.projectKey });
    expect(cards2[0].localId).toBe(b.localId);
  });

  it("taskStats：total/byStatus 零计数态含 0 键 + unmetPending/gatedPending 同 scope 口径", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const stats = await taskStats(h.verbDeps, { projectKey: h.projectKey, slug: "alpha" });
    expect(stats.total).toBe(1);
    expect(stats.byStatus.pending).toBe(1);
    expect(stats.byStatus.completed).toBe(0);
    expect(stats.unmetPending).toBe(0);
    expect(stats.gatedPending).toBe(0);
    expect((await taskStats(h.verbDeps, { projectKey: h.projectKey, slug: "ghost" })).total).toBe(0);
  });

  it("taskGraph：容器子图边三元组；未命中容器 → 空图", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const b = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "B", type: "coding-feature", dependsOn: [a.localId],
    });
    const g = await taskGraph(h.verbDeps, { projectKey: h.projectKey, slug: "alpha" });
    expect(g.tasks).toHaveLength(2);
    expect(g.edges).toContainEqual({ taskId: b.taskId, prerequisiteId: a.taskId, origin: "manual" });
    expect((await taskGraph(h.verbDeps, { projectKey: h.projectKey, slug: "ghost" })).tasks).toEqual([]);
  });

  it("taskSettlements：读源 task_settlements（success commit_hash）；fixDerived = fix_of_task_id", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE id = ?`).run(a.taskId);
    h.db
      .prepare(
        `INSERT INTO task_settlements (id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at)
         VALUES ('s-1', ?, 1, NULL, 'success', '[]', 'abc123', NULL, '2026-01-01T00:00:00.000Z')`,
      )
      .run(a.taskId);
    const rows = await taskSettlements(h.verbDeps, { projectKey: h.projectKey, slug: "alpha" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ localId: a.localId, fixDerived: false, commitHashes: ["abc123"], evidenceDebtCount: 0 });
  });
});

describe("queryTask / taskDetail / sessionLinks", () => {
  it("queryTask：快照键缺席形态 + include 四节门控 + 容器摘要 slug 单键", async () => {
    const a = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature", context: { K: "V" }, brief: "正文",
    });
    const r = await queryTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: a.localId }, include: { records: true, sessions: true },
    });
    expect(r.container).toEqual({ slug: "alpha" });
    expect(r.task.brief).toBe("正文");
    expect(r.task.context).toEqual({ K: "V" });
    expect("priority" in r.task).toBe(false); // NULL → 键缺席
    expect(r.records?.length).toBeGreaterThan(0);
    await expect(queryTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: "9.9" } })).rejects.toMatchObject({
      code: "ERR_TASK_NOT_FOUND",
    });
  });

  it("queryTask latestSettlement：结算史在场带出逐条 AC 状态（1.18-b 判例——读面缺口）；无结算键缺席", async () => {
    const a = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature",
      acceptanceCriteria: ["AC1 判据", "AC2 判据"],
    });
    await claimTask(h.verbDeps, { projectKey: h.projectKey, sessionId: "sess-1", source: { slug: "alpha" } });
    const noSettle = await queryTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: a.localId } });
    expect("latestSettlement" in noSettle).toBe(false); // 无结算史 = 键缺席
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: a.localId },
      result: "success",
      summary: "完成",
      gate: { compile: true, fmt: true, lint: true, test: true },
      acceptanceCriteria: [
        { criterion: "AC1 判据", met: true, evidence: "e1" },
        { criterion: "AC2 判据", met: true, evidence: "e2" },
      ],
    });
    const r = await queryTask(h.verbDeps, { projectKey: h.projectKey, taskRef: { slug: "alpha", localId: a.localId } });
    expect(r.latestSettlement?.seq).toBe(1);
    expect(r.latestSettlement?.result).toBe("success");
    expect(r.latestSettlement?.acResults).toEqual([
      { criterion: "AC1 判据", met: true, evidence: "e1" },
      { criterion: "AC2 判据", met: true, evidence: "e2" },
    ]);
  });

  it("taskDetail：全量水化（allowedTransitions human 面 + records + actualFiles 双缺省 [] + refs 置灰）", async () => {
    const a = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const d = await taskDetail({ db: h.db, resolveWsPath: () => "." }, { projectKey: h.projectKey, taskId: a.taskId });
    expect(d.container).toEqual({ slug: "alpha" });
    expect(d.allowedTransitions).not.toContain("pending"); // human 面 = 八态 − 当前态
    expect(d.allowedTransitions).toContain("completed");
    expect(d.actualFiles).toEqual([]);
    expect(d.refs).toEqual([]);
  });

  it("sessionLinks：双源分型（link 在前 record 在后）+ claimedAt 加性列", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    seedLink(h, t.taskId, "link-sess");
    seedRecord(h, t.taskId, { verb: "submit", sessionId: "rec-sess" });
    const cards = await sessionLinks({ db: h.db }, { projectKey: h.projectKey, sessionId: "link-sess" });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ sessionId: "link-sess", source: "link", claimedAt: expect.any(String) });
    const cards2 = await sessionLinks({ db: h.db }, { projectKey: h.projectKey, sessionId: "rec-sess" });
    expect(cards2).toHaveLength(1);
    expect(cards2[0].source).toBe("record");
  });
});

describe("phase-gate / readUnsettledChain / markE2eAttribution", () => {
  it("readUnsettledChain：链集合 = I 型（fix_of IS NULL）未终态清单；slug 作用域", async () => {
    const impl = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "I", type: "coding-feature" });
    const fix = await addTask(h.verbDeps, {
      projectKey: h.projectKey, slug: "alpha", title: "F", type: "coding-fix",
      sourceTask: { slug: "alpha", localId: impl.localId }, blockSource: true,
    });
    void fix;
    const rows = readUnsettledChainRows(h.db, { projectKey: h.projectKey, slug: "alpha" });
    expect(rows).toEqual([{ slug: "alpha", localId: "1.1", taskStatus: "blocked" }]);
    const verb = await readUnsettledChain(h.verbDeps, { projectKey: h.projectKey, source: { slug: "alpha" } });
    expect(verb.unsettled).toHaveLength(1);
  });

  it("countGatedPending：被门持有的验证类 pending 计数；gate 透明后归零", async () => {
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "I", type: "coding-feature" });
    await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "V", type: "validation-code" });
    expect(countGatedPending(h.db, h.projectKey, { slug: "alpha" })).toBe(1);
    h.db.prepare(`UPDATE task_tasks SET task_status = 'completed' WHERE task_type = 'coding-feature'`).run();
    expect(countGatedPending(h.db, h.projectKey, { slug: "alpha" })).toBe(0);
  });

  it("markE2eAttribution：未命中 fail-loud；命中后零抛错 + 事件（v1 列面零标记列）", async () => {
    await expect(
      markE2eAttribution(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", localId: "9.9" }),
    ).rejects.toMatchObject({ code: "ERR_TASK_NOT_FOUND" });
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    const before = h.events.emitted.length;
    await markE2eAttribution(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", localId: t.localId });
    expect(h.events.emitted.length).toBe(before + 1);
  });
});

describe("submit → settlement 单事务两写（模块②落位）→ taskSettlements 读面", () => {
  it("success 结算落 settlement 行（单事务两写）→ taskSettlements 消费 commit_hash", async () => {
    const t = await addTask(h.verbDeps, { projectKey: h.projectKey, slug: "alpha", title: "A", type: "coding-feature" });
    await claim();
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey, taskRef: { slug: "alpha", localId: t.localId }, result: "success", summary: "S",
      gate: { test: true }, acceptanceCriteria: [], commitHash: "abc123",
    });
    const rows = await taskSettlements(h.verbDeps, { projectKey: h.projectKey, slug: "alpha" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ localId: t.localId, commitHashes: ["abc123"] });
  });
});
