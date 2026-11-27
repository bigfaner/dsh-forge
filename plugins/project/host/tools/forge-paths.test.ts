// forge_dirs/forge_resolve_path 双工具单测（forge-dirs-unification §2.3——输出完全由注册表
// 条目派生）：   ① 受控面 typed 拒绝四支（未知 dirKey / 未知 dest / 缺参 / 参数不合法）；
//   ② 无参条目查询（缺省全量 + 单 key 解析——逐条取条目 resolve 与 description）；
//   ③ 声明合并第三方键经 forge_dirs 全量可见（与内置键不双列）；
//   ④ 装配期同名守卫（现查 tools 面已存同名定义即跳过 + diag warn 先在者胜）；
//   ⑤ 缝缺席降级（register 缺席 = 零注册 warn no-op disposer）；
//   ⑥ createForgePathsToolFace 装配闭包：reflectOf 惰性现查不缓存 + onDeclareDiag 桥接。
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { ForgeDirDeclaration, ForgeDirSources } from "@dsh-forge/lib-path";
import { FORGE_DIRS_BASE_DECLARATION, collectDeclaredDirKeys, mergeDeclarations, type ReflectDeclarePullFace } from "../dirs/anchors.js";
import { PROJECT_DIRS_DECLARATION } from "../dirs/project-entries.js";
import {
  ForgeDirPathInvalidError,
  createForgeDirsTool,
  createForgePathsToolFace,
  createForgeResolvePathTool,
  registerForgePathsTools,
  watchDirKeysDeclarations,
  type ForgePathsToolFace,
} from "./forge-paths.js";

const SOURCES: ForgeDirSources = {
  dshHome: "X:\\home",
  projectRoot: "Z:\\ws\\proj-main",
  workspaceRoot: "Z:\\ws",
};

const RESOLVER = async () => "p-1";

const EXEC = { agent: { session: { id: "s-1", header: { cwd: "Z:\\ws" } } } };

const knowledgeDeclaration: ForgeDirDeclaration = {
  source: "dirKeys.knowledge",
  entries: {
    "knowledge.root": {
      description: "项目知识库根（.knowledge/）",
      deps: ["workspaceRoot"],
      resolve: (deps) => join(deps.workspaceRoot, ".knowledge"),
    },
  },
};

/** 消费面（基座 + project 条目 + 可选第三方声明注入） */
function faceOf(pulled: readonly ForgeDirDeclaration[] = []): ForgePathsToolFace {
  const declarations = mergeDeclarations(pulled);
  return { anchorsOf: async () => SOURCES, declarations: () => declarations };
}

/** spec / task-loop 插件声明的替身（真条目归各插件单测；此处验证汇总工具对带参插件键的枚举与解析） */
const specDeclaration: ForgeDirDeclaration = {
  source: "dirKeys.spec",
  entries: {
    "spec.dir": {
      description: "规格目录",
      deps: ["workspaceRoot"],
      params: ["slug"],
      resolve: (deps, params) => join(deps.workspaceRoot, ".forge", "specs", params.slug),
    },
    "spec.dossier_dir": {
      description: "任务卷宗目录",
      deps: ["spec.dir"],
      params: ["slug", "localId"],
      resolve: (deps, params) => join(deps["spec.dir"], "issues", params.localId),
    },
  },
};
const taskLoopDeclaration: ForgeDirDeclaration = {
  source: "dirKeys.task_loop",
  entries: {
    "task_loop.runtime_dir": {
      description: "任务循环运行时目录",
      deps: ["project.runtime_dir"],
      params: ["slug"],
      resolve: (deps, params) => join(deps["project.runtime_dir"], params.slug),
    },
    "task_loop.task_dir": {
      description: "任务目录",
      deps: ["task_loop.runtime_dir"],
      params: ["slug", "localId"],
      resolve: (deps, params) => join(deps["task_loop.runtime_dir"], params.localId),
    },
  },
};

