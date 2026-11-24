// register.ts 单测（bug 工具族注册缝——评审 B P1-b 覆盖真空补齐 + 审计 M6 归拢键修口，
// 与 forge-paths.test 同族对称）：① createBugProjectIdResolver 三腿解析（projectKeyOf
// 派生——worktree cwd 归拢主根键 / main 行 normalizeFsPath 归一匹配 / coreProjects 退路
// ——全链 miss = undefined）；② registerBugTools 的 ctx.tools.register 缺席 → warn +
// no-op 降级（在场地假 → 四员注册 + unmount 全撤回 + 单员异常隔离）。
// 替身纪律：替身落 DomainDb repos 端口缝（测试侧组合根构造——零生产口）。
import { describe, expect, it, vi } from "vitest";
import type { DomainDb } from "../db/connection.js";
import { createBugTools } from "./bug-tools.js";
import { createBugProjectIdResolver, registerBugTools } from "./register.js";

/** 最小 DomainDb 替身（只塑 resolver 消费的四方法——其余零实现） */
function fakeDb(input: {
  keyOf?: (cwd: string) => string;
  byKey?: Record<string, { id: string }>;
  mains?: Record<string, string>;
}): DomainDb {
  return {
    repos: {
      projects: {
        projectKeyOf: input.keyOf ?? ((cwd: string) => `key:${cwd}`),
        getByKey: (key: string) => input.byKey?.[key],
        list: () => [...Object.values(input.byKey ?? {}), ...Object.keys(input.mains ?? {}).map((id) => ({ id }))],
      },
      workspaces: {
        getMain: (projectId: string) => {
          const wsPath = input.mains?.[projectId];
          return wsPath === undefined ? undefined : { wsPath };
        },
      },
    },
  } as unknown as DomainDb;
}

/** porcelain 桩：git worktree list --porcelain 输出形状（主检出行恒先列） */
const PORCELAIN_WS_FIRST = "worktree X:/ws\n\nworktree X:/ws/.forge/worktrees/wt\n";

describe("createBugProjectIdResolver（三腿解析）", () => {
  it("腿①：projectKeyOf 派生键 getByKey 命中即返回（不进 core 退路）", async () => {
    const db = fakeDb({
      keyOf: (cwd) => `key:${cwd}`,
      byKey: { "key:X:/ws": { id: "p-key" } },
      mains: { "p-key": "X:/nowhere" },
    });
    const coreProjects = vi.fn();
    const resolve = createBugProjectIdResolver({ db, coreProjects });
    await expect(resolve("X:/ws")).resolves.toBe("p-key");
    expect(coreProjects).not.toHaveBeenCalled();
  });

  it("腿①-worktree：marker cwd 归拢主根键命中（审计 M6——porcelain 现查，主根行先列）", async () => {
    const db = fakeDb({
      keyOf: (p) => `key:${p}`,
      byKey: { "key:X:\\ws": { id: "p-wt" } },
    });
    const runner = vi.fn(() => PORCELAIN_WS_FIRST);
    const diag = vi.fn();
    const resolve = createBugProjectIdResolver({ db, gitPorcelain: runner, diag });
    await expect(resolve("X:\\ws\\.forge\\worktrees\\wt")).resolves.toBe("p-wt");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("归拢主根键"), "info");
  });

  it("腿①-worktree fail-soft：git 探针抛错 → 回退 cwd 键（行为同修口前）+ 回退留痕", async () => {
    const db = fakeDb({
      keyOf: (p) => `key:${p}`,
      byKey: { "key:X:\\ws\\.forge\\worktrees\\wt": { id: "p-fb" } },
    });
    const runner = vi.fn(() => {
      throw new Error("git absent");
    });
    const diag = vi.fn();
    const resolve = createBugProjectIdResolver({ db, gitPorcelain: runner, diag });
    await expect(resolve("X:\\ws\\.forge\\worktrees\\wt")).resolves.toBe("p-fb");
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("fail-soft"), "warn");
  });

  it("腿①-worktree 非本仓清单（cwd 不属条目子树）→ fail-soft 回退 cwd 键", async () => {
    const db = fakeDb({
      keyOf: (p) => `key:${p}`,
      byKey: { "key:X:\\ws\\.forge\\worktrees\\wt": { id: "p-foreign" } },
    });
    const resolve = createBugProjectIdResolver({
      db,
      gitPorcelain: () => "worktree Z:/other/repo\n",
    });
    await expect(resolve("X:\\ws\\.forge\\worktrees\\wt")).resolves.toBe("p-foreign");
  });

  it("腿②：派生键 miss → main 行 normalizeFsPath 归一匹配（主检出行直配）", async () => {
    const db = fakeDb({
      byKey: {},
      mains: { "p-main": "X:\\ws\\.forge\\worktrees\\wt\\" },
    });
    const resolve = createBugProjectIdResolver({ db, gitPorcelain: () => "" });
    await expect(resolve("X:/ws/.forge/worktrees/wt")).resolves.toBe("p-main");
  });

  it("腿③：db 缺席 → coreProjects 退路（listProjects wsPath 归一匹配）", async () => {
    const resolve = createBugProjectIdResolver({
      db: undefined,
      coreProjects: () =>
        ({
          listProjects: async () => [{ id: "p-core", wsPath: "X:\\ws\\core" }],
        }) as never,
    });
    await expect(resolve("X:/ws/core/")).resolves.toBe("p-core");
  });

  it("退路 fail-soft：coreProjects 取法抛 → undefined（不外抛）", async () => {
    const resolve = createBugProjectIdResolver({
      db: undefined,
      coreProjects: () => {
        throw new Error("reflect gate");
      },
    });
    await expect(resolve("X:/ws")).resolves.toBeUndefined();
  });

  it("全链 miss → undefined（db 无命中 + core 缺席——工具面 typed 拒语义的解析半边）", async () => {
    const resolve = createBugProjectIdResolver({
      db: fakeDb({ byKey: {}, mains: {} }),
      coreProjects: () => undefined,
    });
    await expect(resolve("X:/unregistered")).resolves.toBeUndefined();
  });
});

