// typert-remotes 单测（plugin-spec 1.5——forgeSpecs host 半 Typert namespace）：
// ① marker 端点表 pin（remoteMethods 快照 = gateway SRC 发现面的端点真源）；
// ② 根 ctx plugin 注册三态可观测（registered/degraded/pending + inject 后到补绑）；
// ③ typed unavailable 降级分层（族缺席 / projectId 未解析——快照族空集、detail·write 族
//    诚实拒绝）；④ 端点族 DTO 形状契约快照（真 in-memory db 服务端到端水化）。
import { afterAll, describe, expect, it, vi } from "vitest";
import { remoteMethods } from "@deepseek-ai/dsh-typert-protocol";
import { Context } from "@deepseek-ai/cordis";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SPEC_FOLLOW_INTERVAL_MS,
  ForgeSpecsRemote,
  forgeProjectsIdentityOf,
  registerSpecTypertRemotes,
  unavailableMessage,
  type ForgeSpecRemoteDeps,
  type ForgeWorktreesFamilyFace,
  type TypertAssemblyCtxFace,
} from "../../host/assembly/typert-remotes.js";
import { assembleSpecServices, type SpecAssembly } from "../../host/assembly/default-assembly.js";
import { createForgeSpecsService, deriveProjectKey } from "../../host/domain/specs/service.js";
import { createForgeToolServices } from "../../host/domain/specs/tool-service.js";
import { FORGE_SPECS_SERVICE_KEY } from "../../shared/contract-constants.js";

/** marker 端点表投影（method/exportName/mode 快照——gateway SRC 端点真源） */
function endpointsOf(service: object): string[] {
  return remoteMethods(service).map(
    (m) => `${m.method}${m.exportName !== undefined ? `>${m.exportName}` : ""}${m.mode !== undefined ? `:${m.mode}` : ""}`,
  );
}

function fakeCtx(): Context {
  // 真实 cordis ctx（TypertRemoteService 构造期 super(ctx, key) 走 reflect.provide）
  return new Context() as unknown as Context;
}

/** 根 ctx plugin 捕获替身（plugin 挂载记录 + inject 生命周期缝——三态可观测替身） */
function captureFace(initialServices: Record<string, unknown> = {}): {
  face: TypertAssemblyCtxFace;
  mounted: { name: string; scope: Context }[];
  provide: (key: string, svc: unknown) => void;
} {
  const mounted: { name: string; scope: Context }[] = [];
  const pending: Array<{ key: string; cb: (scope: Record<string, unknown>) => void }> = [];
  const services: Record<string, unknown> = { ...initialServices };
  const face: TypertAssemblyCtxFace = {
    plugin(options: { name: string; apply: (scope: Context) => void }) {
      const scope = new Context();
      mounted.push({ name: options.name, scope });
      options.apply(scope);
      return scope;
    },
    inject(deps: readonly string[], cb: (scope: Record<string, unknown>) => void) {
      const key = deps[0] as string;
      if (services[key] !== undefined) {
        cb({ [key]: services[key] });
      } else {
        pending.push({ key, cb });
      }
      return () => {};
    },
  };
  return {
    face,
    mounted,
    provide: (key, svc) => {
      services[key] = svc;
      for (const entry of pending.splice(0)) {
        if (entry.key === key) entry.cb({ [key]: svc });
      }
    },
  };
}

describe("端点面 pin（forgeSpecs host 半——gateway SRC 端点真源）", () => {
  it("十一端点：M3 六端点零改 + M4a 五端点追加（roadmaps/roadmapDetail/roadmapMutate/goalBoard/goalReviewMutate）+ follow mode:stream", () => {
    const svc = new ForgeSpecsRemote(fakeCtx(), {});
    expect(endpointsOf(svc)).toEqual([
      "list",
      "detail",
      "query",
      "projection",
      "transition",
      "roadmaps",
      "roadmapDetail",
      "roadmapMutate",
      "goalBoard",
      "goalReviewMutate",
      "follow:stream",
    ]);
  });

  it("follow 重估间隔常量 pin（轮询节拍单源）", () => {
    expect(SPEC_FOLLOW_INTERVAL_MS).toBe(3_000);
  });

  it("typed unavailable message 模板 pin（实现与测试同引单源）", () => {
    expect(unavailableMessage("list", "specs")).toBe(
      "forge.specs list unavailable（本宿主缺 specs 域服务面）",
    );
  });
});

