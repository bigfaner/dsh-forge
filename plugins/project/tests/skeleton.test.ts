import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 结构镜像测试（expert-squad bundle-structure 先例——激活链结构面在单测 pin，
// 真机逐环重验归结算门）：cordis Loader / plugin-manager 识别合法 bundle 所消费的
// 全部声明面，逐一镜像断言。
import projectPlugin from "../host/index.js";
import { apply as clientApply, projectClient } from "../ui/index.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
  name: string;
  dsh?: {
    bundle?: { patch?: string };
    client?: { platform?: string; inject?: readonly string[] };
  };
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("包骨架结构（提案 §二「目录布局」三目录单包）", () => {
  it("三目录 host/ui/shared 在位、无 src 层", () => {
    for (const dir of ["host", "ui", "shared"]) {
      expect(existsSync(resolve(pkgDir, dir)), `${dir}/ 缺席`).toBe(true);
    }
    expect(existsSync(resolve(pkgDir, "src")), "禁止 src 中间层").toBe(false);
  });

  it("tests/ 与 skills/ 目录在位", () => {
    for (const dir of ["tests", "skills"]) {
      expect(existsSync(resolve(pkgDir, dir)), `${dir}/ 缺席`).toBe(true);
    }
  });

  it("配置件全在包根：双 tsconfig + 双 bundle 脚本 + cordis.patch.yml", () => {
    for (const file of [
      "package.json",
      "tsconfig.json",
      "tsconfig.client.json",
      "scripts/bundle-host.mjs",
      "scripts/bundle-client.mjs",
      "cordis.patch.yml",
    ]) {
      expect(existsSync(resolve(pkgDir, file)), `${file} 缺席`).toBe(true);
    }
  });

  it("host 编译链 = host+shared、client 编译链 = ui+shared（双链无 src 层）", () => {
    const host = JSON.parse(readFileSync(resolve(pkgDir, "tsconfig.json"), "utf8")) as {
      include?: string[];
      references?: { path: string }[];
    };
    const client = JSON.parse(readFileSync(resolve(pkgDir, "tsconfig.client.json"), "utf8")) as {
      include?: string[];
    };
    expect(host.include).toEqual(["host", "shared"]);
    // 1.8 起ui 面消费 host/worktrees 的纯类型（AheadBehind）——client 链补收
    // host/worktrees（worktree 域平移的编译链必要修复）。
    expect(client.include).toEqual(["ui", "shared", "host/worktrees"]);
    expect(host.references?.map((r) => r.path)).toContain("./tsconfig.client.json");
  });
});

describe("bundle 声明结构镜像（cordis Loader / plugin-manager 识别面）", () => {
  it("exports \".\"（host）+ \"./client\"（ui）双入口声明", () => {
    expect(pkg.exports?.["."]).toBeTypeOf("object");
    expect(pkg.exports?.["./client"]).toBeTypeOf("object");
  });

  it("dsh.bundle.patch 指向 cordis.patch.yml 且文件在场（bundle 形态恢复——已安装清单收行）", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8")).toContain("- insert:");
  });

  it("dsh.client.platform 值为 'web' 字面量（机检锁定——官方 resolveMeta 精确等值判定，缺 web = UI 静默缺失）", () => {
    expect(pkg.dsh?.client?.platform).toBe("web");
  });

  it("dsh.client.inject 零消费零 inject 边：不声明 settings 域激活边（settings-unification 圆桌处方——configForms.get/whileServed 命名空间绑定不构成跨包消费；缺席降级由消费点现查承担）", () => {
    expect(pkg.dsh?.client?.inject ?? []).not.toContain("@deepseek-ai/dsh-client-ui-settings");
  });

  it("cordis.patch.yml 单行插入 {id, name}——loader 组合行识别面", () => {
    const patchYaml = readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8");
    const insertBlock = patchYaml.match(/- insert:\s*\n\s+- id:\s*(\S+)\s*\n\s+name:\s*'?([^\n']+)'?/);
    expect(insertBlock, "patch 缺单行 insert {id, name} 结构").not.toBeNull();
    expect(insertBlock?.[1]).toBe("project");
    expect(insertBlock?.[2]).toBe("@dsh-forge/project");
  });

  it("peer DSH 版本精确 pin（无范围符号）", () => {
    const peers = pkg.peerDependencies ?? {};
    expect(Object.keys(peers)).toContain("@deepseek-ai/cordis");
    for (const range of Object.values(peers)) {
      expect(range).toMatch(/^[0-9]/);
      expect(range).not.toMatch(/[~^><*]/);
    }
  });

  it("dependencies 零 workspace/file 协议且零 @dsh-forge/*（独立安装自含——lib 子包只允许 devDependencies）", () => {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 使用 workspace/file 协议，独立安装形态断链`).not.toMatch(/^(workspace|file|link):/);
      expect(name.startsWith("@dsh-forge/"), "@dsh-forge/* private 包不可 registry 解析，不得入 dependencies").toBe(false);
    }
    for (const lib of ["lib-api", "lib-db", "lib-diag", "lib-path", "lib-util"]) {
      expect(Object.keys(pkg.devDependencies ?? {})).toContain(`@dsh-forge/${lib}`);
    }
  });

  it("bundle-host.mjs 外置表零 @dsh-forge/*（lib 子包必须内联）", () => {
    const script = readFileSync(resolve(pkgDir, "scripts", "bundle-host.mjs"), "utf8");
    expect(script).toContain('"@deepseek-ai/*"');
    expect(script).not.toMatch(/["']@dsh-forge\/[^"']*["']\s*(?:,|\])/);
  });

  it("host 半 default 导出为 Plugin.Function（loader 只认 default 导出）", () => {
    expect(projectPlugin).toBeTypeOf("function");
  });

  it("client 半为组合 apply 插件面（DI 库件 → 真机 invalid plugin）", () => {
    expect(projectClient.apply).toBeTypeOf("function");
    expect(clientApply).toBeTypeOf("function");
  });
});

// 产物面断言（dist 构建后在场才跑——CI/本地 build 后恒在场）。
describe("bundle 管线产物 self-containment", () => {
  it("host bundle 产物自含：@dsh-forge/lib-* devDeps 内联，官方机械外置", () => {
    const distEntry = resolve(pkgDir, "dist", "host", "index.js");
    if (!existsSync(distEntry)) return; // 未构建（纯 src 测试树）——结构面其余用例已覆盖声明面
    const bundled = readFileSync(distEntry, "utf8");
    // 内联后 import 形态残留 = bundle 未生效（self-containment 口径：dist 零 @dsh-forge/* 运行期 import）
    expect(bundled).not.toMatch(/(?:from\s*|require\(\s*|import\(\s*)["']@dsh-forge\//);
    expect(bundled).toContain("errMessage"); // lib-util 内联锚（host/index.ts 消费点）
  });

  it("client bundle 产物自含：shared/ui 内联、零 @dsh-forge/* import、自注册装载头在位", () => {
    const distClient = resolve(pkgDir, "dist", "client.js");
    if (!existsSync(distClient)) return;
    const bundled = readFileSync(distClient, "utf8");
    // 装载头 PLUGIN_ID 字面量（"@dsh-forge/project"）为自注册识别面，非 import——
    // 口径只断 import 形态（from/require/import()）。
    expect(bundled).not.toMatch(/(?:from\s*|require\(\s*|import\(\s*)["']@dsh-forge\//);
    expect(bundled).toContain("window.__ModuleLoader__.load");
    expect(bundled).toContain("@dsh-forge/project");
  });
});
