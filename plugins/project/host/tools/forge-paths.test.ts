// forgeDirs/forgeResolvePath 双工具单测（plugin-project 挂载缝——G5 平移验收面）：
//   ① 受控面 typed 拒绝三支（未知 dirKey / 未知 dest / 缺参——各列法集）；
//   ② 锚级查询（缺省全量 + 单 key 解析——anchors.ts 注册表单源）；
//   ③ declare merge 第三方键经 forgeDirs 全量可见（与本体键去重不双列）；
//   ④ 装配期同名守卫（现查 tools 面已存同名定义即跳过 + diag warn 先在者胜）；
//   ⑤ 缝缺席降级（register 缺席 = 零注册 warn no-op disposer）；
//   ⑥ createForgePathsToolFace 装配闭包（P2-c 顺带）：reflectOf 惰性现查不缓存 +
//      onDeclareDiag 桥接（降级径 warn 透传）。
import { describe, expect, it, vi } from "vitest";
import type { DirKeyEntry, ReflectDeclarePullFace } from "../dirs/anchors.js";
import { DIR_KEY_REGISTRY } from "../dirs/anchors.js";
import {
  ForgeDirPathInvalidError,
  createForgeDirsTool,
  createForgePathsToolFace,
  createForgeResolvePathTool,
  registerForgePathsTools,
  type ForgePathsToolFace,
} from "./forge-paths.js";

const ANCHORS = {
  projectHome: "X:\\home\\forge-workspaces",
  taskHome: "X:\\home\\forge-workspaces\\ws@deadbeef",
  forgeDir: "X:\\ws\\.forge",
  docsRoot: "X:\\ws\\.forge\\docs",
};

const RESOLVER = async () => "p-1";

const EXEC = { agent: { session: { id: "s-1", header: { cwd: "X:\\ws" } } } };

/** 消费面（本体键 + 可选第三方声明注入） */
function faceOf(declared?: readonly DirKeyEntry[]): ForgePathsToolFace {
  return {
    anchorsOf: async () => ANCHORS,
    dirKeys: () => DIR_KEY_REGISTRY,
    ...(declared !== undefined ? { declaredDirKeys: () => declared } : {}),
  };
}

const knowledgeRoot: DirKeyEntry = {
  dirKey: "knowledge.root",
  description: "工作区知识库根（.knowledge/）",
  resolve: (ctx) => `${ctx.forgeDir ?? ""}\\..\\.knowledge`,
  declaredBy: "knowledge",
};

