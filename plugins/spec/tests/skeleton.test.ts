// 包骨架结构冒烟（plugin-spec 1.2）——本文件同时在位证明 vitest.config.ts projects
// 的 'spec' 池注册生效（include plugins/spec/tests/**——本测试入批即注册可观测）。
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
};

describe("包骨架（三目录制 + scripts 五件 + build 链）", () => {
  it("三目录制 host/ui/shared + tests 在位、无 src 中间层", () => {
    for (const dir of ["host", "ui", "shared", "tests", "scripts"]) {
      expect(existsSync(resolve(pkgDir, dir)), `${dir}/ 缺席`).toBe(true);
    }
    expect(existsSync(resolve(pkgDir, "src")), "禁止 src 中间层").toBe(false);
  });

  it("scripts 五件在位（clean-dist / generate-typert / bundle-host / bundle-client / self-containment）", () => {
    for (const file of [
      "scripts/clean-dist.mjs",
      "scripts/generate-typert.mjs",
      "scripts/bundle-host.mjs",
      "scripts/bundle-client.mjs",
      "scripts/self-containment.mjs",
    ]) {
      expect(existsSync(resolve(pkgDir, file)), `${file} 缺席`).toBe(true);
    }
  });

  it("build 链链序在 package.json：clean-dist → generate-typert → tsc -b → bundle-host → bundle-client", () => {
    const build = pkg.scripts?.build ?? "";
    const chain = [
      "node scripts/clean-dist.mjs",
      "node scripts/generate-typert.mjs",
      "tsc -b",
      "node scripts/bundle-host.mjs",
      "node scripts/bundle-client.mjs",
    ];
    let last = -1;
    for (const step of chain) {
      const at = build.indexOf(step);
      expect(at, `链序缺步或缺序：${step}`).toBeGreaterThan(last);
      last = at;
    }
    expect(pkg.scripts?.prepack).toBe("node scripts/self-containment.mjs");
  });

  it("tsconfig 四件在位：solution 壳汇总 shared/host/ui 三叶", () => {
    for (const file of ["tsconfig.json", "tsconfig.host.json", "tsconfig.ui.json", "tsconfig.shared.json"]) {
      expect(existsSync(resolve(pkgDir, file)), `${file} 缺席`).toBe(true);
    }
    const solution = JSON.parse(readFileSync(resolve(pkgDir, "tsconfig.json"), "utf8")) as {
      references?: { path: string }[];
    };
    expect(solution.references?.map((r) => r.path)).toEqual([
      "./tsconfig.shared.json",
      "./tsconfig.host.json",
      "./tsconfig.ui.json",
    ]);
  });
});

describe("包 manifest（plugin-spec 1.2 验收面）", () => {
  it("名称与版本：@dsh-forge/spec 0.9.0（plugin-spec-roadmaps/1.3 v2 迁移 minor bump）", () => {
    expect(pkg.name).toBe("@dsh-forge/spec");
    expect(pkg.version).toBe("0.9.0");
  });

  it("exports 四键：. + ./client + ./typert + ./remote（typert 双键预留）", () => {
    const exports = pkg.exports ?? {};
    expect(exports["."]).toBeTypeOf("object");
    expect(exports["./client"]).toBeTypeOf("object");
    expect(exports["./typert"]).toEqual({
      types: "./dist/typert.host.d.ts",
      default: "./dist/typert.host.js",
    });
    expect(exports["./remote"]).toEqual({
      types: "./dist/typert.remote-client.d.ts",
      default: "./dist/typert.remote-client.js",
    });
  });

  it("依赖位次（判例 0acab78c）：typert-protocol + zod 落 dependencies、typert-generator 落 devDependencies", () => {
    expect(pkg.dependencies?.["@deepseek-ai/dsh-typert-protocol"]).toBe("0.2.2-rc.2");
    expect(pkg.dependencies?.zod).toBe("4.6.6");
    expect(pkg.devDependencies?.["@deepseek-ai/dsh-typert-generator"]).toBe("0.2.2-rc.2");
  });

  it("dependencies 零 workspace/file 协议且零 @dsh-forge/*（独立安装自含）", () => {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 协议依赖断链`).not.toMatch(/^(workspace|file|link):/);
      expect(name.startsWith("@dsh-forge/"), "@dsh-forge/* 不得入 dependencies").toBe(false);
    }
  });

  it("bundle 声明面：cordis patch 行 + dsh.client.platform=web", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(pkg.dsh?.client?.platform).toBe("web");
    const patchYaml = readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8");
    const insertBlock = patchYaml.match(/- insert:\s*\n\s+- id:\s*(\S+)\s*\n\s+name:\s*'?([^\n']+)'?/);
    expect(insertBlock, "patch 缺单行 insert {id, name} 结构").not.toBeNull();
    expect(insertBlock?.[1]).toBe("spec");
    expect(insertBlock?.[2]).toBe("@dsh-forge/spec");
    // 单装 skills 挂载行（bug fefd5149 缝③）：按 row id 覆写 skill-filesystem——
    // customSkillDirs 指向包内 skills/ 的 !!js 安装后绝对路径表达式（官方 dsh-web-app
    // 预设底稿同款先例；research/official-verification.md §2 挂载唯一机械核销）。
    expect(patchYaml, "patch 缺 skill-filesystem customSkillDirs 挂载行").toMatch(
      /- id: skill-filesystem[\s\S]*customSkillDirs:[\s\S]*'@dsh-forge\/spec\/package\.json'/,
    );
  });

  it("peer 依赖精确 pin（无范围符号）", () => {
    const peers = pkg as unknown as { peerDependencies?: Record<string, string> };
    void peers;
    const manifest = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
      peerDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.peerDependencies ?? {})).toContain("@deepseek-ai/cordis");
    for (const range of Object.values(manifest.peerDependencies ?? {})) {
      expect(range).toMatch(/^[0-9]/);
      expect(range).not.toMatch(/[~^><*]/);
    }
  });
});
