// tools-exclude 子路径导出契约（1.37 路线遗留面——patch exclude 行已全通道退役，
// bug bfd37960 判例：preset 级排除 bundle 通道不可交付；ts 源码与 exports 声明保留，
// 名单常量契约守卫漂移）：
//   ① exports["./tools-exclude"] 子路径导出在场（裸名解析正门形态不拆除）；
//   ② OFFICE_TOOL_DENY_CANDIDATES 名单常量契约（13 名 office 全族）。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFICE_TOOL_DENY_CANDIDATES } from "../host/tools-exclude.js";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
  version?: string;
  exports?: Record<string, unknown>;
};

describe("tools-exclude 子路径导出契约（patch exclude 行退役后遗留面）", () => {
  it("exports ./tools-exclude 声明在场（裸名解析正门形态保留）", () => {
    expect(pkg.exports?.["./tools-exclude"]).toBeDefined();
  });

  it("OFFICE_TOOL_DENY_CANDIDATES 名单常量契约（13 名 office 全族——常量漂移即红）", () => {
    expect(OFFICE_TOOL_DENY_CANDIDATES).toHaveLength(13);
    expect(OFFICE_TOOL_DENY_CANDIDATES[0]).toBe("office_template");
    expect(OFFICE_TOOL_DENY_CANDIDATES.at(-1)).toBe("pptd_write_file");
  });

  it("正本 patch 零 exclude 行（exclude 行全通道退役——bug bfd37960）", () => {
    const patchYaml = readFileSync(join(FORGE_ROOT, "cordis.patch.yml"), "utf8");
    expect(patchYaml).not.toMatch(/- id: tool-exclude-office/m);
  });
});
