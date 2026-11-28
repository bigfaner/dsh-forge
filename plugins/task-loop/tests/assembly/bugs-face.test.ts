// bug 3a776ecc：task-loop 取 bugs 服务的次序与取法——插件缝（project，工厂形态）优先，
// 缺席/劣形才退 core forgeBugs（服务本体）；与宿主 apps/host/src/boot/child.ts
// forgeBugsServiceOf 同序。修复前：core 在前恒读 core；仅插件在场时把工厂当服务查方法
// → 判缺席 → 四动词剔除 worker allowlist、T2/T3 静默关停。

import { describe, expect, it } from "vitest";
import { resolveBugsFace } from "../../host/assembly/bugs-face.js";

type Face = { findRecurrenceCandidates: (...args: never[]) => unknown; readonly tag: string };

const face = (tag: string): Face => ({ findRecurrenceCandidates: () => [], tag });

/** project 插件 forge.bugs 缝形态：工厂（调用后得服务）——见 project host/index.ts deps.bugs */
const pluginSeam = (service: unknown) => ({ get: (name: string) => (name === "forge.bugs" ? () => service : undefined) });

describe("resolveBugsFace：插件缝优先、工厂解包、core 兜底（bug 3a776ecc）", () => {
  it("插件在场 + core 在场 → 读插件，不读 core", () => {
    const plugin = face("plugin");
    const core = face("core");
    expect(resolveBugsFace({ forgeBugs: core, reflect: pluginSeam(plugin) })).toBe(plugin);
  });

  it("仅插件在场（core 不可达）→ 工厂解包得服务（修复前判缺席）", () => {
    const plugin = face("plugin");
    expect(resolveBugsFace({ reflect: pluginSeam(plugin) })).toBe(plugin);
  });

  it("插件缝劣形（无 findRecurrenceCandidates）→ 退 core", () => {
    const core = face("core");
    const stub = { listBugs: async () => [], tag: "plugin-stub" }; // 独立模式 stubBugsService 形态
    expect(resolveBugsFace({ forgeBugs: core, reflect: pluginSeam(stub) })).toBe(core);
  });

  it("插件缝读取抛错 → 退 core", () => {
    const core = face("core");
    const reflect = { get: () => { throw new Error("seam down"); } };
    expect(resolveBugsFace({ forgeBugs: core, reflect })).toBe(core);
  });

  it("core 直接是服务本体——不做工厂解包", () => {
    const core = face("core");
    expect(resolveBugsFace({ forgeBugs: core })).toBe(core);
  });

  it("插件与 core 皆缺席 → undefined", () => {
    expect(resolveBugsFace({})).toBeUndefined();
  });

  it("仅插件独立模式兜底（无 core）→ undefined（四动词缺席语义保留）", () => {
    const stub = { listBugs: async () => [], tag: "plugin-stub" };
    expect(resolveBugsFace({ reflect: pluginSeam(stub) })).toBeUndefined();
  });

  it("reflect.get 抛错且无 core → undefined（不抛）", () => {
    const reflect = { get: () => { throw new Error("ctx down"); } };
    expect(resolveBugsFace({ reflect })).toBeUndefined();
  });
});
