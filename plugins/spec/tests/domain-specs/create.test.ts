// createSpec 域逻辑单测（plugin-spec 1.3，TDD 域逻辑先行）——
// 校验门四分支（纯 deps 桩，零 fs）+ 单事务原子性（文件写缝抛错 → 四表零行）。
import { describe, expect, it } from "vitest";
import { deriveDirName } from "@dsh-forge/lib-path";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import { createForgeSpecsService, SpecError, isSpecError } from "../../host/domain/specs/service.js";

const CWD = "Z:\\project\\demo";

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const written: Array<{ relPath: string; content: string }> = [];
  let failWrite = false;
  const service = createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: (relPath, content) => {
      if (failWrite) throw new Error("fs write failure");
      written.push({ relPath, content });
    },
  });
  const counts = () => ({
    specs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_specs`).get() as { n: number }).n,
    goals: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_goals`).get() as { n: number }).n,
    acs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_acs`).get() as { n: number }).n,
    docs: (domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_docs`).get() as { n: number }).n,
  });
  const validInput = () => ({
    cwd: CWD,
    slug: "demo-spec",
    title: "演示规格",
    tiers: ["ui"],
    goals: [
      { title: "目标一", acs: ["判据 A", "判据 B"] },
      { title: "目标二", brief: "简报", acs: ["判据 C"] },
    ],
    docRelPath: ".forge/specs/demo-spec/spec.md",
  });
  return { domain, service, written, setFailWrite: (v: boolean) => (failWrite = v), counts, validInput };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(isSpecError(e)).toBe(true);
    return (e as SpecError).code;
  }
  throw new Error("expected SpecError");
}

describe("createSpec 成功径", () => {
  it("specs + goals + acs + docs 四表行齐 + 文档写缝调用（draft 起步、归属键 cwd 派生）", () => {
    const h = harness();
    try {
      const row = h.service.createSpec(h.validInput());
      expect(row.specStatus).toBe("draft");
      expect(row.projectKey).toBe(deriveDirName(CWD));
      expect(h.counts()).toEqual({ specs: 1, goals: 2, acs: 3, docs: 1 });
      expect(h.written).toEqual([
        { relPath: ".forge/specs/demo-spec/spec.md", content: expect.any(String) },
      ]);
      // 父链追溯：goals sort_key 序 + acs 逐 goal
      const detail = h.service.getSpec({ cwd: CWD, slug: "demo-spec" })!;
      expect(detail.goals.map((g) => g.goal.title)).toEqual(["目标一", "目标二"]);
      expect(detail.goals[1]!.acs.map((a) => a.criterion)).toEqual(["判据 C"]);
      expect(detail.doc!.relPath).toBe(".forge/specs/demo-spec/spec.md");
    } finally {
      h.domain.db.close();
    }
  });

  it("tiers 缺省 = []（未声明档位缺席态）", () => {
    const h = harness();
    try {
      const input = h.validInput();
      delete input.tiers;
      const row = h.service.createSpec(input);
      expect(row.tiers).toEqual([]);
    } finally {
      h.domain.db.close();
    }
  });
});

describe("createSpec 单事务原子性（任一失败全回滚零半态）", () => {
  it("文档写缝抛错 → 四表全回滚零行（db 为准、文件不落半态）", () => {
    const h = harness();
    try {
      h.setFailWrite(true);
      expect(() => h.service.createSpec(h.validInput())).toThrowError("fs write failure");
      expect(h.counts()).toEqual({ specs: 0, goals: 0, acs: 0, docs: 0 });
      expect(h.written).toEqual([]);
    } finally {
      h.domain.db.close();
    }
  });
});

describe("createSpec 校验门（事务外拒收，零落库）", () => {
  it("goals 空 → ERR_SPEC_GOALS_EMPTY 且零落库", () => {
    const h = harness();
    try {
      const input = h.validInput();
      input.goals = [];
      expect(codeOf(() => h.service.createSpec(input))).toBe("ERR_SPEC_GOALS_EMPTY");
      expect(h.counts()).toEqual({ specs: 0, goals: 0, acs: 0, docs: 0 });
    } finally {
      h.domain.db.close();
    }
  });

  it("AC 判据空白 → ERR_SPEC_CRITERION_EMPTY", () => {
    const h = harness();
    try {
      const input = h.validInput();
      input.goals[0]!.acs = ["判据 A", "   "];
      expect(codeOf(() => h.service.createSpec(input))).toBe("ERR_SPEC_CRITERION_EMPTY");
    } finally {
      h.domain.db.close();
    }
  });

  it("tiers 越界 → ERR_SPEC_TIERS_INVALID（封闭四值 ui/api/pure-logic/docs）", () => {
    const h = harness();
    try {
      const input = h.validInput();
      input.tiers = ["ui", "cli"];
      expect(codeOf(() => h.service.createSpec(input))).toBe("ERR_SPEC_TIERS_INVALID");
    } finally {
      h.domain.db.close();
    }
  });

  it("slug 撞已有 spec → ERR_SPEC_DUPLICATE_SLUG", () => {
    const h = harness();
    try {
      h.service.createSpec(h.validInput());
      expect(codeOf(() => h.service.createSpec(h.validInput()))).toBe("ERR_SPEC_DUPLICATE_SLUG");
    } finally {
      h.domain.db.close();
    }
  });

  it("rel_path 跨 spec 重复 → ERR_SPEC_DUPLICATE_DOC_PATH（服务层单点守卫）", () => {
    const h = harness();
    try {
      h.service.createSpec(h.validInput());
      const second = h.validInput();
      second.slug = "other-spec";
      expect(codeOf(() => h.service.createSpec(second))).toBe("ERR_SPEC_DUPLICATE_DOC_PATH");
      // 跨 project 同 rel_path 不冲突（归属域经 project_key 圈定）
      const third = h.validInput();
      third.cwd = "Z:\\project\\other";
      expect(() => h.service.createSpec(third)).not.toThrowError();
    } finally {
      h.domain.db.close();
    }
  });

  it("cwd 空白 → ERR_SPEC_PROJECT_KEY_DERIVATION（派生失败拒写）", () => {
    const h = harness();
    try {
      for (const bad of ["", "   "]) {
        const input = h.validInput();
        input.cwd = bad;
        expect(codeOf(() => h.service.createSpec(input))).toBe("ERR_SPEC_PROJECT_KEY_DERIVATION");
      }
      expect(h.counts()).toEqual({ specs: 0, goals: 0, acs: 0, docs: 0 });
    } finally {
      h.domain.db.close();
    }
  });
});
