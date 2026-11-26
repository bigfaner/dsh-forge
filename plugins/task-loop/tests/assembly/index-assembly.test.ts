// 单装缺省装配三件单测（fix-1——零组合器 config 自足）：
//   ① db 缺省路径：{home}/forge/db/task-loop/task-loop.db（contract-constants 单源组合 pin）；
//   ② 服务常驻 provider：db 打开即 provide forgeTasks/forgeCheckpoints 具名服务（方法面完整）；
//   ③ 任务目录缺省约定：home 缺省 = env DSH_HOME（显式 config.home 覆写；双缺 = 降级零 provide）。
// 附：启动对账接线（loop_sourced in_progress → interrupted 收敛）+ 具名服务 provide/降级径。
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import taskLoopPlugin from "../../host/index.js";
import { WORKER_BUG_ESSENTIAL_TOOLS } from "../../host/dispatch-core/assemble.js";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import {
  assembleTaskLoopServices,
  domainDbFileName,
  resolveTaskLoopHome,
} from "../../host/assembly/default-assembly.js";
import { listDistinctProjectKeys } from "../../host/domain/tasks/query.js";
import { deriveDirName, resolveProjectKey } from "@dsh-forge/lib-path";
import { settleWorkerRun } from "../../host/dispatch-core/settle.js";
import { assembleTaskLoopToolFamily } from "../../host/assembly/tool-family.js";
import type { TaskSnapshot } from "../../host/domain/tasks/types.js";
import type { SpawnWorkerHandle } from "../../host/dispatch-core/spawn.js";
import { TASK_LOOP_DB_DEFAULT_DIR, TASK_LOOP_DB_FILENAME } from "../../shared/contract-constants.js";

const dirs: string[] = [];

/** 经 driver 驱动用例的 worker spawn 替身（in-process 真绑定模块级 mock——请求录制 + submit 后 end_turn 终态） */
const fakeSpawnState = vi.hoisted(() => ({
  requests: [] as Array<{ label?: string }>,
  submit: undefined as undefined | (() => Promise<unknown>),
}));
vi.mock("../../host/spawn/in-process-driver.js", () => ({
  createInProcessDriverSpawn: () => async (request: { label?: string }) => {
    fakeSpawnState.requests.push(request);
    const result = (async () => {
      // 结算读 = worker 自行 submitTask 落账（settle 核只读终态）——替身先落 success 再终态
      await fakeSpawnState.submit?.();
      return { stopReason: "end_turn" as const, output: "done" };
    })();
    return { workerSessionId: "worker-1", result, dispose: async () => {} };
  },
}));

/** tool-family 装配捕获（生产装配形态测试——经 taskLoopPlugin 正式入口驱动后取同一 services 产物装 family） */
const familyServicesCapture = vi.hoisted(() => ({ services: undefined as unknown }));
vi.mock("../../host/assembly/tool-family.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../host/assembly/tool-family.js")>();
  return {
    ...mod,
    assembleTaskLoopToolFamily: (input: Parameters<typeof mod.assembleTaskLoopToolFamily>[0]) => {
      familyServicesCapture.services = input.services;
      return mod.assembleTaskLoopToolFamily(input);
    },
  };
});

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

