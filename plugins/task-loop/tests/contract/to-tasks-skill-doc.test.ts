// to-tasks SKILL.md 快照契约测试（plugin-task-loop 1.11——code-design §5 首个失败测试落位）：
// SKILL.md 模板行 vs batch_add_tasks 工具 schema 必填参数文本级对读 + 单次全批调用形态断言
// + 禁散调 grep + skill id 目录名约定 + shared 契约常量快照一致。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AC_RESULTS_KEY, CriterionAlignmentRule } from "../../shared/contract-constants.js";
import { createBatchAddTasksTool } from "../../host/tools/batch-add-tasks.js";

const PKG_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKILL_PATH = `${PKG_ROOT}skills/to-tasks/SKILL.md`;

const doc = readFileSync(SKILL_PATH, "utf8");

/** 工具 schema 必填集单源（batch_add_tasks 工具定义直读——不手抄清单）。 */
const tool = createBatchAddTasksTool({
  tasks: {} as Parameters<typeof createBatchAddTasksTool>[0]["tasks"],
  resolveProjectKey: () => "p",
});
const REQUIRED_ROOT_PARAMS = tool.parameters.required ?? [];

/** 任务项格（模板必须逐格覆盖的 agent 面参数——snake_case）。 */
const ITEM_PARAMS = [
  "local_id",
  "title",
  "type",
  "brief",
  "acceptance_criteria",
  "priority",
  "estimated_time",
  "scope",
  "context",
  "depends_on",
  "before",
  "source_task_slug",
  "source_task_local_id",
  "block_source",
  "breaking",
  "coverage_threshold",
  "complexity",
] as const;

describe("to-tasks SKILL.md 快照契约", () => {
  it("skill id = 目录名 to-tasks（官方 skill 面目录约定：frontmatter name 与目录名一致）", () => {
    expect(SKILL_PATH.replace(/\\/g, "/")).toContain("skills/to-tasks/SKILL.md");
    expect(doc).toMatch(/^---\nname: to-tasks\n/);
    expect(doc).toMatch(/^description: /m);
  });

  it("六章骨架在位（适用与前置/spec 探测分叉/拆解规则/收尾模板/判例检索提示/自查清单——1.15 quick-tasks 替代退役，判例检索职责随迁入章）", () => {
    expect(doc).toContain("## 一、适用与前置");
    expect(doc).toContain("## 二、spec 在场探测分叉");
    expect(doc).toContain("## 三、拆解规则");
    expect(doc).toContain("## 四、收尾模板");
    expect(doc).toContain("## 五、判例检索提示");
    expect(doc).toContain("## 六、自查清单");
  });

  it("收尾模板与 batch_add_tasks 工具 schema 必填参数逐项对读一致（模板格覆盖每个必填参数）", () => {
    expect(REQUIRED_ROOT_PARAMS).toEqual(["slug", "tasks"]);
    for (const param of REQUIRED_ROOT_PARAMS) {
      expect(doc).toContain(param);
    }
    for (const param of ITEM_PARAMS) {
      expect(doc).toContain(param);
    }
  });

  it("单次全批调用形态断言（模板 = 单次 batch_add_tasks({ slug, tasks: [ ... ] })）", () => {
    expect(doc).toContain("batch_add_tasks({");
    expect(doc).toContain("tasks: [");
    expect(doc).toContain("禁散调");
  });

  it("禁逐条散调指令（grep add_task({ 零命中——batch_add_tasks({ 不误伤）", () => {
    expect(doc).not.toMatch(/add_task\(\{/g);
  });

  it("判据逐字一致铁律在位（verbatim 铁律句）", () => {
    expect(doc).toContain("逐字一致");
    expect(doc).toContain("禁转述");
  });

  it("facets 提示字段在位（档位期望面 → context facets 键预填，零 spec 感知随判据走）", () => {
    expect(doc).toContain("facets 提示");
    expect(doc).toContain("facets=<ui,api>");
    expect(doc).toContain("仅 warn 提示");
  });

  it("shared 契约常量快照一致（AC 核销键 + 判据文本对齐规则）", () => {
    expect(AC_RESULTS_KEY).toBe("ac_results");
    const rule: CriterionAlignmentRule = {
      joinKey: "ac_results_json[].criterion",
      invariant: "verbatim",
    };
    expect(rule).toMatchObject({ joinKey: "ac_results_json[].criterion", invariant: "verbatim" });
  });
});