describe("registerSpecTypertRemotes（根 ctx plugin 注册三态可观测）", () => {
  it("注册态：specs 服务在场 → plugin 挂根 ctx（registered=[forgeSpecs]，name 带 spec- 前缀）", () => {
    const { face, mounted } = captureFace({ [FORGE_SPECS_SERVICE_KEY]: { listSpecs: () => [] } });
    const result = registerSpecTypertRemotes(face, { specs: () => ({}) as never });
    expect(result.registered).toEqual(["forgeSpecs"]);
    expect(result.degraded).toEqual([]);
    expect(result.pending).toEqual([]);
    expect(mounted.map((m) => m.name)).toEqual(["spec-typert-forgeSpecs"]);
  });

  it("缺席降级态：specs 服务缺席且 inject 缺席 → degraded=[forgeSpecs]，零挂载", () => {
    const { face, mounted } = captureFace();
    const diag = vi.fn();
    const result = registerSpecTypertRemotes(face, { diag });
    expect(result.registered).toEqual([]);
    expect(result.degraded).toEqual(["forgeSpecs"]);
    expect(mounted).toHaveLength(0);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("注册完成"));
  });

  it("根 ctx 取法走符号键（Symbol.for(\"cordis.root\")）——ctx 属性取根在 cordis 1.1.0 inject 门控下抛错（bug 2801eeeb 同族复发）", () => {
    const mounted: { name: string; scope: Context }[] = [];
    const rootFace: TypertAssemblyCtxFace = {
      plugin(options: { name: string; apply: (scope: Context) => void }) {
        const scope = new Context();
        mounted.push({ name: options.name, scope });
        options.apply(scope);
        return scope;
      },
    } as TypertAssemblyCtxFace;
    const face = { [Symbol.for("cordis.root")]: rootFace };
    const result = registerSpecTypertRemotes(face as TypertAssemblyCtxFace, { specs: () => ({}) as never });
    expect(result.registered).toEqual(["forgeSpecs"]);
    expect(mounted.map((m) => m.name)).toEqual(["spec-typert-forgeSpecs"]);
  });

  it("ctx.plugin 缺席（非 cordis 宿主）→ assembly 降级 + 诊断留痕", () => {
    const diag = vi.fn();
    const result = registerSpecTypertRemotes({}, { diag });
    expect(result.registered).toEqual([]);
    expect(result.degraded).toEqual(["assembly"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("ctx.plugin 缺席"));
  });

  it("pending 态：inject 缝在场、服务缺席 → pending 挂起；后到 provide → 补绑 registered", () => {
    const cap = captureFace();
    const result = registerSpecTypertRemotes(cap.face, { specs: () => ({}) as never });
    expect(result.pending).toEqual(["forgeSpecs"]);
    expect(result.registered).toEqual([]);
    expect(cap.mounted).toHaveLength(0);
    cap.provide(FORGE_SPECS_SERVICE_KEY, { listSpecs: () => [] });
    expect(result.registered).toEqual(["forgeSpecs"]);
    expect(cap.mounted.map((m) => m.name)).toEqual(["spec-typert-forgeSpecs"]);
  });

  it("注册后自探针：selfProbe 在场 + registered → 直探 forgeSpecs/list 一次（ok/失败各落诊断）", async () => {
    const diag = vi.fn();
    const selfProbe = vi.fn<(ns: string, method: string) => Promise<unknown>>();
    selfProbe.mockResolvedValueOnce(undefined);
    const cap = captureFace({ [FORGE_SPECS_SERVICE_KEY]: { listSpecs: () => [] } });
    registerSpecTypertRemotes(cap.face, { specs: () => ({}) as never, selfProbe, diag });
    await vi.waitFor(() => {
      expect(selfProbe).toHaveBeenCalledWith("forgeSpecs", "list");
      expect(diag).toHaveBeenCalledWith(expect.stringContaining("注册后自探针 ok"));
    });
    const selfProbe2 = vi.fn<(ns: string, method: string) => Promise<unknown>>();
    selfProbe2.mockRejectedValueOnce(new Error("typertGateway 服务缺席"));
    const diag2 = vi.fn();
    registerSpecTypertRemotes(captureFace({ [FORGE_SPECS_SERVICE_KEY]: {} }).face, {
      specs: () => ({}) as never,
      selfProbe: selfProbe2,
      diag: diag2,
    });
    await vi.waitFor(() => {
      expect(diag2).toHaveBeenCalledWith(expect.stringContaining("注册后自探针失败"));
    });
  });

  it("自探针缺席缝 / forgeSpecs 降级 → 不触发直探（零调用）", async () => {
    const selfProbe = vi.fn<(ns: string, method: string) => Promise<unknown>>();
    registerSpecTypertRemotes(captureFace({ [FORGE_SPECS_SERVICE_KEY]: {} }).face, {
      specs: () => ({}) as never,
    });
    registerSpecTypertRemotes(captureFace().face, { specs: () => ({}) as never, selfProbe });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selfProbe).not.toHaveBeenCalled();
  });
});

// ── 端到端契约快照（真 in-memory db 服务 → host 半 DTO 单点水化）──
// fixture 提升模块级（M3 六端点 + M4a 五端点两共用——同一 db 种子面）

let tempRoot: string;
let services: SpecAssembly;

