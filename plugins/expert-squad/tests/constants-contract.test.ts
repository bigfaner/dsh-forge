// 跨插件契约常量快照契约测试（code-design §2.2——task-loop 对检锚）：
// import 硬锚包内转发位 ../shared/constants（值真源 = @dsh-forge/contracts 定义位）。
// 改值即红，双包同提交协定；排除集快照顺序敏感（白名单求交投影顺序即契约）。

import { describe, expect, it } from "vitest";
import { EXCLUDED_EXPERT_TOOL_NAMES, EXPERTS_SERVICE_KEY } from "../shared/constants.js";

describe("跨插件契约常量快照（task-loop 对检锚——改值即红，双包同提交协定）", () => {
  it("EXPERTS_SERVICE_KEY", () => {
    expect(EXPERTS_SERVICE_KEY).toMatchInlineSnapshot(`"experts"`);
  });

  it("EXCLUDED_EXPERT_TOOL_NAMES（顺序敏感——白名单求交投影顺序即契约）", () => {
    expect(EXCLUDED_EXPERT_TOOL_NAMES).toMatchInlineSnapshot(`
      [
        "list_tools",
        "list_skills",
        "recruit_expert",
        "update_expert",
        "rename_expert",
        "enable_expert",
        "disable_expert",
      ]
    `);
  });

  it("排除集不含取用/委派保留项", () => {
    expect(EXCLUDED_EXPERT_TOOL_NAMES).not.toContain("list_experts");
    expect(EXCLUDED_EXPERT_TOOL_NAMES).not.toContain("delegate_expert");
  });
});