describe("worker persona 专家人格段接线（bug 044a310c 回归）", () => {
  /** 最小 experts 服务面（ExpertsServiceFace 结构子面——resolver 只调 get）。 */
  function expertsWith(entries: Record<string, { name: string; title?: string; personaMd: string }>) {
    return {
      get(key: string) {
        const hit = entries[key];
        if (hit === undefined) throw new Error(`expert not found: ${key}`);
        return { ...hit, tools: [], skills: [], origin: "plugin", enabled: true };
      },
      list: () => Object.values(entries).map((e) => ({ ...e, tools: [], skills: [], origin: "plugin", enabled: true })),
      registerRoot: () => {},
      async setEnabled() {},
    };
  }

  it("ctx.experts 在场 → claim 链经 DEFAULT_EXPERT_MAPPING 取档案 → persona 含「你是<title>」人格段", async () => {
    const home = tmpHome();
    const { ctx } = stubCtx({
      experts: expertsWith({ "tech-writer": { name: "tech-writer", title: "技术作家", personaMd: "以读者视角落笔。" } }),
    });
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    const tasks = (ctx as { reflect: { get(name: string): unknown } }).reflect.get("forgeTasks") as {
      addTask(input: { projectKey: string; slug: string; title: string; type: string }): Promise<{ taskId: string }>;
      claimTask(input: { projectKey: string; sessionId: string; source: { slug: string } }): Promise<{ task: unknown; persona: string }>;
    };
    await tasks.addTask({ projectKey: "p-persona", slug: "alpha", title: "T", type: "doc" });
    const claimed = await tasks.claimTask({ projectKey: "p-persona", sessionId: "s-1", source: { slug: "alpha" } });
    // 人格段在前（renderExpertProfileSection：你是<title>。\n\n<personaMd>）、程序段在后
    expect(claimed.persona.startsWith("你是技术作家。")).toBe(true);
    expect(claimed.persona).toContain("以读者视角落笔。");
    expect(claimed.persona).toContain("## 核心纪律");
    dispose();
  });

  it("experts 缺席（单装无 expert-squad）→ 不注入 → persona 仅程序段（既有形态兼容，不炸）", async () => {
    const home = tmpHome();
    const { ctx } = stubCtx();
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    const tasks = (ctx as { reflect: { get(name: string): unknown } }).reflect.get("forgeTasks") as {
      addTask(input: { projectKey: string; slug: string; title: string; type: string }): Promise<{ taskId: string }>;
      claimTask(input: { projectKey: string; sessionId: string; source: { slug: string } }): Promise<{ task: unknown; persona: string }>;
    };
    await tasks.addTask({ projectKey: "p-nopersona", slug: "alpha", title: "T", type: "doc" });
    const claimed = await tasks.claimTask({ projectKey: "p-nopersona", sessionId: "s-1", source: { slug: "alpha" } });
    expect(claimed.persona.startsWith("你是")).toBe(false);
    expect(claimed.persona).toContain("## 核心纪律");
    dispose();
  });

  it("映射缺键类型（validation-code）→ resolver 返回 undefined → 仅程序段（排除预设语义不变）", async () => {
    const home = tmpHome();
    const { ctx } = stubCtx({
      experts: expertsWith({ "tech-writer": { name: "tech-writer", title: "技术作家", personaMd: "x" } }),
    });
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    const tasks = (ctx as { reflect: { get(name: string): unknown } }).reflect.get("forgeTasks") as {
      addTask(input: { projectKey: string; slug: string; title: string; type: string }): Promise<{ taskId: string }>;
      claimTask(input: { projectKey: string; sessionId: string; source: { slug: string } }): Promise<{ task: unknown; persona: string }>;
    };
    await tasks.addTask({ projectKey: "p-nokey", slug: "alpha", title: "T", type: "validation-code" });
    const claimed = await tasks.claimTask({ projectKey: "p-nokey", sessionId: "s-1", source: { slug: "alpha" } });
    expect(claimed.persona.startsWith("你是")).toBe(false);
    dispose();
  });
});

describe("bug 四动词白名单（装配接线结构锚——bug 044a310c 同族漏接判例）", () => {
  const read = (rel: string): string => readFileSync(join(PKG_ROOT, rel), "utf8");
  const PKG_ROOT = join(import.meta.dirname, "..", "..");

  it("WORKER_BUG_ESSENTIAL_TOOLS 恰四动词（蛇形——list_bugs 在列；驼峰旧名零残留）", () => {
    expect([...WORKER_BUG_ESSENTIAL_TOOLS].sort()).toEqual(["get_bug", "list_bugs", "record_bug", "resolve_bug"]);
    for (const name of WORKER_BUG_ESSENTIAL_TOOLS) expect(name).toMatch(/^[a-z_]+$/);
  });

  it("tool-family 装配 createLoopDriver 时传 bugsPresent（reflect 'forge.bugs' 现查）", () => {
    const src = read("host/assembly/tool-family.ts");
    const call = src.slice(src.indexOf("createLoopDriver({"));
    expect(call.slice(0, call.indexOf("});")).includes("bugsPresent")).toBe(true);
    expect(src.includes('reflect?.get?.("forge.bugs")')).toBe(true);
  });

  it("driver.ts LoopDriverDeps 声明并透传 bugsPresent 到 DispatchCoreDeps", () => {
    const src = read("host/loop/driver.ts");
    expect(src.includes("readonly bugsPresent?: DispatchCoreDeps[")).toBe(true);
    expect(src.includes("deps.bugsPresent !== undefined ? { bugsPresent: deps.bugsPresent }")).toBe(true);
  });

  it("bug-hunter / triage-analyst / bug-investigator 档案 tools 含台账工具且零驼峰旧名", () => {
    const archives: ReadonlyArray<[string, string[]]> = [
      ["../task-loop/experts/bug-hunter.md", ["get_bug", "list_bugs", "record_bug", "resolve_bug"]],
      ["../task-loop/experts/triage-analyst.md", ["get_bug", "list_bugs"]],
      ["../spec/experts/bug-investigator.md", ["get_bug", "list_bugs"]],
    ];
    for (const [rel, required] of archives) {
      const md = read(rel);
      const toolsLine = md.split("\n").find((l) => l.startsWith("tools:")) ?? "";
      for (const name of required) expect(toolsLine.includes(name), `${rel} 缺 ${name}`).toBe(true);
      expect(md.match(/\b(getBug|listBugs|recordBug|resolveBug|aggregateBugs)\b/), `${rel} 驼峰旧名残留`).toBeNull();
    }
  });
});

