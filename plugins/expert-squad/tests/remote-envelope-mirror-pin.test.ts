// remote-envelope 镜像 pin（lib-util 正本 ⇄ expert-squad ui 内联副本逐字等价守卫）：
// client bundle 零 node 依赖约束下，信封解包以「lib 正本 + ui 逐字内联副本」双落位
// 存续（ui/panel/remote-envelope.ts 头注判例——lib-util 主入口图含 node:fs/crypto 面，
// esbuild browser 构建不可达）。双副本无本 pin 即静默漂移——本测试锁正本体逐字等价，
// 任一侧改动必须双侧同批落（改行为 = 双侧同改 + 本测试红绿翻转；改注释 = 头注区不计）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CANONICAL = join(repoRoot, "lib", "util", "src", "remote-envelope.ts");
const MIRROR = join(repoRoot, "plugins", "expert-squad", "ui", "panel", "remote-envelope.ts");

/** 头注剥离（首个 `/** unknown` 分隔线起 = 正本体；头注区各侧自述，不参与等价判定）。 */
function canonicalBodyOf(source: string): string {
  const marker = "/** unknown → 对象窄化";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`mirror pin: 正本体分隔线缺失（${marker}）`);
  return source.slice(start).trimEnd();
}

describe("remote-envelope 镜像 pin（lib-util 正本 ⇄ ui 内联副本逐字等价）", () => {
  it("正本体（asRecord + remoteValueOf）逐字等价——单侧漂移即本测试红", () => {
    const canonical = canonicalBodyOf(readFileSync(CANONICAL, "utf8"));
    const mirror = canonicalBodyOf(readFileSync(MIRROR, "utf8"));
    expect(mirror).toBe(canonical);
  });

  it("正本在 lib-util 单源出口在场（host 半消费锚）", () => {
    const index = readFileSync(join(repoRoot, "lib", "util", "src", "index.ts"), "utf8");
    expect(index).toContain("export { remoteValueOf } from");
  });
});
