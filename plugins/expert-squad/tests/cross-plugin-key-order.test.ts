// 遮蔽语义回归 + 跨插件同键稳定定序（ORDER_RULE）：
// ① user 层同名四键（architecture-reviewer / code-master / code-reviewer /
//   tech-writer）继续遮蔽内置层——多插件内置新格局（两个 plugin root 同键 + 本包
//   随包内置）下，user 层取用语义零变化（origin=user、实例 ID `layer:user#键`）；
// ② 跨插件内置层同键冲突按插件名稳定字典序取后者（与 root 注册/装配序无关），
//   快照锚定胜出条目（code-reviewer = 现成冲突样例：task-loop 内置 + 本包内置）。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ExpertsRegistry } from "../host/registry.js";
import type { ExpertEntry, LayeredExpertEntry } from "../host/registry.js";
import type { ExpertRoot } from "../host/store/scan.js";

/** 遮蔽回归键集（任务锚定四键，序即断言序）。 */
const SHADOW_KEYS = [
  "architecture-reviewer",
  "code-master",
  "code-reviewer",
  "tech-writer",
] as const;

/** 冲突样例两插件名（字典序 "@dsh-forge/expert-squad" < "task-loop" → 后者胜出）。 */
const PKG_SQUAD = "@dsh-forge/expert-squad";
const PKG_TASK_LOOP = "task-loop";

function expertMd(overrides: { name?: string; title?: string } = {}): string {
  return [
    "---",
    `name: ${overrides.name ?? "code-reviewer"}`,
    `title: ${overrides.title ?? "资深评审"}`,
    "description: >-",
    `  ${overrides.name ?? "code-reviewer"} 档案（${overrides.title ?? "资深评审"}）。`,
    "tools: [read, grep]",
    "skills: [review]",
    "---",
    "## 职责\n\n评审。\n",
  ].join("\n");
}

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

let dir: string;
let squadBuiltin: string;
let taskLoopBuiltin: string;
let userLayer: string;
let roots: ExpertRoot[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "expert-squad-cross-key-"));
  tmpRoots.push(dir);
  squadBuiltin = join(dir, "squad-builtin");
  taskLoopBuiltin = join(dir, "task-loop-builtin");
  userLayer = join(dir, "user");
  await Promise.all([mkdir(squadBuiltin), mkdir(taskLoopBuiltin), mkdir(userLayer)]);
  // 本包随包内置：四键全量
  for (const key of SHADOW_KEYS) {
    await writeFile(join(squadBuiltin, `${key}.md`), expertMd({ name: key, title: `内置·${key}` }));
  }
  // task-loop 内置：code-reviewer 同键冲突样例
  await writeFile(
    join(taskLoopBuiltin, "code-reviewer.md"),
    expertMd({ name: "code-reviewer", title: "task-loop 内置评审" }),
  );
  // user 层：四键全量（遮蔽层）
  for (const key of SHADOW_KEYS) {
    await writeFile(join(userLayer, `${key}.md`), expertMd({ name: key, title: `用户·${key}` }));
  }
  roots = [];
});

function makeRegistry(): Promise<ExpertsRegistry> {
  const reg = new ExpertsRegistry({ roots: () => roots, workspace: "C:\\ws\\a" });
  return reg.refresh().then(() => reg);
}

/** 快照确定性投影：剥 updatedAt（mtime）与 sourcePath 的临时目录前缀。 */
function projectable(entry: ExpertEntry | LayeredExpertEntry) {
  return {
    name: entry.name,
    title: entry.title,
    origin: entry.origin,
    enabled: entry.enabled,
    instanceId: entry.instanceId,
    sourceFile: basename(entry.sourcePath),
    ...("effective" in entry ? { effective: entry.effective } : {}),
  };
}

