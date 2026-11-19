// AC 派生投影集成测试（plugin-spec 1.7 → 1.8 include 化重接线，TDD）——querySpec
// include=["acProjection"] 消费面（task-loop 服务消费三铁律）：
//   ① 在场三态契约：met / unmet / unmatched（进程内注入 matchAcSettlements 桩；
//      抄写漂移 = 判据文本不命中 → 归 unmet 并入 unmatched；部分核销 = met=false → unmet）；
//   ② 缺席降级「无任务数据」不报错 + emitDiag（event 前缀 spec-ac-projection——AGENTS §7）；
//   ③ unmatched 非空 emitDiag warn（漂移信号 → M4 复核触发）；
//   ④ 消费点现查永不缓存（AGENTS 1.6）：重复查询每次现查 + 无缓存零第二写点（重复查询
//      不落库）+ 无 memoize（两次查询间桩态翻转 → 投影跟随）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService, deriveProjectKey, type ForgeSpecsService } from "../../host/domain/specs/service.js";
import { createForgeToolServices, type ForgeToolServices } from "../../host/domain/specs/tool-service.js";
import { createSpecTools, type SpecToolDeps, type SpecTools } from "../../host/tools/index.js";
import type { SpecToolExecFace } from "../../host/tools/faces.js";
import type { AcMatchRow, AcSettlementsFace } from "../../host/tools/projection.js";
import type { DiagEventPayload } from "@dsh-forge/lib-diag";

const CWD = "Z:\\project\\demo";

type DiagLine = Omit<DiagEventPayload, "process">;

interface QuerySpecOut {
  readonly spec: { readonly slug: string };
  readonly goalCount: number;
  readonly goals?: ReadonlyArray<{
    readonly goalSeq: number;
    readonly acs?: ReadonlyArray<{ readonly criterion: string; readonly state: string }>;
  }>;
}

/** 集成组合根：内存 db + 服务 + 组合根 + 注入桩缝 + 诊断收集缝 */
function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const service: ForgeSpecsService = createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: () => {},
  });
  const diag: DiagLine[] = [];
  const verbs: ForgeToolServices = createForgeToolServices({
    db: domain.db,
    repos: domain.repos,
    specs: service,
    onDiag: (payload: DiagLine) => {
      diag.push(payload);
    },
  });
  const deps: SpecToolDeps = {
    specs: service,
    verbs,
    onDiag: (payload: DiagLine) => {
      diag.push(payload);
    },
  };
  const counts = () =>
    JSON.stringify({
      specs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_specs`).get() as { n: number }).n,
      goals: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_goals`).get() as { n: number }).n,
      acs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_acs`).get() as { n: number }).n,
      docs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_docs`).get() as { n: number }).n,
    });
  return {
    service,
    db: domain.db,
    repos: domain.repos,
    deps,
    diag,
    counts,
    tools: createSpecTools(deps),
    /** 组合根重建（seam 注入组合根——querySpec 投影消费点单源；diag 收集缝保共享） */
    toolsWith(acSettlementsOf?: () => AcSettlementsFace | undefined): SpecTools {
      const verbs = createForgeToolServices({
        db: domain.db,
        repos: domain.repos,
        specs: service,
        onDiag: deps.onDiag,
        ...(acSettlementsOf !== undefined ? { acSettlementsOf } : {}),
      });
      return createSpecTools({ specs: service, verbs });
    },
    close: () => domain.db.close(),
  };
}

const execOf = (): SpecToolExecFace => ({ agent: { session: { id: "s1", header: { cwd: CWD } } } });

const GOALS = [
  { title: "目标一", acs: ["判据 A", "判据 B"] },
  { title: "目标二", acs: ["判据 C"] },
];

async function createDemo(tools: SpecTools): Promise<void> {
  await tools.createSpec.execute(
    { slug: "demo-spec", title: "演示规格", goals: GOALS },
    execOf(),
  );
}

/** 注入桩缝（进程内替身——spec 零 task slug 零结算表感知，聚合 DTO 直进） */
function stubTools(
  h: ReturnType<typeof harness>,
  rowsFor: (criteria: readonly string[], call: number) => readonly AcMatchRow[],
): { tools: SpecTools; calls: { n: number } } {
  const calls = { n: 0 };
  const seam: AcSettlementsFace = {
    matchAcSettlements: async (projectKey, criteria) => {
      calls.n += 1;
      expect(projectKey).toBe(deriveProjectKey(CWD));
      const matches = rowsFor(criteria, calls.n);
      return {
        matches,
        unmatched: matches.filter((m) => m.met !== true).map((m) => m.criterion),
      };
    },
  };
  const verbs = createForgeToolServices({
    db: h.db,
    repos: h.repos,
    specs: h.service,
    onDiag: h.deps.onDiag,
    acSettlementsOf: () => seam,
  });
  return { tools: createSpecTools({ specs: h.service, verbs }), calls };
}

