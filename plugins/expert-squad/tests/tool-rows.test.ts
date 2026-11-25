// tool-rows —— 专家 preset 模型工具行常量守卫：行集逐项对齐官方 web-app standard 预设
// 现行写法（name + config + 平台条件）。官方预设改了而常量未跟 → 本面红（漏跟的后果是
// 专家少工具/配置漂移——软失败但须可见）。
// 上游正本：deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml。
// 正本不可达（非本机开发环境）→ skip（不在 CI 强依赖外部仓路径）。

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPERT_TOOL_ROWS } from "../host/tool-rows.js";

const UPSTREAM = process.env.DSH_UPSTREAM_PRESET ?? "Z:/project/github/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml";

/** 从官方预设 YAML 抽取一个工具行的声明（name 行 → 到下一 id 行前的 config/disabled 文本块）。 */
function upstreamRowOf(text: string, packageName: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => line.includes(`'${packageName}'`) || line.includes(`"${packageName}"`));
  if (at < 0) return undefined;
  const block: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(-\s*)?id:/.test(line) || /name:\s*'@deepseek-ai\//.test(line)) break;
    if (line.trim()) block.push(line.trim());
  }
  return block.join("\n");
}

describe.skipIf(!existsSync(UPSTREAM))("EXPERT_TOOL_ROWS ↔ 官方 standard 预设对齐", () => {
  const upstream = readFileSync(UPSTREAM, "utf8");

  it.each(EXPERT_TOOL_ROWS.map((row) => [row.id!, row]))("%s 行在官方预设在场且 config 逐键一致", (_id, row) => {
    const block = upstreamRowOf(upstream, row.name);
    expect(typeof block, `官方预设无 ${row.name} 行——行常量漂移`).toBe("string");
    for (const [key, value] of Object.entries((row.config as Record<string, unknown> | undefined) ?? {})) {
      expect(block).toContain(`${key}: ${JSON.stringify(value)}`);
    }
    if (Object.keys(row.config ?? {}).length === 0) expect(block).not.toContain("config:");
  });

  it("shell 行平台条件互斥（bash@非 win32 / pwsh@win32）——与官方 disabled 表达式同向", () => {
    const bash = EXPERT_TOOL_ROWS.find((row) => row.name.endsWith("dsh-tool-bash"));
    const pwsh = EXPERT_TOOL_ROWS.find((row) => row.name.endsWith("dsh-tool-pwsh"));
    expect(bash?.name).toBe("@deepseek-ai/dsh-tool-bash");
    expect(pwsh?.name).toBe("@deepseek-ai/dsh-tool-pwsh");
    expect(bash!.disabled).toBe(process.platform === "win32");
    expect(pwsh!.disabled).toBe(process.platform !== "win32");
    expect(upstreamRowOf(upstream, bash!.name)).toContain("process.platform === 'win32'");
    expect(upstreamRowOf(upstream, pwsh!.name)).toContain("process.platform !== 'win32'");
  });

  it("行 id 在集合内唯一（preset 子树行 id 撞名 = 挂载失败）", () => {
    const ids = EXPERT_TOOL_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
