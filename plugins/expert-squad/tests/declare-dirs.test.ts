// forge-dirs-unification 3.4 —— expert-squad 目录键声明合并单测：
// 插件键 expert_squad.experts 经根 scope dirKeys.expert_squad 约定名登记（host/index.ts
// provide——消费侧枚举 dirKeys.* 现拉）；条目形状 satisfies Partial<ForgeDirs> 编译期
// 受检，成员键与 host/forge-dirs.d.ts 声明合并逐一相同；注册表解析以注入事实断言
// （lib/path resolveForgeDirs 单源）；recruit_expert 参数说明含 forge/experts 字面量。
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FORGE_BASE_DIR_ENTRIES, resolveForgeDirs, type ForgeDirSources } from "@dsh-forge/lib-path";
import { EXPERT_SQUAD_DIR_ENTRIES, DIR_KEYS_SERVICE_NAME } from "../host/index.js";

const SOURCES: ForgeDirSources = {
  dshHome: "X:\\dsh-home",
  projectRoot: "Z:\\ws\\proj-main",
  workspaceRoot: "Z:\\ws",
};

describe("expert_squad.experts 目录键声明", () => {
  it("登记键 = expert_squad.experts（插件前缀命名空间，非 forge.* 保留段）；deps = forge.home", () => {
    expect(Object.keys(EXPERT_SQUAD_DIR_ENTRIES)).toEqual(["expert_squad.experts"]);
    expect(DIR_KEYS_SERVICE_NAME).toBe("dirKeys.expert_squad");
    expect(EXPERT_SQUAD_DIR_ENTRIES["expert_squad.experts"].deps).toEqual(["forge.home"]);
  });

  it("注册表解析（注入事实断言）：{forge.home}/experts——只随 forge 根", () => {
    const resolved = resolveForgeDirs(
      [
        { source: "forge 本体（@dsh-forge/lib-path）", entries: FORGE_BASE_DIR_ENTRIES },
        { source: DIR_KEYS_SERVICE_NAME, entries: EXPERT_SQUAD_DIR_ENTRIES },
      ],
      SOURCES,
    );
    expect(resolved["expert_squad.experts"]).toBe(
      join("X:\\dsh-home", "forge", "experts"),
    );
  });

  it("recruit_expert target 参数说明含 forge/experts 字面量（用户层落点文案同源）", async () => {
    const src = await readFile(new URL("../host/tools.ts", import.meta.url), "utf8");
    expect(src).toContain("forge/experts");
    expect(src).not.toContain("$DSH_HOME/experts");
  });
});
