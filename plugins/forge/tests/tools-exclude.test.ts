// forge patch office 排除件契约（1.37 预设级排除路线）：
//   ① preset-forge 子树 tool-exclude-office 行：行名 = 本包 tools-exclude 子路径导出
//      （preset 子树行导入基点 = profile 根——web/desktop bundle 档 @dsh-forge/forge
//      均已安装可解析）；
//   ② deny 名单 = OFFICE_TOOL_DENY_CANDIDATES 正本同序全族（patch yaml 字面列表 ↔
//      常量契约——漂移即红）；
//   ③ 顶层行数不受影响（exclude 行在 preset 子树内，不进六插行面）。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFICE_TOOL_DENY_CANDIDATES } from "../host/tools-exclude.js";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchYaml = readFileSync(join(FORGE_ROOT, "cordis.patch.yml"), "utf8");
const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
  version?: string;
  exports?: Record<string, unknown>;
};

describe("preset-forge office 排除件契约", () => {
  it("tool-exclude-office 行挂本包 tools-exclude 子路径导出（exports 声明在场——裸名解析正门）", () => {
    expect(patchYaml).toContain("- id: tool-exclude-office");
    expect(patchYaml).toContain("name: '@dsh-forge/forge/tools-exclude'");
    expect(pkg.exports?.["./tools-exclude"]).toBeDefined();
  });

  it("deny 名单 = OFFICE_TOOL_DENY_CANDIDATES 正本同序全族（13 名 office 全族）", () => {
    const denyBlock = patchYaml.match(/- id: tool-exclude-office[\s\S]*$/)?.[0] ?? "";
    const denyNames = denyBlock.match(/^ {16}- (\S+)\s*$/gm)?.map((l) => l.trim().slice(2)) ?? [];
    expect(denyNames).toEqual([...OFFICE_TOOL_DENY_CANDIDATES]);
    expect(OFFICE_TOOL_DENY_CANDIDATES).toHaveLength(13);
  });

  it("exclude 行在 preset 子树内（不进顶层六插行面——行序 pin 面不受扰）", () => {
    const topLevel = patchYaml.split("\n").filter((l) => /^ {0,4}- id:/.test(l)).map((l) => l.replace(/^ {0,4}- id:\s*/, ""));
    expect(topLevel.filter((id) => id === "tool-exclude-office")).toEqual([]);
    expect(topLevel).toContain("preset-forge");
  });
});