describe("forgeDirs（锚级查询）", () => {
  it("缺省全量：本体五键逐一解析（dirKey/dir/description 三件套与注册表同源）", async () => {
    const tool = createForgeDirsTool(faceOf(), RESOLVER);
    const value = (await tool.execute({}, EXEC)) as { ok: true; paths: { dirKey: string; dir: string }[] };
    expect(value.ok).toBe(true);
    expect(value.paths.map((p) => p.dirKey)).toEqual(DIR_KEY_REGISTRY.map((e) => e.dirKey));
    const byKey = new Map(value.paths.map((p) => [p.dirKey, p.dir]));
    expect(byKey.get("forge.project_home")).toBe(ANCHORS.projectHome);
    expect(byKey.get("forge.task_home")).toBe(ANCHORS.taskHome);
    expect(byKey.get("forge.docs_root")).toBe(ANCHORS.docsRoot);
    expect(byKey.get("forge.tmp")).toBe(`${ANCHORS.forgeDir}\\tmp`);
    expect(byKey.get("forge.worktrees")).toBe(`${ANCHORS.forgeDir}\\worktrees`);
  });

  it("declare merge 第三方键全量可见（knowledge.root 追加在本体键之后——AC 第三方键经 forgeDirs 全量可见）", async () => {
    const tool = createForgeDirsTool(faceOf([knowledgeRoot]), RESOLVER);
    const value = (await tool.execute({}, EXEC)) as { paths: { dirKey: string; dir: string }[] };
    expect(value.paths.map((p) => p.dirKey)).toEqual([...DIR_KEY_REGISTRY.map((e) => e.dirKey), "knowledge.root"]);
    expect(value.paths.at(-1)!.dir).toBe(`${ANCHORS.forgeDir}\\..\\.knowledge`);
  });

  it("单 dirKey 查询：仅返回该锚", async () => {
    const tool = createForgeDirsTool(faceOf(), RESOLVER);
    const value = (await tool.execute({ dirKey: "forge.docs_root" }, EXEC)) as { paths: { dirKey: string; dir: string }[] };
    expect(value.paths).toEqual([{ dirKey: "forge.docs_root", dir: ANCHORS.docsRoot, description: DIR_KEY_REGISTRY[2]!.description }]);
  });

  it("未知 dirKey typed 拒绝并列出合法集（含第三方键——ERR_DIR_PATH_INVALID）", async () => {
    const tool = createForgeDirsTool(faceOf([knowledgeRoot]), RESOLVER);
    await expect(tool.execute({ dirKey: "forge.nope" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(tool.execute({ dirKey: "forge.nope" }, EXEC)).rejects.toThrow(
      new RegExp(`legal keys: ${DIR_KEY_REGISTRY.map((e) => e.dirKey).join(", ").replaceAll(".", "\\.")}, knowledge\\.root`),
    );
  });
});

describe("forgeResolvePath（目的地解析）", () => {
  it("合法 dest 解析：锚绑定 + 模板占位替换（taskLogs/dossier/proposalDir 三员）", async () => {
    const tool = createForgeResolvePathTool(faceOf(), RESOLVER);
    const cases: readonly [string, Record<string, string>, string][] = [
      ["taskLogs", { slug: "demo", localId: "1.1" }, `${ANCHORS.taskHome}\\logs\\demo\\1.1`],
      ["dossier", { slug: "demo", localId: "fix-1" }, `${ANCHORS.docsRoot}\\proposals\\demo\\issues\\fix-1`],
      ["proposalDir", { slug: "demo" }, `${ANCHORS.docsRoot}\\proposals\\demo`],
    ];
    for (const [dest, args, expected] of cases) {
      const value = (await tool.execute({ dest, ...args }, EXEC)) as { ok: true; dir: string };
      expect(value).toEqual({ ok: true, dir: expected });
    }
  });

  it("未知 dest typed 拒绝并列出法集（受控枚举单源 DIR_DESTINATIONS）", async () => {
    const tool = createForgeResolvePathTool(faceOf(), RESOLVER);
    await expect(tool.execute({ dest: "nope" }, EXEC)).rejects.toThrow(ForgeDirPathInvalidError);
    await expect(tool.execute({ dest: "nope" }, EXEC)).rejects.toThrow(/legal destinations: dossier \(requires: slug, localId\); taskLogs/);
  });

  it("requires 缺参 typed 拒绝并指明缺参清单", async () => {
    const tool = createForgeResolvePathTool(faceOf(), RESOLVER);
    await expect(tool.execute({ dest: "taskLogs", slug: "demo" }, EXEC)).rejects.toThrow(
      "taskLogs requires: slug, localId (missing: localId)",
    );
    await expect(tool.execute({ dest: "proposalDir" }, EXEC)).rejects.toThrow("proposalDir requires: slug (missing: slug)");
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
    expect(registered).toEqual(["forgeDirs", "forgeResolvePath"]);
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
        get: (name: string) => (name === "forgeDirs" ? { name } : undefined),
      },
    };
    const diag = vi.fn();
    const handle = registerForgePathsTools(ctx, { face: faceOf(), resolveProjectId: RESOLVER }, diag);
    expect(registered).toEqual(["forgeResolvePath"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("'forgeDirs' 已存在同名定义"), "warn");
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

describe("createForgePathsToolFace（装配闭包——P2-c 顺带）", () => {
  /** reflect 替身（props 名表 + get 现取） */
  function reflectOf(entries: readonly DirKeyEntry[]): ReflectDeclarePullFace {
    return {
      props: { "dirKeys.knowledge": entries },
      get: (name: string) => (name === "dirKeys.knowledge" ? entries : undefined),
    };
  }

  it("reflectOf 惰性现查：构造期零调用，declaredDirKeys() 逐调用现取（检测不缓存）", () => {
    const reflect = vi.fn(() => reflectOf([knowledgeRoot]));
    const face = createForgePathsToolFace({ anchorsOf: async () => ANCHORS, reflectOf: reflect });
    expect(reflect).not.toHaveBeenCalled(); // 构造期零现查
    expect(face.declaredDirKeys?.()).toEqual([knowledgeRoot]);
    expect(face.declaredDirKeys?.()).toEqual([knowledgeRoot]);
    expect(reflect).toHaveBeenCalledTimes(2); // 逐调用现查——结果不缓存
  });

  it("onDeclareDiag 桥接：拉取缝降级径（reflect 在场 props 缺席）warn 经桥透传", () => {
    const onDeclareDiag = vi.fn();
    const face = createForgePathsToolFace({
      anchorsOf: async () => ANCHORS,
      reflectOf: () => ({ get: () => undefined }) as ReflectDeclarePullFace, // props 缺席 → 降级径
      onDeclareDiag,
    });
    expect(face.declaredDirKeys?.()).toEqual([]);
    expect(onDeclareDiag).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warn", event: "forge-dirs-declare" }),
    );
  });

  it("reflect 缺席 = declare 缝零贡献零抛（onDeclareDiag 不发射——非降级径）", () => {
    const onDeclareDiag = vi.fn();
    const face = createForgePathsToolFace({ anchorsOf: async () => ANCHORS, reflectOf: () => undefined, onDeclareDiag });
    expect(face.declaredDirKeys?.()).toEqual([]);
    expect(onDeclareDiag).not.toHaveBeenCalled();
    expect(face.dirKeys()).toEqual(DIR_KEY_REGISTRY);
  });
});
