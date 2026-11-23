// register.ts 单测（bug 工具族注册缝——评审 B P1-b 覆盖真空补齐，与 forge-paths.test
// 同族对称）：① createBugProjectIdResolver 三腿解析（projectKeyOf 派生 / main 行
// normalizeFsPath 归一匹配 / coreProjects 退路——全链 miss = undefined）；
// ② registerBugTools 的 ctx.tools.register 缺席 → warn + no-op 降级（在场地假 → 四员
// 注册 + unmount 全撤回 + 单员异常隔离）。
// 替身纪律：替身落 DomainDb repos 端口缝（测试侧组合根构造——零生产口）。
import { describe, expect, it, vi } from "vitest";
import type { DomainDb } from "../db/connection.js";
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

  it("腿②：派生键 miss → main 行 normalizeFsPath 归一匹配（反斜杠/尾分隔符变体命中成员行）", async () => {
    const db = fakeDb({
      byKey: {},
      mains: { "p-main": "X:\\ws\\.forge\\worktrees\\wt\\" },
    });
    const resolve = createBugProjectIdResolver({ db });
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
