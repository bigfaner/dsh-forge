import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 循环收口评审指示的专家在场探测缝装配回归锚（bug 31cc76f5——装配漏接家族，76224990
// 派发内核迁入时消费端随迁、装配注入行漏迁：driver 声明并消费 expertsPresent，生产装配
// 从未赋值 → P8 评审指示恒发 subagent 回落措辞，专家团在场亦不可达）。
// 行为锚：三评审键逐键 get 探测、缺席/禁用即 false、每次调用现查不缓存。
// 源码锚：createLoopDriver 调用传入 expertsPresent（行为锚放走过本 bug，不单独承担接线正确性）。
import { LOOP_REVIEW_EXPERT_KEYS } from "../../host/loop/injection.js";
import { reviewExpertsPresent } from "../../host/assembly/tool-family.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function expertsStub(available: ReadonlySet<string>): { get: (key: string) => unknown; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get: (key: string) => {
      calls.push(key);
      if (!available.has(key)) throw new Error(`expert not found: ${key}`);
      return { name: key, personaMd: "x" };
    },
  };
}

describe("reviewExpertsPresent 行为锚（三评审键在场探测）", () => {
  it("experts 面缺席 / 劣形 = false", () => {
    expect(reviewExpertsPresent({})).toBe(false);
    expect(reviewExpertsPresent({ experts: {} })).toBe(false);
    expect(reviewExpertsPresent({ experts: { get: () => { throw new Error("boom"); } } })).toBe(false);
  });

  it("三评审键齐备 = true，且逐键探测（检测集 = LOOP_REVIEW_EXPERT_KEYS）", () => {
    const experts = expertsStub(new Set(LOOP_REVIEW_EXPERT_KEYS));
    expect(reviewExpertsPresent({ experts })).toBe(true);
    expect([...experts.calls].sort()).toEqual([...LOOP_REVIEW_EXPERT_KEYS].sort());
  });

  it("任一评审键缺席/禁用 = false", () => {
    for (const missing of LOOP_REVIEW_EXPERT_KEYS) {
      const rest = LOOP_REVIEW_EXPERT_KEYS.filter((k) => k !== missing);
      expect(reviewExpertsPresent({ experts: expertsStub(new Set(rest)) }), `${missing} 缺席`).toBe(false);
    }
  });

  it("每次调用现查不缓存（AGENTS 1.6）——在场性随服务状态变化", () => {
    let available = new Set<string>(LOOP_REVIEW_EXPERT_KEYS);
    const ctx = { experts: { get: (key: string) => { if (!available.has(key)) throw new Error(key); return { name: key, personaMd: "x" }; } } };
    expect(reviewExpertsPresent(ctx)).toBe(true);
    available = new Set();
    expect(reviewExpertsPresent(ctx)).toBe(false);
    available = new Set<string>(LOOP_REVIEW_EXPERT_KEYS);
    expect(reviewExpertsPresent(ctx)).toBe(true);
  });
});

describe("装配源码锚（bug 31cc76f5）", () => {
  it("tool-family 装配 createLoopDriver 时传 expertsPresent", () => {
    const src = readFileSync(resolve(pkgDir, "host/assembly/tool-family.ts"), "utf8");
    const call = src.slice(src.indexOf("createLoopDriver({"));
    expect(call.slice(0, call.indexOf("});")).includes("expertsPresent")).toBe(true);
    // 探测取法单源：tool-family 内 reviewExpertsPresent 经 expertsFaceOf 取面（与 worker 路由档案同源）
    expect(src).toMatch(/const experts = expertsFaceOf\(input\.ctx\)/);
  });
});
