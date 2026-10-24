// panel 详情 Dialog 单测（ui-design F2 查看/编辑双模式）：纯逻辑面（校验/multi-select/
// Markdown 分块）+ ExpertDetailController 状态机（保存/启停/取消流）+ SSR 静态标记
// 逐位断言（查看态分段/编辑态字段/双模式切换件）+ 列表 patchEntry 卡片即时同步。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DESCRIPTION_MAX,
  TOOL_CANDIDATES,
  addSkill,
  draftOf,
  hasBareMustache,
  personaBlocks,
  toggleInList,
  unionSkills,
  validateDraft,
  type ExpertDraft,
} from "../src-client/panel/detail-logic.js";
import {
  ExpertDetailController,
  type DetailMutations,
} from "../src-client/panel/detail-source.js";
import { ExpertDetailDialog } from "../src-client/panel/detail-dialog.js";
import type { ExpertView } from "../src-client/panel/filter.js";
import { ExpertListController } from "../src-client/panel/list-source.js";

function entry(overrides: Partial<ExpertView> = {}): ExpertView {
  return {
    name: "code-reviewer",
    title: "资深评审",
    description: "Runs code review",
    personaMd: "## 职责\n- 评审 diff 与正确性\n`pnpm lint` **必须**先绿",
    tools: ["read", "edit"],
    skills: ["review", "tsc"],
    origin: "project",
    enabled: true,
    updatedAt: "2026-10-18T08:30:00.000Z",
    ...overrides,
  };
}

function noMutations(): DetailMutations {
  return {
    update: async () => entry(),
    setEnabled: async (_key: string, _enabled: boolean) => entry(),
  };
}

// ---- 纯逻辑面 ---------------------------------------------------------------

describe("detail-logic 校验（F2 保存门）", () => {
  it("空岗位 → 字段级错误；裸 {{ 人设 → 字段级错误", () => {
    expect(validateDraft(draftOf(entry({ title: "" })))).toEqual({
      title: "岗位不能为空",
    });
    expect(validateDraft(draftOf(entry({ title: "   " })))).toEqual({
      title: "岗位不能为空",
    });
    const bad = draftOf(entry());
    expect(validateDraft({ ...bad, personaMd: "ok {{x" })).toEqual({
      personaMd: '人设含裸 {{ ——不被允许',
    });
    expect(validateDraft(draftOf(entry()))).toEqual({});
  });

  it("hasBareMustache 命中任意 {{ 出现", () => {
    expect(hasBareMustache("a {{ b")).toBe(true);
    expect(hasBareMustache("clean")).toBe(false);
  });

  it("简介上限常量 = 120", () => {
    expect(DESCRIPTION_MAX).toBe(120);
  });
});

describe("detail-logic multi-select", () => {
  it("toggleInList 勾选/取消", () => {
    expect(toggleInList(["read"], "edit")).toEqual(["read", "edit"]);
    expect(toggleInList(["read", "edit"], "edit")).toEqual(["read"]);
  });

  it("addSkill 非空去重新增", () => {
    expect(addSkill(["a"], "b")).toEqual(["a", "b"]);
    expect(addSkill(["a"], "a")).toEqual(["a"]);
    expect(addSkill(["a"], "  ")).toEqual(["a"]);
  });

  it("unionSkills 汇总全目录技能候选（去重保序）", () => {
    expect(unionSkills([entry(), entry({ name: "b", skills: ["tsc", "vue"] })])).toEqual([
      "review",
      "tsc",
      "vue",
    ]);
  });

  it("工具候选为固定白名单清单", () => {
    expect(TOOL_CANDIDATES).toContain("read");
    expect(TOOL_CANDIDATES).toContain("bash");
  });

  it("draftOf 深拷贝字段（编辑不污染原档案）", () => {
    const source = entry();
    const draft = draftOf(source);
    (draft.tools as string[]).push("x");
    expect(source.tools).toEqual(["read", "edit"]);
  });
});

