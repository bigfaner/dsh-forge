// 契约测试（真实 scan 链装载随包 experts/ 目录，评审 warn 补缺）：
// 既有覆盖（experts-coverage / experts-single-install）只验文件在场 + name 键，
// 未经验证真实 scan 链（ExpertsRegistry + scanExpertRoots）能装载四插件随包
// experts/ 真实目录——若迁移档案缺 title/description/tools 等 scan 必需
// frontmatter，既有测试全绿但装机后 scan 拒载、专家池空。本测试用真实
// ExpertsRegistry（roots 指向四插件随包 experts/ 真实目录，非 tmp fixture）
// refresh 后逐键在场断言，缺 scan 必需字段即红。
//
// 替身来源标注：无替身——全部为仓库内真实随包 experts/ 目录 + 真实
// ExpertsRegistry/scan 链，唯一注入点是 roots 指向（生产装配缝的等价入口）。

import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ExpertsRegistry } from "../host/registry.js";
import type { ExpertRoot } from "../host/store/scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGINS_ROOT = resolve(HERE, "..", "..");

/** 四插件随包 experts/ 真实目录（真源，非 tmp fixture）。 */
const PLUGIN_ROOTS: readonly { pluginName: string; dir: string; expectedKeys: string[] }[] = [
  {
    pluginName: "task-loop",
    dir: join(PLUGINS_ROOT, "task-loop", "experts"),
    expectedKeys: [
      "architecture-reviewer",
      "bug-hunter",
      "code-cleaner",
      "code-reviewer",
      "delivery-engineer",
      "doc-consolidator",
      "doc-reviewer",
      "drift-auditor",
      "feature-builder",
      "gate-keeper",
      "refactor-surgeon",
      "retro-reviewer",
      "simplify-master",
      "spec-reviewer",
      "summary-distiller",
      "tech-writer",
      "test-contract-author",
      "test-journey-author",
      "test-runner",
      "test-script-author",
      "triage-analyst",
      "ui-craftsman",
    ],
  },
  {
    pluginName: "@dsh-forge/forge",
    dir: join(PLUGINS_ROOT, "forge", "experts"),
    expectedKeys: [
      "code-master",
      "dep-upgrader",
      "merge-planner",
      "ops-observer",
      "perf-tuner",
      "security-auditor",
    ],
  },
  {
    pluginName: "@dsh-forge/knowledge",
    dir: join(PLUGINS_ROOT, "knowledge", "experts"),
    expectedKeys: ["knowledge-curator"],
  },
  {
    pluginName: "@dsh-forge/spec",
    dir: join(PLUGINS_ROOT, "spec", "experts"),
    expectedKeys: [
      "architect",
      "bug-investigator",
      "design-reviewer",
      "formal-verifier",
      "test-master",
      "ui-designer",
    ],
  },
];

/** 真实 scan 链入口：真实 ExpertsRegistry + 真实 refresh（scanExpertRoots 同链）。 */
async function makeRegistry(roots: ExpertRoot[]): Promise<ExpertsRegistry> {
  const reg = new ExpertsRegistry({ roots: () => roots, workspace: "C:\\ws\\a" });
  await reg.refresh();
  return reg;
}

describe("真实 scan 链装载四插件随包 experts/ 目录", () => {
  it("单插件 root：逐键在场且经真实 scan 装载（entry 含 scan 必需 frontmatter 字段）", async () => {
    for (const { pluginName, dir, expectedKeys } of PLUGIN_ROOTS) {
      const reg = await makeRegistry([{ origin: "plugin", dir, pluginName }]);
      const loaded = new Set(reg.list().map((entry) => entry.name));
      // 目录内每个 .md 档案都必须装载成功（缺 title/tools 等 scan 必需字段即红）
      expect([...loaded].sort(), `plugin ${pluginName} 装载键集`).toEqual(
        [...expectedKeys].sort(),
      );
      // 与磁盘真实目录键数对齐（防止 expectedKeys 本身漂移）
      expect(loaded.size, `plugin ${pluginName} 键数`).toBe(readdirSync(dir).filter((f) => f.endsWith(".md")).length);
      for (const key of expectedKeys) {
        const entry = reg.get(key);
        expect(entry?.instanceId, `plugin ${pluginName} 键 ${key}`).toBe(`${pluginName}#${key}`);
        expect(entry.title.length, `plugin ${pluginName} 键 ${key} title 非空`).toBeGreaterThan(0);
        expect(entry.sourcePath.endsWith(`${key}.md`)).toBe(true);
      }
    }
  });

  it("四插件同 registry（22/6/1/6 键），task-loop 22 键全量逐键断言", async () => {
    const roots: ExpertRoot[] = PLUGIN_ROOTS.map(({ pluginName, dir }) => ({
      origin: "plugin" as const,
      dir,
      pluginName,
    }));
    const reg = await makeRegistry(roots);
    const byPlugin = new Map(
      PLUGIN_ROOTS.map(({ pluginName, expectedKeys }) => [
        pluginName,
        new Set(expectedKeys),
      ] as const),
    );
    // 各插件键数（22/6/1/6）：按键集归属断言（四插件键集互不相交）
    for (const [pluginName, keys] of byPlugin) {
      const hit = reg
        .list()
        .filter((entry) => keys.has(entry.name));
      expect(hit.length, `plugin ${pluginName} 装载数`).toBe(keys.size);
      for (const entry of hit) {
        expect(entry.instanceId.startsWith(`${pluginName}#`)).toBe(true);
      }
    }
    // task-loop 22 键全量逐键在场（全量断言锚）
    const taskLoop = byPlugin.get("task-loop")!;
    expect(taskLoop.size).toBe(22);
    for (const key of taskLoop) {
      const entry = reg.get(key);
      expect(entry?.instanceId.startsWith("task-loop#"), `task-loop 键 ${key}`).toBe(true);
      expect(entry.title.length, `task-loop 键 ${key} title 非空`).toBeGreaterThan(0);
    }
    // 装载零降级：真实档案不得触发 warning（缺必需 frontmatter 会在 warnings 留痕）
    expect(reg.warnings, `scan warnings: ${reg.warnings.join(" | ")}`).toEqual([]);
  });
});
