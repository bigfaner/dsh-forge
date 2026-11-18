// spec 六动词 tool 单测（plugin-spec 1.4，TDD）——薄封装面：
// create_spec 两分支（成功落库 + 文件写失败回滚零半态——AC 必红两径）+ doc_path 缺省
// 派生（lib/api forge-paths 单源）+ update 族/transition/query/list 六动词 Happy 面 +
// typed 失败面（format 单源失败 DTO）+ AC 投影三态与缺席降级。
import { describe, expect, it } from "vitest";
import { isForgeToolFailure, specDocRelPath, type ForgeToolFailure } from "@dsh-forge/lib-api";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService, SpecError, type ForgeSpecsService } from "../../host/domain/specs/service.js";
import { createForgeToolServices, type ForgeToolServices } from "../../host/domain/specs/tool-service.js";
import { createSpecTools, FORGE_SPEC_TOOL_NAMES } from "../../host/tools/index.js";
import type { SpecToolExecFace } from "../../host/tools/faces.js";
import type { AcMatchRow, AcSettlementsFace } from "../../host/tools/projection.js";

const CWD = "Z:\\project\\demo";

function execOf(): SpecToolExecFace {
  return { agent: { session: { id: "s1", header: { cwd: CWD } } } };
}

function harness(opts: { failWrite?: boolean } = {}) {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  let failWrite = opts.failWrite ?? false;
  const service = createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: (relPath, content, projectKey) => {
      if (failWrite) {
        // 装配面写缝真实现形态：文件写失败 → typed 上抛（ERR_SPEC_DOC_WRITE——服务层同事务回滚）
        throw new SpecError("ERR_SPEC_DOC_WRITE", "fs write failure", { relPath, projectKey });
      }
      void relPath;
      void content;
      void projectKey;
    },
  });
  const verbs: ForgeToolServices = createForgeToolServices({
    db: domain.db,
    repos: domain.repos,
    specs: service,
  });
  const tools = createSpecTools({ specs: service, verbs });
  const counts = () => ({
    specs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_specs`).get() as { n: number }).n,
    goals: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_goals`).get() as { n: number }).n,
    acs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_acs`).get() as { n: number }).n,
    docs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_docs`).get() as { n: number }).n,
  });
  return {
    service: service as ForgeSpecsService,
    db: domain.db,
    repos: domain.repos,
    verbs,
    tools,
    counts,
    close: () => domain.db.close(),
  };
}

/** 投影缝替身组合根：以显式 seam 重建组合根 + 工具组（AGENTS 1.6——缝每次调用期求值） */
function toolsWithSeam(h: ReturnType<typeof harness>, rows: readonly AcMatchRow[]) {
  const seam: AcSettlementsFace = {
    matchAcSettlements: (_projectKey, criteria) => {
      const matches = criteria.map(
        (c) => rows.find((r) => r.criterion === c) ?? { criterion: c, met: false },
      );
      return Promise.resolve({
        matches,
        unmatched: matches.filter((m) => m.met !== true).map((m) => m.criterion),
      });
    },
  };
  const verbsWithSeam = createForgeToolServices({
    db: h.db,
    repos: h.repos,
    specs: h.service,
    acSettlementsOf: () => seam,
  });
  return createSpecTools({ specs: h.service, verbs: verbsWithSeam });
}

const validGoals = [
  { title: "目标一", acs: ["判据 A", "判据 B"] },
  { title: "目标二", brief: "简报", acs: ["判据 C"] },
];

async function createDemo(h: ReturnType<typeof harness>): Promise<void> {
  const result = (await h.tools.createSpec.execute(
    { slug: "demo-spec", title: "演示规格", tiers: ["ui"], goals: validGoals },
    execOf(),
  )) as { spec: { slug: string } };
  expect(result.spec.slug).toBe("demo-spec");
}

