// 任务 type 词表 schema 封闭 pin（pitfall type-fail-loud-unknown-task-type——校验优先
// 落注册面 schema 层）：add_task / update_task 的 type 参数必须携 TASK_TYPES 全集 enum；
// batch_add_tasks 因 items 为 JSON 串（schema 不可达）以描述文本承载族名警示。
import { describe, expect, it } from "vitest";
import { TASK_TYPES } from "@dsh-forge/lib-api/labels";
import { createAddTaskTool } from "../../host/tools/add-task.js";
import { createBatchAddTasksTool } from "../../host/tools/batch-add-tasks.js";
import { createUpdateTaskTool } from "../../host/tools/update-task.js";
import { TASK_TYPE_ENUM } from "../../host/tools/faces.js";

const deps = { verbDeps: {} as never, resolveProjectKey: () => "p" };

describe("任务 type 词表 schema 封闭（schema 层校验优先——写入代码不加硬检查）", () => {
  it("TASK_TYPE_ENUM 单源 = contracts TASK_TYPES 全集（两工具与 pin 同消费一常量，禁复制）", () => {
    expect(TASK_TYPE_ENUM).toEqual([...TASK_TYPES]);
    expect(createAddTaskTool(deps).parameters.properties["type"].enum).toBe(TASK_TYPE_ENUM);
    expect(createUpdateTaskTool({ verbDeps: {} as never }).parameters.properties["type"].enum).toBe(TASK_TYPE_ENUM);
  });

  it("batch_add_tasks tasks 描述承载族名警示（items 为 JSON 串——schema enum 不可达）", () => {
    const desc = createBatchAddTasksTool({ tasks: {} as never }).parameters.properties["tasks"].description;
    expect(desc).toContain("exact TASK_TYPES value");
    expect(desc).toContain("family names like 'coding' are invalid");
  });

  it("词表无裸族名 'coding'（诱发因子回归锚——裸族名不是合法精确值；'doc' 恰为合法值不可误伤）", () => {
    expect(TASK_TYPES).not.toContain("coding");
    expect(TASK_TYPES).toContain("doc");
  });
});
