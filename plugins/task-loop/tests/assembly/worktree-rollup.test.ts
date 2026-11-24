// worktree 归拢确定性键派生 pin（2026-11-24 用户裁决——worktree 归拢到项目根）：
// 任务子 tab 空数据真因（键族缝回退主根单键 + 任务键落 worktree 键）修口钉——
// 写侧 {root}\.forge\worktrees\<name> 形态 cwd 确定性推导主根键，不依赖 forge.worktrees
// 注册缝在场；非 worktree 形态不推导。诊断留痕 .forge/task-logs/001-task-tab-empty/。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveProjectKeyRolledUp } from "../../host/assembly/tool-family.js";
import { deriveProjectKey } from "../../host/db/repositories/project-key.js";
import taskLoopPlugin from "../../host/index.js";

const ROOT = "Z:\\ws\\proj";
const WT = `${ROOT}\\.forge\\worktrees\\plugins`;

describe("deriveProjectKeyRolledUp（worktree 形态确定性归拢主根键）", () => {
  it("worktree 形态（\\ 分隔）→ 主根键，且与 deriveProjectKey(root) 全等", () => {
    expect(deriveProjectKeyRolledUp(WT)).toBe(deriveProjectKey(ROOT));
  });

  it("worktree 形态（/ 分隔）→ 主根键", () => {
    expect(deriveProjectKeyRolledUp("Z:/ws/proj/.forge/worktrees/plugins")).toBe(deriveProjectKey("Z:/ws/proj"));
  });

  it("嵌套 worktree 形态 → 最外层主根键", () => {
    expect(deriveProjectKeyRolledUp(`${WT}\\.forge\\worktrees\\inner`)).toBe(deriveProjectKey(ROOT));
  });

  it("边界：非 worktree 形态不推导（原样派生）", () => {
    expect(deriveProjectKeyRolledUp(ROOT)).toBe(deriveProjectKey(ROOT));
    // 仅 .forge 一段（无 worktrees 段）不推导
    expect(deriveProjectKeyRolledUp(`${ROOT}\\.forge\\tmp`)).toBe(deriveProjectKey(`${ROOT}\\.forge\\tmp`));
    // worktrees 单段无 .forge 前缀不推导
    expect(deriveProjectKeyRolledUp(`${ROOT}\\worktrees\\plugins`)).toBe(deriveProjectKey(`${ROOT}\\worktrees\\plugins`));
    // marker 大小写变体不推导（project_key 拼写敏感同口径）
    expect(deriveProjectKeyRolledUp(`${ROOT}\\.Forge\\Worktrees\\plugins`)).toBe(deriveProjectKey(`${ROOT}\\.Forge\\Worktrees\\plugins`));
    // 末段非 worktree 树内子路径（worktree 内部 cwd）→ 仍归拢最外层主根
    expect(deriveProjectKeyRolledUp(`${WT}\\host\\src`)).toBe(deriveProjectKey(ROOT));
  });

  it("空 cwd → 派生拒绝原样上抛（ProjectKeyDerivationError）", () => {
    expect(() => deriveProjectKeyRolledUp("")).toThrowError(/ERR_PROJECT_KEY_DERIVATION/);
  });
});

describe("归拢端到端（装配级——forge.worktrees 缝缺席 ≠ 归拢失效）", () => {
  function execOf(cwd: string): unknown {
    return { agent: { session: { id: "s1", header: { cwd } } } };
  }

  it("worktree cwd 写入 add_task → 主根 cwd 的 list_tasks 可见（无缝、零注册面）", async () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-rollup-"));
    const registered: { name: string; execute: (a: unknown, e: unknown) => Promise<unknown> }[] = [];
    const ctx = {
      reflect: { provide: () => {}, get: () => undefined },
      emit: () => {},
      tools: {
        register: (definition: { name: string; execute: (a: unknown, e: unknown) => Promise<unknown> }) => {
          registered.push(definition);
        },
      },
    };
    const dispose = taskLoopPlugin(ctx, { home, dbFile: ":memory:" });
    try {
      const byName = new Map(registered.map((t) => [t.name, t]));
      await byName.get("add_task")!.execute(
        { slug: "rollup-pin", title: "rollup pin", type: "coding-fix" },
        execOf(WT),
      );
      const listed = (await byName.get("list_tasks")!.execute({ slug: "rollup-pin" }, execOf(ROOT))) as {
        cards: { slug: string }[];
      };
      expect(listed.cards.some((c) => c.slug === "rollup-pin")).toBe(true);
    } finally {
      dispose();
    }
  });
});
