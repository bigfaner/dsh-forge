// updateSpec 守卫族 + transitionSpec 状态机域逻辑单测（plugin-spec 1.3）——
// 必含 Goal 守卫 / 归档冻结 / 边表逐格（含 archived 不可 reverse）/ 驳回留痕 /
// accepted human-only / 台账 append-only / 两写原子性（非法流转零变化）。
import { describe, expect, it } from "vitest";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import {
  createForgeSpecsService,
  type ForgeSpecsService,
} from "../../host/domain/specs/service.js";

const CWD = "Z:\\project\\demo";

function harness() {
  const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
  const service: ForgeSpecsService = createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: () => {},
  });
  const seed = () =>
    service.createSpec({
      cwd: CWD,
      slug: "demo-spec",
      title: "演示规格",
      goals: [{ title: "目标一", acs: ["判据 A"] }],
      docRelPath: ".forge/specs/demo-spec/spec.md",
    });
  return { domain, service, seed };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? `unexpected:${String(e)}`;
  }
  throw new Error("expected SpecError");
}

const transitionsOf = (domain: SpecDomainDb) =>
  (
    domain.db.prepare(`SELECT from_status, to_status, note, actor FROM spec_transitions ORDER BY created_at`).all() as Array<{
      from_status: string;
      to_status: string;
      note: string | null;
      actor: string;
    }>
  ).map((r) => ({ from: r.from_status, to: r.to_status, note: r.note, actor: r.actor }));

describe("updateSpec 字段改写", () => {
  it("title/tiers 改写 + updated_at 刷新；查询面回读一致", () => {
    const h = harness();
    try {
      h.seed();
      const row = h.service.updateSpec({ cwd: CWD, slug: "demo-spec", title: "新标题", tiers: ["api"] });
      expect(row.title).toBe("新标题");
      expect(row.tiers).toEqual(["api"]);
      expect(row.updatedAt >= row.createdAt).toBe(true);
    } finally {
      h.domain.db.close();
    }
  });

  it("docRelPath 改写：登记行更新、跨 spec 撞路径拒写（ERR_SPEC_DUPLICATE_DOC_PATH）", () => {
    const h = harness();
    try {
      h.seed();
      h.service.createSpec({
        cwd: CWD,
        slug: "other-spec",
        title: "二",
        goals: [{ title: "g", acs: ["c"] }],
        docRelPath: ".forge/specs/other-spec/spec.md",
      });
      const row = h.service.updateSpec({ cwd: CWD, slug: "demo-spec", docRelPath: ".forge/specs/moved.md" });
      expect(row.slug).toBe("demo-spec");
      expect(
        (h.domain.db.prepare(`SELECT rel_path FROM spec_docs WHERE spec_id = ?`).get(row.id) as { rel_path: string })
          .rel_path,
      ).toBe(".forge/specs/moved.md");
      expect(codeOf(() =>
        h.service.updateSpec({ cwd: CWD, slug: "demo-spec", docRelPath: ".forge/specs/other-spec/spec.md" }),
      )).toBe("ERR_SPEC_DUPLICATE_DOC_PATH");
    } finally {
      h.domain.db.close();
    }
  });

  it("spec 不存在 → ERR_SPEC_NOT_FOUND", () => {
    const h = harness();
    try {
      expect(codeOf(() => h.service.updateSpec({ cwd: CWD, slug: "ghost", title: "x" }))).toBe(
        "ERR_SPEC_NOT_FOUND",
      );
    } finally {
      h.domain.db.close();
    }
  });
});

describe("必含 Goal 守卫（replaceGoals）", () => {
  it("Goal/AC 全集批量增改：删插同事务、sort_key 重赋", () => {
    const h = harness();
    try {
      h.seed();
      const row = h.service.replaceGoals({
        cwd: CWD,
        slug: "demo-spec",
        goals: [
          { title: "新目标一", acs: ["新判据 1"] },
          { title: "新目标二", brief: "b", acs: ["新判据 2", "新判据 3"] },
        ],
      });
      const detail = h.service.getSpec({ cwd: CWD, slug: "demo-spec" })!;
      expect(detail.goals.map((g) => g.goal.title)).toEqual(["新目标一", "新目标二"]);
      expect(detail.goals[0]!.goal.sortKey).toBe(1);
      expect(detail.goals[1]!.acs.map((a) => a.criterion)).toEqual(["新判据 2", "新判据 3"]);
      expect(row.specStatus).toBe("draft");
    } finally {
      h.domain.db.close();
    }
  });

  it("Goal 删至零行拒写（ERR_SPEC_GOALS_EMPTY）且现值零变化", () => {
    const h = harness();
    try {
      h.seed();
      const before = h.service.getSpec({ cwd: CWD, slug: "demo-spec" })!;
      expect(codeOf(() => h.service.replaceGoals({ cwd: CWD, slug: "demo-spec", goals: [] }))).toBe(
        "ERR_SPEC_GOALS_EMPTY",
      );
      const after = h.service.getSpec({ cwd: CWD, slug: "demo-spec" })!;
      expect(after.goals).toEqual(before.goals);
    } finally {
      h.domain.db.close();
    }
  });
});

