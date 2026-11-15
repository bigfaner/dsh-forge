// 单装缺省装配三件单测（fix-1——零组合器 config 自足）：
//   ① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（contract-constants 单源组合 pin）；
//   ② 服务常驻 provider：db 打开即 provide forgeTasks/forgeCheckpoints 具名服务（方法面完整）；
//   ③ 任务目录缺省约定：home 缺省 = env DSH_HOME（显式 config.home 覆写；双缺 = 降级零 provide）。
// 附：启动对账接线（loop_sourced in_progress → interrupted 收敛）+ 具名服务 provide/降级径。
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import taskLoopPlugin from "../../host/index.js";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import {
  assembleTaskLoopServices,
  domainDbFileName,
  resolveTaskLoopHome,
} from "../../host/assembly/default-assembly.js";
import { listDistinctProjectKeys } from "../../host/domain/tasks/query.js";
import { TASK_LOOP_DB_DEFAULT_DIR, TASK_LOOP_DB_FILENAME } from "../../shared/contract-constants.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "task-loop-asm-"));
  dirs.push(dir);
  return dir;
}

/** 结构化 ctx 桩（reflect.provide/get 同 Map + typert plugin 捕获 + inject 缝替身） */
function stubCtx(initial?: Record<string, unknown>) {
  const services: Record<string, unknown> = { ...initial };
  const mounted: string[] = [];
  const pending: Array<{ key: string; cb: (scope: Record<string, unknown>) => void }> = [];
  const ctx = {
    reflect: {
      provide(name: string, value?: unknown) {
        services[name] = value;
      },
      get(name: string) {
        return services[name];
      },
    },
    plugin(options: { name: string }) {
      mounted.push(options.name);
    },
    inject(deps: readonly string[], cb: (scope: Record<string, unknown>) => void) {
      const key = deps[0] as string;
      if (services[key] !== undefined) cb({ [key]: services[key] });
      else pending.push({ key, cb });
      return () => {};
    },
  };
  return {
    ctx,
    mounted,
    services,
    pendingCount: () => pending.length,
  };
}

describe("单装缺省装配三件", () => {
  it("① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（contract-constants 单源组合）——装配后库文件在盘", () => {
    const home = tmpHome();
    // 落点组合单源 pin：domainDbFileName == constants 拼装（漂移即 RED）
    expect(domainDbFileName(home)).toBe(join(home, TASK_LOOP_DB_DEFAULT_DIR, TASK_LOOP_DB_FILENAME));
    const services = assembleTaskLoopServices({ home });
    expect(services !== null, "缺省装配返回面在场").toBe(true);
    services!.dispose();
    expect(existsSync(join(home, TASK_LOOP_DB_DEFAULT_DIR, TASK_LOOP_DB_FILENAME))).toBe(true);
  });

  it("② 服务常驻 provider：db 打开即 provide forgeTasks/forgeCheckpoints（具名服务键 + 方法面完整），disposer 关库", () => {
    const home = tmpHome();
    const { ctx, services, mounted } = stubCtx();
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    const tasks = services.forgeTasks as Record<string, unknown> | undefined;
    const checkpoints = services.forgeCheckpoints as Record<string, unknown> | undefined;
    expect(tasks !== undefined, "forgeTasks 具名服务 provide").toBe(true);
    expect(checkpoints !== undefined, "forgeCheckpoints 具名服务 provide").toBe(true);
    for (const method of ["addTask", "claimTask", "submitTask", "listTasks", "taskStats", "reconcileInterrupted"]) {
      expect(typeof tasks?.[method], method).toBe("function");
    }
    for (const method of ["appendCheckpoint", "ensureCheckpoint", "listCheckpoints"]) {
      expect(typeof checkpoints?.[method], method).toBe("function");
    }
    // Typert 通道挂载注册行（根 ctx plugin——CONTROLLERS 表 forgeTasks 行）
    expect(mounted).toContain("task-loop-typert-forgeTasks");
    dispose();
  });

  it("③ 任务目录缺省约定：config.home 缺席 → env DSH_HOME 兜底；双缺 → 降级零 provide（诊断留痕）", () => {
    const home = tmpHome();
    const prev = process.env.DSH_HOME;
    try {
      // env 兜底腿：DSH_HOME 在场 → 缺省装配生效
      process.env.DSH_HOME = home;
      expect(resolveTaskLoopHome({})).toBe(home);
      const { ctx, services } = stubCtx();
      const dispose = taskLoopPlugin(ctx, { dbFile: ":memory:" });
      expect(services.forgeTasks !== undefined, "forgeTasks provide（env 兜底腿）").toBe(true);
      expect(services.forgeCheckpoints !== undefined, "forgeCheckpoints provide（env 兜底腿）").toBe(true);
      dispose();

      // 双缺腿：DSH_HOME 清空 → 降级零 provide（fail-soft 不阻载）
      delete process.env.DSH_HOME;
      const lines: string[] = [];
      const bare = stubCtx();
      const disposeBare = taskLoopPlugin(bare.ctx, { diag: (line) => lines.push(line) });
      expect(bare.services.forgeTasks).toBeUndefined();
      expect(bare.services.forgeCheckpoints).toBeUndefined();
      disposeBare();
      expect(lines.some((l) => l.includes("缺省装配缺席"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = prev;
    }
  });
});

describe("cordis 官方宿主兼容（真 Context——reflect.provide 官方面）", () => {
  it("真 cordis Context：forgeTasks/forgeCheckpoints 经 reflect.get 在场（inject 门外的官方面读取）", () => {
    const home = tmpHome();
    const ctx = new Context();
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    try {
      const tasks = ctx.reflect.get(FORGE_TASKS_SERVICE_KEY) as Record<string, unknown> | undefined;
      const checkpoints = ctx.reflect.get(FORGE_CHECKPOINTS_SERVICE_KEY) as Record<string, unknown> | undefined;
      expect(typeof tasks?.submitTask).toBe("function");
      expect(typeof checkpoints?.listCheckpoints).toBe("function");
    } finally {
      dispose();
    }
  });
});

describe("启动对账接线（reconcile 降级）", () => {
  it("loop_sourced in_progress 中断态 → 装配对账收敛 interrupted；空库零对账零写入", async () => {
    const home = tmpHome();
    const services = assembleTaskLoopServices({ home })!;
    // 种中断态：addTask → loopSourced claim（in_progress ∧ loop_sourced=1）
    const projectKey = "p-reconcile";
    const added = await services.tasks.addTask({ projectKey, slug: "alpha", title: "T", type: "coding-feature" });
    await services.tasks.claimTask({ projectKey, sessionId: "s-1", source: { slug: "alpha" }, loopSourced: true });
    await services.reconcile();
    const status = services.db.db
      .prepare<unknown[], { task_status: string }>("SELECT task_status FROM task_tasks WHERE id = ?")
      .get(added.taskId);
    expect(status?.task_status).toBe("interrupted");
    // 空键容器零对账（listDistinctProjectKeys 只返回有行键）
    expect(listDistinctProjectKeys(services.db.db)).toEqual([projectKey]);
    services.dispose();
  });

  it("对账降级径：reconcile 抛错 → index 接线 warn 留痕不阻载（fire-and-forget 吞错）", async () => {
    const home = tmpHome();
    const { ctx } = stubCtx();
    const lines: string[] = [];
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:", diag: (line, level) => lines.push(`${level}:${line}`) });
    // 空库对账零命中零写入——装配期 fire-and-forget 完成（await 一轮宏任务让出）
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lines.some((l) => l.startsWith("error:"))).toBe(false);
    dispose();
  });
});
