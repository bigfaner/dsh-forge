// forge client 形状 pin（bug 95c1fed6——forge-aggregate-bundle 1.31）：
// 官方 web client-modules（0.2.2-rc.5 registry）按 cordis registry.plugin 判定要求
// module.exports 携带 apply——forge 壳入口必须为 cordis 插件 apply 面形态，五件成员
// client 行装载路径同径复核 pin（各件入口自带 apply 导出）。任一漂移即红，防装载面
// 静默退化回无 apply 形态（占位产物归 scripts/bundle-client.mjs 构建期 vm 复放门）。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 五件成员（bundle 组合面）——client 行装载路径与 forge 壳同径（client-modules 扫描）。 */
const MEMBERS = ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const;

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("forge 壳 client apply 面形态（bug 95c1fed6）", () => {
  const entry = read("plugins/forge/ui/index.ts");

  it("ui 入口导出 cordis 插件面：default 插件对象（含 apply）+ apply 具名导出兜底", () => {
    expect(entry).toMatch(/export default forgeClient/);
    expect(entry).toMatch(/apply\(_ctx:\s*unknown\):\s*void/);
    expect(entry).toMatch(/export const apply\s*=\s*forgeClient\.apply\.bind\(forgeClient\)/);
  });

  it("apply 返回值铁律注记在场（cordis 组合契约：返回值当 effect 消费 = undefined）", () => {
    expect(entry).toContain("返回值铁律");
  });

  it("bundle-client 离手门含产物形状守卫（vm 复放 __ModuleLoader__ 截获 factory 返回值）", () => {
    const script = read("plugins/forge/scripts/bundle-client.mjs");
    expect(script).toContain("vm.runInNewContext");
    expect(script).toContain("__ModuleLoader__");
    expect(script).toContain('typeof pluginFace?.apply !== "function"');
    expect(script).toMatch(/import vm from "node:vm"/);
  });
});

describe("五件成员 client apply 兼容 pin（rc.5 registry 同径装载复核）", () => {
  for (const member of MEMBERS) {
    it(`@dsh-forge/${member} ui 入口携带 apply 装配面`, () => {
      const entry = read(`plugins/${member}/ui/index.ts`);
      const hasApply = (text: string) => /export const apply\s*=|apply\s*\(_?ctx/.test(text);
      const text = hasApply(entry)
        ? true
        : // 转发式入口（如 knowledge：export * from './faces.js'）——落座文件即正门
          [...entry.matchAll(/export\s+(?:\*\s+from|\{[^}]*\}\s+from)\s+["']([^"']+)["']/g)]
            .map((m) => `plugins/${member}/ui/${m[1]!.replace("./", "").replace(".js", ".ts")}`)
            .filter((f) => {
              try {
                return hasApply(read(f));
              } catch {
                return false;
              }
            })
            .length > 0;
      expect(text, `${member} client 入口缺 apply 面`).toBe(true);
    });
  }
});