describe("personaBlocks（查看态 Markdown 分块）", () => {
  it("标题/列表/段落分块 + 行内加粗与行内代码", () => {
    const blocks = personaBlocks("## 职责\n- 评审 diff\n`pnpm lint` **必须**先绿");
    expect(blocks).toEqual([
      { kind: "heading", inline: [{ t: "text", v: "职责" }] },
      { kind: "li", inline: [{ t: "text", v: "评审 diff" }] },
      {
        kind: "para",
        inline: [
          { t: "code", v: "pnpm lint" },
          { t: "text", v: " " },
          { t: "b", v: "必须" },
          { t: "text", v: "先绿" },
        ],
      },
    ]);
  });
});

// ---- 控制器状态机 -----------------------------------------------------------

describe("ExpertDetailController（F2 双模式状态机）", () => {
  it("关闭态 getSnapshot 引用稳定（useSyncExternalStore 快照契约——fix-4 恒骨架回归钉）", () => {
    const ctl = new ExpertDetailController(noMutations());
    // state === undefined（Dialog 未开/已关）时连续读取必须同一引用——
    // 每次新对象会被 useSyncExternalStore 判为快照变化 → 无限重渲染（React #185）
    expect(ctl.getSnapshot()).toBe(ctl.getSnapshot());
    ctl.open(entry());
    ctl.close();
    // close 回 undefined 后同理：关闭态快照引用仍稳定
    expect(ctl.getSnapshot()).toBe(ctl.getSnapshot());
  });

  it("open → 查看态快照；startEdit → 编辑态预填草稿", () => {
    const ctl = new ExpertDetailController(noMutations());
    expect(ctl.getSnapshot().open).toBe(false);
    ctl.open(entry());
    expect(ctl.getSnapshot().open).toBe(true);
    expect(ctl.getSnapshot().mode).toBe("view");
    ctl.startEdit();
    expect(ctl.getSnapshot().mode).toBe("edit");
    expect(ctl.getSnapshot().draft.title).toBe("资深评审");
  });

  it("保存校验失败：字段级错误落态、不调 update、停留编辑态", async () => {
    let called = 0;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async () => {
        called += 1;
        return entry();
      },
    });
    ctl.open(entry());
    ctl.startEdit();
    ctl.setField("title", "");
    await ctl.save();
    expect(called).toBe(0);
    expect(ctl.getSnapshot().mode).toBe("edit");
    expect(ctl.getSnapshot().errors.title).toBe("岗位不能为空");
  });

  it("保存成功：update 带全载荷 → 回查看态 + 专家换新 + Toast 热刷新", async () => {
    let payload: ExpertDraft | undefined;
    const updated = entry({ title: "首席评审" });
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async (_name, draft) => {
        payload = draft;
        return updated;
      },
    });
    ctl.open(entry());
    ctl.startEdit();
    ctl.setField("title", "首席评审");
    await ctl.save();
    expect(payload?.title).toBe("首席评审");
    expect(ctl.getSnapshot().mode).toBe("view");
    expect(ctl.getSnapshot().expert).toBe(updated);
    expect(ctl.getSnapshot().toast).toContain("热刷新生效");
  });

  it("保存写失败：停留编辑态 + Toast 透出错误", async () => {
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async () => {
        throw new Error("写失败");
      },
    });
    ctl.open(entry());
    ctl.startEdit();
    await ctl.save();
    expect(ctl.getSnapshot().mode).toBe("edit");
    expect(ctl.getSnapshot().toast).toContain("写失败");
  });

  it("启停：setEnabled(!enabled) → 专家换新 + Toast 已禁用/已启用", async () => {
    const calls: boolean[] = [];
    const ctl = new ExpertDetailController({
      ...noMutations(),
      setEnabled: async (_key, enabled) => {
        calls.push(enabled);
        return entry({ enabled });
      },
    });
    ctl.open(entry());
    await ctl.toggleEnabled();
    expect(calls).toEqual([false]);
    expect(ctl.getSnapshot().expert.enabled).toBe(false);
    expect(ctl.getSnapshot().toast).toContain("已禁用");
    await ctl.toggleEnabled();
    expect(calls).toEqual([false, true]);
    expect(ctl.getSnapshot().toast).toContain("已启用");
  });

  it("cancelEdit 丢弃草稿回查看态（原档案不污染）", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry());
    ctl.startEdit();
    ctl.setField("title", "改稿");
    ctl.cancelEdit();
    expect(ctl.getSnapshot().mode).toBe("view");
    expect(ctl.getSnapshot().expert.title).toBe("资深评审");
  });
});