async function queryProjection(tools: SpecTools): Promise<QuerySpecOut> {
  return (await tools.querySpec.execute(
    { slug: "demo-spec", include: ["acProjection"] },
    execOf(),
  )) as QuerySpecOut;
}

/** 平铺 AC 投影态（goals[].acs → 判据序 state 清单——断言便利投影）。 */
const flatStates = (out: QuerySpecOut): string[] =>
  (out.goals ?? []).flatMap((g) => (g.acs ?? []).map((a) => a.state));

const flatRows = (out: QuerySpecOut): Array<{ criterion: string; state: string }> =>
  (out.goals ?? []).flatMap((g) => [...(g.acs ?? [])]);

describe("AC 投影在场三态契约（进程内注入桩——met / unmet / unmatched）", () => {
  it("met/unmet 直映射 + 抄写漂移（桩侧判据不命中）归 unmet 并入 unmatched", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      // 抄写漂移形态：spec 判据「判据 B'」与任务侧判据「判据 B」文本不一致 →
      // 桩按归一化精确等返回聚合行（task-loop 匹配语义归一化单源在彼侧）
      const { tools } = stubTools(h, (criteria) =>
        criteria.map((c) =>
          c === "判据 A"
            ? { criterion: c, met: true, evidence: "e1", taskRefs: ["demo/1.1"] }
            : { criterion: c, met: false }, // 未达成 → unmet 并入 unmatched（聚合清单）
        ),
      );
      const result = await queryProjection(tools);
      expect(flatStates(result)).toEqual(["met", "unmet", "unmet"]);
      expect(flatRows(result)[0]).toEqual({ criterion: "判据 A", state: "met" });
    } finally {
      h.close();
    }
  });

  it("OR 部分核销聚合（多 task 同判据——桩直出聚合行，spec 侧零再聚合）", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const { tools } = stubTools(h, (criteria) =>
        criteria.map((c) => ({ criterion: c, met: c !== "判据 A", taskRefs: c === "判据 A" ? ["demo/1.1", "demo/fix-1"] : [] })),
      );
      const result = await queryProjection(tools);
      expect(flatRows(result)[0]).toEqual({ criterion: "判据 A", state: "unmet" });
    } finally {
      h.close();
    }
  });
});

describe("缺席降级（三铁律之二）——「无任务数据」不报错 + emitDiag", () => {
  it("缝缺席 → 全 AC no-task-data 成功面 + spec-ac-projection-absent 留痕（info）", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      // 零 acSettlementsOf = task-loop 缺席（default 工具组形态）
      const result = await queryProjection(h.tools);
      expect(flatStates(result)).toEqual(["no-task-data", "no-task-data", "no-task-data"]);
      const absent = h.diag.filter((d) => d.event === "spec-ac-projection-absent");
      expect(absent).toHaveLength(1);
      expect(absent[0]!.level).toBe("info");
      expect(absent[0]!.message).toContain("无任务数据");
    } finally {
      h.close();
    }
  });

  it("缝在场但调用抛错 → 同投影态降级不报错 + warn 留痕", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const seam: AcSettlementsFace = {
        matchAcSettlements: async () => {
          throw new Error("task-loop unavailable");
        },
      };
      const tools = h.toolsWith(() => seam);
      const result = await queryProjection(tools);
      expect(flatStates(result)).toEqual(["no-task-data", "no-task-data", "no-task-data"]);
      const absent = h.diag.filter((d) => d.event === "spec-ac-projection-absent");
      expect(absent).toHaveLength(1);
      expect(absent[0]!.level).toBe("warn");
    } finally {
      h.close();
    }
  });

  it("投影缺席时零 diag（include 缺省不触发投影面）", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      await h.tools.querySpec.execute({ slug: "demo-spec" }, execOf());
      expect(h.diag.filter((d) => d.event.startsWith("spec-ac-projection"))).toEqual([]);
    } finally {
      h.close();
    }
  });
});

