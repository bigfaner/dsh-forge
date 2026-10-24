// summon 视图静态渲染单测（召唤 Modal = HR 招聘对话，已批原型逐位）：头部标题 +
// ✕、消息流（hr/me 气泡、开场指引 ref）、输入行（placeholder + 发送钮）、遮罩
// role=dialog、SSR 态不触发交互。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SummonDialog } from "../src-client/panel/summon-dialog.js";
import { SummonChatController } from "../src-client/panel/summon-source.js";
import type { ExpertView } from "../src-client/panel/filter.js";

function expert(key: string): ExpertView {
  return {
    name: key,
    title: "新入职",
    description: "d",
    personaMd: "",
    tools: ["read"],
    skills: [],
    origin: "user",
    enabled: true,
    updatedAt: "2026-10-18T08:30:00.000Z",
  };
}

function render(controller: SummonChatController): string {
  return renderToStaticMarkup(React.createElement(SummonDialog, { controller }));
}

describe("SummonDialog 静态标记（原型 hrchat 逐位）", () => {
  it("开启态：头部标题 + 关闭钮 + 消息流 + 输入行 + 发送钮", () => {
    const c = new SummonChatController(async () => expert("expert-a"), () => undefined);
    c.open();
    const html = render(c);
    expect(html).toContain("dswf-hrchat");
    expect(html).toContain("HR · 专家招聘与管理");
    expect(html).toContain("你好，我是 HR");
    expect(html).toContain("对 HR 说：招募一个 XX 专家");
    expect(html).toContain("发送");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("dswf-hr-overlay");
  });

  it("hr 气泡带 ref 引导行；结构 class 与原型 msg.hr/msg.me 同型", () => {
    const c = new SummonChatController(async () => expert("expert-a"), () => undefined);
    c.open();
    const html = render(c);
    expect(html).toContain("msg hr");
    expect(html).toContain("dswf-msg-ref");
    expect(html).toContain("试试");
  });
});