describe("forge_dirs（目录键发现面——全部声明键逐行）", () => {
  it("缺省全量：基座键 + project 四键 + 第三方键逐一解析（dirKey/dir/description 三件套与声明同源）", async () => {
    const tool = createForgeDirsTool(faceOf([knowledgeDeclaration]), RESOLVER);
    const value = (await tool.execute({}, EXEC)) as { ok: true; paths: { dirKey: string; dir: string }[] };
    expect(value.ok).toBe(true);
    expect(value.paths.map((p) => p.dirKey)).toEqual(["forge.home", "project.runtime_dir", "project.docs_dir", "project.tmp_dir", "project.worktrees_dir", "knowledge.root"]);
    const byKey = new Map(value.paths.map((p) => [p.dirKey, p.dir]));
    expect(byKey.get("forge.home")).toBe("X:\\home\\forge");
    expect(byKey.get("project.runtime_dir")).toContain("X:\\home\\forge\\projects\\");
    expect(byKey.get("project.docs_dir")).toBe("Z:\\ws\\.forge\\docs");
    expect(byKey.get("knowledge.root")).toBe("Z:\\ws\\.knowledge");
    expect(value.paths.every((p) => p.description.length > 0)).toBe(true);
  });

  it("带参键同列：值留空 + 标明所需参数（声明序）；渲染文本条数分开计并指向 forge_resolve_path", async () => {
    const tool = createForgeDirsTool(faceOf([specDeclaration]), RESOLVER);
    const value = (await tool.execute({}, EXEC)) as {
      paths: { dirKey: string; dir: string | null; params?: string[]; description: string }[];
    };
    expect(value.paths.find((p) => p.dirKey === "spec.dir")).toEqual({
      dirKey: "spec.dir",
      dir: null,
      params: ["slug"],
      description: "规格目录",
    });
    expect(value.paths.find((p) => p.dirKey === "project.docs_dir")).toEqual({
      dirKey: "project.docs_dir",
      dir: "Z:\\ws\\.forge\\docs",
      description: "文档位置",
    });
    const text = tool.output.render({}, value).map((c) => c.text).join("\n");
    expect(text).toContain("✓ 5 dir(s) + 2 parameterized");
    expect(text).toContain("- spec.dir: (requires: slug) → forge_resolve_path — 规格目录");
    expect(text).toContain("- spec.dossier_dir: (requires: slug, localId) → forge_resolve_path — 任务卷宗目录");
    expect(text).not.toContain("null");
  });

  it("无带参键时渲染条数不出现 parameterized 段", async () => {
    const tool = createForgeDirsTool(faceOf(), RESOLVER);
    const text = tool.output.render({}, await tool.execute({}, EXEC)).map((c) => c.text).join("\n");
    expect(text.split("\n")[0]).toBe("✓ 5 dir(s)");
  });

  it("单 dirKey 查询：仅返回该条（description 取条目同源）；带参键返回值留空行", async () => {
    const tool = createForgeDirsTool(faceOf([specDeclaration]), RESOLVER);
    const value = (await tool.execute({ dirKey: "project.docs_dir" }, EXEC)) as { paths: { dirKey: string; dir: string; description: string }[] };
    expect(value.paths).toHaveLength(1);
    expect(value.paths[0]!.dirKey).toBe("project.docs_dir");
    expect(value.paths[0]!.dir).toBe("Z:\\ws\\.forge\\docs");
    const paramed = (await tool.execute({ dirKey: "spec.dossier_dir" }, EXEC)) as { paths: { dir: string | null; params?: string[] }[] };
    expect(paramed.paths[0]!.dir).toBeNull();
    expect(paramed.paths[0]!.params).toEqual(["slug", "localId"]);
  });

  it("未知 dirKey typed 拒绝并列出全部合法键（含第三方键——ERR_DIR_PATH_INVALID）", async () => {
    const tool = createForgeDirsTool(faceOf([knowledgeDeclaration]), RESOLVER);
    await expect(tool.execute({ dirKey: "forge.nope" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(tool.execute({ dirKey: "forge.nope" }, EXEC)).rejects.toThrow(/legal keys: .*knowledge\.root/);
  });
});

describe("forge_resolve_path（带参条目解析——枚举/参数/校验由条目生成）", () => {
  it("合法 dest 解析：dest 即键名，基目录取被依赖条目解析结果", async () => {
    const tool = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER);
    const projectRuntime = (await createForgeDirsTool(faceOf(), RESOLVER).execute({ dirKey: "project.runtime_dir" }, EXEC)) as { paths: { dir: string }[] };
    const container = projectRuntime.paths[0]!.dir;
    const cases: readonly [string, Record<string, string>, string][] = [
      ["spec.dir", { slug: "demo" }, join(SOURCES.workspaceRoot, ".forge", "specs", "demo")],
      ["spec.dossier_dir", { slug: "demo", localId: "fix-1" }, join(SOURCES.workspaceRoot, ".forge", "specs", "demo", "issues", "fix-1")],
      ["task_loop.runtime_dir", { slug: "demo" }, join(container, "demo")],
      ["task_loop.task_dir", { slug: "demo", localId: "1.1" }, join(container, "demo", "1.1")],
    ];
    for (const [dest, args, expected] of cases) {
      const value = (await tool.execute({ dest, ...args }, EXEC)) as { ok: true; dest: string; params: object; dir: string };
      // 返回元信息：dest + 该目的地声明所需参数（多余实参不回显）+ dir
      expect(value).toEqual({ ok: true, dest, params: args, dir: expected });
    }
    // 多余实参不回显
    const extra = (await tool.execute({ dest: "spec.dir", slug: "demo", localId: "unused" }, EXEC)) as { params: object };
    expect(extra.params).toEqual({ slug: "demo" });
    // 渲染文本：dest / params / dir 三行
    const text = tool.output
      .render({}, { ok: true, dest: "task_loop.task_dir", params: { slug: "demo", localId: "1.1" }, dir: join(container, "demo", "1.1") })
      .map((c) => c.text)
      .join("\n");
    expect(text.split("\n")).toEqual([
      "✓ dir resolved",
      "- dest: task_loop.task_dir",
      "- params: slug=demo, localId=1.1",
      `- dir: ${join(container, "demo", "1.1")}`,
    ]);
  });

  it("dest 枚举与描述在注册时从声明集生成（零手写键名——声明变即变）", () => {
    const withPlugins = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER).parameters;
    const dest = (withPlugins.properties as { dest: { enum?: string[]; description: string } }).dest;
    expect(dest.enum).toEqual(["spec.dir", "spec.dossier_dir", "task_loop.runtime_dir", "task_loop.task_dir"]);
    expect(dest.description).toBe(
      "Directory key with params — controlled enum generated from the declared entries: " +
        "spec.dir (requires: slug); spec.dossier_dir (requires: slug, localId); task_loop.runtime_dir (requires: slug); task_loop.task_dir (requires: slug, localId). " +
        "Unknown dest is rejected with the legal set.",
    );
    // 无带参声明：不挂空枚举（JSON Schema 空 enum 拒绝一切值），描述如实说明
    const bare = (createForgeResolvePathTool(faceOf(), RESOLVER).parameters.properties as { dest: { enum?: string[]; description: string } }).dest;
    expect(bare.enum).toBeUndefined();
    expect(bare.description).toContain("no parameterized directory key is currently declared");
  });

  it("工具源码零手写目录键（不感知其它插件——forge.home 基座键名除外，仅作无参 dest 反例）", () => {
    const src = readFileSync(join(import.meta.dirname, "forge-paths.ts"), "utf8");
    for (const key of ["spec.dir", "dossier_dir", "task_loop", "project.runtime_dir", "project.docs_dir", "knowledge.root", "expert_squad"]) {
      expect(src).not.toContain(key);
    }
  });

  it("未声明插件的键不是合法目的地（未装载即缺席——project 自身无带参键）", async () => {
    const tool = createForgeResolvePathTool(faceOf(), RESOLVER);
    await expect(tool.execute({ dest: "spec.dir", slug: "demo" }, EXEC)).rejects.toThrow(
      "unknown dest 'spec.dir' — legal destinations: ",
    );
  });

  it("旧键名退役：forge.* 业务目录键报未知目的地/未知 dirKey", async () => {
    const tool = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER);
    await expect(tool.execute({ dest: "forge.spec_dir", slug: "demo" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(tool.execute({ dest: "forge.task_logs_dir", slug: "demo", localId: "1.1" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(createForgeDirsTool(faceOf(), RESOLVER).execute({ dirKey: "forge.docs_root" }, EXEC)).rejects.toThrow(
      /legal keys: .*project\.docs_dir/,
    );
  });

  it("未知 dest typed 拒绝并列出法集（带参条目枚举单源）", async () => {
    const tool = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER);
    await expect(tool.execute({ dest: "nope" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(tool.execute({ dest: "nope" }, EXEC)).rejects.toThrow(
      /legal destinations: spec\.dir \(requires: slug\); spec\.dossier_dir \(requires: slug, localId\); task_loop\.runtime_dir \(requires: slug\); task_loop\.task_dir \(requires: slug, localId\)/,
    );
  });

  it("缺参 typed 拒绝并点名所缺参数；无参 dest（如 forge.home）不是合法 dest", async () => {
    const tool = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER);
    await expect(tool.execute({ dest: "task_loop.task_dir", slug: "demo" }, EXEC)).rejects.toThrow(
      "task_loop.task_dir requires: slug, localId (missing: localId)",
    );
    await expect(tool.execute({ dest: "forge.home" }, EXEC)).rejects.toThrow(/legal destinations/);
    await expect(tool.execute({ dest: "task_loop.runtime_dir" }, EXEC)).rejects.toThrow(
      "task_loop.runtime_dir requires: slug (missing: slug)",
    );
  });

  it("参数不合法 typed 拒绝并点名参数（路径分隔符/..——isValidDirParam 同源）", async () => {
    const tool = createForgeResolvePathTool(faceOf([specDeclaration, taskLoopDeclaration]), RESOLVER);
    await expect(tool.execute({ dest: "spec.dir", slug: "../evil" }, EXEC)).rejects.toThrow(/参数不合法：slug/);
    await expect(tool.execute({ dest: "spec.dossier_dir", slug: "a/b", localId: "1" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
  });
});

describe("注册缝（官方 tools 缝——同名守卫先在者胜）", () => {
  it("正常注册两员 + unmount 全撤回", () => {
    const registered: string[] = [];
    const disposers: (() => void)[] = [];
    const ctx = {
      tools: {
        register: (d: { name: string }) => {
          registered.push(d.name);
          disposers.push(() => {
            registered.splice(registered.indexOf(d.name), 1);
          });
          return disposers.at(-1)!;
        },
        get: (name: string) => (registered.includes(name) ? { name } : undefined),
      },
    };
    const diag = vi.fn();
    const handle = registerForgePathsTools(ctx, { face: faceOf(), resolveProjectId: RESOLVER }, diag);
    expect(registered).toEqual(["forge_dirs", "forge_resolve_path"]);
    handle.dispose();
    expect(registered).toEqual([]);
  });

  it("同名守卫：tools 面已存同名定义即跳过 + diag warn（先在者胜不覆盖）", () => {
    const registered: string[] = [];
    const ctx = {
      tools: {
        register: (d: { name: string }) => {
          registered.push(d.name);
          return () => {};
        },
        get: (name: string) => (name === "forge_dirs" ? { name } : undefined),
      },
    };
    const diag = vi.fn();
    const handle = registerForgePathsTools(ctx, { face: faceOf(), resolveProjectId: RESOLVER }, diag);
    expect(registered).toEqual(["forge_resolve_path"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("'forge_dirs' 已存在同名定义"), "warn");
    handle.dispose();
  });

  it("register 缝缺席 = 零注册 + warn 留痕（no-op 句柄调用方零分支）", () => {
    const diag = vi.fn();
    const handle = registerForgePathsTools({}, { face: faceOf(), resolveProjectId: RESOLVER }, diag);
    expect(handle.dispose).toBeTypeOf("function");
    expect(() => handle.dispose()).not.toThrow();
    expect(handle.refresh()).toBe(false);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("ctx.tools.register 缺席"), "warn");
  });
});

describe("目录键声明变化跟随（refresh——dest 枚举按当次声明集重注册）", () => {
  /** tools 缝替身：按名保存最近一次注册的定义，注销即删 */
  function toolsStub() {
    const defs = new Map<string, { name: string; parameters: { properties: { dest: { enum?: string[] } } } }>();
    let registerCalls = 0;
    return {
      defs,
      registerCalls: () => registerCalls,
      ctx: {
        tools: {
          register: (d: { name: string; parameters: { properties: { dest: { enum?: string[] } } } }) => {
            registerCalls += 1;
            defs.set(d.name, d);
            return () => void defs.delete(d.name);
          },
          get: (name: string) => defs.get(name),
        },
      },
    };
  }

  it("晚装载的声明方：refresh 后 dest 枚举包含新键；清单未变则不重注册；卸载后 refresh 无效", () => {
    const props: Record<string, unknown> = {};
    const reflect: ReflectDeclarePullFace = { props, get: (name) => props[name] };
    const face: ForgePathsToolFace = { anchorsOf: async () => SOURCES, declarations: () => mergeDeclarations(collectDeclaredDirKeys(reflect)) };
    const stub = toolsStub();
    const handle = registerForgePathsTools(stub.ctx, { face, resolveProjectId: RESOLVER }, () => {});
    const destEnum = (): string[] | undefined => stub.defs.get("forge_resolve_path")!.parameters.properties.dest.enum;
    expect(destEnum()).toBeUndefined(); // 注册期无带参声明
    props["dirKeys.spec"] = specDeclaration.entries; // 声明方晚于工具注册上线
    expect(destEnum()).toBeUndefined(); // 未 refresh 前枚举滞后
    expect(handle.refresh()).toBe(true);
    expect(destEnum()).toEqual(["spec.dir", "spec.dossier_dir"]);
    expect(stub.defs.get("forge_dirs")).toBeDefined(); // 双工具整体重注册
    const calls = stub.registerCalls();
    expect(handle.refresh()).toBe(false); // 清单未变——零重注册
    expect(stub.registerCalls()).toBe(calls);
    delete props["dirKeys.spec"]; // 声明方注销
    expect(handle.refresh()).toBe(true);
    expect(destEnum()).toBeUndefined();
    handle.dispose();
    expect(stub.defs.size).toBe(0);
    props["dirKeys.spec"] = specDeclaration.entries;
    expect(handle.refresh()).toBe(false); // 卸载后晚到事件不复活工具
    expect(stub.defs.size).toBe(0);
  });

  it("同名守卫对自有定义放行：外来同名 forge_dirs 恒让位，自有 forge_resolve_path 照常重注册", () => {
    const props: Record<string, unknown> = {};
    const face: ForgePathsToolFace = {
      anchorsOf: async () => SOURCES,
      declarations: () => mergeDeclarations(collectDeclaredDirKeys({ props, get: (name) => props[name] })),
    };
    const stub = toolsStub();
    stub.defs.set("forge_dirs", { name: "forge_dirs", parameters: { properties: { dest: {} } } }); // 先在者占名
    const diag = vi.fn();
    const handle = registerForgePathsTools(stub.ctx, { face, resolveProjectId: RESOLVER }, diag);
    expect([...stub.defs.keys()]).toEqual(["forge_dirs", "forge_resolve_path"]);
    props["dirKeys.spec"] = specDeclaration.entries;
    expect(handle.refresh()).toBe(true);
    expect(stub.defs.get("forge_resolve_path")!.parameters.properties.dest.enum).toEqual(["spec.dir", "spec.dossier_dir"]);
    expect(stub.defs.has("forge_dirs")).toBe(true); // 先在者仍在场（未被本插件撤回）
    handle.dispose();
    expect(stub.defs.has("forge_dirs")).toBe(true); // 只撤自有
    expect(stub.defs.has("forge_resolve_path")).toBe(false);
  });
});

describe("watchDirKeysDeclarations（官方 internal/service 事件——dirKeys.* 变化回调）", () => {
  it("只对 dirKeys.* 约定名触发；同轮多事件合并为一次回调；退订后不再触发", async () => {
    let listener: ((name: unknown) => void) | undefined;
    let offs = 0;
    const ctx = {
      on: (name: string, l: (n: unknown) => void) => {
        expect(name).toBe("internal/service");
        listener = l;
        return () => void (offs += 1);
      },
    };
    const onChange = vi.fn();
    const off = watchDirKeysDeclarations(ctx, onChange);
    listener!("forgeTasks"); // 非约定名
    listener!("dirKeys.spec");
    listener!("dirKeys.task_loop");
    expect(onChange).not.toHaveBeenCalled(); // 微任务合并前
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
    expect(offs).toBe(1);
    listener!("dirKeys.spec");
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("事件面缺席 / 订阅抛 / 回调抛 = 不监听零抛或监听不失效", async () => {
    expect(() => watchDirKeysDeclarations({}, () => {})()).not.toThrow();
    const throwing = { on: () => { throw new Error("inject gate"); } };
    expect(() => watchDirKeysDeclarations(throwing, () => {})()).not.toThrow();
    let listener: ((name: unknown) => void) | undefined;
    watchDirKeysDeclarations({ on: (_n: string, l: (n: unknown) => void) => void (listener = l) }, () => {
      throw new Error("boom");
    });
    expect(() => listener!("dirKeys.spec")).not.toThrow();
    await Promise.resolve();
  });
});

describe("createForgePathsToolFace（装配闭包）", () => {
  /** reflect 替身（props 名表 + get 现取——声明对象形态） */
  function reflectOf(declaration: ForgeDirDeclaration): ReflectDeclarePullFace {
    return {
      props: { [declaration.source]: declaration.entries },
      get: (name: string) => (name === declaration.source ? declaration.entries : undefined),
    };
  }

  it("reflectOf 惰性现查：构造期零调用，declarations() 逐调用现取（检测不缓存）", () => {
    const reflect = vi.fn(() => reflectOf(knowledgeDeclaration));
    const face = createForgePathsToolFace({ anchorsOf: async () => SOURCES, reflectOf: reflect });
    expect(reflect).not.toHaveBeenCalled(); // 构造期零现查
    expect(face.declarations().map((d) => d.source)).toEqual([
      FORGE_DIRS_BASE_DECLARATION.source,
      PROJECT_DIRS_DECLARATION.source,
      knowledgeDeclaration.source,
    ]);
    face.declarations();
    expect(reflect).toHaveBeenCalledTimes(2); // 逐调用现查——结果不缓存
  });

  it("onDeclareDiag 桥接：拉取缝降级径（reflect 在场 props 缺席）warn 经桥透传", () => {
    const onDeclareDiag = vi.fn();
    const face = createForgePathsToolFace({
      anchorsOf: async () => SOURCES,
      reflectOf: () => ({ get: () => undefined }) as ReflectDeclarePullFace, // props 缺席 → 降级径
      onDeclareDiag,
    });
    expect(face.declarations()).toHaveLength(2); // 仅内置声明（基座 + project）
    expect(onDeclareDiag).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warn", event: "forge-dirs-declare" }),
    );
  });

  it("reflect 缺席 = 声明缝零贡献零抛（onDeclareDiag 不发射——非降级径）", () => {
    const onDeclareDiag = vi.fn();
    const face = createForgePathsToolFace({ anchorsOf: async () => SOURCES, reflectOf: () => undefined, onDeclareDiag });
    expect(face.declarations()).toEqual(mergeDeclarations([]));
    expect(onDeclareDiag).not.toHaveBeenCalled();
  });
});
