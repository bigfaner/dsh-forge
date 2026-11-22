// task-loop 单装降级门（expert-builtin-redistribution t-ac11）：无 expert-squad 时
// ① 映射 17 键经 plugin 层 root 可扫描——registerRoot 缺席时直读不依赖（plugin-forge 式
//    node:fs 直读随包 experts/ 目录配方，结构与 tests/experts-coverage.test.ts 同构）；
// ② 专家缺席走通用 worker 兜底档——同 tests/dispatch/worker-route.test.ts 结算门既有
//    结构对照，不新造结构。
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXPERT_MAPPING } from "@dsh-forge/lib-api";
import { registerBuiltinExpertsRoot } from "../host/index.js";
import { FORGE_PACKAGE_NAME, resolveWorkerProfile } from "../host/faces.js";
import type { ForgeDiagEmitFace } from "../host/faces.js";

const expertsDir = fileURLToPath(new URL("../experts/", import.meta.url));

function frontmatterName(file: string): string | undefined {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const nameLine = match[1]!.match(/^name:\s*(\S+)\s*$/m);
  return nameLine?.[1];
}

describe("单装降级门：plugin 层 root 直读（registerRoot 缺席时直读不依赖）", () => {
  const mappingKeys = Object.values(DEFAULT_EXPERT_MAPPING);

  it("DEFAULT_EXPERT_MAPPING 17 键齐全（单源映射快照基数）", () => {
    expect(mappingKeys).toHaveLength(17);
    expect(new Set(mappingKeys).size).toBe(17);
  });

  it("registerRoot 在场：plugin 层 root 以随包 experts/ 目录 + 本包包名注册一次（root 可扫描锚）", () => {
    const calls: { dir: string; pluginName: string | undefined }[] = [];
    registerBuiltinExpertsRoot(
      {
        reflect: {
          get: (name: string) =>
            name !== "experts"
              ? undefined
              : {
                  registerRoot: (_ctx: unknown, dir: string, pluginName?: string) => {
                    calls.push({ dir, pluginName });
                  },
                },
        },
      },
      () => {},
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.pluginName).toBe(FORGE_PACKAGE_NAME);
    expect(calls[0]!.dir).toBe(expertsDir);
    expect(existsSync(calls[0]!.dir)).toBe(true);
  });

  it("registerRoot 缺席（experts 面整体缺席）：fail-soft warn 留痕不抛、零注册", () => {
    const lines: string[] = [];
    expect(() =>
      registerBuiltinExpertsRoot(
        { reflect: { get: () => undefined } },
        (line, level) => {
          lines.push(`${level}:${line}`);
        },
      ),
    ).not.toThrow();
    expect(lines.some((l) => l.startsWith("warn:") && l.includes("experts 服务缺席"))).toBe(true);
  });

  it("registerRoot 缺席时直读不依赖：随包 experts/ 目录逐键直读覆盖映射 17 键（单装无注册仍可扫描）", () => {
    expect(existsSync(expertsDir)).toBe(true);
    for (const key of mappingKeys) {
      const file = `${expertsDir}${key}.md`;
      expect(existsSync(file), `${key}.md 缺席（直读面断裂）`).toBe(true);
      expect(frontmatterName(file), `${key}.md frontmatter name 不等于人格键`).toBe(key);
    }
  });
});

describe("单装降级门：通用 worker 兜底（同结算门既有结构对照）", () => {
  const diagCalls: { level: string; event: string; message: string }[] = [];
  const diag: ForgeDiagEmitFace = (p) => diagCalls.push({ level: p.level, event: p.event, message: p.message });
  const parentAgentOptions = { provider: "deepseek", model: "reasoner" } as const;

  it("无 expert-squad（experts 缺席）→ generic 档：agentOptions 父会话继承 + diag info 留痕", async () => {
    diagCalls.length = 0;
    const profile = await resolveWorkerProfile(
      { expertsOf: () => undefined, parentAgentOptions: () => parentAgentOptions, diag },
      "refactor",
    );
    expect(profile.kind).toBe("generic");
    expect(profile.agentOptions).toEqual(parentAgentOptions);
    expect(diagCalls.some((c) => c.level === "info" && c.event === "worker-route" && c.message.includes("通用 worker 兜底档"))).toBe(true);
  });

  it("映射键有档案而 experts 服务缺席：仍走 generic 档（单装形态路由恒兜底——直读面不构成路由面）", async () => {
    diagCalls.length = 0;
    const profile = await resolveWorkerProfile(
      { expertsOf: () => undefined, parentAgentOptions: () => undefined, diag },
      "doc",
    );
    expect(profile.kind).toBe("generic");
    expect(profile.agentOptions).toBeUndefined();
  });
});
