// deep 退役结构 pin 双断言组（forge-aggregate-bundle 1.7——提案 §三删除清单 + §四.4）：
//   ① deep 清单路径不存在断言：deep-build.mjs / typert-seam.ts / 五个 deep 专属测试 /
//      experts/ 副本 / dist-deep/ 产物 / .gitignore 条目 / package-release deep 分支
//      ——任一回流即红（git 历史即封存，结构面零回潮）；
//   ② freshness 门在打包链生效断言（归属守卫 + 门禁功能）：freshness 模块在位、
//      package-release assembleRelease 入口前置 runFreshnessGate、aggregate-assets
//      入口前置代际守卫 + 自动编译/代际双校验语义在场 + 门禁功能反例红（合成包
//      代际标记漂移即 fail）。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generationViolations, runFreshnessGate, SKIP_REBUILD_ENV } from "../../plugins/forge/scripts/freshness.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_ROOT = join(REPO_ROOT, "plugins", "forge");
const pkgReleaseSrc = readFileSync(join(REPO_ROOT, "scripts", "package-release.mjs"), "utf8");
const aggregateSrc = readFileSync(join(FORGE_ROOT, "scripts", "aggregate-assets.mjs"), "utf8");
const freshnessSrc = readFileSync(join(FORGE_ROOT, "scripts", "freshness.mjs"), "utf8");
const gitignoreSrc = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");

describe("结构 pin ①——deep 退役删除清单路径不存在", () => {
  const ABSENT_PATHS = [
    "plugins/forge/scripts/deep-build.mjs",
    "plugins/forge/host/typert-seam.ts",
    "plugins/forge/tests/typert-seam.test.ts",
    "plugins/forge/tests/compose.test.ts",
    "tests/forge/client-merge.test.ts",
    "tests/forge/deep-artifact.test.ts",
    "tests/forge/asset-aggregation.test.ts",
    "plugins/forge/experts",
    "plugins/forge/dist-deep",
  ];
  for (const rel of ABSENT_PATHS) {
    it(`退役路径不存在：${rel}`, () => {
      expect(() => readFileSync(join(REPO_ROOT, rel), "utf8")).toThrow();
    });
  }

  it(".gitignore 零 deep/experts 生成物条目（experts/ 与 dist-deep/ 条目随删除清退役）", () => {
    expect(gitignoreSrc).not.toContain("plugins/forge/experts/");
    expect(gitignoreSrc).not.toContain("plugins/forge/dist-deep/");
    expect(gitignoreSrc).not.toContain("deep-build");
  });

  it("package-release 零 deep 分支残留（buildDeepVariant/channels.deep/deep 变体/--no-deep/deep-build 调用全退役）", () => {
    expect(pkgReleaseSrc).not.toMatch(/buildDeepVariant|forge-deep|channels\.deep|no-deep|DEEP_REL|deep: true|deep \? |join\([^)]*deep-build/);
  });

  it("freshness 逻辑不再残留退役宿主（deep-build.mjs 缺席即深源断绝——①已断言，此处断言迁移面唯一）", () => {
    // 迁移唯一宿主 = freshness.mjs；打包链只经模块引用消费，不内联复制门禁语义
    expect(pkgReleaseSrc.match(/runFreshnessGate/g)?.length).toBe(2); // import + 调用
    expect(aggregateSrc.match(/generationViolations/g)?.length).toBe(2); // import + 调用
  });
});

