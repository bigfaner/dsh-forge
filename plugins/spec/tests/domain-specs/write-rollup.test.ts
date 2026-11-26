// 写侧归拢单测（overview-dockkit-alignment/1.8，审计 M3/M5——spec 写读全链归拢）：
// ① createSpec worktree cwd → 行键归拢主根键 + 文档写缝收主根键/主检出根双锚；
// ② detail 读面（getSpec）worktree cwd 归拢后命中主根键行（列表有卡点开不 404 的域侧基座）；
// ③ AC 投影查询键（tool-service querySpec matchAcSettlements）按归拢主根键查结算；
// ④ fail-soft 回退 cwd 键 + 诊断留痕；非 marker cwd 零 git 调用（行为同修口前）。
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectKey, projectKeyOf as deriveProjectKey } from "@dsh-forge/lib-path";
import type { GitPorcelainRunner } from "@dsh-forge/lib-path/project-root";
import { openSpecDb, type SpecDomainDb } from "../../host/db/connection.js";
import {
  createForgeSpecsService,
  type ForgeSpecsService,
} from "../../host/domain/specs/service.js";
import { createForgeToolServices, type ForgeToolServices } from "../../host/domain/specs/tool-service.js";
import { assembleSpecServices } from "../../host/assembly/default-assembly.js";
import type { AcMatchRow, AcSettlementsFace } from "../../host/tools/projection.js";

const MAIN_ROOT = "Z:/ws/proj";
const WT_CWD = "Z:\\ws\\proj\\.forge\\worktrees\\plugins";

/** porcelain 双条目桩（主检出根恒首条目——git 输出原样正斜杠口径） */
const porcelainRunner: GitPorcelainRunner = () =>
  [
    `worktree ${MAIN_ROOT}`,
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree Z:/ws/proj/.forge/worktrees/plugins",
    "HEAD def",
    "branch refs/heads/b1",
    "",
  ].join("\n");

const GOALS = [
  { title: "目标一", acs: ["判据 A"] },
];

describe("resolveProjectKey（lib 单源——runner 注入）", () => {
  it("marker 命中 → 归拢主根键（主根拼写随 cwd 反斜杠风格改写）", () => {
    const r = resolveProjectKey(WT_CWD, { registryQuery: () => undefined, gitRunner: porcelainRunner });
    expect(r.rolledUp).toBe(true);
    expect(r.mainRoot).toBe("Z:\\ws\\proj");
    expect(r.key).toBe(deriveProjectKey("Z:\\ws\\proj"));
  });

  it("非 marker cwd → 零 git 调用原样派生", () => {
    let calls = 0;
    const spy: GitPorcelainRunner = () => (calls += 1, "");
    const r = resolveProjectKey("Z:\\project\\demo", { registryQuery: () => undefined, gitRunner: spy });
    expect(r.rolledUp).toBe(false);
    expect(r.key).toBe(deriveProjectKey("Z:\\project\\demo"));
    expect(calls).toBe(0);
  });

  it("git 探针抛错 → fail-soft 回退 cwd 键 + fallbackReason", () => {
    const r = resolveProjectKey(WT_CWD, { registryQuery: () => undefined, gitRunner: () => {
      throw new Error("git not found");
    } });
    expect(r.rolledUp).toBe(false);
    expect(r.key).toBe(deriveProjectKey(WT_CWD));
    expect(r.fallbackReason).toContain("fail-soft");
  });
});

describe("createSpec 写侧归拢（行键 + 文档写缝双锚主根）", () => {
  function harness() {
    const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
    const written: Array<{ relPath: string; projectKey: string }> = [];
    const diag: string[] = [];
    const service: ForgeSpecsService = createForgeSpecsService({
      db: domain.db,
      repos: domain.repos,
      writeSpecDoc: (relPath, _content, projectKey) => {
        written.push({ relPath, projectKey });
      },
      gitPorcelain: porcelainRunner,
      diag: (line) => diag.push(line),
    });
    return { domain, service, written, diag };
  }

  it("worktree cwd createSpec → 行键 = 主根键；写缝收归拢键 + 原始 cwd（主根键守卫可解析主检出根）", () => {
    const h = harness();
    try {
      const row = h.service.createSpec({
        cwd: WT_CWD,
        slug: "wt-spec",
        title: "Worktree Spec",
        tiers: ["ui"],
        goals: GOALS,
        docRelPath: ".forge/specs/wt-spec/spec.md",
      });
      expect(row.projectKey).toBe(deriveProjectKey("Z:\\ws\\proj"));
      expect(row.projectKey).not.toBe(deriveProjectKey(WT_CWD));
      expect(h.written).toEqual([{ relPath: ".forge/specs/wt-spec/spec.md", projectKey: deriveProjectKey("Z:\\ws\\proj") }]);
      expect(h.diag.join("\n")).toContain("归属键归拢");
    } finally {
      h.domain.db.close();
    }
  });

  it("getSpec 双锚同步：worktree cwd 与主根 cwd 均命中同一行（归拢后单键自洽）", () => {
    const h = harness();
    try {
      h.service.createSpec({
        cwd: WT_CWD,
        slug: "wt-spec",
        title: "Worktree Spec",
        tiers: [],
        goals: GOALS,
        docRelPath: ".forge/specs/wt-spec/spec.md",
      });
      expect(h.service.getSpec({ cwd: WT_CWD, slug: "wt-spec" })?.spec.slug).toBe("wt-spec");
      expect(h.service.getSpec({ cwd: "Z:\\ws\\proj", slug: "wt-spec" })?.spec.slug).toBe("wt-spec");
    } finally {
      h.domain.db.close();
    }
  });

  it("git 探针失败 → fail-soft 回退 worktree cwd 键（行为同修口前）+ 诊断留痕", () => {
    const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
    const diag: string[] = [];
    try {
      const service = createForgeSpecsService({
        db: domain.db,
        repos: domain.repos,
        writeSpecDoc: () => {},
        gitPorcelain: () => {
          throw new Error("git not found");
        },
        diag: (line) => diag.push(line),
      });
      const row = service.createSpec({
        cwd: WT_CWD,
        slug: "fallback-spec",
        title: "Fallback",
        tiers: [],
        goals: GOALS,
        docRelPath: ".forge/specs/fallback-spec/spec.md",
      });
      expect(row.projectKey).toBe(deriveProjectKey(WT_CWD));
      expect(diag.join("\n")).toContain("fail-soft 回退");
    } finally {
      domain.db.close();
    }
  });
});

