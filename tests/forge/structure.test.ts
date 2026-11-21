// forge 骨架结构 pin（forge-deep-pack 1.8 汇总层；forge-aggregate-bundle 1.7 随 deep
// 退役改形——逐面正本归 plugins/forge/tests/ 三契约 + tests/forge/{derive-configs,
// deep-retirement-pin}.test.ts，本文件为结构速查 pin：三目录 / exports 双键 /
// 零 typert 工件键 / files 与版本规则 / 静态四查汇总——任一漂移即红，防骨架面静默变形）。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORGE_ROOT = join(REPO_ROOT, "plugins", "forge");

const pkg = JSON.parse(readFileSync(join(FORGE_ROOT, "package.json"), "utf8")) as {
  version?: string;
  exports?: Record<string, unknown>;
  files?: string[];
};

describe("骨架三目录（阶段一最小化——零占位空模块）", () => {
  it("host/ui/scripts 三目录在位且工件齐备（host 薄 apply + 派发单源；ui 自有视图入口；六脚本含 freshness 门）", () => {
    expect(existsSync(join(FORGE_ROOT, "host"))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, "ui"))).toBe(true);
    expect(existsSync(join(FORGE_ROOT, "scripts"))).toBe(true);
    for (const f of [
      "host/index.ts",
      "host/assembly.ts",
      "ui/index.ts",
      "scripts/clean-dist.mjs",
      "scripts/bundle-host.mjs",
      "scripts/bundle-client.mjs",
      "scripts/self-containment.mjs",
      "scripts/freshness.mjs",
      "cordis.patch.yml",
    ]) {
      expect(existsSync(join(FORGE_ROOT, f)), `缺骨架工件：${f}`).toBe(true);
    }
  });

  it("零占位目录：read/orchestrate/shared 不建（Workbench 期按需增——forge-workbench 提案）", () => {
    for (const dir of ["read", "orchestrate", "shared"]) {
      expect(existsSync(join(FORGE_ROOT, dir)), `占位目录回流：${dir}/`).toBe(false);
    }
  });
});

describe("exports 双键 + 零 typert 工件键（圆桌共识 2）", () => {
  it("基线双键 . 与 ./client 在位（目标形态 = 源码包产物契约）", () => {
    expect(pkg.exports?.["."]).toEqual({
      types: "./dist/host/index.d.ts",
      import: "./dist/host/index.js",
    });
    expect(pkg.exports?.["./client"]).toEqual({
      types: "./dist/client/ui/index.d.ts",
      default: "./dist/client.js",
    });
  });

  it("零 typert 工件键（聚合方法长在五件，forge 纯消费——typert 归手工缝 register）", () => {
    const keys = Object.keys(pkg.exports ?? {});
    expect(keys.filter((k) => k.includes("typert"))).toEqual([]);
  });
});

describe("files 规则 + 版本规则机检 pin", () => {
  it("files 含 dist（且 patch 随包）", () => {
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("cordis.patch.yml");
  });

  it("版本规则：files 含 dist ⇒ version ≥ 0.2.0（minor 跳位判据——机检 pin）", () => {
    const numeric = (pkg.version ?? "0.0.0")
      .split(".")
      .map((n) => Number.parseInt(n, 10));
    const ordered = numeric[0]! * 1_000_000 + numeric[1]! * 1_000 + numeric[2]!;
    expect(pkg.files).toContain("dist");
    expect(ordered, `files 含 dist 时 version 须 ≥ 0.2.0（实测 ${pkg.version}）`).toBeGreaterThanOrEqual(2_000);
  });
});

describe("静态四查汇总（逐查正本 = plugins/forge/tests/boundary.test.ts——此处汇总 pin 不漂移）", () => {
  /** host/ui 源码文件相对路径集。 */
  function hostUiSources(): string[] {
    const out: string[] = [];
    for (const dir of ["host", "ui"]) {
      const root = join(FORGE_ROOT, dir);
      for (const name of readdirSync(root)) {
        const full = join(root, name);
        if (statSync(full).isFile()) out.push(relative(FORGE_ROOT, full).replaceAll("\\", "/"));
      }
    }
    return out.sort();
  }

  const sources = hostUiSources();
  const readText = (f: string) => readFileSync(join(FORGE_ROOT, f), "utf8");

  it("① import 白名单（禁 db / 跨插件 import）", () => {
    const ALLOWED = [
      /^@dsh-forge\/(?:project|spec|task-loop|expert-squad|knowledge)(?:\/(?:client|typert))?$/,
      /^@dsh-forge\/lib-diag$/,
      /^@deepseek-ai\/cordis$/,
      /^\./,
      /^node:/,
    ];
    for (const file of sources) {
      for (const match of readText(file).matchAll(/(?:\bfrom\s*|\bimport\s*|\bimport\(\s*)["']([^"']+)["']/g)) {
        const spec = match[1]!;
        expect(ALLOWED.some((re) => re.test(spec)), `${file} 白名单外 import："${spec}"`).toBe(true);
      }
    }
  });

  it("② ctx.reflect.get 静态全禁（唯一豁免落款 = host/index.ts 在场守卫）", () => {
    for (const file of sources) {
      if (file === "host/index.ts") continue;
      expect(readText(file), `${file} 出现 reflect.get（非豁免落款点）`).not.toMatch(/reflect\s*\?*\.\s*get\s*\(/);
    }
  });

  it("③④ 零 db 句柄 + 零文件系统写入（按目录禁写——写面归 scripts/ 构建链）", () => {
    for (const file of sources) {
      const text = readText(file);
      expect(text, `${file} 出现 db 句柄`).not.toMatch(/\bopenDatabase\b|new\s+Database\s*\(|CREATE\s+TABLE/i);
      expect(text, `${file} 出现 fs 写入面`).not.toMatch(/(?:writeFileSync|mkdirSync|rmSync|mkdtempSync)\s*\(/);
    }
  });
});