describe("结算报告回收装配回归锚（bug a31b96a2——proposalId 门退役 + 落点锚）", () => {
  const PROJECT_KEY = "p-recovery";

  /** tasksHome 注入形态装配（回收缝单源：真实 services + tool-family 装配产物） */
  function assembleWithRecovery(ws: string, tasksHome: string, entries: Array<{ level?: string; message?: string }>) {
    const { ctx } = stubCtx();
    (ctx as { emit?: unknown }).emit = (_event: string, payload: { level?: string; message?: string }) => {
      entries.push(payload);
    };
    const services = assembleTaskLoopServices({
      home: tmpHome(),
      dbFile: ":memory:",
      tasksHome,
      resolveWsPath: (key) => (key === PROJECT_KEY ? ws : ""),
    })!;
    const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
    return { services, family };
  }

  function okHandle(): SpawnWorkerHandle {
    return {
      workerSessionId: "worker-1",
      result: Promise.resolve({ stopReason: "end_turn", output: "done" }),
      dispose: async () => {},
    };
  }

  it("真实结算核：tasksHome 运行时任务目录顶层 .md 结算后复制进 <ws>/.forge/specs/<slug>/issues/<localId>/；预置 spec.md 不被覆盖", async () => {
    const ws = tmpHome();
    const tasksHome = tmpHome();
    const entries: Array<{ level?: string; message?: string }> = [];
    const { services, family } = assembleWithRecovery(ws, tasksHome, entries);
    try {
      // 装配锚：tasksHome 注入形态下回收缝在场（漏接变异即红）
      expect(family.reportRecovery).not.toBeUndefined();

      // 运行时任务目录（真实 mkdtemp 树）顶层放 .md 报告——localId 随真实任务编号
      const derivedKey = services.db.projectKeyOf(ws);
      const specMd = join(ws, ".forge", "specs", "alpha", "spec.md");
      mkdirSync(join(ws, ".forge", "specs", "alpha"), { recursive: true });
      writeFileSync(specMd, "# 既有 Spec 正本\n", "utf8");

      // 真实任务域：add → claim → submit（success 结算落 completed）
      await services.tasks.addTask({ projectKey: PROJECT_KEY, slug: "alpha", title: "T", type: "doc" });
      const claimed = await services.tasks.claimTask({ projectKey: PROJECT_KEY, sessionId: "s-1", source: { slug: "alpha" } });
      const task = claimed.task as TaskSnapshot;
      const runtimeDir = join(tasksHome, derivedKey, "logs", "alpha", task.localId);
      mkdirSync(runtimeDir, { recursive: true });
      writeFileSync(join(runtimeDir, "settle-report.md"), "# 结算回收证明\n", "utf8");
      await services.tasks.submitTask({
        projectKey: PROJECT_KEY,
        taskRef: { slug: "alpha", localId: task.localId },
        result: "success",
        summary: "done",
      });

      // 经 assembleTaskLoopToolFamily 装配的生产回收缝驱动真实结算核
      const settlement = await settleWorkerRun(
        { tasks: services.tasks, reportRecovery: family.reportRecovery!, diag: (p) => entries.push(p) },
        { projectId: PROJECT_KEY, task, digest: "d", handle: okHandle(), spawnStartedAt: Date.now() },
      );
      expect(settlement.case).toBe("settled");
      if (settlement.case !== "settled") return;
      expect(settlement.result.outcome).toBe("success");

      // 回收落点断言（tool-family 落点改回 docs/proposals 或删掉 specsIssuesDir 注入 → 本断言红）
      const issuesDir = join(ws, ".forge", "specs", "alpha", "issues", task.localId);
      expect(readFileSync(join(issuesDir, "settle-report.md"), "utf8")).toBe("# 结算回收证明\n");
      // 既有 Spec 文档不被覆盖
      expect(readFileSync(specMd, "utf8")).toBe("# 既有 Spec 正本\n");
      // 运行时原件不动且内容不变（复制非移动——copyFile 变异为 rename 则本断言红）
      expect(readFileSync(join(runtimeDir, "settle-report.md"), "utf8")).toBe("# 结算回收证明\n");
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });

  it("经 driver 驱动：reportRecovery 透传链把守（tool-family 注入 createLoopDriver deps → driver.ts 透传结算核）——任一环被删即红", async () => {
    const ws = tmpHome();
    const tasksHome = tmpHome();
    const { services, family } = assembleWithRecovery(ws, tasksHome, []);
    try {
      const derivedKey = services.db.projectKeyOf(ws);
      mkdirSync(join(ws, ".forge", "specs", "alpha"), { recursive: true });
      // 真实任务域：add（不预领——由循环驱动器自己 claim）
      await services.tasks.addTask({ projectKey: PROJECT_KEY, slug: "alpha", title: "T", type: "doc" });
      const cards = await services.tasks.listTasks({ projectKey: PROJECT_KEY, slug: "alpha" });
      const localId = cards[0]!.localId;
      // 预置运行时回收源（结算前落 .md 报告——localId 随真实任务编号）
      const runtimeDir = join(tasksHome, derivedKey, "logs", "alpha", localId);
      mkdirSync(runtimeDir, { recursive: true });
      writeFileSync(join(runtimeDir, "settle-report.md"), "# driver 透传回收证明\n", "utf8");
      fakeSpawnState.submit = () =>
        services.tasks.submitTask({
          projectKey: PROJECT_KEY,
          taskRef: { slug: "alpha", localId },
          result: "success",
          summary: "done",
        });

      // 经装配产物 family.driver 全链驱动：claim → spawn（替身）→ 结算核 settle
      const start = await family.driver.start({ source: { slug: "alpha" }, ownerSessionId: "s-1", parent: {}, projectId: PROJECT_KEY });
      expect(start).toEqual({ ok: true, loopId: expect.any(String) });

      // 结算回收经 driver 透传链落盘：tool-family 注入行 / driver.ts 透传行任一被删 → 本断言红
      // （回收发生在结算核 settle 期——文件在场即透传链已走通；随后 stop 收口不等静默窗）
      await vi.waitFor(
        () => {
          expect(existsSync(join(ws, ".forge", "specs", "alpha", "issues", localId, "settle-report.md"))).toBe(true);
        },
        { timeout: 15_000, interval: 10 },
      );
      expect(
        readFileSync(join(ws, ".forge", "specs", "alpha", "issues", localId, "settle-report.md"), "utf8"),
      ).toBe("# driver 透传回收证明\n");
      expect(fakeSpawnState.requests).toHaveLength(1);
      await family.driver.stop({ ownerSessionId: "s-1" });
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  }, 30_000);
});

describe("回收钩子目录归拢（bug 245bacf3——worktree 会话同目录性）", () => {
  it("worktree 会话：回收钩子定位目录 = 事件链落盘目录（主检出归拢取法单源，非未归拢 worktree 键）", async () => {
    const mainRoot = tmpHome();
    const wt = join(mainRoot, ".forge", "worktrees", "wt-1");
    mkdirSync(wt, { recursive: true });
    const tasksHome = tmpHome();
    const PROJECT_KEY = deriveDirName(mainRoot);
    const entries: Array<{ level?: string; message?: string }> = [];
    const { ctx } = stubCtx();
    (ctx as { emit?: unknown }).emit = (_event: string, payload: { level?: string; message?: string }) => {
      entries.push(payload);
    };
    const services = assembleTaskLoopServices({
      home: tmpHome(),
      dbFile: ":memory:",
      tasksHome,
      resolveWsPath: (key) => (key === PROJECT_KEY ? wt : ""),
      registryQuery: (cwd) => (cwd === wt ? mainRoot : undefined),
    })!;
    const family = assembleTaskLoopToolFamily({ services, ctx, diag: () => {} });
    try {
      expect(family.reportRecovery).not.toBeUndefined();
      const rolledKey = resolveProjectKey(wt, { registryQuery: (cwd) => (cwd === wt ? mainRoot : undefined) }).key;
      const runtimeDir = await family.reportRecovery!.resolveRuntimeTaskDir({
        projectId: PROJECT_KEY,
        slug: "alpha",
        localId: "1.0",
      });
      // 事件链落盘目录 = resolveDir 同一归拢取法（default-assembly projectKeyOfCwd）→ 同容器目录
      const eventChainDir = join(tasksHome, rolledKey, "logs", "alpha", "1.0");
      expect(runtimeDir).toBe(eventChainDir);
      // 防假绿：未归拢的 worktree 键目录 ≠ 归拢目录
      expect(runtimeDir).not.toBe(join(tasksHome, deriveDirName(wt), "logs", "alpha", "1.0"));
    } finally {
      family.disposeLoop();
      services.dispose();
    }
  });
});

describe("生产装配 resolveWsPath 接缝（bug 9b3c9a9b——零 config 注入、只给 tasksHome）", () => {
  it("经 taskLoopPlugin 正式入口：回收钩子把 projectId 解析出 wsPath 与运行时任务目录；worker 简报任务日志目录 ≡ 钩子解析目录；未注册项目 = undefined 不抛", async () => {
    const ws = tmpHome();
    // projectKey = deriveDirName(ws) 同名制（dual-memory-seam 单源——生产任务键派生同径）
    const PROJECT_KEY = deriveDirName(ws);
    const tasksHome = tmpHome();
    // 规格锚在盘（forge 根锚点节 fail-soft 探测的前置；落点 = 注册表 forge.spec_dir
    // 解析真相 = {ws}/.forge/docs/specs/{slug}——forge-dirs-unification §2.3）
    mkdirSync(join(ws, ".forge", "docs", "specs", "alpha"), { recursive: true });
    writeFileSync(join(ws, ".forge", "docs", "specs", "alpha", "spec.md"), "# 既有 Spec 正本\n", "utf8");
    const { ctx, services } = stubCtx();
    let projectRegistered = true;
    // forge.projects 缝替身（plugins/project 五缝同形——惰性工厂产 ProjectsServicePort 窄面）
    services["forge.projects"] = () => ({
      getProject: async (id: string) => (id === PROJECT_KEY && projectRegistered ? { wsPath: ws } : null),
    });
    const prev = process.env.DSH_HOME;
    process.env.DSH_HOME = tmpHome(); // 零 config 注入：home 走 env DSH_HOME
    // 官方 tools 缝替身（插件内 family 装配前置——reportRecovery 装配在 family 侧）
    (ctx as { tools?: unknown }).tools = { register: (_definition: unknown) => () => {} };
    const dispose = taskLoopPlugin(ctx, { tasksHome });
    try {
      const tasks = services.forgeTasks as import("../../host/domain/tasks/service.js").TasksService;
      await tasks.addTask({ projectKey: PROJECT_KEY, slug: "alpha", title: "T", type: "doc" });
      const claimed = await tasks.claimTask({ projectKey: PROJECT_KEY, sessionId: "s-1", source: { slug: "alpha" } });
      const task = claimed.task as TaskSnapshot;
      // ① worker 简报任务日志目录字符串（经 resolveWorkerContext 产物 = persona 尾部锚点节取）
      const seg = claimed.persona.slice(claimed.persona.indexOf("forge.task_logs_dir——"));
      const briefDir = /`([^`]+)`/.exec(seg.slice(seg.indexOf("`")))?.[1] ?? "";
      const expectedDir = join(tasksHome, PROJECT_KEY, "logs", "alpha", task.localId);
      expect(briefDir).toBe(`${expectedDir}\\`);
      // ② worker 简报规格目录锚点（经注册表 forge.spec_dir 解析 = {ws}/.forge/docs/specs/<slug>——不缺席）
      expect(claimed.persona).toContain(join(ws, ".forge", "docs", "specs", "alpha"));

      // ③ 回收钩子（生产装配产物 family）把 projectId 解析出运行时任务目录，与 worker 简报直接比较相等
      const family = assembleTaskLoopToolFamily({
        services: familyServicesCapture.services as Parameters<typeof assembleTaskLoopToolFamily>[0]["services"],
        ctx,
        diag: () => {},
      });
      const runtimeDir = await family.reportRecovery!.resolveRuntimeTaskDir({
        projectId: PROJECT_KEY,
        slug: "alpha",
        localId: task.localId,
      });
      expect(runtimeDir).toBe(expectedDir);
      const issuesDir = await family.reportRecovery!.resolveSpecsIssuesDir({
        projectId: PROJECT_KEY,
        slug: "alpha",
        localId: task.localId,
      });
      expect(issuesDir).toBe(join(ws, ".forge", "specs", "alpha", "issues", task.localId));

      // ④ 项目未注册 → undefined 不抛（fail-soft 惰性跳过语义）
      projectRegistered = false;
      expect(
        await family.reportRecovery!.resolveRuntimeTaskDir({ projectId: PROJECT_KEY, slug: "alpha", localId: task.localId }),
      ).toBeUndefined();
      family.disposeLoop();
    } finally {
      dispose();
      process.env.DSH_HOME = prev;
    }
  });
});