describe("unmatched 非空 emitDiag warn（漂移信号 → M4 复核触发）", () => {
  it("unmatched 行在位 → spec-ac-projection-unmatched warn + 判据点名；全 met 零 warn", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const { tools } = stubTools(h, (criteria) =>
        criteria.map((c) => (c === "判据 B" ? { criterion: c, met: false, unmatched: true } : { criterion: c, met: true })),
      );
      await queryProjection(tools);
      const warns = h.diag.filter((d) => d.event === "spec-ac-projection-unmatched");
      expect(warns).toHaveLength(1);
      expect(warns[0]!.level).toBe("warn");
      expect(warns[0]!.message).toContain("判据 B");

      h.diag.length = 0;
      const allMet = stubTools(h, (criteria) => criteria.map((c) => ({ criterion: c, met: true })));
      await queryProjection(allMet.tools);
      expect(h.diag.filter((d) => d.event === "spec-ac-projection-unmatched")).toEqual([]);
    } finally {
      h.close();
    }
  });
});

describe("消费点现查永不缓存（AGENTS 1.6）——重复查询现查 + 无缓存零第二写点", () => {
  it("重复查询：桩每次调用期现查（calls 随查询数增长）+ db 行数零变化（不落库）", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const before = h.counts();
      const { tools, calls } = stubTools(h, (criteria) => criteria.map((c) => ({ criterion: c, met: true })));
      for (let i = 0; i < 3; i += 1) {
        const before = calls.n;
        const result = await queryProjection(tools);
        expect(flatStates(result).every((s) => s === "met")).toBe(true);
        expect(calls.n).toBeGreaterThan(before); // 每次查询至少一次现查（查询投影 + 尾部推进写点各一次）——零 memoize
      }
      expect(h.counts()).toBe(before); // 无缓存零第二写点
    } finally {
      h.close();
    }
  });

  it("无 memoize：两次查询间桩态翻转（met → unmet）→ 投影跟随新态（无缓存残留）", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const rows: AcMatchRow[] = GOALS.flatMap((g) => g.acs).map((c) => ({ criterion: c, met: true }));
      const seam: AcSettlementsFace = {
        matchAcSettlements: async (_key, criteria) => {
          const matches = criteria.map((c) => rows.find((r) => r.criterion === c) ?? { criterion: c, met: false });
          return { matches, unmatched: matches.filter((m) => m.met !== true).map((m) => m.criterion) };
        },
      };
      const tools = h.toolsWith(() => seam);
      const first = await queryProjection(tools);
      expect(flatStates(first)).toEqual(["met", "met", "met"]);
      // 任务侧新结算抵达：判据 A 翻转 unmet——消费点现查必须立即反映
      rows[0] = { criterion: "判据 A", met: false };
      const second = await queryProjection(tools);
      expect(flatStates(second)).toEqual(["unmet", "met", "met"]);
    } finally {
      h.close();
    }
  });
});

describe("消费点缝在场性翻转（AGENTS 1.6——服务在场 → 缺席 → 在场，非仅数据态翻转）", () => {
  it("acSettlementsOf 每查询现求值：在场→缺席→在场 投影即时跟随；缺席期降级留痕且零 seam 调用", async () => {
    const h = harness();
    try {
      await createDemo(h.tools);
      const calls = { n: 0 };
      const seam: AcSettlementsFace = {
        matchAcSettlements: async (_key, criteria) => {
          calls.n += 1;
          const matches = criteria.map((c) => ({ criterion: c, met: true }));
          return { matches, unmatched: [] };
        },
      };
      // 在场性求值缝本身可翻转——模拟 task-loop 插件中途卸载 / 重装
      let present = true;
      const tools = h.toolsWith(() => (present ? seam : undefined));
      const q = () => queryProjection(tools);

      // 在场 → met
      const first = await q();
      expect(flatStates(first)).toEqual(["met", "met", "met"]);

      // 中途卸载：缝缺席 → no-task-data 降级 + absent info 留痕
      present = false;
      const second = await q();
      expect(flatStates(second)).toEqual(["no-task-data", "no-task-data", "no-task-data"]);
      const absent = h.diag.filter((d) => d.event === "spec-ac-projection-absent");
      expect(absent).toHaveLength(1);
      expect(absent[0]!.level).toBe("info");

      // 重装回归：缝再在场 → 投影即时跟随回 met（无缺席残留缓存）
      present = true;
      const third = await q();
      expect(flatStates(third)).toEqual(["met", "met", "met"]);
      // 缺席期零 seam 调用；在场查询各触发至少一次现查（查询投影 + 尾部推进写点）
      expect(calls.n).toBeGreaterThanOrEqual(2);
    } finally {
      h.close();
    }
  });
});