const lazy = (() => {
    let ready: { cwd: string; deps: ForgeSpecRemoteDeps } | undefined;
    return () => {
      if (ready === undefined) {
        tempRoot = mkdtempSync(join(tmpdir(), "spec-typert-"));
        const ws = join(tempRoot, "ws-demo");
        mkdirSync(ws, { recursive: true });
        services = assembleSpecServices({
          home: tempRoot,
          dbFile: ":memory:",
          resolveWsPath: () => ws,
        })!;
        services.specs.createSpec({
          cwd: ws,
          slug: "alpha",
          title: "Alpha Spec",
          tiers: ["api"],
          goals: [
            { title: "G1", brief: "首个目标", acs: ["AC one", "AC two"] },
            { title: "G2", acs: ["AC three"] },
          ],
          docRelPath: ".forge/specs/alpha/spec.md",
          docContent: "# alpha\n",
        });
        writeFileSync(join(ws, ".forge", "specs", "alpha", "spec.md"), "# alpha\n");
        services.specs.createSpec({
          cwd: ws,
          slug: "beta",
          title: "Beta Spec",
          tiers: [],
          goals: [{ title: "B1", acs: ["AC b1"] }],
          docRelPath: ".forge/specs/beta/spec.md",
        });
        // 悬空态：登记在库后移除文档文件（db 行在文件缺失——只读降级语义）
        rmSync(join(ws, ".forge", "specs", "beta", "spec.md"));
        // M4a 目标域种子（1.9 五端点族取材）：roadmap + milestone + goal 复核报告
        const makeVerbs = (actor?: "plugin-tool" | "ui") =>
          createForgeToolServices({
            db: services.db.db,
            repos: services.db.repos,
            specs: services.specs,
            ...(actor !== undefined ? { actor } : {}),
          });
        const seedVerbs = makeVerbs();
        seedVerbs.createRoadmap({ cwd: ws, slug: "rm-1", title: "Roadmap One", acEntries: [{ criterion: "RM AC one" }] });
        const rmRow = seedVerbs.queryRoadmap({ cwd: ws, slug: "rm-1" }).roadmap;
        const rmAcId = rmRow.acJson[0]!.id;
        seedVerbs.createMilestone({ cwd: ws, roadmapSlug: "rm-1", title: "M1", acEntries: [{ criterion: "M1 AC", address: rmAcId }] });
        const alphaSpec = services.db.repos.specs.getBySlug(deriveProjectKey(ws), "alpha")!;
        const alphaGoals = services.db.repos.specs.listGoalsBySpec(alphaSpec.id);
        services.db.repos.reviews.appendReview({
          id: "rev-seed-1",
          entityKind: "goal",
          entityId: alphaGoals[0]!.id,
          verdict: "passed",
          content: "复核通过",
          gapNote: null,
          actor: "ui",
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        const identity = async (projectId: string) =>
          projectId === "proj-1"
            ? { projectKey: deriveProjectKey(ws), wsPath: ws }
            : null;
        ready = {
          cwd: ws,
          deps: {
            specs: () => services.specs,
            tools: () => makeVerbs(),
            uiTools: () => makeVerbs("ui"),
            repos: () => services.db.repos,
            identity,
          },
        };
      }
      return ready;
    };
  })();

afterAll(() => {
  if (tempRoot !== undefined) rmSync(tempRoot, { recursive: true, force: true });
  services?.dispose();
});

/** M3 六端点共用 remote 构造（fixture 模块级后全 describe 共用） */
function remote(): ForgeSpecsRemote {
  return new ForgeSpecsRemote(fakeCtx(), lazy().deps);
}

describe("forgeSpecs 端点族契约快照（M3 六端点——真服务 + 假 identity）", () => {

  it("list：卡片清单（listing 序 + goalCount/acCount host 半水化）——形状契约快照", async () => {
    const result = await remote().list({ projectId: "proj-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((c) => c.slug)).toEqual(["alpha", "beta"]);
    expect(normalize(result.value)).toMatchSnapshot();
  });

  it("list search/statusFilter 过滤", async () => {
    const bySearch = await remote().list({ projectId: "proj-1", search: "alp" });
    expect(bySearch.ok && bySearch.value.map((c) => c.slug)).toEqual(["alpha"]);
    const byStatus = await remote().list({ projectId: "proj-1", statusFilter: "approved" });
    expect(byStatus.ok && byStatus.value).toEqual([]);
  });

  it("detail：父链全量 + transitions 台账 + doc 悬空态现算——形状契约快照", async () => {
    const alpha = await remote().detail({ projectId: "proj-1", slug: "alpha" });
    expect(alpha.ok).toBe(true);
    if (alpha.ok) expect(normalize([alpha.value])).toMatchSnapshot();
    expect(alpha.ok && alpha.value.doc).toEqual({ relPath: ".forge/specs/alpha/spec.md", dangling: false });
    const beta = await remote().detail({ projectId: "proj-1", slug: "beta" });
    expect(beta.ok && beta.value.doc?.dangling).toBe(true);
  });

  it("detail 未命中 → typed NOT_FOUND（Result error 分支，非抛错折叠）", async () => {
    const result = await remote().detail({ projectId: "proj-1", slug: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_SPEC_NOT_FOUND");
  });

  it("query：include 四节门控（默认全节；projection 关 = 零投影节）——形状契约快照", async () => {
    const full = await remote().query({ projectId: "proj-1", slug: "alpha" });
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.ok && Object.keys(full.value).sort()).toEqual(
        ["acProjection", "doc", "goals", "spec", "transitions"],
      );
      expect(normalize([full.value])).toMatchSnapshot();
    }
    const gated = await remote().query({
      projectId: "proj-1",
      slug: "alpha",
      include: { goals: false, projection: false },
    });
    expect(gated.ok && Object.keys(gated.value).sort()).toEqual(["doc", "spec", "transitions"]);
  });

  it("projection：缺席缝 → 全 AC no-task-data——形状契约快照", async () => {
    const result = await remote().projection({ projectId: "proj-1", slug: "alpha" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(normalize([result.value])).toMatchSnapshot();
    const states = result.ok ? result.value.goals.flatMap((g) => g.acs.map((a) => a.state)) : [];
    expect(states).toEqual(["no-task-data", "no-task-data", "no-task-data"]);
  });

  it("transition：写面透传（actor 缺省 ui）+ 台账 append；非法边 → typed code", async () => {
    const result = await remote().transition({
      projectId: "proj-1",
      slug: "alpha",
      to: "awaiting_approval",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.specStatus).toBe("awaiting_approval");
    // 驳回支：note 必填（域状态机守卫 typed code 直透）
    const rejectNoNote = await remote().transition({
      projectId: "proj-1",
      slug: "alpha",
      to: "draft",
      actor: "ui",
    });
    expect(rejectNoNote.ok).toBe(false);
    if (!rejectNoNote.ok) expect(rejectNoNote.error.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
    // 非法跳级边：draft → approved 拒（typed code 直透）
    const illegal = await remote().transition({
      projectId: "proj-1",
      slug: "beta",
      to: "approved",
      actor: "ui",
    });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.error.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
    const ledger = await remote().detail({ projectId: "proj-1", slug: "alpha" });
    expect(ledger.ok && ledger.value.transitions).toHaveLength(1);
  });

  it("follow：首帧 seq=1 全量快照（cards + stats）+ abort 出循环", async () => {
    const controller = new AbortController();
    const frames: unknown[] = [];
    for await (const frame of remote().follow({ projectId: "proj-1" }, controller.signal)) {
      frames.push(frame);
      controller.abort();
    }
    expect(frames).toHaveLength(1);
    const first = frames[0] as { seq: number; snapshot: { cards: unknown[]; stats: { total: number } } };
    expect(first.seq).toBe(1);
    expect(first.snapshot.stats.total).toBe(2);
    expect(first.snapshot.cards).toHaveLength(2);
  });

  it("projectId 未解析分层：list 空集 ok / detail·query·projection·transition typed 诚实拒绝", async () => {
    const r = remote();
    const listing = await r.list({ projectId: "unknown" });
    expect(listing.ok && listing.value).toEqual([]);
    for (const call of [
      () => r.detail({ projectId: "unknown", slug: "alpha" }),
      () => r.query({ projectId: "unknown", slug: "alpha" }),
      () => r.projection({ projectId: "unknown", slug: "alpha" }),
      () => r.transition({ projectId: "unknown", slug: "alpha", to: "awaiting_approval" }),
    ]) {
      const result = await call();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ERR_SPEC_IDENTITY_UNRESOLVED");
    }
  });
});

describe("族缺席降级（specs 服务缝 typed unavailable）", () => {
  const svc = new ForgeSpecsRemote(fakeCtx(), {});
  it("五读写端点 Result error（诚实降级非抛错）", async () => {
    expect(await svc.list({ projectId: "p" })).toEqual({
      ok: false,
      error: { code: "ERR_SPEC_UNAVAILABLE", message: unavailableMessage("list", "specs") },
    });
    const detail = await svc.detail({ projectId: "p", slug: "s" });
    expect(detail.ok).toBe(false);
    const query = await svc.query({ projectId: "p", slug: "s" });
    expect(query.ok).toBe(false);
    const projection = await svc.projection({ projectId: "p", slug: "s" });
    expect(projection.ok).toBe(false);
    const transition = await svc.transition({ projectId: "p", slug: "s", to: "draft" });
    expect(transition.ok).toBe(false);
  });

  it("族缺席降级：M4a 五端点 Result error（诚实降级非抛错）", async () => {
    expect(await svc.roadmaps({ projectId: "p" })).toEqual({
      ok: false,
      error: { code: "ERR_SPEC_UNAVAILABLE", message: unavailableMessage("roadmaps", "specs") },
    });
    for (const call of [
      () => svc.roadmapDetail({ projectId: "p", slug: "s" }),
      () => svc.roadmapMutate({ projectId: "p", action: "create", slug: "s", title: "t" }),
      () => svc.goalBoard({ projectId: "p", specSlug: "s" }),
      () => svc.goalReviewMutate({ projectId: "p", specSlug: "s", goalSeq: 1, action: "finalize" }),
    ]) {
      const result = await call();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ERR_SPEC_UNAVAILABLE");
    }
  });

  it("follow 族缺席 → 调用期诚实抛（AsyncIterable 不可回 Result）", async () => {
    await expect(async () => {
      for await (const frame of svc.follow({ projectId: "p" })) void frame;
    }).rejects.toThrow(unavailableMessage("follow", "specs"));
  });
});

describe("forgeProjectsIdentityOf（identity 双源缝：forge.projects 点分缝正源 + workspaceRegistry 回落——bug ac27ab1a / recurrence b990aa94）", () => {
  /** 官方 workspaceRegistry 消费窄面替身（get 窄面——可注入命中/缺席/抛错三态） */
  function registryFace(
    rows: Record<string, { path: string }> = {},
    opts: { throwOnGet?: boolean } = {},
  ): { get: (id: string) => Promise<{ path: string } | undefined>; getCalls: () => number } {
    let calls = 0;
    return {
      get: async (id: string) => {
        calls += 1;
        if (opts.throwOnGet === true) throw new Error("registry boom");
        return rows[id];
      },
      getCalls: () => calls,
    };
  }

  /** forge.projects 缝替身（plugins/project 五缝形态——reflect.get 返回惰性工厂，调用产 face） */
  function forgeProjectsSeam(rows: Record<string, { wsPath: string }>): { factory: unknown; calls: () => number } {
    let calls = 0;
    const face = {
      getProject: async (id: string) => {
        calls += 1;
        return rows[id] ?? null;
      },
    };
    const factory = () => face;
    return { factory, calls: () => calls };
  }

  function ctxWithSeam(seam: unknown, registry?: unknown): {
    reflect: { get: (name: string) => unknown };
    workspaceRegistry?: unknown;
  } {
    const ctx: { reflect: { get: (name: string) => unknown }; workspaceRegistry?: unknown } = {
      reflect: { get: (name: string) => (name === "forge.projects" ? seam : undefined) },
    };
    if (registry !== undefined) ctx.workspaceRegistry = registry;
    return ctx;
  }

  function identityOf(ctx: unknown) {
    const diag: string[] = [];
    const face = forgeProjectsIdentityOf(ctx, (line: string) => diag.push(line));
    return { face, diag };
  }

  it("缝正源命中 → wsPath + deriveProjectKey 派生（factory 调用产 face；registry 同 id 在座也不消费——projectId 是 forge 签发 ID ≠ workspaceId）", async () => {
    const seam = forgeProjectsSeam({ "f940767b": { wsPath: "Z:\\ws\\forge" } });
    const reg = registryFace({ "f940767b": { path: "Z:\\ws\\wrong" } });
    const { face, diag } = identityOf(ctxWithSeam(seam.factory, reg));
    expect(await face("f940767b")).toEqual({ wsPath: "Z:\\ws\\forge", projectKey: deriveProjectKey("Z:\\ws\\forge") });
    expect(seam.calls()).toBe(1);
    expect(reg.getCalls()).toBe(0);
    expect(diag).toEqual([]);
  });

  it("缝反射键 = 点分 forge.projects（plugins/project PROJECT_SEAM_KEYS.projects 同值——camelCase forgeProjects 恒 miss 判例钉死）", async () => {
    const seen: string[] = [];
    const ctx = {
      reflect: { get: (name: string) => { seen.push(name); return undefined; } },
      workspaceRegistry: registryFace({}),
    };
    const { face } = identityOf(ctx);
    await face("p-1");
    expect(seen).toContain("forge.projects");
    expect(seen).not.toContain("forgeProjects");
  });

  it("缝缺席 → 回落 workspaceRegistry（纯官方 workspaceId 语境——registry.get(id).path 命中）", async () => {
    const reg = registryFace({ "ws-1": { path: "Z:\\ws\\official" } });
    const ctx = ctxWithSeam(undefined, reg);
    const { face, diag } = identityOf(ctx);
    expect(await face("ws-1")).toEqual({ wsPath: "Z:\\ws\\official", projectKey: deriveProjectKey("Z:\\ws\\official") });
    expect(reg.getCalls()).toBe(1);
    expect(diag).toEqual([]);
  });

  it("缝 getProject miss → 回落 workspaceRegistry（行空不截断回落）", async () => {
    const seam = forgeProjectsSeam({});
    const reg = registryFace({ "ws-1": { path: "Z:\\ws\\official" } });
    const { face } = identityOf(ctxWithSeam(seam.factory, reg));
    expect(await face("ws-1")).toEqual({ wsPath: "Z:\\ws\\official", projectKey: deriveProjectKey("Z:\\ws\\official") });
  });

  it("缝 getProject 抛错 → 回落 workspaceRegistry（抛错 fail-soft 非截断）", async () => {
    const factory = () => ({ getProject: async () => { throw new Error("seam boom"); } });
    const reg = registryFace({ "ws-1": { path: "Z:\\ws\\official" } });
    const { face } = identityOf(ctxWithSeam(factory, reg));
    expect(await face("ws-1")).toEqual({ wsPath: "Z:\\ws\\official", projectKey: deriveProjectKey("Z:\\ws\\official") });
  });

  it("registry 缺席/抛错 → 缝正源独立承担（双源互不前置依赖）", async () => {
    const seam = forgeProjectsSeam({ "p-1": { wsPath: "Z:\\ws\\forge" } });
    const throwingReg = registryFace({}, { throwOnGet: true });
    const { face } = identityOf(ctxWithSeam(seam.factory, throwingReg));
    expect(await face("p-1")).toEqual({ wsPath: "Z:\\ws\\forge", projectKey: deriveProjectKey("Z:\\ws\\forge") });
  });

  it("双源全缺 → null + diag warn 留痕（不静默 null——identity 解析失败路径可观测）", async () => {
    const ctx = {
      workspaceRegistry: registryFace({}),
      reflect: { get: () => undefined },
    };
    const { face, diag } = identityOf(ctx);
    expect(await face("p-none")).toBeNull();
    expect(diag.length).toBeGreaterThan(0);
    expect(diag[0]).toContain("p-none");
  });

  it("每调用现查零缓存（AGENTS 1.6——同 id 两次调用缝 factory 与 registry 各现查两次）", async () => {
    const seam = forgeProjectsSeam({});
    const reg = registryFace({ "ws-1": { path: "Z:\\ws\\official" } });
    const { face } = identityOf(ctxWithSeam(seam.factory, reg));
    await face("ws-1");
    await face("ws-1");
    expect(seam.calls()).toBe(2);
    expect(reg.getCalls()).toBe(2);
  });
});

// ── M4a 目标域五端点契约快照（1.9——roadmaps/roadmapDetail/roadmapMutate/goalBoard/goalReviewMutate）──

describe("M4a 目标域五端点契约快照（真服务 + 工具面动词复用）", () => {
  function remote(): ForgeSpecsRemote {
    return new ForgeSpecsRemote(fakeCtx(), lazy().deps);
  }
  function verbs() {
    lazy();
    return createForgeToolServices({
      db: services.db.db,
      repos: services.db.repos,
      specs: services.specs,
    });
  }

  it("roadmaps：roadmap 清单（listing 序）——形状契约快照", async () => {
    const result = await remote().roadmaps({ projectId: "proj-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.slug)).toEqual(["rm-1"]);
    expect(normalizeIds(result.value)).toMatchSnapshot();
  });

  it("roadmaps：projectId 未解析 → 空集诚实降级（清单族同 list 判型）", async () => {
    const result = await remote().roadmaps({ projectId: "unknown" });
    expect(result.ok && result.value).toEqual([]);
  });

  it("roadmapDetail：本体 + milestones 下钻 + 达成派生——形状契约快照", async () => {
    const result = await remote().roadmapDetail({ projectId: "proj-1", slug: "rm-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones.map((m) => m.title)).toEqual(["M1"]);
    expect(result.value.achievement.completed).toBe(false);
    expect(result.value.achievement.perMilestone).toHaveLength(1);
    expect(normalizeIds(result.value)).toMatchSnapshot();
  });

  it("roadmapDetail 未命中 → typed NOT_FOUND", async () => {
    const result = await remote().roadmapDetail({ projectId: "proj-1", slug: "missing" });
    expect(!result.ok && result.error.code).toBe("ERR_SPEC_ROADMAP_UNKNOWN");
  });

  it("roadmapMutate create/update：快照直投——形状契约快照", async () => {
    const created = await remote().roadmapMutate({
      projectId: "proj-1",
      action: "create",
      slug: "rm-2",
      title: "Roadmap Two",
      acEntries: [{ criterion: "RM2 AC" }],
    });
    expect(created.ok).toBe(true);
    if (created.ok && !Array.isArray(created.value)) {
      expect(created.value.slug).toBe("rm-2");
      expect(normalizeIds([created.value])).toMatchSnapshot();
    }
    const updated = await remote().roadmapMutate({
      projectId: "proj-1",
      action: "update",
      slug: "rm-2",
      title: "Roadmap Two Renamed",
    });
    expect(updated.ok && !Array.isArray(updated.value) && updated.value.title).toBe("Roadmap Two Renamed");
  });

  it("roadmapMutate moveMilestone：全量新序透传——形状契约快照", async () => {
    const seed = verbs();
    const m2 = seed.createMilestone({ cwd: lazy().cwd, roadmapSlug: "rm-1", title: "M2", acEntries: [{ criterion: "M2 AC", address: seed.queryRoadmap({ cwd: lazy().cwd, slug: "rm-1" }).roadmap.acJson[0]!.id }] });
    const moved = await remote().roadmapMutate({
      projectId: "proj-1",
      action: "moveMilestone",
      slug: "rm-1",
      milestoneId: m2.id,
      before: (seed.listMilestones({ cwd: lazy().cwd, roadmapSlug: "rm-1" }))[0]!.id,
    });
    expect(moved.ok).toBe(true);
    if (moved.ok && "assignments" in moved.value) {
      expect(moved.value.assignments.map((a) => a.seq).sort()).toEqual([1, 2]);
      expect(normalizeIds([moved.value])).toMatchSnapshot();
    }
    // 互斥违例 → typed INVALID_INPUT
    const bad = await remote().roadmapMutate({
      projectId: "proj-1",
      action: "moveMilestone",
      slug: "rm-1",
      milestoneId: m2.id,
    });
    expect(!bad.ok && bad.error.code).toBe("ERR_SPEC_REMOTE_INVALID_INPUT");
  });

  it("roadmapMutate confirm：human-only 边走 actor='ui' 实例——非待验收现值 typed 拒", async () => {
    const result = await remote().roadmapMutate({ projectId: "proj-1", action: "confirm", slug: "rm-1" });
    // rm-1 现值 pending：pending→completed 非法边（typed code 直透——域状态机守卫）
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
  });

  it("goalBoard：徽标面（isTerminal/availableTransitions）+ 最新复核 + 台账尾帧——形状契约快照", async () => {
    const result = await remote().goalBoard({ projectId: "proj-1", specSlug: "alpha" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.goals.map((g) => g.goalSeq)).toEqual([1, 2]);
    for (const entry of result.value.goals) {
      expect(entry.badge.isTerminal).toBe(false);
      expect(entry.badge.availableTransitions).toEqual(["in_progress"]);
    }
    expect(result.value.goals[0]!.latestReview).toEqual({ verdict: "passed", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(normalizeIds(result.value)).toMatchSnapshot();
  });

  it("goalBoard 未命中 → typed NOT_FOUND；projectId 未解析 → typed 拒", async () => {
    const miss = await remote().goalBoard({ projectId: "proj-1", specSlug: "missing" });
    expect(!miss.ok && miss.error.code).toBe("ERR_SPEC_NOT_FOUND");
    const unresolved = await remote().goalBoard({ projectId: "unknown", specSlug: "alpha" });
    expect(!unresolved.ok && unresolved.error.code).toBe("ERR_SPEC_IDENTITY_UNRESOLVED");
  });

  it("goalReviewMutate：驳回 note 必填守卫 + finalize 终审确认（actor='ui'）——形状契约快照", async () => {
    const seed = verbs();
    const alphaSpec = services.db.repos.specs.getBySlug(deriveProjectKey(lazy().cwd), "alpha")!;
    const goal = services.db.repos.specs.listGoalsBySpec(alphaSpec.id)[1]!;
    // 现值推至 awaiting_confirmation（写面直设——终审边前置态）
    services.db.repos.specs.updateGoalStatus(goal.id, "awaiting_confirmation", "2026-01-02T00:00:00.000Z");
    const rejectNoNote = await remote().goalReviewMutate({
      projectId: "proj-1",
      specSlug: "alpha",
      goalSeq: goal.sortKey,
      action: "reject",
    });
    expect(!rejectNoNote.ok && rejectNoNote.error.code).toBe("ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED");
    const finalize = await remote().goalReviewMutate({
      projectId: "proj-1",
      specSlug: "alpha",
      goalSeq: goal.sortKey,
      action: "finalize",
    });
    expect(finalize.ok).toBe(true);
    if (finalize.ok) {
      expect(finalize.value.goalStatus).toBe("completed");
      expect(normalizeIds([finalize.value])).toMatchSnapshot();
    }
    // 台账 actor 审计锚 = ui
    const ledger = services.db.repos.transitions.listByEntity("goal", goal.id);
    expect(ledger.at(-1)?.actor).toBe("ui");
    void seed;
  });

  it("goalReviewMutate：projectId 未解析 → typed 拒", async () => {
    const result = await remote().goalReviewMutate({
      projectId: "unknown",
      specSlug: "alpha",
      goalSeq: 1,
      action: "finalize",
    });
    expect(!result.ok && result.error.code).toBe("ERR_SPEC_IDENTITY_UNRESOLVED");
  });
});

/** 快照归一（id/时间戳/actor 审计面——形状 pin 与易变值解耦） */
function normalize<T>(value: readonly T[]): unknown[] {
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === "id" || key === "createdAt" || key === "updatedAt" || key === "projectKey"
        ? `<${key === "projectKey" ? "projectKey" : key}>`
        : key === "note" && v === null
          ? undefined
          : v,
    ),
  );
}

/** M4a 五端点快照归一（在 normalize 基础上追加 UUID 锚族——goalId/entityId/挂链 id 族） */
function normalizeIds<T>(value: readonly T[]): unknown[] {
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (["id", "goalId", "entityId", "milestoneId", "roadmapId", "specId", "address"].includes(key) && typeof v === "string") {
        return `<${key}>`;
      }
      if (key === "createdAt" || key === "updatedAt") return `<${key}>`;
      if (key === "projectKey") return "<projectKey>";
      if (key === "note" && v === null) return undefined;
      return v;
    }),
  );
}

// ── 键族聚合（f5——worktree spec 主根概览可见：list/follow 快照族按键族合并） ──

/** worktree 检出种子（tempRoot 下 sibling 目录——主根身份 + worktree 键 spec 各一行） */
function worktreeFixture(): { wt: string; worktrees: ForgeWorktreesFamilyFace } {
  const { cwd } = lazy();
  const wt = join(cwd, "..", "ws-wt");
  mkdirSync(wt, { recursive: true });
  if (services.db.repos.specs.getBySlug(deriveProjectKey(wt), "wt-spec") === undefined) {
    services.specs.createSpec({
      cwd: wt,
      slug: "wt-spec",
      title: "Worktree Spec",
      tiers: ["ui"],
      goals: [{ title: "G1", acs: ["AC wt one"] }],
      docRelPath: ".forge/specs/wt-spec/spec.md",
      docContent: "# wt-spec\n",
    });
  }
  return {
    wt,
    worktrees: { list: async ({ projectRoot }) => ({ entries: [{ path: join(projectRoot, "..", "ws-wt") }] }) },
  };
}

describe("键族聚合（2026-11-24 方案 A——spec 快照族多键合并）", () => {
  function familyRemote(opts: { worktrees?: ForgeWorktreesFamilyFace; diag?: (line: string) => void } = {}): ForgeSpecsRemote {
    const { deps } = lazy();
    const wtFix = worktreeFixture();
    return new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      worktrees: "worktrees" in opts ? () => opts.worktrees : () => wtFix.worktrees,
      ...(opts.diag !== undefined ? { diag: opts.diag } : {}),
    });
  }

  it("list：主根 + worktree 两键卡片合并（slug 去重、主根先行）", async () => {
    const result = await familyRemote().list({ projectId: "proj-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((c) => c.slug)).toEqual(["alpha", "beta", "wt-spec"]);
    expect(result.value.map((c) => c.title)).toContain("Worktree Spec");
  });

  it("follow：baseline 帧按键族聚合（cards 并集）", async () => {
    const svc = lazy().deps.specs!();
    if (svc === undefined) throw new Error("specs 服务缺席");
    const controller = new AbortController();
    const frames: unknown[] = [];
    for await (const frame of familyRemote().follow({ projectId: "proj-1" }, controller.signal)) {
      frames.push(frame);
      controller.abort();
    }
    expect(frames).toHaveLength(1);
    const snapshot = (frames[0] as { snapshot: { cards: { slug: string }[] } }).snapshot;
    expect(snapshot.cards.map((c) => c.slug)).toContain("wt-spec");
    expect(snapshot.cards).toHaveLength(3);
    void svc;
  });

  it("键族缝缺席（forge.worktrees 未装配）→ 快照族回退单键现状 + 诊断留痕", async () => {
    const diag = vi.fn();
    const result = await familyRemote({ worktrees: undefined, diag }).list({ projectId: "proj-1" });
    expect(result.ok && result.value.map((c) => c.slug)).toEqual(["alpha", "beta"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("键族缝缺席"));
  });

  it("键族清单抛错 → fail-soft 回退单键 + 诊断留痕（不炸读面）", async () => {
    const diag = vi.fn();
    const result = await familyRemote({ worktrees: { list: async () => { throw new Error("seam broke"); } }, diag }).list({ projectId: "proj-1" });
    expect(result.ok && result.value.map((c) => c.slug)).toEqual(["alpha", "beta"]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("键族清单失败"));
  });

  // ── 主根归拢（2026-11-24 同日裁决：归拢推导抽 lib-path project-root 单源三插件共享） ──

  it("主根归拢（lib 单源消费）：注册行落 worktree 检出（marker 触发）→ porcelain 现查归拢主检出根（list projectRoot = 主根）", async () => {
    const { deps } = lazy();
    const wtPath = "Z:/ws/proj/.forge/worktrees/plugins";
    const porcelain = [
      "worktree Z:/ws/proj",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree Z:/ws/proj/.forge/worktrees/plugins",
      "HEAD def",
      "branch refs/heads/b1",
      "",
    ].join("\n");
    const listRoots: string[] = [];
    const rollupRemote = new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      identity: async (id) => (id === "proj-1" ? { projectKey: deriveProjectKey(wtPath), wsPath: wtPath } : null),
      worktrees: () => ({
        list: async (q) => {
          listRoots.push(q.projectRoot);
          return { entries: [{ path: wtPath }] };
        },
      }),
      gitPorcelain: () => porcelain,
    });
    const result = await rollupRemote.list({ projectId: "proj-1" });
    expect(result.ok).toBe(true);
    // 归拢生效：forge.worktrees 注册面消费主检出根（非注册行 worktree 路径原样）
    expect(listRoots).toEqual(["Z:/ws/proj"]);
    // 族 = 主根键（无 spec 文档空读）+ worktree 行键（无 spec 文档空读）→ 空卡集（键族证据在 listRoots）
    expect(result.ok && result.value).toEqual([]);
  });

  it("主根归拢 fail-soft：git 探针抛错 → 回退注册行键（list projectRoot 原样）+ 诊断留痕", async () => {
    const { deps } = lazy();
    const wtPath = "Z:/ws/proj/.forge/worktrees/plugins";
    const diag = vi.fn();
    const listRoots: string[] = [];
    const rollupRemote = new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      identity: async (id) => (id === "proj-1" ? { projectKey: deriveProjectKey(wtPath), wsPath: wtPath } : null),
      worktrees: () => ({
        list: async (q) => {
          listRoots.push(q.projectRoot);
          return { entries: [{ path: wtPath }] };
        },
      }),
      gitPorcelain: () => {
        throw new Error("git not found");
      },
      diag,
    });
    const result = await rollupRemote.list({ projectId: "proj-1" });
    expect(result.ok).toBe(true);
    expect(listRoots).toEqual([wtPath]);
    expect(diag).toHaveBeenCalledWith(expect.stringContaining("主根归拢 fail-soft"));
  });
});

// ── M4 单键面键族兼容读 + M5 AC 投影键同步（overview-dockkit-alignment/1.8 / 2.1）──

describe("detail/query/transition 键族兼容读（审计 M4——列表有卡点开不 404）", () => {
  /**
   * 贴形 fixture（评审 H-P1 反假绿口径——替身形状复刻生产组合根）：worktree wsPath 含
   * `.forge/worktrees/` marker（非兄弟目录假绿形态）。存量行种子 = legacy 服务实例注桩
   * git fail-soft（行键 = worktree 键——归拢前 create 落点）；remote 注 rolled specs 服务
   * （porcelain 桩含主根 + worktree → keyOf 归拢生效——修口前族成员经 svc.getSpec 的查询键
   * 被归拢中和恒等主根键 → 本组用例必红；修口后 getSpecByKey 纯键直查 → 命中）。
   */
  function markerFamilyRemote(): ForgeSpecsRemote {
    const { deps, cwd } = lazy();
    const wt = join(cwd, ".forge", "worktrees", "wt");
    const porcelain = [
      `worktree ${cwd.replaceAll("\\", "/")}`,
      "HEAD abc",
      "branch refs/heads/main",
      "",
      `worktree ${wt.replaceAll("\\", "/")}`,
      "HEAD def",
      "branch refs/heads/b1",
      "",
    ].join("\n");
    const legacySvc = createForgeSpecsService({
      db: services.db.db,
      repos: services.db.repos,
      writeSpecDoc: () => {},
      gitPorcelain: () => {
        throw new Error("git not found");
      },
    });
    if (services.db.repos.specs.getBySlug(deriveProjectKey(wt), "wt-spec") === undefined) {
      legacySvc.createSpec({
        cwd: wt,
        slug: "wt-spec",
        title: "Worktree Spec",
        tiers: [],
        goals: [{ title: "G1", acs: ["AC wt one"] }],
        docRelPath: ".forge/specs/wt-spec/spec.md",
      });
    }
    const rolledSvc = createForgeSpecsService({
      db: services.db.db,
      repos: services.db.repos,
      writeSpecDoc: () => {},
      gitPorcelain: () => porcelain,
    });
    return new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      specs: () => rolledSvc,
      worktrees: () => ({ list: async () => ({ entries: [{ path: wt }] }) }),
    });
  }

  it("detail：主根键 spec（dangling=false 不回归）+ 存量 worktree 键 spec（经族内 worktree 纯键命中）", async () => {
    const r = markerFamilyRemote();
    const alpha = await r.detail({ projectId: "proj-1", slug: "alpha" });
    expect(alpha.ok).toBe(true);
    if (alpha.ok) expect(alpha.value.doc?.dangling).toBe(false);
    const wtSpec = await r.detail({ projectId: "proj-1", slug: "wt-spec" });
    expect(wtSpec.ok).toBe(true);
    if (wtSpec.ok) expect(wtSpec.value.title).toBe("Worktree Spec");
  });

  it("query：存量 worktree 键 spec 经纯键通道可达（include 门控不回归）", async () => {
    const r = markerFamilyRemote();
    const result = await r.query({ projectId: "proj-1", slug: "wt-spec" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.spec.title).toBe("Worktree Spec");
      expect(result.value.goals?.[0]?.acs[0]?.criterion).toBe("AC wt one");
    }
  });

  it("transition：存量 worktree 键 spec 经键族纯键寻径流转成功（写面不 NOT_FOUND）", async () => {
    const r = markerFamilyRemote();
    const result = await r.transition({ projectId: "proj-1", slug: "wt-spec", to: "awaiting_approval" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.specStatus).toBe("awaiting_approval");
  });

  it("键族全键未命中 → typed NOT_FOUND（错误面不变）", async () => {
    const r = markerFamilyRemote();
    const result = await r.detail({ projectId: "proj-1", slug: "missing" });
    expect(!result.ok && result.error.code).toBe("ERR_SPEC_NOT_FOUND");
  });
});

describe("AC 投影键同步（审计 M5——结算查归拢主根键，进度不再恒 0）", () => {
  it("归拢注册行（marker + porcelain 现查）：worktree 键存量 spec 行投影按主根键查结算", async () => {
    const { deps } = lazy();
    const mainRoot = "Z:/ws/rollup-proj";
    // 注册行/身份拼写 = 会话 cwd 反斜杠形态（harness 口径——键派生拼写敏感，写读同拼写）
    const wtPath = "Z:\\ws\\rollup-proj\\.forge\\worktrees\\wt";
    const porcelain = [
      `worktree ${mainRoot}`,
      "HEAD abc",
      "branch refs/heads/main",
      "",
      `worktree ${wtPath}`,
      "HEAD def",
      "branch refs/heads/b1",
      "",
    ].join("\n");
    // 存量形态种子（评审 H-P2 贴形——真存量 worktree 键行）：行键 = worktree 键。legacy
    // 服务实例注桩 git fail-soft（marker 命中但现查失败 → 回退 cwd 键）——归拢前 create
    // 落点恒 worktree 键，非归拢主根键。
    const legacySvc = createForgeSpecsService({
      db: services.db.db,
      repos: services.db.repos,
      writeSpecDoc: () => {},
      gitPorcelain: () => {
        throw new Error("git not found");
      },
    });
    if (services.db.repos.specs.getBySlug(deriveProjectKey("Z:\\ws\\rollup-proj"), "rolled-spec") === undefined) {
      legacySvc.createSpec({
        cwd: "Z:\\ws\\rollup-proj\\.forge\\worktrees\\wt",
        slug: "rolled-spec",
        title: "Rolled Spec",
        tiers: [],
        goals: [{ title: "G1", acs: ["AC rolled one"] }],
        docRelPath: ".forge/specs/rolled-spec/spec.md",
      });
    }
    const settledKeys: string[] = [];
    const r = new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      // 键族寻径面注 rolled specs 服务（porcelain 桩含主根 + worktree → keyOf 归拢生效——
      // 修口前族成员 svc.getSpec 查询键被归拢中和恒等主根键 → NOT_FOUND 必红；修口后
      // getSpecByKey 纯键直查 → worktree 键行命中）
      specs: () => createForgeSpecsService({
        db: services.db.db,
        repos: services.db.repos,
        writeSpecDoc: () => {},
        gitPorcelain: () => porcelain,
      }),
      identity: async (id) => (id === "proj-1" ? { projectKey: deriveProjectKey(wtPath), wsPath: wtPath } : null),
      worktrees: () => ({ list: async () => ({ entries: [{ path: wtPath }] }) }),
      gitPorcelain: () => porcelain,
      acSettlementsOf: () => ({
        matchAcSettlements: async (projectKey, criteria) => {
          settledKeys.push(projectKey);
          return {
            matches: criteria.map((criterion) => ({ criterion, met: true })),
            unmatched: [],
          };
        },
      }),
    });
    const result = await r.projection({ projectId: "proj-1", slug: "rolled-spec" });
    expect(result.ok).toBe(true);
    // 投影键 = 归拢主根键（task-loop 结算行落点）——非行键（worktree 键）
    expect(settledKeys).toEqual([deriveProjectKey("Z:\\ws\\rollup-proj")]);
    if (result.ok) expect(result.value.goals[0]?.acs[0]?.state).toBe("met");
  });

  it("普通项目（非 worktree）：投影键 = 行键（现状不回归）", async () => {
    const { deps, cwd } = lazy();
    const settledKeys: string[] = [];
    const r = new ForgeSpecsRemote(fakeCtx(), {
      ...deps,
      acSettlementsOf: () => ({
        matchAcSettlements: async (projectKey, criteria) => {
          settledKeys.push(projectKey);
          return { matches: criteria.map((criterion) => ({ criterion, met: false })), unmatched: criteria };
        },
      }),
    });
    const result = await r.projection({ projectId: "proj-1", slug: "alpha" });
    expect(result.ok).toBe(true);
    expect(settledKeys).toEqual([deriveProjectKey(cwd)]);
  });
});