describe("缺省装配写缝（键 → 主检出根解析——spec.md 落主检出）", () => {
  it("worktree cwd 经缺省缝写入主检出根 .forge/specs/；非 worktree cwd 直写 cwd 不回归", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-rollup-asm-"));
    try {
      const mainRoot = join(tempRoot, "main");
      const wt = join(mainRoot, ".forge", "worktrees", "plugins");
      mkdirSync(wt, { recursive: true });
      const services = assembleSpecServices({
        home: tempRoot,
        dbFile: ":memory:",
        gitPorcelain: () => `worktree ${mainRoot.replaceAll("\\", "/")}\nHEAD abc\nbranch refs/heads/main\n\nworktree ${wt.replaceAll("\\", "/")}\nHEAD def\nbranch refs/heads/b1\n\n`,
      })!;
      try {
        const row = services.specs.createSpec({
          cwd: wt,
          slug: "root-visible",
          title: "Root Visible",
          tiers: [],
          goals: GOALS,
          docRelPath: ".forge/specs/root-visible/spec.md",
        });
        expect(row.projectKey).toBe(deriveProjectKey(mainRoot));
        // 文档落主检出根（键→主检出根解析——「主根可见」终态）
        expect(existsSync(join(mainRoot, ".forge", "specs", "root-visible", "spec.md"))).toBe(true);
        expect(existsSync(join(wt, ".forge", "specs", "root-visible", "spec.md"))).toBe(false);
        // 非 worktree cwd：直写 cwd（旧行为不回归）
        const plain = join(tempRoot, "plain");
        mkdirSync(plain, { recursive: true });
        services.specs.createSpec({
          cwd: plain,
          slug: "plain-spec",
          title: "Plain",
          tiers: [],
          goals: GOALS,
          docRelPath: ".forge/specs/plain-spec/spec.md",
        });
        expect(existsSync(join(plain, ".forge", "specs", "plain-spec", "spec.md"))).toBe(true);
      } finally {
        services.dispose();
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("AC 投影键同步（审计 M5——tool-face querySpec 结算查主根键）", () => {
  it("worktree cwd 会话 querySpec include=acProjection → matchAcSettlements 收归拢主根键", async () => {
    const domain: SpecDomainDb = openSpecDb(".", { file: ":memory:" });
    try {
      const service: ForgeSpecsService = createForgeSpecsService({
        db: domain.db,
        repos: domain.repos,
        writeSpecDoc: () => {},
        gitPorcelain: porcelainRunner,
      });
      service.createSpec({
        cwd: WT_CWD,
        slug: "proj-spec",
        title: "Proj Spec",
        tiers: [],
        goals: GOALS,
        docRelPath: ".forge/specs/proj-spec/spec.md",
      });
      const seenKeys: string[] = [];
      const seam: AcSettlementsFace = {
        matchAcSettlements: async (projectKey, criteria) => {
          seenKeys.push(projectKey);
          const matches: AcMatchRow[] = criteria.map((criterion) => ({ criterion, met: true }));
          return { matches, unmatched: [] };
        },
      };
      const verbs: ForgeToolServices = createForgeToolServices({
        db: domain.db,
        repos: domain.repos,
        specs: service,
        acSettlementsOf: () => seam,
        gitPorcelain: porcelainRunner,
      });
      const out = await verbs.querySpec({
        cwd: WT_CWD,
        slug: "proj-spec",
        include: ["acProjection"],
      });
      // 投影键 = 归拢主根键（task-loop 结算行落主根键——worktree spec 进度不再恒 0；
      // querySpec 推进写点 + 投影现算两消费点同键）
      expect(seenKeys.length).toBeGreaterThan(0);
      expect(seenKeys.every((k) => k === deriveProjectKey("Z:\\ws\\proj"))).toBe(true);
      const goals = out.goals ?? [];
      expect(goals[0]?.acs?.[0]?.state).toBe("met");
    } finally {
      domain.db.close();
    }
  });
});