// ---- SSR 静态渲染（F2 组件树逐位） -----------------------------------------

function renderDialog(overrides: {
  mode?: "view" | "edit";
  enabled?: boolean;
  errors?: Partial<ExpertDraft extends never ? never : Record<string, string | undefined>>;
} = {}): string {
  const ctl = new ExpertDetailController(noMutations());
  ctl.open(entry({ enabled: overrides.enabled ?? true }));
  if ((overrides.mode ?? "view") === "edit") ctl.startEdit();
  return renderToStaticMarkup(
    React.createElement(ExpertDetailDialog, {
      controller: ctl,
      allSkills: ["review", "tsc"],
    }),
  );
}

describe("ExpertDetailDialog 查看态（F2 分段）", () => {
  it("头部（灯/名称/标识 chip/编辑钮）+ meta 行", () => {
    const html = renderDialog();
    expect(html).toContain("dot on");
    expect(html).toContain("code-reviewer");
    expect(html).toContain(">编辑<");
    expect(html).toContain("资深评审 · 启用中");
  });

  it("查看态分段：简介/人设（Markdown 渲染）/工具白名单 chips/技能 chips", () => {
    const html = renderDialog();
    expect(html).toContain("简介（何时委派我）");
    expect(html).toContain("人设（Persona · 派发时注入子会话）");
    expect(html).toContain('<strong class="dswf-dlg-md-h"><span>职责</span></strong>');
    expect(html).toContain("<code>pnpm lint</code>");
    expect(html).toContain("<li><span>评审 diff 与正确性</span></li>");
    expect(html).toContain("工具白名单（子会话强制生效）");
    expect(html).toContain("技能标签");
    expect(html).toContain('class="chip tool"');
  });

  it("底部启停钮：启用中 → 禁用；已禁用 → 启用 + meta 同步", () => {
    expect(renderDialog()).toContain(">禁用<");
    const off = renderDialog({ enabled: false });
    expect(off).toContain("dot off");
    expect(off).toContain("已禁用");
    expect(off).toContain(">启用<");
  });
});

describe("ExpertDetailDialog 编辑态（F2 字段集）", () => {
  it("岗位 Input + 简介 textarea（120 上限）+ 人设 textarea + 保存钮", () => {
    const html = renderDialog({ mode: "edit" });
    expect(html).toContain('data-field="title"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('data-field="personaMd"');
    expect(html).toContain(">保存<");
    expect(html).toContain("简介（模型选人依据：何时委派我");
    expect(html).toContain("Markdown 自由输入");
  });

  it("multi-select：工具白名单在上、技能标签在下，box 显已选 chips", () => {
    const html = renderDialog({ mode: "edit" });
    expect(html).toContain('data-msel="tools"');
    expect(html).toContain('data-msel="skills"');
    expect(html.indexOf('data-msel="tools"')).toBeLessThan(html.indexOf('data-msel="skills"'));
    expect(html).toContain('data-msel-chip="read"');
    expect(html).toContain('data-msel-chip="tsc"');
  });

  it("字段级错误落态：岗位/人设错误文本在场", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry());
    ctl.startEdit();
    ctl.setField("title", "");
    void ctl.save();
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, {
        controller: ctl,
        allSkills: [],
      }),
    );
    expect(html).toContain("岗位不能为空");
  });
});

// ---- 列表卡片即时同步 -------------------------------------------------------

describe("ExpertListController.patchEntry（卡片同步）", () => {
  it("按 name 原子换新并通知订阅者", async () => {
    let resolveList!: (entries: ExpertView[]) => void;
    const ctl = new ExpertListController(
      {
        fetchList: () =>
          new Promise<ExpertView[]>((resolve) => {
            resolveList = resolve;
          }),
      },
      60_000,
    );
    ctl.start();
    resolveList([entry()]);
    await new Promise((resolve) => setTimeout(resolve, 0)); // 首拉落 ready，排除轮询回写竞态
    let notified = 0;
    ctl.subscribe(() => {
      notified += 1;
    });
    ctl.patchEntry(entry({ title: "首席评审", enabled: false }));
    expect(notified).toBe(1);
    expect(ctl.getSnapshot().entries[0]?.title).toBe("首席评审");
    expect(ctl.getSnapshot().entries[0]?.enabled).toBe(false);
    ctl.stop();
  });
});
