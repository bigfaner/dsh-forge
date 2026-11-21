// console 豁免面机械 pin（F4）——client 束入口面（ui/client.ts）零新增直落 console：
// 豁免面由 pin 守卫非注释约定（docs/conventions/diagnostic-emit-discipline.md——client
// 束豁免只允许 [dsh-forge/md-mermaid] 前缀 console.error 诊断发射）。扫入口源面而非
// dist/client.js——mermaid vendor 内联体自带大量 console 调用，产物级扫描恒假阳。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientSrc = readFileSync(resolve(pkgDir, "ui/client.ts"), "utf8");

describe("console 豁免面 pin（client 束入口源面）", () => {
  it("每处 console 调用均为 [dsh-forge/md-mermaid] 前缀 console.error 诊断发射（零其它直落）", () => {
    const sites = [...clientSrc.matchAll(/console\s*\.\s*(log|warn|error|info|debug|trace)\s*\(/g)];
    expect(sites.length, "client 束豁免面诊断发射应在场").toBeGreaterThan(0);
    for (const site of sites) {
      const line = clientSrc.slice(0, site.index).split("\n").length;
      const method = site[1];
      const tail = clientSrc.slice((site.index ?? 0) + site[0].length);
      const exempt = method === "error" && /^\s*['"`]\[dsh-forge\/md-mermaid\]/.test(tail);
      expect(
        exempt,
        `ui/client.ts:${line} 直落 console.${method} 非豁免面诊断形态（须 console.error + [dsh-forge/md-mermaid] 前缀字符串首参）`,
      ).toBe(true);
    }
  });
});
