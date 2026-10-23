import { readdirSync, readFileSync } from "node:fs";
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
    client?: { platform?: string };
  };
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
};

describe("bundle 声明结构镜像（cordis Loader / plugin-manager 识别面）", () => {
  it("dsh.bundle.patch 指向 cordis.patch.yml 且文件在场", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(readFileSync(resolve(pkgDir, "cordis.patch.yml"), "utf8")).toContain("- insert:");
  });

  it("dsh.client 声明 platform:web（缺 web = UI 静默缺失）", () => {
    expect(pkg.dsh?.client?.platform).toBe("web");
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
});
