// query_task / list_tasks / task_stats / update_task / unblock_task / pause_task 工具层
// 契约测试（plugin-task-loop 1.11——slug 化工具面）：slug 必填、pause reason 必带、
// unblock 结算负载黑名单、happy path 走域动词。
import { beforeEach, describe, expect, it } from "vitest";
import { createListTasksTool } from "../../host/tools/list-tasks.js";
import { createPauseTaskTool } from "../../host/tools/pause-task.js";
import { createQueryTaskTool } from "../../host/tools/query-task.js";
import { createSubmitTaskTool } from "../../host/tools/submit-task.js";
import { createTaskStatsTool } from "../../host/tools/task-stats.js";
import { createUnblockTaskTool } from "../../host/tools/unblock-task.js";
import { createUpdateTaskTool } from "../../host/tools/update-task.js";
import { createTasksHarness, seedEdge, seedRecord, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

let h: TasksHarness;

beforeEach(() => {
  h = createTasksHarness();
});

function toolOf(name: string) {
  const deps = { verbDeps: h.verbDeps, resolveProjectKey: () => h.projectKey };
  switch (name) {
    case "query":
      return createQueryTaskTool(deps);
    case "list":
      return createListTasksTool(deps);
    case "stats":
      return createTaskStatsTool(deps);
    case "update":
      return createUpdateTaskTool(deps);
    case "unblock":
      return createUnblockTaskTool(deps);
    case "pause":
      return createPauseTaskTool(deps);
    default:
      return createSubmitTaskTool(deps);
  }
}

describe("query_task slug 必填 + 读面走通", () => {
  it("slug / local_id 缺席即拒", async () => {
    const tool = toolOf("query");
    await expect(tool.execute({ local_id: "1" }, {})).rejects.toThrow(/slug/);
    await expect(tool.execute({ slug: "alpha" }, {})).rejects.toThrow(/local_id/);
    await expect(tool.execute("nope", {})).rejects.toThrow(/arguments must be an object/);
  });

  it("include 四布尔门控走域 queryTask（prerequisites/records 开节）", async () => {
    const pre = seedTask(h, "alpha", "0", { status: "completed" });
    const self = seedTask(h, "alpha", "1");
    seedEdge(h, self, pre);
    seedRecord(h, self, { verb: "claim" });
    const r = (await toolOf("query").execute({ slug: "alpha", local_id: "1", include_prerequisites: true, include_records: true }, {})) as {
      prerequisites: { slug: string; localId: string }[];
      records: unknown[];
      waitingOnMe?: unknown;
    };
    expect(r.prerequisites).toEqual([{ slug: "alpha", localId: "0", taskStatus: "completed" }]);
    expect(r.records.length).toBeGreaterThan(0);
    expect(r.waitingOnMe).toBeUndefined(); // 未开节键缺席
  });
});

describe("list_tasks slug 可选过滤 + statusFilter 词表收窄", () => {
  it("slug 缺省全库 / 指定 slug 单容器过滤（返回 {cards} 匹配 output schema——bug: 裸数组被 host 校验拒）", async () => {
    seedTask(h, "alpha", "1");
    seedTask(h, "beta", "2");
    const all = (await toolOf("list").execute({}, {})) as { cards: { slug: string }[] };
    expect(Array.isArray(all)).toBe(false); // 必须是对象而非裸数组（output schema type: "object"）
    expect(all.cards).toHaveLength(2);
    const scoped = (await toolOf("list").execute({ slug: "alpha" }, {})) as { cards: { slug: string }[] };
    expect(scoped.cards).toHaveLength(1);
    expect(scoped.cards[0].slug).toBe("alpha");
  });

  it("statusFilter 词表外元素拒", async () => {
    await expect(toolOf("list").execute({ statusFilter: ["doing"] }, {})).rejects.toThrow(/must only contain/);
  });
});

describe("task_stats slug 可选读数", () => {
  it("byStatus/unmetPending/gatedPending 读数透传", async () => {
    const pre = seedTask(h, "alpha", "0", { status: "pending" });
    const waiterId = seedTask(h, "alpha", "1") as string;
    seedEdge(h, waiterId, pre);
    const r = (await toolOf("stats").execute({ slug: "alpha" }, {})) as {
      total: number;
      byStatus: Record<string, number>;
      unmetPending: number;
      gatedPending: number;
    };
    expect(r.total).toBe(2);
    expect(r.byStatus.pending).toBe(2);
    expect(r.unmetPending).toBe(1);
    expect(r.gatedPending).toBe(0);
  });
});

describe("update_task slug 必填 + 宽字段 partial", () => {
  it("slug / local_id 缺席即拒", async () => {
    const tool = toolOf("update");
    await expect(tool.execute({ local_id: "1", title: "X" }, {})).rejects.toThrow(/slug/);
    await expect(tool.execute({ slug: "alpha", title: "X" }, {})).rejects.toThrow(/local_id/);
  });

  it("给定字段改写、未给不动（brief/priority/estimated_time；context KEY=VALUE 解析）", async () => {
    seedTask(h, "alpha", "1", { brief: "旧" });
    const r = (await toolOf("update").execute(
      { slug: "alpha", local_id: "1", brief: "新", priority: "P1", estimated_time: "2h", context: ["A=1"] },
      {},
    )) as { brief?: string; priority?: string; estimatedTime?: string; context?: Record<string, string>; title: string };
    expect(r.brief).toBe("新");
    expect(r.priority).toBe("P1");
    expect(r.estimatedTime).toBe("2h");
    expect(r.context).toEqual({ A: "1" });
    expect(r.title).toBe("任务 1"); // 未给不动
  });
});

describe("unblock_task reason 必带 + 结算负载黑名单", () => {
  it("reason 缺席/空白即拒（工具层先证）", async () => {
    const tool = toolOf("unblock");
    await expect(tool.execute({ slug: "alpha", local_id: "1" }, {})).rejects.toThrow(/reason/);
    await expect(tool.execute({ slug: "alpha", local_id: "1", reason: "  " }, {})).rejects.toThrow(/reason must be a non-empty string/);
  });

  it("结算面负载键命中即拒（ac_results / gate_compile / facets 指认 submit_task）", async () => {
    const tool = toolOf("unblock");
    await expect(tool.execute({ slug: "alpha", local_id: "1", reason: "x", ac_results: [] }, {})).rejects.toThrow(/submit_task/);
    await expect(tool.execute({ slug: "alpha", local_id: "1", reason: "x", gate_compile: true }, {})).rejects.toThrow(/settlement\/gate\/AC loads/);
    await expect(tool.execute({ slug: "alpha", local_id: "1", reason: "x", facets: ["ui"] }, {})).rejects.toThrow(/facets/);
  });

  it("blocked → pending 走通（域唯一入口格）", async () => {
    seedTask(h, "alpha", "1", { status: "blocked" });
    const r = (await toolOf("unblock").execute({ slug: "alpha", local_id: "1", reason: "阻塞解除" }, {})) as { status: string };
    expect(r.status).toBe("pending");
  });

  it("非 blocked 卡即拒（agent 矩阵先验透传）", async () => {
    seedTask(h, "alpha", "1", { status: "pending" });
    await expect(toolOf("unblock").execute({ slug: "alpha", local_id: "1", reason: "x" }, {})).rejects.toThrow();
  });
});

describe("pause_task reason 必带 + in_progress → suspended", () => {
  it("reason 缺席/空白即拒（工具层先证）", async () => {
    const tool = toolOf("pause");
    await expect(tool.execute({ slug: "alpha", local_id: "1" }, {})).rejects.toThrow(/reason/);
    await expect(tool.execute({ slug: "alpha", local_id: "1", reason: "" }, {})).rejects.toThrow();
  });

  it("slug + local_id 两显式参解析走域 pauseTask → suspended", async () => {
    seedTask(h, "alpha", "1", { status: "in_progress" });
    const r = (await toolOf("pause").execute({ slug: "alpha", local_id: "1", reason: "改写简报" }, {})) as {
      taskStatus: string;
      slug: string;
      localId: string;
    };
    expect(r.taskStatus).toBe("suspended");
    expect(r.slug).toBe("alpha");
    expect(r.localId).toBe("1");
    const row = h.db.prepare(`SELECT task_status FROM task_tasks WHERE slug='alpha' AND local_id='1'`).get() as { task_status: string };
    expect(row.task_status).toBe("suspended");
    // 审计行：transition（actor='core'，reason 落 note 列）
    const rec = h.db.prepare(`SELECT verb, actor, note FROM task_records WHERE verb='transition'`).get() as { verb: string; actor: string; note: string };
    expect(rec).toMatchObject({ verb: "transition", actor: "core", note: "改写简报" });
  });
});
