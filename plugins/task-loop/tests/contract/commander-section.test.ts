// forge:commander 段契约（plugin-task-loop 1.12 直迁——注册面同体、行为零变化；
// experts 条件锚按 AGENTS 1.6 可选消费配方改写）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORGE_COMMANDER_SECTION_NAME,
  FORGE_COMMANDER_SECTION_ORDER,
  commanderSectionText,
  renderCommanderSection,
} from "../../host/prompt/commander.js";

const HERE = join(import.meta.dirname, "..", "..", "host", "prompt");

describe("forge:commander 段（直迁契约 pin）", () => {
  it("段名/段序（dispatch-loop 512 之后——forge 段族次序稳定）", () => {
    expect(FORGE_COMMANDER_SECTION_NAME).toBe("forge:commander");
    expect(FORGE_COMMANDER_SECTION_ORDER).toBe(513);
  });

  it("话术锚（expert-squad 既有判据续用——文本级对读）", () => {
    const text = renderCommanderSection();
    expect(text).toContain("查找专家");
    expect(text).toContain("职责近似时选更合适");
    expect(text).not.toContain("专家体系影响面核对");
  });

  it("experts 条件锚（1.6 配方）：服务缺席 = 空串；主会话在场 = 全文；子会话装配 = 空串", () => {
    const present = () => true;
    const absent = () => false;
    const mainContext = { agent: { id: "s1" } };
    const subContext = { agent: { id: "s2", session: { header: { origin: "subagent" } } } };
    expect(commanderSectionText(mainContext, absent)).toBe("");
    expect(commanderSectionText(mainContext, present)).toBe(renderCommanderSection());
    expect(commanderSectionText(subContext, present)).toBe("");
  });

  it("段文本禁裸 {{（SystemPrompt 插值炸渲染防护——既有纪律句续用）", () => {
    const src = readFileSync(join(HERE, "commander.ts"), "utf8");
    const text = renderCommanderSection();
    expect(text).not.toContain("{{");
    expect(src).toContain("文本禁用裸 {{");
  });
});
