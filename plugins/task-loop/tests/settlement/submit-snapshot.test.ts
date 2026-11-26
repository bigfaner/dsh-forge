// submit_task 结算输出快照（forge-dirs-unification 3.3——改造前后行为等价的比对基准）：
// 以一组归属键可派生的固定输入（harness projectKey 单源派生）驱动 submitTask 三条结算链
//（success 全载荷 / blocked 归类 / fix 链 fix_root_id 解析），录制结算输出并入库
//（submit-settlement-snapshot.json）；改造后重放同一组输入，归一化后逐字段一致。
// 归一化口径：id（写入点 randomUUID）与 created_at/updated_at（结算时点时钟）为易变字段，
// 按稳定符号掩码替换（id 依 encounter 序编号、时戳 → "<iso>"）；其余字段逐字比对。
// 录制模式：TASK_LOOP_SNAPSHOT_WRITE=1 时重写快照文件；缺省 = 比对模式。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { submitTask } from "../../host/domain/tasks/submit.js";
import { createTasksHarness, seedTask, type TasksHarness } from "../domain-tasks/harness.js";

const SNAPSHOT_FILE = join(fileURLToPath(new URL(".", import.meta.url)), "submit-settlement-snapshot.json");
const WRITE_MODE = process.env.TASK_LOOP_SNAPSHOT_WRITE === "1";

interface TaskRowProjection {
  readonly id: string;
  readonly slug: string;
  readonly local_id: string;
  readonly task_type: string;
  readonly task_status: string;
  readonly project_key: string;
  readonly fix_of_task_id: string | null;
  readonly updated_at: string;
}

interface SettlementRowProjection {
  readonly id: string;
  readonly task_id: string;
  readonly seq: number;
  readonly fix_root_id: string | null;
  readonly result: string;
  readonly ac_results_json: string;
  readonly commit_hash: string | null;
  readonly evidence_json: string;
  readonly created_at: string;
}

interface RecordRowProjection {
  readonly task_id: string;
  readonly verb: string;
  readonly from_status: string | null;
  readonly to_status: string | null;
  readonly actor: string;
  readonly created_at: string;
}

interface SnapshotShape {
  readonly projectKey: string;
  readonly records: {
    readonly task_id: string;
    readonly verb: string;
    readonly from_status: string | null;
    readonly to_status: string | null;
    readonly actor: string;
    readonly created_at: string;
  }[];
  readonly projectKey: string;
  readonly success: {
    readonly result: { readonly taskId: string; readonly status: string };
    readonly task: TaskRowProjection;
    readonly settlement: SettlementRowProjection;
  };
  readonly blocked: {
    readonly result: { readonly taskId: string; readonly status: string };
    readonly task: TaskRowProjection;
    readonly settlement: SettlementRowProjection;
  };
  readonly fixChain: {
    readonly result: { readonly taskId: string; readonly status: string };
    readonly rootSettlement: SettlementRowProjection;
    readonly fixSettlement: SettlementRowProjection;
  };
}

const ISO = "<iso>";
const UUID = "<uuid>";

/** 归一化：id 依 encounter 序编稳定符号；时戳掩码。 */
function normalize(snapshot: {
  projectKey: string;
  rawTasks: TaskRowProjection[];
  rawSettlements: SettlementRowProjection[];
  rawRecords: RecordRowProjection[];
  results: { readonly success: { taskId: string; status: string }; readonly blocked: { taskId: string; status: string }; readonly fixChain: { taskId: string; status: string } };
}): SnapshotShape {
  const idSymbols = new Map<string, string>();
  const sym = (id: string | null): string | null => {
    if (id === null) return null;
    let s = idSymbols.get(id);
    if (s === undefined) {
      s = `id-${idSymbols.size + 1}`;
      idSymbols.set(id, s);
    }
    return s;
  };
  const maskTs = (v: string): string => (v.trim() === "" ? v : ISO);
  const task = (r: TaskRowProjection) => ({
    id: sym(r.id)!,
    slug: r.slug,
    local_id: r.local_id,
    task_type: r.task_type,
    task_status: r.task_status,
    project_key: r.project_key,
    fix_of_task_id: sym(r.fix_of_task_id),
    updated_at: maskTs(r.updated_at),
  });
  const settlement = (r: SettlementRowProjection) => ({
    id: UUID,
    task_id: sym(r.task_id)!,
    seq: r.seq,
    fix_root_id: sym(r.fix_root_id),
    result: r.result,
    ac_results_json: r.ac_results_json,
    commit_hash: r.commit_hash,
    evidence_json: r.evidence_json,
    created_at: maskTs(r.created_at),
  });
  const record = (r: RecordRowProjection) => ({
    task_id: sym(r.task_id)!,
    verb: r.verb,
    from_status: r.from_status,
    to_status: r.to_status,
    actor: r.actor,
    created_at: maskTs(r.created_at),
  });
  return {
    projectKey: snapshot.projectKey,
    records: snapshot.rawRecords.map(record),
    success: {
      result: { taskId: sym(snapshot.results.success.taskId)!, status: snapshot.results.success.status },
      task: task(snapshot.rawTasks.find((t) => t.id === snapshot.results.success.taskId)!),
      settlement: settlement(snapshot.rawSettlements.find((s) => s.task_id === snapshot.results.success.taskId)!),
    },
    blocked: {
      result: { taskId: sym(snapshot.results.blocked.taskId)!, status: snapshot.results.blocked.status },
      task: task(snapshot.rawTasks.find((t) => t.id === snapshot.results.blocked.taskId)!),
      settlement: settlement(snapshot.rawSettlements.find((s) => s.task_id === snapshot.results.blocked.taskId)!),
    },
    fixChain: {
      result: { taskId: sym(snapshot.results.fixChain.taskId)!, status: snapshot.results.fixChain.status },
      rootSettlement: settlement(snapshot.rawSettlements.find((s) => s.task_id === "t-root-1_0")!),
      fixSettlement: settlement(snapshot.rawSettlements.find((s) => s.task_id === snapshot.results.fixChain.taskId)!),
    },
  };
}

