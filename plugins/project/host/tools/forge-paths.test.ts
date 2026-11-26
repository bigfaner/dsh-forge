// forge_dirs/forge_resolve_path 双工具单测（forge-dirs-unification §2.3——输出完全由注册表
// 条目派生）：   ① 受控面 typed 拒绝四支（未知 dirKey / 未知 dest / 缺参 / 参数不合法）；
//   ② 无参条目查询（缺省全量 + 单 key 解析——逐条取条目 resolve 与 description）；
//   ③ 声明合并第三方键经 forge_dirs 全量可见（与内置键不双列）；
//   ④ 装配期同名守卫（现查 tools 面已存同名定义即跳过 + diag warn 先在者胜）；
//   ⑤ 缝缺席降级（register 缺席 = 零注册 warn no-op disposer）；
//   ⑥ createForgePathsToolFace 装配闭包：reflectOf 惰性现查不缓存 + onDeclareDiag 桥接。
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { ForgeDirDeclaration, ForgeDirSources } from "@dsh-forge/lib-path";
import { FORGE_DIRS_BASE_DECLARATION, mergeDeclarations, type ReflectDeclarePullFace } from "../dirs/anchors.js";
import { PROJECT_DIRS_DECLARATION } from "../dirs/project-entries.js";
import {
  ForgeDirPathInvalidError,
  createForgeDirsTool,
  createForgePathsToolFace,
  createForgeResolvePathTool,
  registerForgePathsTools,
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

describe("forge_dirs（无参条目查询）", () => {
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

  it("单 dirKey 查询：仅返回该条（description 取条目同源）", async () => {
    const tool = createForgeDirsTool(faceOf(), RESOLVER);
    const value = (await tool.execute({ dirKey: "project.docs_dir" }, EXEC)) as { paths: { dirKey: string; dir: string; description: string }[] };
    expect(value.paths).toHaveLength(1);
    expect(value.paths[0]!.dirKey).toBe("project.docs_dir");
    expect(value.paths[0]!.dir).toBe("Z:\\ws\\.forge\\docs");
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
      const value = (await tool.execute({ dest, ...args }, EXEC)) as { ok: true; dir: string };
      expect(value).toEqual({ ok: true, dir: expected });
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

  it("register 缝缺席 = 零注册 + warn 留痕（no-op disposer 调用方零分支）", () => {
    const diag = vi.fn();
    const handle = registerForgePathsTools({}, { face: faceOf(), resolveProjectId: RESOLVER }, diag);
    expect(handle.dispose).toBeTypeOf("function");
    expect(() => handle.dispose()).not.toThrow();
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("ctx.tools.register 缺席"), "warn");
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
