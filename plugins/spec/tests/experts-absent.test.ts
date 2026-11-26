// 无 expert-squad 单装行为零变化验证（builtin-redistribution t-ac12）：
//   ① M4 门挂缝退化形态 = 规则核销单源（specMachine 边表 + note 必填守卫）+ diag warn
//      （experts 服务缺席留痕）——transitionSpec 本体零影响（transitionGuards 缺省 = 零追加）；
//   ② 装配面 expert-squad 缺席：插件照常装配（forgeSpecs provide + 工具族注册），
//      仅一条 experts 缺席 warn 留痕；
//   ③ inject 名单不含 'experts'（spec 不消费 experts 服务——M4 门 guard 预留位，单装零依赖）。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import specPlugin from "../host/index.js";
import { openSpecDb, type SpecDomainDb } from "../host/db/connection.js";
import {
  createForgeSpecsService,
  type ForgeSpecsService,
} from "../host/domain/specs/service.js";
import { FORGE_SPECS_SERVICE_KEY } from "../shared/contract-constants.js";
import { SPEC_DIR_KEYS_SERVICE_NAME } from "../host/forge-dir-entries.js";

const CWD = "Z:\\project\\demo";

function serviceOf(domain: SpecDomainDb, transitionGuards?: ForgeGuard[]): ForgeSpecsService {
  return createForgeSpecsService({
    db: domain.db,
    repos: domain.repos,
    writeSpecDoc: () => {},
    ...(transitionGuards !== undefined ? { transitionGuards } : {}),
  });
}

type ForgeGuard = Parameters<
  NonNullable<Parameters<typeof createForgeSpecsService>[0]["transitionGuards"]>
>[number];

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? `unexpected:${String(e)}`;
  }
  throw new Error("expected SpecError");
}

function seed(service: ForgeSpecsService): void {
  service.createSpec({
    cwd: CWD,
    slug: "demo-spec",
    title: "演示规格",
    goals: [{ title: "目标一", acs: ["判据 A"] }],
    docRelPath: ".forge/specs/demo-spec/spec.md",
  });
}

describe("M4 门挂缝退化形态（无 expert-squad = transitionGuards 零注入）", () => {
  it("缺省注入与显式空清单逐位一致：合法边照走 + 台账照记（规则核销单源——本体零影响）", () => {
    const bare = openSpecDb(".", { file: ":memory:" });
    const explicit = openSpecDb(".", { file: ":memory:" });
    try {
      const svcBare = serviceOf(bare);
      const svcExplicit = serviceOf(explicit, []);
      seed(svcBare);
      seed(svcExplicit);
      for (const svc of [svcBare, svcExplicit]) {
        // 合法边照走（draft → awaiting_approval）+ 现值两写同事务
        const row = svc.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "awaiting_approval", actor: "plugin-tool" });
        expect(row.specStatus).toBe("awaiting_approval");
      }
      const ledger = (domain: SpecDomainDb) =>
        (domain.db.prepare(`SELECT from_status, to_status FROM spec_transitions`).all() as Array<{
          from_status: string;
          to_status: string;
        }>);
      expect(ledger(bare)).toEqual(ledger(explicit));
      expect(ledger(bare)).toEqual([{ from_status: "draft", to_status: "awaiting_approval" }]);
    } finally {
      bare.db.close();
      explicit.db.close();
    }
  });

  it("规则核销守卫族零退化：非法边照拒 + note 必填边照拒（错误码保留）", () => {
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      const svc = serviceOf(domain);
      seed(svc);
      // 非法边（draft → approved 非边表成员）照拒
      expect(codeOf(() =>
        svc.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "approved", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_ILLEGAL_TRANSITION");
      // 退回边 note 必填照拒（awaiting_approval → draft 无理由）
      svc.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "awaiting_approval", actor: "plugin-tool" });
      expect(codeOf(() =>
        svc.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "draft", actor: "plugin-tool" }),
      )).toBe("ERR_SPEC_REJECT_NOTE_REQUIRED");
      // 拒绝路径零台账残留（本体零影响——两写同事务回滚语义不变）
      const rows = domain.db.prepare(`SELECT COUNT(*) AS n FROM spec_transitions`).get() as { n: number };
      expect(rows.n).toBe(1);
    } finally {
      domain.db.close();
    }
  });

  it("对照：guard 注入即被调（缝生效位）——缺席径零 guard 调用纯属退化形态而非缝失效", () => {
    const domain = openSpecDb(".", { file: ":memory:" });
    try {
      const calls: string[] = [];
      const svc = serviceOf(domain, [({ fromStatus, toStatus }) => calls.push(`${fromStatus}->${toStatus}`)]);
      seed(svc);
      svc.transitionSpec({ cwd: CWD, slug: "demo-spec", to: "awaiting_approval", actor: "ui" });
      expect(calls).toEqual(["draft->awaiting_approval"]);
    } finally {
      domain.db.close();
    }
  });
});

describe("装配面 expert-squad 缺席（experts 服务缺席 = 单装常态）", () => {
  it("specPlugin 整体装配：恰一条 experts 缺席 warn + forgeSpecs 照常 provide + 工具族照常注册 + 卸载收口", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "spec-noexp-"));
    try {
      const provided: Array<{ name: string }> = [];
      const registered: string[] = [];
      const lines: Array<{ line: string; level?: string }> = [];
      const ctx = {
        reflect: {
          provide: (name: string) => provided.push({ name }),
          get: () => undefined, // expert-squad 缺席（无任何可选服务）
        },
        emit: () => {},
        tools: {
          register: (definition: { name: string }) => {
            registered.push(definition.name);
            return () => {
              const at = registered.indexOf(definition.name);
              if (at >= 0) registered.splice(at, 1);
            };
          },
        },
      };
      const dispose = specPlugin(ctx, {
        home: join(tempRoot, "home"),
        dbFile: ":memory:",
        resolveWsPath: (projectKey: string) => join(tempRoot, "ws", projectKey),
        diag: (line: string, level?: "info" | "warn" | "error") => lines.push({ line, level }),
      });
      try {
        const expertWarns = lines.filter((l) => l.line.includes("experts 服务缺席"));
        expect(expertWarns).toHaveLength(1);
        expect(expertWarns[0]!.level).toBe("warn");
        // 本体零影响：域服务 provide 与工具族注册不受 experts 缺席牵连
        expect(provided.map((p) => p.name)).toEqual([SPEC_DIR_KEYS_SERVICE_NAME, FORGE_SPECS_SERVICE_KEY]);
        expect(registered.length).toBeGreaterThan(0);
      } finally {
        dispose();
      }
      expect(registered).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("inject 名单不含 'experts'（spec 只注册档案不消费 experts 服务——M4 门 guard 预留位单装零依赖）", () => {
    const inject = (specPlugin as unknown as { inject: readonly string[] }).inject;
    expect(inject).not.toContain("experts");
  });
});
