// forge 边界门机检（forge-deep-pack 1.3 骨架批随提案 §三改写：纯声明守卫 → 静态四查
// + 声明面守卫）。阶段一最小化：包面 = 组合 + 派发 + 合并 client + 打包，零占位空模块
// （read/orchestrate/shared 归 forge-workbench 期按需增目录）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 递归枚举包内文件（排除 node_modules 与 tests/——边界门对象 = 源码与声明面）。
 * dist/ 生成物子树不在枚举面。 */
function listSourceFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "skills" || entry === "experts") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (relative(resolve(root), resolve(full)) === "tests") continue;
      out.push(...listSourceFiles(full, root));
    } else {
      out.push(relative(resolve(root), resolve(full)).replaceAll("\\", "/"));
    }
  }
  return out.sort();
}

const sourceFiles = listSourceFiles(FORGE_ROOT);
const readText = (f: string) => readFileSync(join(FORGE_ROOT, f), "utf8");
const texts = new Map(sourceFiles.map((f) => [f, readText(f)]));

describe("forge 边界门（静态四查 / 阶段一最小化包面）", () => {
  it("包内容面恰十五件骨架工件（声明面 + 双 tsconfig + 六脚本（含 freshness 门）+ host 薄 apply/派发单源/tools-exclude 遗留面 + ui 入口——零 read/orchestrate/shared 占位目录；skills/experts 资产子树另行守卫）", () => {
    expect(sourceFiles).toEqual([
      "README.md",
      "cordis.patch.yml",
      "host/assembly.ts",
      "host/index.ts",
      "host/tools-exclude.ts",
      "package.json",
      "scripts/bundle-client.mjs",
      "scripts/bundle-host.mjs",
      "scripts/clean-dist.mjs",
      "scripts/freshness.mjs",
      "scripts/self-containment.mjs",
      "tsconfig.client.json",
      "tsconfig.host.json",
      "tsconfig.json",
      "ui/index.ts",
    ]);
  });

  it("四查① import 白名单：host/ui 源码 import 仅允许五件名（含 /client 子出口——插行激活下五件 client 半侧自注册）/lib-diag/cordis/相对/node:（禁 db、禁其它跨插件 import）", () => {
    const ALLOWED = [
      /^@dsh-forge\/(?:project|spec|task-loop|expert-squad|knowledge)(?:\/(?:client|typert))?$/,
      /^@dsh-forge\/lib-diag$/,
      /^@deepseek-ai\/cordis$/,
      /^\./,
      /^node:/,
    ];
    for (const file of sourceFiles.filter((f) => /^(?:host|ui)\//.test(f))) {
      const text = texts.get(file)!;
      for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*|\bimport\(\s*)["']([^"']+)["']/g)) {
        const spec = match[1]!;
        expect(
          ALLOWED.some((re) => re.test(spec)),
          `${file} 出现白名单外 import："${spec}"`,
        ).toBe(true);
      }
      expect(text, `${file} 出现 better-sqlite3 依赖痕迹`).not.toMatch(/better-sqlite3/);
    }
  });

  it("四查② ctx.reflect.get 静态禁令 + 豁免落款（默认配方 = 类型化 import + 在场性现查——AGENTS §1.6；豁免落款点 = host/index.ts 在场守卫 isMemberActive（提案评审 N3/N4 + P0 #7）+ host/index.ts registerBuiltinExpertsRoot（builtin-redistribution：experts 可选服务无类型化消费面，现查 + 零 memoize 三铁律逐条满足））", () => {
    // 豁免落款（唯一文件）：host/index.ts。名单外任一出现即红。
    const REFLECT_EXEMPT = new Set(["host/index.ts"]);
    for (const file of sourceFiles.filter((f) => /\.(?:[cm]?[jt]sx?)$/.test(f))) {
      const text = texts.get(file)!;
      if (!REFLECT_EXEMPT.has(file)) {
        expect(text, `${file} 出现 ctx.reflect.get（非豁免落款点）`).not.toMatch(/reflect\s*\.\s*get\s*\(/);
      }
    }
    // 豁免点用量上界（防豁免面漫灌）：isMemberActive 守卫 + registerBuiltinExpertsRoot 注册现查。
    const guardHits = [...texts.get("host/index.ts")!.matchAll(/reflect\s*\?*\.\s*get\s*(?:\??\.\s*)?\(/g)].length;
    expect(guardHits, "host/index.ts reflect.get 现查点超豁免上界（恰 2 处——isMemberActive + registerBuiltinExpertsRoot）").toBe(2);
  });

  it("四查③④ 零 db 句柄 + host/ui 零文件系统写入（按目录禁写——dist 产物写面归 scripts/ 构建链）", () => {
    for (const file of sourceFiles.filter((f) => /^(?:host|ui)\//.test(f))) {
      const text = texts.get(file)!;
      expect(text, `${file} 出现 openDatabase 调用/导入`).not.toMatch(/\bopenDatabase\b/);
      expect(text, `${file} 出现 Database 句柄构造`).not.toMatch(/new\s+Database\s*\(/);
      expect(text, `${file} 出现 CREATE TABLE 建表语句`).not.toMatch(/CREATE\s+TABLE/i);
      expect(text, `${file} 出现 fs 写入面（writeFileSync/mkdir/rm）`).not.toMatch(/(?:writeFileSync|mkdirSync|rmSync|mkdtempSync)\s*\(/);
    }
  });
});

describe("forge 声明面守卫（package.json 骨架期全量）", () => {
  const pkg = JSON.parse(readText("package.json")) as {
    name?: string;
    version?: string;
    main?: string;
    types?: string;
    exports?: Record<string, Record<string, string>>;
    dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
    files?: string[];
    scripts?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  it("name/version/main/types：包名 @dsh-forge/forge + files 含 dist ⇒ version ≥ 0.2.0（minor 跳位机检 pin）+ 双链 main/types 指 dist/host", () => {
    expect(pkg.name).toBe("@dsh-forge/forge");
    expect(pkg.files).toContain("dist");
    const [major, minor, patch] = (pkg.version ?? "0.0.0").split(".").map(Number);
    expect(major! * 1_000_000 + minor! * 1_000 + patch!).toBeGreaterThanOrEqual(2_000);
    expect(pkg.main).toBe("./dist/host/index.js");
    expect(pkg.types).toBe("./dist/host/index.d.ts");
  });

  it("exports 恰四键（./package.json + . + ./client + ./tools-exclude 遗留面）且零 typert 工件键（圆桌共识 2——聚合方法长在五件，forge 纯消费；./package.json 出口 = skills 自锚 resolve 面——P0 #5 处方 C）", () => {
    expect(Object.keys(pkg.exports ?? {})).toEqual(["./package.json", "./tools-exclude", ".", "./client"]);
    expect(pkg.exports?.["./package.json"]).toBe("./package.json");
    expect(pkg.exports?.["."]).toEqual({
      types: "./dist/host/index.d.ts",
      import: "./dist/host/index.js",
    });
    expect(pkg.exports?.["./client"]).toEqual({
      types: "./dist/client/ui/index.d.ts",
      default: "./dist/client.js",
    });
    expect(Object.keys(pkg.exports ?? {}).some((k) => k.includes("typert"))).toBe(false);
  });

  it("dsh 声明：bundle.patch 单行自插指向 + client.platform web", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(pkg.dsh?.client?.platform).toBe("web");
  });

  it("files 三件（dist + cordis.patch.yml + experts/——builtin-redistribution：随包内置专家档案随产物分发；skills 随 dist 构建期物化不再单列）", () => {
    expect(pkg.files).toEqual(["dist", "cordis.patch.yml", "experts/"]);
  });

  it("scripts：build = clean-dist → tsc -b → bundle-host → bundle-client（run-once 禁 watch）+ prepack self-containment", () => {
    expect(pkg.scripts?.build).toBe(
      "node scripts/clean-dist.mjs && tsc -b && node scripts/bundle-host.mjs && node scripts/bundle-client.mjs",
    );
    expect(pkg.scripts?.prepack).toBe("node scripts/self-containment.mjs");
    for (const script of Object.values(pkg.scripts ?? {})) {
      expect(script, "SC2 watch 回流禁令").not.toMatch(/--watch/);
    }
  });

  it("依赖面：peerDeps cordis 4.1.0 + devDeps 限构建期内联 + dependencies 恰五件相对 file: 依赖", () => {
    expect(pkg.peerDependencies).toEqual({ "@deepseek-ai/cordis": "4.1.0" });
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual(
      ["@dsh-forge/lib-diag", "@types/node", "esbuild", "typescript"].sort(),
    );
    const deps = Object.keys(pkg.dependencies ?? {});
    expect([...deps].sort()).toEqual([
      "@dsh-forge/project",
      "@dsh-forge/spec",
      "@dsh-forge/task-loop",
      "@dsh-forge/expert-squad",
      "@dsh-forge/knowledge",
    ].sort());
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 须为相对 file: 声明`).toMatch(/^file:\.\.\//);
    }
  });
});
