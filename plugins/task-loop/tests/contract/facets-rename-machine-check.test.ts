// facets 更名零残留机检（plugin-spec/1.6——runtime_surface/runtime_face 退役，全链 facets）：
// plugins/task-loop 源码树（host/ shared/ ui/）禁止功能性引用两旧名；豁免 =
// 入参 fail-loud 指认面（host/tools/submit-task.ts 旧名检测行）——其余出现即 RED。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HOST_DIR = fileURLToPath(new URL("../../host", import.meta.url));

/** 递归收集 .ts 文件（零三方依赖——目录规模小）。 */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** 豁免面：旧名 fail-loud 指认检测行（语义 = 识别旧名并拒认指新参，非功能性引用）。 */
const ALLOWED_SUBSTRINGS = [
  'a["runtime_surface"] !== undefined',
  'a["runtime_face"] !== undefined',
  "? \"runtime_surface\"",
  "? \"runtime_face\"",
  "`${renamed} was renamed to facets",
];

describe("facets 更名零残留机检（task-loop host 树）", () => {
  it("host/ shared/ 树零 runtime_surface/runtime_face 功能性引用（豁免 fail-loud 指认行）", () => {
    const offenders: string[] = [];
    for (const file of tsFiles(HOST_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (!/runtime_surface|runtime_face/.test(line)) continue;
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue; // 注释/退役说明豁免
        if (ALLOWED_SUBSTRINGS.some((s) => line.includes(s))) continue;
        offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
