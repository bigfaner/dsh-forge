// 结算行读缝生产装配回归（bug 23507eb5——装配漏接家族第七例）：
// driver.ts 声明并透传 settlements，但 tool-family 生产装配从未注入 → submit 载荷面整体
// 降级（blocked reason =「blocking reason not recorded」、commitHash 落点核验恒不执行）。
// 三条用例均走正式装配入口（assembleTaskLoopServices + assembleTaskLoopToolFamily），
// 不手工注入被测缝：装配漏接变异（删注入行）即红。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assembleTaskLoopServices } from "../../host/assembly/default-assembly.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";
import { settleWorkerRun, type CommitLandingVerifier } from "../../host/dispatch-core/settle.js";
import type { DispatchCoreDeps } from "../../host/dispatch-core/core.js";
import type { SpawnWorkerHandle } from "../../host/dispatch-core/spawn.js";
import type { TaskSnapshot } from "../../host/domain/tasks/types.js";

/** createLoopDriver 生产 deps 捕获（装配注入断言面——漏接即 undefined） */
const driverDepsCapture = vi.hoisted(() => ({ deps: undefined as DispatchCoreDeps | undefined }));
vi.mock("../../host/loop/driver.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../host/loop/driver.js")>();
  return {
    ...mod,
    createLoopDriver: (deps: Parameters<typeof mod.createLoopDriver>[0]) => {
      driverDepsCapture.deps = deps as unknown as DispatchCoreDeps;
      return mod.createLoopDriver(deps);
    },
  };
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 正式装配入口（与生产相同调用径——零 config、零手工缝注入） */
function setup() {
  const home = mkdtempSync(join(tmpdir(), "task-loop-settle-asm-"));
  dirs.push(home);
  const services = assembleTaskLoopServices({ home, dbFile: ":memory:" })!;
  const ctx = { emit: (_event: string, _payload: Record<string, unknown>) => {} };
  const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
  return { services, family };
}

/** 真实任务域：add → claim → 返回快照 */
async function claimedTask(services: NonNullable<ReturnType<typeof assembleTaskLoopServices>>, slug: string) {
  await services.tasks.addTask({ projectKey: PROJECT_KEY, slug, title: "T", type: "doc" });
  const claimed = await services.tasks.claimTask({ projectKey: PROJECT_KEY, sessionId: "s-1", source: { slug } });
  return claimed.task as TaskSnapshot;
}

function handle(): SpawnWorkerHandle {
  return { workerSessionId: "worker-1", result: Promise.resolve({ stopReason: "completed", output: "" }), dispose: async () => {} };
}

const PROJECT_KEY = "p-settle-asm";
const okLanding: CommitLandingVerifier = async () => ({ ok: true, branch: "feat-x", commitBranches: ["feat-x"] });
const badLanding: CommitLandingVerifier = async () => ({ ok: false, branch: "feat-x", commitBranches: ["main"] });

describe("结算行读缝生产装配（bug 23507eb5——装配漏接回归锚）", () => {
  it("正式装配入口组装的循环内核依赖携带 settlements 读缝；投影 = task_settlements 末条（result/commitHash/evidence）", async () => {
    const { services, family } = setup();
    try {
      // 装配锚：注入行被删 → settlements 缺席（零配置降级形态）→ 本断言红
      expect(driverDepsCapture.deps?.settlements).not.toBeUndefined();
      expect(typeof driverDepsCapture.deps!.settlements!.lastByTask).toBe("function");

      // 真实写径落结算行（success + commitHash + summary/files/evidenceDebt 全语义载荷）
      const task = await claimedTask(services, "alpha");
      await services.tasks.submitTask({
        projectKey: PROJECT_KEY,
        taskRef: { slug: "alpha", localId: task.localId },
        result: "success",
        summary: "done",
        commitHash: "abc1234",
        evidenceDebt: { suite: "e2e", specs: ["e2e/specs/a.spec.ts"] },
      });
      const view = await driverDepsCapture.deps!.settlements!.lastByTask(task.taskId);
      expect(view?.result).toBe("success");
      expect(view?.commitHash).toBe("abc1234");
      expect(view?.evidence).toMatchObject({ summary: "done", gates: { evidenceDebt: { suite: "e2e" } } });
      // 无结算任务 = undefined（追加序末条语义）
      const empty = await driverDepsCapture.deps!.settlements!.lastByTask("no-such-task");
      expect(empty).toBeUndefined();
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });

  it("经结算核：blocked 结算行 reason 原文随结算结果携带（不再是「blocking reason not recorded」）", async () => {
    const { services, family } = setup();
    try {
      const task = await claimedTask(services, "beta");
      await services.tasks.submitTask({
        projectKey: PROJECT_KEY,
        taskRef: { slug: "beta", localId: task.localId },
        result: "blocked",
        reason: "环境缺依赖：pnpm install 失败",
        blockClassification: { kind: "new-problem" },
      });
      // 生产装配产物 face（捕获自 createLoopDriver deps——与注入生产链同一对象）
      const settlement = await settleWorkerRun(
        { tasks: services.tasks, settlements: driverDepsCapture.deps!.settlements! },
        { projectId: PROJECT_KEY, task, digest: "d", handle: handle(), spawnStartedAt: Date.now() },
      );
      expect(settlement.case).toBe("settled");
      if (settlement.case !== "settled") return;
      expect(settlement.result.outcome).toBe("blocked");
      expect(settlement.result.reason).toBe("环境缺依赖：pnpm install 失败");
      expect(settlement.result.reason).not.toBe("blocking reason not recorded");
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });

  it("经结算核：success + commitHash 在场时提交落点核验被执行——提交不在容器检出分支上则结算被拒（landing-rejected）", async () => {
    const { services, family } = setup();
    try {
      const task = await claimedTask(services, "gamma");
      await services.tasks.submitTask({
        projectKey: PROJECT_KEY,
        taskRef: { slug: "gamma", localId: task.localId },
        result: "success",
        summary: "done",
        commitHash: "abc1234",
      });
      // 缝缺席（修复前形态）→ commitHash 投影缺 → 核验以 commitHash 在场为前置恒不执行
      const settlement = await settleWorkerRun(
        { tasks: services.tasks, settlements: driverDepsCapture.deps!.settlements!, commitLanding: badLanding },
        { projectId: PROJECT_KEY, task, digest: "d", handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: "Z:\\wt" },
      );
      expect(settlement.case).toBe("landing-rejected");
      if (settlement.case !== "landing-rejected") return;
      expect(settlement.cause.message).toContain("[settle-cwd-pin]");
      // 反向锚：落点命中 → settled（新任务径——landing-rejected 已把上一任务真化 interrupted，
      // 二次结算读非终态为 failed noSettlement 不可复用）。断言加严：成功结算且 commitHash 在场。
      const okTask = await claimedTask(services, "delta");
      await services.tasks.submitTask({
        projectKey: PROJECT_KEY,
        taskRef: { slug: "delta", localId: okTask.localId },
        result: "success",
        summary: "done",
        commitHash: "cafe5678",
      });
      const settled = await settleWorkerRun(
        { tasks: services.tasks, settlements: driverDepsCapture.deps!.settlements!, commitLanding: okLanding },
        { projectId: PROJECT_KEY, task: okTask, digest: "d", handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: "Z:\\wt" },
      );
      expect(settled.case).toBe("settled");
      if (settled.case !== "settled") return;
      expect(settled.result.outcome).toBe("success");
      expect(settled.result.commitHash).toBe("cafe5678");
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });
});