describe("create_spec（AC1——单动词全集落库 + 文档写 specs/slug/spec.md + 失败回滚两分支）", () => {
  it("成功分支：goals+acs 全集单动词落库 + doc_path 缺省 = lib/api 单源派生 .forge/specs/{slug}/spec.md", async () => {
    const h = harness();
    try {
      const result = (await h.tools.createSpec.execute(
        { slug: "demo-spec", title: "演示规格", goals: validGoals },
        execOf(),
      )) as { spec: { specStatus: string }; docPath: string };
      expect(result.spec.specStatus).toBe("draft");
      expect(result.docPath).toBe(specDocRelPath("demo-spec"));
      expect(result.docPath).toBe(".forge/specs/demo-spec/spec.md");
      expect(h.counts()).toEqual({ specs: 1, goals: 2, acs: 3, docs: 1 });
    } finally {
      h.close();
    }
  });

  it("doc_path 随参显式覆盖缺省派生", async () => {
    const h = harness();
    try {
      const result = (await h.tools.createSpec.execute(
        { slug: "demo-spec", title: "t", goals: validGoals, doc_path: ".forge/specs/custom.md" },
        execOf(),
      )) as { docPath: string };
      expect(result.docPath).toBe(".forge/specs/custom.md");
    } finally {
      h.close();
    }
  });

  it("失败分支：文件写缝抛错 → 失败 DTO（typed code）+ db 全回滚零行（无半态）", async () => {
    const h = harness({ failWrite: true });
    try {
      const result = (await h.tools.createSpec.execute(
        { slug: "demo-spec", title: "t", goals: validGoals },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(result)).toBe(true);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("fs write failure");
      expect(h.counts()).toEqual({ specs: 0, goals: 0, acs: 0, docs: 0 });
    } finally {
      h.close();
    }
  });
});

describe("22 动词注册名单（薄封装门面——tools.md 总表逐行）", () => {
  it("FORGE_SPEC_TOOL_NAMES 22 员与定义组一一对应", () => {
    const h = harness();
    try {
      expect(FORGE_SPEC_TOOL_NAMES).toHaveLength(22);
      const names = Object.values(h.tools).map((t) => t.name);
      expect(names).toHaveLength(22);
      for (const name of FORGE_SPEC_TOOL_NAMES) expect(names).toContain(name);
    } finally {
      h.close();
    }
  });
});

describe("update_spec / replace_spec_goals / transition_spec（调整族 + 状态流转薄封装）", () => {
  it("update_spec 字段改写 + 归档冻结拒绝走失败面", async () => {
    const h = harness();
    try {
      await createDemo(h);
      const updated = (await h.tools.updateSpec.execute(
        { slug: "demo-spec", title: "新题" },
        execOf(),
      )) as { spec: { title: string } };
      expect(updated.spec.title).toBe("新题");
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "awaiting_approval" }, execOf());
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "approved" }, execOf());
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "in_progress" }, execOf());
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "awaiting_acceptance" }, execOf());
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "completed" }, execOf());
      const frozen = (await h.tools.updateSpec.execute(
        { slug: "demo-spec", title: "再改" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(frozen)).toBe(true);
      expect(frozen.code).toBe("ERR_SPEC_ARCHIVED_FROZEN");
    } finally {
      h.close();
    }
  });

  it("replace_spec_goals 全集增改（必含 Goal 不变式——零行拒绝走失败面）", async () => {
    const h = harness();
    try {
      await createDemo(h);
      const replaced = (await h.tools.replaceSpecGoals.execute(
        { slug: "demo-spec", goals: [{ title: "唯一目标", acs: ["判据 X"] }] },
        execOf(),
      )) as { spec: { slug: string } };
      expect(replaced.spec.slug).toBe("demo-spec");
      const empty = (await h.tools.replaceSpecGoals.execute(
        { slug: "demo-spec", goals: [] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(empty)).toBe(true);
      expect(empty.code).toBe("ERR_TOOL_ARGS_INVALID");
      expect(empty.message).toContain("goals");
    } finally {
      h.close();
    }
  });

  it("transition_spec 驳回支 note 必填（失败面）+ 合法流转落地", async () => {
    const h = harness();
    try {
      await createDemo(h);
      await h.tools.transitionSpec.execute({ slug: "demo-spec", to: "awaiting_approval" }, execOf());
      const noNote = (await h.tools.transitionSpec.execute(
        { slug: "demo-spec", to: "draft" },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(noNote)).toBe(true);
      expect(noNote.code).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
      const rejected = (await h.tools.transitionSpec.execute(
        { slug: "demo-spec", to: "draft", note: "理由" },
        execOf(),
      )) as { spec: { specStatus: string } };
      expect(rejected.spec.specStatus).toBe("draft");
    } finally {
      h.close();
    }
  });
});

describe("query_spec / list_specs（查询族薄封装 + include 封闭枚举）", () => {
  it("缺省 = 快照 + goalCount 概览；include=goals+transitions 展开父链 + 台账；未知 slug → ERR_SPEC_NOT_FOUND 失败面", async () => {
    const h = harness();
    try {
      await createDemo(h);
      const basic = (await h.tools.querySpec.execute({ slug: "demo-spec" }, execOf())) as {
        spec: { slug: string };
        goalCount: number;
        goals?: unknown[];
        transitions?: unknown[];
      };
      expect(basic.spec.slug).toBe("demo-spec");
      expect(basic.goalCount).toBe(2);
      expect(basic.goals).toBeUndefined();
      expect(basic.transitions).toBeUndefined();
      const expanded = (await h.tools.querySpec.execute(
        { slug: "demo-spec", include: ["goals", "transitions"] },
        execOf(),
      )) as {
        goals: { title: string; goalSeq: number; goalStatus: string }[];
        transitions: unknown[];
      };
      expect(expanded.goals.map((g) => g.title)).toEqual(["目标一", "目标二"]);
      expect(expanded.goals.map((g) => g.goalSeq)).toEqual([1, 2]);
      expect(expanded.goals.every((g) => g.goalStatus === "pending")).toBe(true);
      expect(expanded.transitions).toHaveLength(0);
      const missing = (await h.tools.querySpec.execute({ slug: "nope" }, execOf())) as ForgeToolFailure;
      expect(isForgeToolFailure(missing)).toBe(true);
      expect(missing.code).toBe("ERR_SPEC_NOT_FOUND");
    } finally {
      h.close();
    }
  });

  it("include=acProjection：缝在场三态映射（met/unmet）；缝缺席 → 全 no-task-data；未知 include 值 typed 拒", async () => {
    const h = harness();
    try {
      await createDemo(h);
      const withSeam = toolsWithSeam(h, [
        { criterion: "判据 A", met: true, evidence: "e1", taskRefs: ["demo/1.1"] },
        { criterion: "判据 B", met: false },
        { criterion: "判据 C", met: false },
      ]);
      const result = (await withSeam.querySpec.execute(
        { slug: "demo-spec", include: ["acProjection"] },
        execOf(),
      )) as { goals: { acs: { criterion: string; state: string }[] }[] };
      const flat = result.goals.flatMap((g) => g.acs);
      expect(flat.map((p) => p.state)).toEqual(["met", "unmet", "unmet"]);
      expect(flat[0]).toEqual({ criterion: "判据 A", state: "met" });

      // 缺席缝降级（default 工具组零 acSettlementsOf）
      const degraded = (await h.tools.querySpec.execute(
        { slug: "demo-spec", include: ["acProjection"] },
        execOf(),
      )) as { goals: { acs: { state: string }[] }[] };
      expect(degraded.goals.flatMap((g) => g.acs).map((p) => p.state)).toEqual(["no-task-data", "no-task-data", "no-task-data"]);

      // 封闭枚举：未知值 typed Error 拒（AC-3）
      const unknown = (await h.tools.querySpec.execute(
        { slug: "demo-spec", include: ["bogus"] },
        execOf(),
      )) as ForgeToolFailure;
      expect(isForgeToolFailure(unknown)).toBe(true);
      expect(unknown.code).toBe("ERR_SPEC_INCLUDE_UNKNOWN");
    } finally {
      h.close();
    }
  });

  it("list_specs 清单 + status_filter 收窄 + 非法词表拒绝", async () => {
    const h = harness();
    try {
      await createDemo(h);
      const all = (await h.tools.listSpecs.execute({}, execOf())) as { specs: { slug: string }[] };
      expect(all.specs.map((s) => s.slug)).toEqual(["demo-spec"]);
      const none = (await h.tools.listSpecs.execute({ status_filter: "approved" }, execOf())) as { specs: unknown[] };
      expect(none.specs).toHaveLength(0);
      const bad = (await h.tools.listSpecs.execute({ status_filter: "bogus" }, execOf())) as ForgeToolFailure;
      expect(isForgeToolFailure(bad)).toBe(true);
      expect(bad.code).toBe("ERR_TOOL_ARGS_INVALID");
      expect(bad.message).toContain("status_filter");
    } finally {
      h.close();
    }
  });
});
