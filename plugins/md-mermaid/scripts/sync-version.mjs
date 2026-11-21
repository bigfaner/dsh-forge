// 版本单源回填（F3/N6——MD_MERMAID_WEB_VERSION 0.1.0 vs package.json 0.3.0 双真相源收敛）：
// ui/index.ts 源中 MD_MERMAID_WEB_VERSION 为占位字面量 '__MD_MERMAID_WEB_VERSION__'，
// 本脚本在构建链（tsc -b 之后、bundle 之前）以 package.json version 回填 dist/ui 运行期面
// ——版本唯一事实源 = package.json，手改占位字面量即漂移（tests/client-bundle-dom pin 守卫）。
// Run once per build；run-once, no watch。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLACEHOLDER = "'__MD_MERMAID_WEB_VERSION__'";
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

let patched = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".js")) {
      const code = readFileSync(p, "utf8");
      if (!code.includes(PLACEHOLDER)) continue;
      writeFileSync(p, code.split(PLACEHOLDER).join(JSON.stringify(pkg.version)));
      patched++;
    }
  }
};
walk(resolve(pkgDir, "dist/ui"));

if (patched === 0) {
  console.error("[sync-version] 回填失败：dist/ui 零占位字面量命中——ui/index.ts 占位面漂移或 dist 缺 ui 产物");
  process.exit(1);
}
console.log(`[sync-version] 版本单源回填通过（${patched} 文件 → ${pkg.version}）`);