describe("worktree cwd record_bug 全链（审计 M6）", () => {
  it("worktree cwd 会话 record_bug → 归拢主根键命中项目行，服务收主根 projectId（不再 ERR_WORKSPACE_NOT_REGISTERED）", async () => {
    const db = fakeDb({
      keyOf: (p) => `key:${p}`,
      byKey: { "key:X:\\ws": { id: "p-wt" } },
    });
    const registerBug = vi.fn().mockResolvedValue({});
    const tools = Object.fromEntries(
      createBugTools({
        bugs: () => ({ registerBug }) as unknown as never,
        resolveProjectId: createBugProjectIdResolver({ db, gitPorcelain: () => PORCELAIN_WS_FIRST }),
      }).map((t) => [t.name, t]),
    );
    const exec = { agent: { session: { id: "s1", header: { cwd: "X:\\ws\\.forge\\worktrees\\wt" } } } };
    await tools["record_bug"]!.execute({ summary: "s", bug_desc: "d", trigger_desc: "t", expected: "e", actual: "a" }, exec);
    expect(registerBug).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p-wt" }));
  });
});

describe("registerBugTools（官方 tools 缝注册）", () => {
  it("register 缝缺席 = 零注册 + warn 留痕（no-op disposer——调用方零分支）", () => {
    const diag = vi.fn();
    const handle = registerBugTools({}, { db: undefined, bugs: () => undefined }, diag);
    expect(() => handle.dispose()).not.toThrow();
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("ctx.tools.register 缺席"), "warn");
  });

  it("tools 面在场 → bug 四员经 ctx.tools.register 注册 + unmount 全撤回", () => {
    const registered: string[] = [];
    const ctx = {
      tools: {
        register: (d: { name: string }) => {
          registered.push(d.name);
          return () => {
            registered.splice(registered.indexOf(d.name), 1);
          };
        },
      },
    };
    const diag = vi.fn();
    const handle = registerBugTools(ctx, { db: undefined, bugs: () => undefined }, diag);
    expect(registered).toEqual(["record_bug", "resolve_bug", "get_bug", "list_bugs"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("bug 工具族注册完成：4 员"), "info");
    handle.dispose();
    expect(registered).toEqual([]);
  });

  it("单员 register 抛 → error diag 留痕，其余员照常注册（异常隔离）", () => {
    const registered: string[] = [];
    const ctx = {
      tools: {
        register: (d: { name: string }) => {
          if (d.name === "resolve_bug") throw new Error("gate");
          registered.push(d.name);
          return () => {};
        },
      },
    };
    const diag = vi.fn();
    const handle = registerBugTools(ctx, { db: undefined, bugs: () => undefined }, diag);
    expect(registered).toEqual(["record_bug", "get_bug", "list_bugs"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("bug tool register failed (resolve_bug)"), "error");
    expect(() => handle.dispose()).not.toThrow();
  });
});
