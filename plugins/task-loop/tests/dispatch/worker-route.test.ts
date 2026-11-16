// 模块④机检 + 判例锚（plugin-task-loop 1.12）：
// ① experts 可选消费 memoize 禁令 grep 门——presence 检测结果禁止缓存（AGENTS 1.6）；
// ② reflect.get 消费点零残留锚——服务取法收敛为纯 ctx.inject 具名契约（fix-8 判例；
//    253b8265 判例：申请期一次性探针冻结降级态禁用）；
// ③ 通用 worker 兜底档行为测试——experts 缺席 → generic 档（agentOptions 父继承）、
//    中途装卸现查生效（若结果被缓存则 RED）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkerProfile } from "../../host/faces.js";
import type { ExpertProfileResolver, ForgeDiagEmitFace } from "../../host/faces.js";

const HOST_DIR = join(import.meta.dirname, "..", "..", "host");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walkTs(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const hostSources = walkTs(HOST_DIR);

describe("模块④ 机检门", () => {
  it("memoize 禁令 grep 门：host 全域零 presence 检测缓存（memoize 化缓存表禁用）", () => {
    const offenders = hostSources.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /memoize/i.test(src) && !/永不 memoize|禁 memoize|memoize 禁令|不缓存|现查/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("reflect.get 消费点零残留锚：host 全域零 ctx.reflect.get 运行期消费（纯 inject 具名契约）", () => {
    const offenders = hostSources.filter((f) => {
      // 剥块注释与行注释后匹配——结构面/历史注记允许，运行期消费调用点禁用
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return /\.reflect\.get\s*\(/.test(code) || /reflect\s*\.\s*get\s*\(\s*['"]/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});

describe("resolveWorkerProfile：通用 worker 兜底档（同结算门异路由）", () => {
  const diagCalls: { level: string; event: string; message: string }[] = [];
  const diag: ForgeDiagEmitFace = (p) => diagCalls.push({ level: p.level, event: p.event, message: p.message });
  const parentAgentOptions = { provider: "deepseek", model: "reasoner" } as const;

  it("experts 缺席 → generic 档：agentOptions 父会话继承 + diag info 留痕", async () => {
    diagCalls.length = 0;
    const profile = await resolveWorkerProfile(
      { expertsOf: () => undefined, parentAgentOptions: () => parentAgentOptions, diag },
      "refactor",
    );
    expect(profile.kind).toBe("generic");
    expect(profile.agentOptions).toEqual(parentAgentOptions);
    expect(diagCalls.some((c) => c.level === "info" && c.event === "worker-route")).toBe(true);
  });

  it("experts 在场且档案命中 → expert 档位；非缺席故障 fail-loud 原样外抛", async () => {
    const resolver: ExpertProfileResolver = async (taskType) =>
      taskType === "coding" ? { name: "coder", personaMd: "# coder", tools: ["read"], expertKey: "coder" } : undefined;
    const expert = await resolveWorkerProfile(
      { expertsOf: () => resolver, parentAgentOptions: () => parentAgentOptions, diag },
      "coding",
    );
    expect(expert.kind).toBe("expert");
    expect(expert.toolFilter?.allow).toEqual(["read"]);

    const loud: ExpertProfileResolver = async () => {
      throw new Error("experts registry unavailable");
    };
    await expect(
      resolveWorkerProfile({ expertsOf: () => loud, parentAgentOptions: () => parentAgentOptions }, "coding"),
    ).rejects.toThrow("experts registry unavailable");
  });

  it("bug d14b0b6c：专家档案缺席（expert not found）→ generic 兜底档 + diag 留痕（fail-soft 不停环）", async () => {
    diagCalls.length = 0;
    // 官方宿主无 tech-writer 预设形态：resolver 抛「expert not found: tech-writer」
    const absent: ExpertProfileResolver = async () => {
      throw new Error("expert not found: tech-writer");
    };
    const profile = await resolveWorkerProfile(
      { expertsOf: () => absent, parentAgentOptions: () => parentAgentOptions, diag },
      "doc",
    );
    expect(profile.kind).toBe("generic");
    expect(profile.agentOptions).toEqual(parentAgentOptions);
    expect(diagCalls.some((c) => c.level === "info" && c.event === "worker-route" && c.message.includes("tech-writer"))).toBe(true);
    // resolver 包装形态（附提示行）同路降级——首行缺席键名保真
    const wrapped: ExpertProfileResolver = async () => {
      throw new Error("expert not found: tech-writer\n提示：映射值应为人格键（如 tech-writer）；可用专家经 list_experts 工具列出后自查");
    };
    diagCalls.length = 0;
    const profile2 = await resolveWorkerProfile(
      { expertsOf: () => wrapped, parentAgentOptions: () => parentAgentOptions, diag },
      "doc",
    );
    expect(profile2.kind).toBe("generic");
    expect(diagCalls[0]?.message).toContain("expert not found: tech-writer");
  });

  it("每次派发现查不缓存：缺席 → 途中装卸 → 现查生效（缓存即 RED）", async () => {
    let present = false;
    const resolver: ExpertProfileResolver = async () => ({ name: "analyst", personaMd: "# a", expertKey: "analyst" });
    const first = await resolveWorkerProfile({ expertsOf: () => (present ? resolver : undefined), parentAgentOptions: () => parentAgentOptions }, "doc");
    expect(first.kind).toBe("generic");
    present = true; // 派发中途装卸
    const second = await resolveWorkerProfile({ expertsOf: () => (present ? resolver : undefined), parentAgentOptions: () => parentAgentOptions }, "doc");
    expect(second.kind).toBe("expert");
  });
});
