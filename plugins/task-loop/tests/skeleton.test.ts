import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 结构镜像测试（plugin-project skeleton 先例——激活链结构面在单测 pin，真机逐环重验归
// 结算门）：cordis Loader / plugin-manager 识别合法 bundle 所消费的全部声明面，逐一
// 镜像断言；门禁序铁律四条（plugin-project fix-6 假绿家族判例，bug eed9583b）脚本面 pin。
import taskLoopPlugin from "../host/index.js";
import { apply as clientApply, taskLoopClient } from "../ui/index.js";
import { FORGE_CHECKPOINTS_SERVICE_KEY, FORGE_TASKS_SERVICE_KEY } from "../shared/contract-constants.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dsh?: {
    bundle?: { patch?: string };
    client?: { platform?: string; inject?: readonly string[] };
  };
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("包骨架结构（提案 §二「目录布局」三目录单包样板）", () => {
  it("三目录 host/ui/shared 在位、无 src 层", () => {
    for (const dir of ["host", "ui", "shared"]) {
      expect(existsSync(resolve(pkgDir, dir)), `${dir}/ 缺席`).toBe(true);
    }
    expect(existsSync(resolve(pkgDir, "src")), "禁止 src 中间层").toBe(false);
  });

  it("tests/ 与 scripts/ 目录在位", () => {
    for (const dir of ["tests", "scripts"]) {
      expect(existsSync(resolve(pkgDir, dir)), `${dir}/ 缺席`).toBe(true);
    }
  });

  it("配置件全在包根：三 tsconfig + 五构建脚本 + cordis.patch.yml + ambient 协议壳", () => {
    for (const file of [
      "package.json",
      "tsconfig.json",
      "tsconfig.host.json",
      "tsconfig.client.json",
      "typert-protocol.d.ts",
      "scripts/clean-dist.mjs",
      "scripts/generate-typert.mjs",
      "scripts/bundle-host.mjs",
      "scripts/bundle-client.mjs",
      "scripts/self-containment.mjs",
      "cordis.patch.yml",
    ]) {
      expect(existsSync(resolve(pkgDir, file)), `${file} 缺席`).toBe(true);
    }
  });

  it("host 编译链 = host（shared 随链收编）、client 编译链 = ui（face 纯度：client 链零 host 收编）", () => {
    const host = JSON.parse(readFileSync(resolve(pkgDir, "tsconfig.host.json"), "utf8")) as {
      include?: string[];
      references?: { path: string }[];
    };
    const client = JSON.parse(readFileSync(resolve(pkgDir, "tsconfig.client.json"), "utf8")) as {
      include?: string[];
    };
    expect(host.include).toEqual(["host", "shared"]);
    expect(client.include).toEqual(["ui"]);
    expect(host.references?.map((r) => r.path)).toContain("./tsconfig.client.json");
    // 骨架期消费面 = lib-diag/lib-util（bundle 内联验证锚）；五子包 devDeps 接线面另行断言。
    expect(host.references?.map((r) => r.path)).toEqual(expect.arrayContaining(["../../lib/diag", "../../lib/util"]));
  });
});

describe("bundle 声明结构镜像（cordis Loader / plugin-manager 识别面）", () => {
  it("exports 基线双键 + typert 工件键（1.13：typert worker 落 ./typert + ./remote 两键——基线双键不排斥工件键扩展，project f4ccd57d 先例）", () => {
    const keys = Object.keys(pkg.exports ?? {}).sort();
    expect(keys).toContain(".");
    expect(keys).toContain("./client");
    expect(keys).toContain("./typert");
    expect(keys).toContain("./remote");
    expect(pkg.exports?.["."]).toBeTypeOf("object");
    expect(pkg.exports?.["./client"]).toBeTypeOf("object");
  });

  it("dsh.bundle.patch 指向 cordis.patch.yml 且文件在场", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8")).toContain("- insert:");
  });

  it("dsh.client.platform 值为 'web' 字面量（机检锁定——官方 resolveMeta 精确等值判定，缺 web = UI 静默缺失）", () => {
    expect(pkg.dsh?.client?.platform).toBe("web");
  });

  it("cordis.patch.yml 单行插入 {id, name}——loader 组合行识别面", () => {
    const patchYaml = readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8");
    const insertBlock = patchYaml.match(/- insert:\s*\n\s+- id:\s*(\S+)\s*\n\s+name:\s*'?([^\n']+)'?/);
    expect(insertBlock, "patch 缺单行 insert {id, name} 结构").not.toBeNull();
    expect(insertBlock?.[1]).toBe("task-loop");
    expect(insertBlock?.[2]).toBe("@dsh-forge/task-loop");
  });

  it("peer DSH 版本精确 pin（无范围符号）——cordis 4.0.4 版本线", () => {
    const peers = pkg.peerDependencies ?? {};
    expect(Object.keys(peers)).toContain("@deepseek-ai/cordis");
    expect(peers["@deepseek-ai/cordis"]).toBe("4.0.4");
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
  });

  it("lib 五子包 devDeps 接线 + 本包触面 @deepseek-ai/* pin 升 0.2.2-rc.1（typert generator 0.2.2-rc.2 版本线；dsh-subagent-in-process-driver 0.2.2-rc.1 上游未发布——0.2.0-rc.2 仓内既有线，升版随上游 next 发布收口）", () => {
    const devDeps = pkg.devDependencies ?? {};
    for (const lib of ["lib-api", "lib-db", "lib-diag", "lib-path", "lib-util"]) {
      expect(Object.keys(devDeps)).toContain(`@dsh-forge/${lib}`);
    }
    for (const name of ["dsh-session", "dsh-client-ui-primitives"]) {
      expect(devDeps[`@deepseek-ai/${name}`]).toBe("0.2.2-rc.1");
    }
    expect(devDeps["@deepseek-ai/dsh-subagent-in-process-driver"]).toBe("0.2.0-rc.2");
    expect(devDeps["@deepseek-ai/dsh-typert-generator"]).toBe("0.2.2-rc.2");
    expect(devDeps["@deepseek-ai/cordis"]).toBe("4.0.4");
  });

  it("版本 bump 0.14.0（plugin-task-loop 1.18-b 判例——queryTask 读面带出最新结算逐条 AC 状态（latestSettlement 节 + 呈现投影）：新增读面能力 minor 位 +1；pin 随批校正）", () => {
    expect(pkg.version).toBe("0.14.0");
  });
});