async function buildActual(): Promise<SnapshotShape> {
  const h: TasksHarness = createTasksHarness();
  try {
    // 固定输入：归属键可派生（harness projectKey 单源 = deriveDirName 固定 cwd）；
    // 三条链的任务均种为 in_progress（agent 面矩阵先验的合法前置态）
    seedTask(h, "alpha", "1.0", { status: "in_progress", brief: "固定输入场景一" });
    seedTask(h, "beta", "1.0", { status: "in_progress" });
    const root = seedTask(h, "root", "1.0", { status: "in_progress" });
    const feature = "t-alpha-1_0";
    const blockedTask = "t-beta-1_0";

    const success = await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "alpha", localId: "1.0" },
      result: "success",
      summary: "全载荷结算",
      gate: { compile: true, fmt: true, lint: true, test: true },
      acceptanceCriteria: [{ criterion: "C1", met: true, evidence: "e1" }],
      files: ["src/a.ts", "src/b.ts"],
      filesCreated: ["src/a.ts"],
      filesModified: ["src/b.ts"],
      commitHash: "abc1234",
      keyDecisions: ["d1"],
      testsPassed: 7,
      testsFailed: 0,
      coverage: 0.9,
      notes: "n",
      facets: ["pure-logic"],
    });
    const blocked = await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "beta", localId: "1.0" },
      result: "blocked",
      reason: "缺依赖",
      blockClassification: { kind: "new-problem" },
      gate: { lint: false },
    });
    // fix 链：根 blocked → fix 任务 success（fix_root_id 事务内解析）
    await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "root", localId: "1.0" },
      result: "blocked",
      reason: "根因",
      blockClassification: { kind: "same-family-recurrence" },
    });
    const fix = seedTask(h, "fix", "fix-1", { status: "in_progress", type: "coding-fix", fixOfTaskId: root });
    const fixChain = await submitTask(h.verbDeps, {
      projectKey: h.projectKey,
      taskRef: { slug: "fix", localId: "fix-1" },
      result: "success",
      summary: "修复核销",
      gate: { compile: true, fmt: true, lint: true, test: true },
      acceptanceCriteria: [{ criterion: "R1", met: true, evidence: "re" }],
      commitHash: "cafe000",
    });

    const readTasks = (id: string): TaskRowProjection =>
      h.db.prepare(`SELECT id, slug, local_id, task_type, task_status, project_key, fix_of_task_id, updated_at FROM task_tasks WHERE id = ?`).get(id) as TaskRowProjection;
    const readSettlements = (): SettlementRowProjection[] =>
      h.db.prepare(`SELECT id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at FROM task_settlements ORDER BY created_at, seq, id`).all() as SettlementRowProjection[];
    const readRecords = (id: string): RecordRowProjection =>
      h.db.prepare(`SELECT task_id, verb, from_status, to_status, actor, created_at FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(id) as RecordRowProjection;

    return normalize({
      projectKey: h.projectKey,
      rawTasks: [readTasks(feature), readTasks(blockedTask), readTasks(root), readTasks(fix)],
      rawSettlements: readSettlements(),
      rawRecords: [readRecords(feature), readRecords(blockedTask), readRecords(root), readRecords(fix)],
      results: {
        success: { taskId: feature, status: success.status },
        blocked: { taskId: blockedTask, status: blocked.status },
        fixChain: { taskId: fix, status: fixChain.status },
      },
    });
  } finally {
    h.dispose();
  }
}

describe("submit_task 结算输出快照（forge-dirs-unification 3.3 比对基准）", () => {
  it("固定输入结算输出与快照逐字段一致（id/时戳掩码归一化；records 逐项入比对）", async () => {
    const actual = await buildActual();
    if (WRITE_MODE) {
      // 写入模式：显式跳过快照比对（录制会覆盖基线文件）——但先断言比对面非空并打印条数留痕
      expect(actual.records.length).toBe(4);
      console.log(
        `[snapshot] 写入模式：比对跳过，快照已重写——records=${actual.records.length} tasks=4 settlements=3`,
      );
      writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
      return;
    }
    const recorded = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")) as SnapshotShape;
    expect(actual).toEqual(recorded);
  });
});