describe("遮蔽语义回归：user 层同名四键遮蔽内置层（多插件内置新格局）", () => {
  it("get 恒取 user 层（origin/instanceId/title），内置双 plugin root 同键不影响遮蔽", async () => {
    roots = [
      { origin: "plugin", dir: squadBuiltin, pluginName: PKG_SQUAD },
      { origin: "plugin", dir: taskLoopBuiltin, pluginName: PKG_TASK_LOOP },
      { origin: "user", dir: userLayer },
    ];
    const reg = await makeRegistry();
    for (const key of SHADOW_KEYS) {
      const entry = reg.get(key);
      expect(entry.origin).toBe("user");
      expect(entry.instanceId).toBe(`layer:user#${key}`);
      expect(entry.title).toBe(`用户·${key}`);
    }
  });

  it("listLayered 全层聚组：code-reviewer 三层在场、生效位 = user 层", async () => {
    roots = [
      { origin: "plugin", dir: squadBuiltin, pluginName: PKG_SQUAD },
      { origin: "plugin", dir: taskLoopBuiltin, pluginName: PKG_TASK_LOOP },
      { origin: "user", dir: userLayer },
    ];
    const reg = await makeRegistry();
    const grouped = reg
      .listLayered()
      .filter((entry) => entry.name === "code-reviewer");
    expect(grouped.map((entry) => [entry.origin, entry.effective])).toEqual([
      ["user", true],
      ["plugin", false],
    ]);
    // plugin 层展示条目 = 跨插件定序胜出者（task-loop），非本包随包份
    expect(grouped[1]!.instanceId).toBe(`${PKG_TASK_LOOP}#code-reviewer`);
  });
});

describe("跨插件同键定序：插件名稳定字典序取后者（与装配序无关）", () => {
  it("两种装配序下胜出者一致 = task-loop 份（字典序后者），快照锚定", async () => {
    const collect = async (order: "squad-first" | "task-loop-first") => {
      roots =
        order === "squad-first"
          ? [
              { origin: "plugin", dir: squadBuiltin, pluginName: PKG_SQUAD },
              { origin: "plugin", dir: taskLoopBuiltin, pluginName: PKG_TASK_LOOP },
            ]
          : [
              { origin: "plugin", dir: taskLoopBuiltin, pluginName: PKG_TASK_LOOP },
              { origin: "plugin", dir: squadBuiltin, pluginName: PKG_SQUAD },
            ];
      const reg = await makeRegistry();
      return projectable(reg.get("code-reviewer"));
    };
    const squadFirst = await collect("squad-first");
    const taskLoopFirst = await collect("task-loop-first");
    expect(squadFirst).toEqual(taskLoopFirst); // 与装配序无关
    expect(squadFirst).toMatchInlineSnapshot(`
      {
        "enabled": true,
        "instanceId": "task-loop#code-reviewer",
        "name": "code-reviewer",
        "origin": "plugin",
        "sourceFile": "code-reviewer.md",
        "title": "task-loop 内置评审",
      }
    `);
  });

  it("user 层缺席时取用落 plugin 层胜出者；listLayered 同键 plugin 条目即胜出份", async () => {
    // user 层只留非冲突键，code-reviewer 仅存于两个 plugin root
    const { rm } = await import("node:fs/promises");
    await rm(join(userLayer, "code-reviewer.md"));
    roots = [
      { origin: "plugin", dir: squadBuiltin, pluginName: PKG_SQUAD },
      { origin: "user", dir: userLayer },
      { origin: "plugin", dir: taskLoopBuiltin, pluginName: PKG_TASK_LOOP },
    ];
    const reg = await makeRegistry();
    expect(reg.get("code-reviewer").instanceId).toBe(`${PKG_TASK_LOOP}#code-reviewer`);
    const layered = reg
      .listLayered()
      .filter((entry) => entry.name === "code-reviewer");
    expect(layered.map((entry) => entry.instanceId)).toEqual([`${PKG_TASK_LOOP}#code-reviewer`]);
    // 败者跳过有 warning 留痕（本包随包份被定序跳过）
    expect(reg.warnings.some((w) => w.includes("code-reviewer"))).toBe(true);
  });
});
