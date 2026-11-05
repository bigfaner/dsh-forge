import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 结构镜像测试（annotutor 纪律——激活链结构面在单测 pin，真机逐环重验归结算门）：
// cordis Loader / plugin-manager 识别合法 bundle 所消费的全部声明面，逐一镜像断言。
import expertSquadPlugin from "../src/index.js";
import { expertSquadClient, apply as clientApply } from "../src-client/index.js";

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

describe("bundle 声明结构镜像（cordis Loader / plugin-manager 识别面）", () => {
  it("dsh.bundle.patch 指向 cordis.patch.yml 且文件在场（bundle 形态恢复——plugin-manager 已安装清单收行，插件页呈现单源）", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8")).toContain("- insert:");
  });

  it("dsh.client 声明 platform:web（缺 web = UI 静默缺失）", () => {
    expect(pkg.dsh?.client?.platform).toBe("web");
  });

  it("dsh.client.inject 声明 settings 域装配期注入边（configForms 服务提供者先载——apply 期在场）", () => {
    expect(pkg.dsh?.client?.inject).toContain("@deepseek-ai/dsh-client-ui-settings");
  });

  it('exports["./client"] 声明浏览器半入口', () => {
    expect(pkg.exports?.["./client"]).toBeTypeOf("object");
  });

  it("peer DSH 版本精确 pin（无范围符号）", () => {
    const peers = pkg.peerDependencies ?? {};
    expect(Object.keys(peers)).toContain("@deepseek-ai/cordis");
    for (const range of Object.values(peers)) {
      expect(range).toMatch(/^[0-9]/);
      expect(range).not.toMatch(/[~^><*]/);
    }
  });

  it("cordis.patch.yml 单行插入 {id, name}——loader 组合行识别面", () => {
    const patchYaml = readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8");
    const insertBlock = patchYaml.match(/- insert:\s*\n\s+- id:\s*(\S+)\s*\n\s+name:\s*'?([^\n']+)'?/);
    expect(insertBlock, "patch 缺单行 insert {id, name} 结构").not.toBeNull();
    expect(insertBlock?.[1]).toBe("expert-squad");
    expect(insertBlock?.[2]).toBe("@dsh-forge/expert-squad");
  });

  it("随包 experts/ 目录含 ≥1 样例档案（root 注册缝自证）", () => {
    const experts = readdirSync(resolve(pkgDir, "experts")).filter((f) => f.endsWith(".md"));
    expect(experts.length).toBeGreaterThanOrEqual(1);
    for (const file of experts) {
      const md = readFileSync(resolve(pkgDir, "experts", file), "utf8");
      expect(md.startsWith("---"), `${file} 缺 frontmatter`).toBe(true);
      expect(md).toMatch(/^name:\s*\S+/m);
    }
  });

  it("host 半 default 导出为 Plugin.Function（loader 只认 default 导出）", () => {
    expect(expertSquadPlugin).toBeTypeOf("function");
  });

  it("client 半为组合 apply 插件面（DI 库件 → 真机 invalid plugin）", () => {
    expect(expertSquadClient.apply).toBeTypeOf("function");
    expect(clientApply).toBeTypeOf("function");
  });

  it("client apply 装配 detail.section 缝（已安装卡片详情页配置面——官方组 plugins.item 条目注册已随 bundle 恢复裁决退役）", () => {
    const settingsSrc = readFileSync(resolve(pkgDir, "src-client", "settings", "index.tsx"), "utf8");
    expect(settingsSrc).toContain("plugins.detail.section");
    expect(settingsSrc).not.toContain('"plugins.item"');
  });

  // bug 6a46cc75 守卫：官方 dsh-plugin-manager 安装 = profile 裸跑 pnpm add，无
  // workspace 协议处理——dependencies 必须全 registry 可解析，workspace:* 即堵死
  // 独立安装形态（ERR_PNPM_WORKSPACE_PKG_NOT_FOUND）。
  it("dependencies 零 workspace/file 协议（独立安装自含声明面——@dsh-forge/* 只允许 devDependencies）", () => {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(range, `${name} 使用 workspace/file 协议，独立安装形态断链`).not.toMatch(/^(workspace|file|link):/);
      expect(name.startsWith("@dsh-forge/"), "@dsh-forge/* private 包不可 registry 解析，不得入 dependencies").toBe(false);
    }
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("@dsh-forge/contracts");
  });

  // 产物面断言（dist 构建后在场才跑——CI/本地 build 后恒在场）。
  it("host bundle 产物自含：@dsh-forge/* 值依赖内联，官方机械与外部依赖外置", () => {
    const distEntry = resolve(pkgDir, "dist", "index.js");
    if (!existsSync(distEntry)) return; // 未构建（纯 src 测试树）——结构面其余用例已覆盖声明面
    const bundled = readFileSync(distEntry, "utf8");
    expect(bundled).not.toContain("@dsh-forge/contracts"); // 内联后字面量残留 = bundle 未生效
    expect(bundled).toContain("intersectToolNames"); // contracts 纯逻辑族闭包内联锚
    expect(bundled).toContain("composePersonaText");
    expect(bundled).toMatch(/["']@deepseek-ai\//); // 官方机械外置保留（内联第二副本分裂单例语义）
    expect(bundled).toMatch(/["']chokidar["']/); // 真实外部依赖外置保留（registry 可装）
  });
});