describe("结构 pin ②——freshness 门在 bundle 打包链生效（归属守卫 + 功能反例红）", () => {
  it("归属守卫：assembleRelease 入口前置 runFreshnessGate（freshness:true 默认——出树前自动编译）", () => {
    const assembleIdx = pkgReleaseSrc.indexOf("export function assembleRelease");
    expect(assembleIdx, "assembleRelease 定义缺席").toBeGreaterThan(-1);
    const gateIdx = pkgReleaseSrc.indexOf("if (freshness) runFreshnessGate(", assembleIdx);
    expect(gateIdx, "assembleRelease 入口缺 runFreshnessGate 前置").toBeGreaterThan(-1);
    const rebuildIdx = pkgReleaseSrc.indexOf("rmSync(outDir", assembleIdx);
    expect(rebuildIdx, "outDir 重建先于 freshness 门——前置失位").toBeGreaterThan(gateIdx);
  });

  it("归属守卫：aggregate-assets 入口前置代际守卫（fail-loud exit(1)——dist 陈旧不产 patch）", () => {
    const gateIdx = aggregateSrc.indexOf("generationDrift");
    const selfCheckIdx = aggregateSrc.indexOf("selfCheck(");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(aggregateSrc).toContain("process.exit(1)");
    expect(selfCheckIdx).toBeGreaterThan(gateIdx);
  });

  it("freshness 模块语义在场：run-once 自动编译 + 代际标记双校验 + skip flag 只跳编译不跳校验", () => {
    expect(freshnessSrc).toContain("spawnSync(\"pnpm\", [\"-C\"");
    expect(freshnessSrc).toContain("@dsh-forge-generation");
    expect(freshnessSrc).toContain("dist/client.js");
    expect(freshnessSrc).toContain("dist/host/index.js");
    expect(freshnessSrc).toContain('process.env[SKIP_REBUILD_ENV] === "1"');
    expect(freshnessSrc).not.toMatch(/--watch/);
  });

  describe("门禁功能（合成包反例红/正例绿——freshness 门真实生效）", () => {
    let fixtureRoot
    beforeEach(() => {
      fixtureRoot = mkdtempSync(join(tmpdir(), "dshf-freshness-"))
      mkdirSync(join(fixtureRoot, "plugins", "alpha", "dist", "host"), { recursive: true })
    })
    afterEach(() => {
      rmSync(fixtureRoot, { recursive: true, force: true })
    })

    function writeAlphaPackage(markerVersion) {
      const dir = join(fixtureRoot, "plugins", "alpha")
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@dsh-forge/alpha", version: "1.2.3" }, null, 2))
      writeFileSync(join(dir, "dist", "client.js"), `/* @dsh-forge-generation:@dsh-forge/alpha@${markerVersion}*/\nexport const x = 1\n`)
      writeFileSync(join(dir, "dist", "host", "index.js"), "export const h = 1\n")
      return dir
    }

    it("正例：代际标记 == 源 version → 代际双校验零违规", () => {
      const dir = writeAlphaPackage("1.2.3")
      expect(generationViolations("@dsh-forge/alpha", dir)).toEqual([])
    })

    it("反例·代际标记漂移：校验红（陈旧 dist 不放行）", () => {
      const dir = writeAlphaPackage("1.2.2")
      expect(generationViolations("@dsh-forge/alpha", dir)[0]).toContain("代际校验失败")
    })

    it("反例·dist/client.js 缺席：校验红", () => {
      const dir = writeAlphaPackage("1.2.3")
      rmSync(join(dir, "dist", "client.js"))
      expect(generationViolations("@dsh-forge/alpha", dir)[0]).toContain("dist/client.js 缺席")
    })

    it("runFreshnessGate 端到端：代际漂移 → gate fail-loud throw（skip flag 下代际校验仍强制）", () => {
      writeAlphaPackage("0.0.9")
      const prev = process.env[SKIP_REBUILD_ENV]
      process.env[SKIP_REBUILD_ENV] = "1"
      try {
        expect(() =>
          runFreshnessGate({ repoRoot: fixtureRoot, forgeDir: join(fixtureRoot, "plugins", "alpha"), members: ["@dsh-forge/alpha"], log: () => {} }),
        ).toThrow(/freshness 门 fail/);
      } finally {
        if (prev === undefined) delete process.env[SKIP_REBUILD_ENV]
        else process.env[SKIP_REBUILD_ENV] = prev
      }
    })
  })
});