describe("门禁序铁律四条（bug eed9583b 假绿家族判例——脚本面 pin）", () => {
  it("铁律①：tsc -b 仅 build 第一步段（clean-dist → generate-typert → tsc -b → bundle-host → bundle-client；tsc 永不产 .js）", () => {
    expect(pkg.scripts?.build).toBe(
      "node scripts/clean-dist.mjs && node scripts/generate-typert.mjs && tsc -b && node scripts/bundle-host.mjs && node scripts/bundle-client.mjs",
    );
  });

  it("铁律②：离手门绑 bundle 脚本执行期（bundle-host/bundle-client 末尾自跑 auditDist，非 0 即败）+ prepack 复跑", () => {
    expect(pkg.scripts?.prepack).toBe("node scripts/self-containment.mjs");
    for (const script of ["scripts/bundle-host.mjs", "scripts/bundle-client.mjs"]) {
      const text = readFileSync(resolve(pkgDir, script), "utf8");
      expect(text).toContain("auditDist(pkgDir");
      expect(text).toContain("process.exit(1)");
    }
  });

  it("铁律③：ENTRY_POINTS/KEEP 从 package.json exports 单源生成，禁手工清单", () => {
    const text = readFileSync(resolve(pkgDir, "scripts/bundle-host.mjs"), "utf8");
    expect(text).toContain("exportsDistPaths(pkg)");
    expect(text).not.toMatch(/ENTRY_POINTS\s*=\s*\[/);
  });

  it("铁律④：self-containment 断言绑 bundle 脚本执行期而非独立测试会话（bundle 脚本 import 同一断言面）", () => {
    for (const script of ["scripts/bundle-host.mjs", "scripts/bundle-client.mjs"]) {
      const text = readFileSync(resolve(pkgDir, script), "utf8");
      expect(text).toContain('from "./self-containment.mjs"');
    }
  });

  it("bundle-host.mjs 外置表零 @dsh-forge/*（lib 子包必须内联）", () => {
    const script = readFileSync(resolve(pkgDir, "scripts", "bundle-host.mjs"), "utf8");
    expect(script).toContain('"@deepseek-ai/*"');
    expect(script).not.toMatch(/["']@dsh-forge\/[^"']*["']\s*(?:,|\])/);
  });
});

describe("装载面形态（cordis Loader / 官方 client-modules 消费契约）", () => {
  it("host 半 default 导出为 Plugin.Function（loader 只认 default 导出）+ inject 名单显式含 webServer（proposal 硬判据——名单缺席 = cordis inject 门拒恒 undefined）", () => {
    expect(taskLoopPlugin).toBeTypeOf("function");
    expect(taskLoopPlugin.inject).toContain("webServer");
  });

  it("服务键沿用 pin（圆桌 C1——键稳定性为登记制前提）", () => {
    expect(FORGE_TASKS_SERVICE_KEY).toBe("forgeTasks");
    expect(FORGE_CHECKPOINTS_SERVICE_KEY).toBe("forgeCheckpoints");
  });

  it("client 半为组合 apply 插件面（DI 库件 → 真机 invalid plugin）", () => {
    expect(taskLoopClient.apply).toBeTypeOf("function");
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

  it("client bundle 产物自含：ui 内联、零 @dsh-forge/* import、自注册装载头在位", () => {
    const distClient = resolve(pkgDir, "dist", "client.js");
    if (!existsSync(distClient)) return;
    const bundled = readFileSync(distClient, "utf8");
    // 装载头 PLUGIN_ID 字面量（"@dsh-forge/task-loop"）为自注册识别面，非 import——
    // 口径只断 import 形态（from/require/import()）。
    expect(bundled).not.toMatch(/(?:from\s*|require\(\s*|import\(\s*)["']@dsh-forge\//);
    expect(bundled).toContain("window.__ModuleLoader__.load");
    expect(bundled).toContain("@dsh-forge/task-loop");
  });
});
