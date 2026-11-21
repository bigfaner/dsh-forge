// forge 资产/工件聚合契约（forge-deep-pack 1.6；1.14 返工——skills 改构建期物化进
// dist/skills/<member>/ 生成物不进 git，experts 落包根 .gitignore 同等地位。三面聚合
// 回归清单，层序 e2e 前置层）：
//   ① typert 手工缝（P0 #3）：装载期三件工件 import 面 + manifest 所有权静态守卫；
//   ② skills 处方 C（P0 #5）：五件聚合 forge/dist/skills/<member>/（构建生成物）
//      文件集同源 + patch customSkillDirs 五条全自锚（跨包锚三硬前提根除——缺席包
//      MODULE_NOT_FOUND 无 fail-soft / ./package.json 出口缺失 / 层序覆盖脆弱）
//      + package.json 出口/files；
//   ③ experts 布局同构重定位（P0 #4）：聚合至 forge 包根（生成物不进 git——
//      scan.ts ../../experts/ 锚定约束不可挪 dist），dist/host → ../../experts/
//      层级同构使 expert-squad 原 import.meta.url 表达式零改写成立 + 构建闭包守卫
//      （断言无下游内联五件 host 入口时 experts 同构在位——漂移 = ENOENT 静默空返回）。
// 真机层（skills 可发现可调 / typert RPC 往返）归 e2e 旅程（deep-tgz-install-full-chain
// / typert-rpc-roundtrip）——本文件为仓内契约层，逐项锚定生成脚本产物不漂移。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { FORGE_PKG_SPECIFIER, SKILL_MEMBER_DIRS, skillDirSelfAnchorExpr } from "../../plugins/forge/host/assembly.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_ROOT = join(REPO_ROOT, "plugins", "forge");

/** 递归枚举相对文件集。 */
function walkRel(dir: string, root = dir): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRel(full, root));
    else out.push(resolve(full).slice(resolve(root).length + 1).replaceAll("\\", "/"));
  }
  return out.sort();
}

const patchYaml = readFileSync(join(FORGE_ROOT, "cordis.patch.yml"), "utf8");

/** 抽取 customSkillDirs 列表项（!!js 表达式——指定缩进的 '- ' 行）。 */
function skillDirEntries(indent: string): string[] {
  const lines = patchYaml.split("\n");
  const out: string[] = [];
  let collecting = false;
  for (const line of lines) {
    if (line === `${indent}customSkillDirs:`) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (line.startsWith(`${indent}  - !!js `)) out.push(line.slice(`${indent}  - !!js `.length));
      else collecting = false;
    }
  }
  return out;
}

describe("skills 处方 C：五件聚合 forge/dist/skills/<member>/（P0 #5；1.14 构建期物化）", () => {
  it("聚合体文件集 = 五件源包 skills/ 文件集逐件全等（.gitkeep 占位除外——构建生成物不漂移）", () => {
    for (const member of SKILL_MEMBER_DIRS) {
      const src = walkRel(join(REPO_ROOT, "plugins", member, "skills")).filter((f) => f !== ".gitkeep");
      const dest = walkRel(join(FORGE_ROOT, "dist", "skills", member)).filter((f) => f !== ".gitkeep");
      expect(dest, `dist/skills/${member} 聚合漂移——重跑 plugins/forge/scripts/aggregate-assets.mjs（build 链末步）`).toEqual(src);
    }
  });

  it("skills 可发现性前置层：每件含技能的聚合目录逐目录 SKILL.md 在场（skill-filesystem 扫描形状）", () => {
    let skillCount = 0;
    for (const member of SKILL_MEMBER_DIRS) {
      const memberRoot = join(FORGE_ROOT, "dist", "skills", member);
      for (const name of readdirSync(memberRoot)) {
        const dir = join(memberRoot, name);
        if (!statSync(dir).isDirectory()) continue;
        expect(existsSync(join(dir, "SKILL.md")), `skills/${member}/${name} 缺 SKILL.md`).toBe(true);
        skillCount += 1;
      }
    }
    expect(skillCount).toBeGreaterThanOrEqual(9); // spec 4 + task-loop 3 + knowledge 2 + expert-squad 1（project 占位）
  });

  it("顶层 skill-filesystem 行 customSkillDirs 恰五条全自锚（逐字符 = assembly 单源——漂移红）", () => {
    expect(skillDirEntries("    ")).toEqual(SKILL_MEMBER_DIRS.map((m) => skillDirSelfAnchorExpr(m)));
  });

  it("preset-standard 嵌套行 customSkillDirs = 官方 dsh-agent-preset 锚 + 五条全自锚（五件跨包锚根除——deep tgz 档五件包不可解析）", () => {
    const entries = skillDirEntries("          ");
    expect(entries).toHaveLength(6);
    expect(entries[0]).toContain("resolve('@deepseek-ai/dsh-agent-preset/package.json')");
    expect(entries.slice(1)).toEqual(SKILL_MEMBER_DIRS.map((m) => skillDirSelfAnchorExpr(m)));
  });

  it("三硬前提根除：patch 全文零五件跨包锚（缺席包 MODULE_NOT_FOUND 无 fail-soft——只依赖 forge 自己，三档通吃）", () => {
    for (const member of SKILL_MEMBER_DIRS) {
      expect(patchYaml, `跨包锚回流：${member}`).not.toContain(`resolve('@dsh-forge/${member}/package.json')`);
    }
  });

  it("package.json 出口/files 补口：./package.json 出口（自锚 resolve 面）+ files 含 experts、零 skills 键（skills 随 dist 分发——1.14 返工）", () => {
    const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
      exports?: Record<string, string>;
      files?: string[];
    };
    expect(pkg.exports?.["./package.json"]).toBe("./package.json");
    expect(pkg.files).not.toContain("skills");
    expect(pkg.files).toContain("experts");
    expect(FORGE_PKG_SPECIFIER).toBe("@dsh-forge/forge");
  });
});

