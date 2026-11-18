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
  type TypertAssemblyCtxFace,
} from "../../host/assembly/typert-remotes.js";
import { assembleSpecServices, type SpecAssembly } from "../../host/assembly/default-assembly.js";
import { deriveProjectKey } from "../../host/domain/specs/service.js";
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
  it("六端点：list/detail/query/projection/transition + follow mode:stream", () => {
    const svc = new ForgeSpecsRemote(fakeCtx(), {});
    expect(endpointsOf(svc)).toEqual([
      "list",
      "detail",
      "query",
      "projection",
      "transition",
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

describe("forgeSpecs 端点族契约快照（真服务 + 假 identity）", () => {
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
        const identity = async (projectId: string) =>
          projectId === "proj-1"
            ? { projectKey: deriveProjectKey(ws), wsPath: ws }
            : null;
        ready = {
          cwd: ws,
          deps: {
            specs: () => services.specs,
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

  function remote(): ForgeSpecsRemote {
    return new ForgeSpecsRemote(fakeCtx(), lazy().deps);
  }

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

  it("follow 族缺席 → 调用期诚实抛（AsyncIterable 不可回 Result）", async () => {
    await expect(async () => {
      for await (const frame of svc.follow({ projectId: "p" })) void frame;
    }).rejects.toThrow(unavailableMessage("follow", "specs"));
  });
});

describe("forgeProjectsIdentityOf（forge.projects 缝 identity 单源）", () => {
  it("getProject 命中 → wsPath + deriveProjectKey 派生；缺席/抛错 = null（fail-soft）", async () => {
    const ctx = {
      reflect: {
        get: (name: string) =>
          name === "forgeProjects"
            ? { getProject: async (id: string) => (id === "p-1" ? { wsPath: "Z:\\ws\\demo" } : null) }
            : undefined,
      },
    };
    const identity = forgeProjectsIdentityOf(ctx);
    expect(await identity("p-1")).toEqual({ wsPath: "Z:\\ws\\demo", projectKey: deriveProjectKey("Z:\\ws\\demo") });
    expect(await identity("p-miss")).toBeNull();
    const throwing = forgeProjectsIdentityOf({
      reflect: { get: () => ({ getProject: async () => { throw new Error("boom"); } }) },
    });
    expect(await throwing("p-1")).toBeNull();
    const absent = forgeProjectsIdentityOf({});
    expect(await absent("p-1")).toBeNull();
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
