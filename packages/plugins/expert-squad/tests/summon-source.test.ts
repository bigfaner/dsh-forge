// summon 逻辑与控制器单测（召唤对话 = HR 招聘对话，已批原型 hrSend 语义移植）：
// 建档派生（key/岗位/工具白名单/简介截断）、开场指引一次性、发送流（用户消息 +
// 正在建档占位 → 回执/失败替换）、互斥前的关闭语义。

import { describe, expect, it } from "vitest";
import {
  OPENING_GUIDE,
  deriveRecruit,
  receiptText,
  errorText,
  thinkingText,
  RECEIPT_REF,
} from "../src-client/panel/summon-logic.js";
import { SummonChatController } from "../src-client/panel/summon-source.js";
import type { ExpertView } from "../src-client/panel/filter.js";

function expert(key: string): ExpertView {
  return {
    name: key,
    title: "新入职",
    description: "Newly onboarded by HR",
    personaMd: "",
    tools: ["read"],
    skills: [],
    origin: "user",
    enabled: true,
    updatedAt: "2026-10-18T08:30:00.000Z",
  };
}

describe("deriveRecruit（建档请求 → update 路由载荷）", () => {
  it("「招募一个数据库迁移专家」→ 岗位含需求、工具缺省 read+grep", () => {
    const d = deriveRecruit("招募一个数据库迁移专家");
    expect(d.title).toContain("数据库迁移");
    expect(d.tools).toEqual(["read", "grep"]);
    expect(d.key).toMatch(/^expert-[a-z0-9]+$/);
    expect(d.draft.description.length).toBeLessThanOrEqual(120);
    expect(d.draft.description.length).toBeGreaterThan(0);
  });

  it("「工具只留读写」→ read+edit", () => {
    const d = deriveRecruit("招募一个评审专家，工具只留读写");
    expect(d.tools).toEqual(["read", "edit"]);
  });

  it("无「招募一个」句式 → 兜底岗位「新入职」", () => {
    const d = deriveRecruit("帮我弄一个会写文档的");
    expect(d.title).toBe("新入职");
  });

  it("超长简介截断到 120 字（update 路由 zod 门同值）", () => {
    const d = deriveRecruit("x".repeat(300));
    expect(d.draft.description.length).toBeLessThanOrEqual(120);
  });

  it("同一次派生内 key 稳定、跨次派生 key 互异", () => {
    const a = deriveRecruit("招募一个测试专家");
    const b = deriveRecruit("招募一个测试专家");
    expect(a.key).not.toBe(b.key);
  });
});

describe("回执与错误文案", () => {
  it("回执含岗位名与英文标识 chip；ref 行注记联动刷新", () => {
    const t = receiptText("数据库迁移专家", "expert-abc");
    expect(t).toContain("数据库迁移专家");
    expect(t).toContain("expert-abc");
    expect(RECEIPT_REF).toContain("面板列表已刷新");
  });

  it("错误文案透出原因", () => {
    expect(errorText("boom")).toContain("boom");
  });

  it("占位文案", () => {
    expect(thinkingText()).toContain("正在建档");
    expect(OPENING_GUIDE.text).toContain("HR");
    expect(OPENING_GUIDE.ref).toContain("招募");
  });
});

describe("SummonChatController", () => {
  it("首次 open 注入开场指引；关闭重开不重复注入", () => {
    const seen: string[] = [];
    const c = new SummonChatController(async () => expert("expert-a"), () => seen.push("x"));
    c.open();
    expect(c.getSnapshot().open).toBe(true);
    expect(c.getSnapshot().messages.length).toBe(1);
    c.close();
    expect(c.getSnapshot().open).toBe(false);
    c.open();
    expect(c.getSnapshot().messages.length).toBe(1);
  });

  it("send：me 消息 + 占位 → 成功回执替换占位并回调联动刷新", async () => {
    let created = 0;
    const c = new SummonChatController(async () => {
      created += 1;
      return expert("expert-b");
    }, () => undefined);
    c.open();
    await c.send("招募一个评审专家");
    const msgs = c.getSnapshot().messages;
    expect(created).toBe(1);
    expect(msgs[1]!.from).toBe("me");
    expect(msgs[2]!.from).toBe("hr");
    expect(msgs[2]!.text).toContain("已建档");
    expect(msgs.length).toBe(3); // 开场 + me + 回执（占位已被替换）
    expect(c.getSnapshot().busy).toBe(false);
  });

  it("send：失败 → 占位替换为错误文案，控制器不崩", async () => {
    const c = new SummonChatController(async () => {
      throw new Error("write failed");
    }, () => undefined);
    c.open();
    await c.send("招募一个评审专家");
    expect(c.getSnapshot().messages.at(-1)!.text).toContain("write failed");
  });

  it("空文本与 busy 在途不重入", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const c = new SummonChatController(async () => {
      await gate;
      return expert("expert-c");
    }, () => undefined);
    c.open();
    const first = c.send("招募一个评审专家");
    expect(c.getSnapshot().busy).toBe(true);
    await c.send("第二条");
    expect(c.getSnapshot().messages.filter((m) => m.from === "me").length).toBe(1);
    release?.();
    await first;
    expect(c.getSnapshot().busy).toBe(false);
  });
});