describe("experts 布局同构重定位（P0 #4；1.14 返工——生成物 .gitignore 不进 git）", () => {
  it("experts 聚合至 forge 包根：文件集 = expert-squad/experts 全等（构建生成物不漂移）", () => {
    const src = walkRel(join(REPO_ROOT, "plugins", "expert-squad", "experts"));
    const dest = walkRel(join(FORGE_ROOT, "experts"));
    expect(dest).toEqual(src);
    expect(dest.length).toBeGreaterThanOrEqual(2);
  });

  it("层级同构：dist/host → ../../experts/ 恰落 forge 包根 experts/（expert-squad 原 import.meta.url 表达式零改写成立）", () => {
    const inlinedModuleUrl = pathToFileURL(join(FORGE_ROOT, "dist", "host", "index.js")).href;
    const resolved = fileURLToPath(new URL("../../experts/", inlinedModuleUrl));
    expect(resolve(resolved)).toBe(resolve(join(FORGE_ROOT, "experts")));
    expect(existsSync(resolved)).toBe(true);
  });

  it("构建闭包守卫：dist/host 零下游内联五件 host 入口痕迹（external 档现状）；内联档出现 ../../experts/ 字面量时 experts 同构必须已在位（漂移 = ENOENT 静默空返回）", () => {
    const distHost = join(FORGE_ROOT, "dist", "host");
    if (!existsSync(distHost)) return; // dist 缺席 = 未构建（守卫主体在 aggregate-assets.mjs 构建末尾自跑）
    let inlineHit = false;
    for (const name of readdirSync(distHost)) {
      if (!name.endsWith(".js")) continue;
      const text = readFileSync(join(distHost, name), "utf8");
      if (text.includes('"../../experts/"') || text.includes("'../../experts/'")) inlineHit = true;
    }
    if (inlineHit) {
      expect(existsSync(join(FORGE_ROOT, "experts")), "内联档 experts 同构缺席——P0 #4 漂移回归").toBe(true);
    } else {
      // external 档现状断言：五件 host 入口以裸说明符引用（宿主 node_modules 解析）。
      const index = readFileSync(join(distHost, "index.js"), "utf8");
      expect(index).toContain('@dsh-forge/expert-squad');
    }
  });
});

describe("typert 手工缝装载期 import 面（P0 #3——静态守卫，行为单测归 plugins/forge/tests/typert-seam.test.ts）", () => {
  const seamSrc = readFileSync(join(FORGE_ROOT, "host", "typert-seam.ts"), "utf8");

  it("装载期静态 import 三件工件在前（project/spec/task-loop——字面量静态 import 是 external/inline 双档通吃唯一形态；lib-diag 诊断面随行）", () => {
    const imports = [...seamSrc.matchAll(/import\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(imports.slice(0, 3)).toEqual([
      "@dsh-forge/project/typert",
      "@dsh-forge/spec/typert",
      "@dsh-forge/task-loop/typert",
    ]);
    expect(imports[3]).toBe("@dsh-forge/lib-diag");
  });

  it("manifest 所有权静态守卫：零再导出/零改造（forge 只注册——所有权门拦截再导出，唯一正门 = register）", () => {
    expect(seamSrc).not.toMatch(/export\s+(?:const|let|var)\s+TYPERT\b/);
    expect(seamSrc).not.toMatch(/export\s*\{[^}]*\bTYPERT\b/);
    expect(seamSrc).toContain("register(manifest)");
    for (const member of ["project", "spec", "task-loop"]) {
      const artifact = readFileSync(join(REPO_ROOT, "plugins", member, "dist", "typert.host.js"), "utf8");
      expect(artifact, `${member} 工件 manifest 所有权漂移`).toContain(`package: '@dsh-forge/${member}'`);
    }
  });
});