describe("归档态边界（裁定：不可 reverse / 冻结快照 / 投影不受影响）", () => {
  function seedArchived(h: { service: ForgeSpecsService }): void {
    h.seed();
    h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
    h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "accepted", actor: "plugin-tool" });
    h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "archived", actor: "ui" });
  }

  it("archived 后 updateSpec / replaceGoals 全写面拒（ERR_SPEC_ARCHIVED_FROZEN）", () => {
    const h = harness();
    try {
      seedArchived(h);
      expect(codeOf(() => h.service.updateSpec({ cwd: CWD, slug: "demo-spec", title: "改" }))).toBe(
        "ERR_SPEC_ARCHIVED_FROZEN",
      );
      expect(codeOf(() =>
        h.service.replaceGoals({ cwd: CWD, slug: "demo-spec", goals: [{ title: "g", acs: ["c"] }] }),
      )).toBe("ERR_SPEC_ARCHIVED_FROZEN");
    } finally {
      h.domain.db.close();
    }
  });

  it("archived 不可 reverse：任何出边非法（含 →draft / →under-review / →accepted）", () => {
    const h = harness();
    try {
      seedArchived(h);
      for (const to of ["draft", "under-review", "accepted"] as const) {
        expect(codeOf(() => h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to, actor: "ui" }))).toBe(
          "ERR_SPEC_ILLEGAL_TRANSITION",
        );
      }
      expect(
        (h.domain.db.prepare(`SELECT spec_status FROM spec_specs WHERE slug = 'demo-spec'`).get() as { spec_status: string })
          .spec_status,
      ).toBe("archived");
    } finally {
      h.domain.db.close();
    }
  });

  it("归档态查询/投影读面不受影响（getSpec / listSpecs 照常）", () => {
    const h = harness();
    try {
      seedArchived(h);
      const detail = h.service.getSpec({ cwd: CWD, slug: "demo-spec" })!;
      expect(detail.spec.specStatus).toBe("archived");
      expect(detail.goals).toHaveLength(1);
      expect(h.service.listSpecs({ cwd: CWD, statusFilter: "archived" }).map((s) => s.slug)).toEqual([
        "demo-spec",
      ]);
    } finally {
      h.domain.db.close();
    }
  });
});

describe("transitionSpec 状态机边表", () => {
  it("合法单向链逐格：draft→under-review→accepted→archived + 台账逐行 append", () => {
    const h = harness();
    try {
      h.seed();
      const s1 = h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
      expect(s1.specStatus).toBe("under-review");
      const s2 = h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "accepted", actor: "ui" });
      expect(s2.specStatus).toBe("accepted");
      const s3 = h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "archived", actor: "ui" });
      expect(s3.specStatus).toBe("archived");
      expect(transitionsOf(h.domain)).toEqual([
        { from: "draft", to: "under-review", note: null, actor: "plugin-tool" },
        { from: "under-review", to: "accepted", note: null, actor: "ui" },
        { from: "accepted", to: "archived", note: null, actor: "ui" },
      ]);
    } finally {
      h.domain.db.close();
    }
  });

  it("驳回支 under-review→draft：note 必填（ERR_SPEC_REJECT_NOTE_REQUIRED）+ 理由留痕", () => {
    const h = harness();
    try {
      h.seed();
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
      expect(codeOf(() =>
        h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "draft", actor: "ui" }),
      )).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
      h.service.transitionSpec({
        cwd: CWD,
        slug: "demo-spec",
        to: "draft",
        note: "判据不完整",
        actor: "plugin-tool",
      });
      expect(transitionsOf(h.domain).at(-1)).toEqual({
        from: "under-review",
        to: "draft",
        note: "判据不完整",
        actor: "plugin-tool",
      });
    } finally {
      h.domain.db.close();
    }
  });

  it("非法边拒写且零半态：draft→accepted 跳级 / draft→archived / accepted→draft 逆向 / accepted→under-review", () => {
    const h = harness();
    try {
      h.seed();
      // 跳级/越支：draft 直达 accepted、draft 直达 archived
      for (const to of ["accepted", "archived"] as const) {
        expect(codeOf(() =>
          h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to, actor: "plugin-tool" }),
        )).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
      }
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "accepted", actor: "ui" });
      // 逆向：accepted 退 draft / 退 under-review
      for (const to of ["draft", "under-review"] as const) {
        expect(codeOf(() =>
          h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to, actor: "plugin-tool" }),
        )).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
      }
      // 零半态：现值不变 + 台账仅两条合法行
      expect(
        (h.domain.db.prepare(`SELECT spec_status FROM spec_specs WHERE slug = 'demo-spec'`).get() as { spec_status: string })
          .spec_status,
      ).toBe("accepted");
      expect(transitionsOf(h.domain)).toHaveLength(2);
    } finally {
      h.domain.db.close();
    }
  });

  it("accepted human-only：非用户动作通道拒写（ERR_SPEC_ACTOR_INVALID）", () => {
    const h = harness();
    try {
      h.seed();
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
      expect(codeOf(() =>
        h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "accepted", actor: "agent" as "plugin-tool" }),
      )).toBe("ERR_SPEC_ACTOR_INVALID");
      expect(
        (h.domain.db.prepare(`SELECT spec_status FROM spec_specs WHERE slug = 'demo-spec'`).get() as { spec_status: string })
          .spec_status,
      ).toBe("under-review");
      expect(transitionsOf(h.domain)).toHaveLength(1);
      // 用户动作双通道（对话 tool 径 / UI 径）均可写 accepted
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "accepted", actor: "plugin-tool" });
      expect(
        (h.domain.db.prepare(`SELECT spec_status FROM spec_specs WHERE slug = 'demo-spec'`).get() as { spec_status: string })
          .spec_status,
      ).toBe("accepted");
    } finally {
      h.domain.db.close();
    }
  });

  it("台账 UPDATE 被 append-only 触发器 ABORT（服务层零改删路径的库级兜底）", () => {
    const h = harness();
    try {
      h.seed();
      h.service.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "under-review", actor: "plugin-tool" });
      expect(() =>
        h.domain.db.prepare(`UPDATE spec_transitions SET note = 'x'`).run(),
      ).toThrowError(/append-only/);
    } finally {
      h.domain.db.close();
    }
  });
});
