// panel 详情 Dialog 单测（ui-design F2 查看/编辑双模式）：纯逻辑面（校验/multi-select/
// Markdown 分块）+ ExpertDetailController 状态机（保存/启停/取消流）+ SSR 静态标记
// 逐位断言（查看态分段/编辑态字段/双模式切换件）+ 列表 patchEntry 卡片即时同步。

import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DESCRIPTION_MAX,
  TOOL_CANDIDATES,
  addSkill,
  draftOf,
  hasBareMustache,
  personaBlocks,
  skillCandidatesOf,
  toggleInList,
  toolCandidatesOf,
  unionSkills,
  validateDraft,
  type ExpertDraft,
} from "../src-client/panel/detail-logic.js";
import {
  ExpertDetailController,
  TOAST_AUTO_DISMISS_MS,
  type DetailMutations,
} from "../src-client/panel/detail-source.js";
import {
  ExpertDetailDialog,
  attachMselCollapse,
  dialogDragPos,
  mselMenuPlacement,
  mselMenuStyleEqual,
  mselNextOpen,
} from "../src-client/panel/detail-dialog.js";
import {
  INHERIT_OPTION,
  modelCatalogLoaderOf,
  modelCatalogOfEnvelope,
  modelOptionsOf,
  providerOptionsOf,
} from "../src-client/panel/model-catalog.js";
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

  it("工具候选兜底清单在场（目录缺席回退用）", () => {
    expect(TOOL_CANDIDATES).toContain("read");
    expect(TOOL_CANDIDATES).toContain("bash");
  });

  it("toolCandidatesOf：目录在场 = 目录清单（去重保序，含插件追加工具）；缺席 = 兜底清单", () => {
    expect(toolCandidatesOf(["read", "pwsh", "read", "delegate_expert"])).toEqual([
      "read",
      "pwsh",
      "delegate_expert",
    ]);
    expect(toolCandidatesOf(undefined)).toBe(TOOL_CANDIDATES);
  });

  it("skillCandidatesOf：目录在场 = 目录为主源 ∪ 档案技能（历史值保持可选）；缺席 = 并集回退", () => {
    const entries = [entry(), entry({ name: "b", skills: ["tsc", "vue"] })];
    expect(skillCandidatesOf(["sql", "review"], entries)).toEqual([
      "sql",
      "review",
      "tsc",
      "vue",
    ]);
    expect(skillCandidatesOf([], entries)).toEqual(["review", "tsc", "vue"]);
    expect(skillCandidatesOf(undefined, entries)).toEqual(["review", "tsc", "vue"]);
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

  // bug b29f77e7：``` 围栏 → code 块（lang + 原文 source）；围栏体不做行内解析。
  it("bug b29f77e7: 围栏代码块分块（lang 透传 + 源原样；未闭合围栏兜底到末尾）", () => {
    const blocks = personaBlocks("前文\n```mermaid\nflowchart LR\n  A-->B\n```\n后文");
    expect(blocks).toEqual([
      { kind: "para", inline: [{ t: "text", v: "前文" }] },
      { kind: "code", lang: "mermaid", source: "flowchart LR\n  A-->B" },
      { kind: "para", inline: [{ t: "text", v: "后文" }] },
    ]);
    // 未闭合围栏：余下行为 code 块（不吞前后文语义）
    const unclosed = personaBlocks("```mermaid\nflowchart TD\n  A-->B");
    expect(unclosed).toEqual([
      { kind: "code", lang: "mermaid", source: "flowchart TD\n  A-->B" },
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

  it("Toast 3s 自动消失（同文案到点才清；关闭后到点 no-op）", async () => {
    vi.useFakeTimers();
    try {
      const ctl = new ExpertDetailController(noMutations());
      ctl.open(entry());
      ctl.startEdit();
      await ctl.save();
      expect(ctl.getSnapshot().toast).toContain("热刷新生效");
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
      expect(ctl.getSnapshot().toast).toBeUndefined();
      // 关闭后定时器不再落态（IDLE 单例契约不被破坏）
      ctl.open(entry());
      ctl.startEdit();
      await ctl.save();
      ctl.close();
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
      expect(ctl.getSnapshot().open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bug 13f807c4: 编辑态+条目被删（stale）——渲染期派生 stale 通知控制器后，save 短路不发 update", async () => {
    let updates = 0;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async () => {
        updates += 1;
        return entry();
      },
    });
    ctl.open(entry());
    ctl.startEdit();
    // sameKeyEntries 不含打开条目 = 已删；Dialog 渲染期派生 stale 并通知控制器（装配缝）
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, {
        controller: ctl,
        allSkills: [],
        sameKeyEntries: [],
      }),
    );
    expect(html).toContain("该专家已不存在");
    await ctl.save();
    expect(updates).toBe(0); // 守卫在场前：update upsert 复活已删条目
  });

  it("bug 13f807c4: 编辑态+条目被删——保存钮 disabled（busy || stale）", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry());
    ctl.startEdit();
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, {
        controller: ctl,
        allSkills: [],
        sameKeyEntries: [],
      }),
    );
    expect(html).toMatch(/disabled[^>]*>保存</);
  });

  it("bug 13f807c4: stale 下 toggleEnabled 亦短路不发路由；条目恢复后守卫解除", async () => {
    let toggles = 0;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      setEnabled: async (_key, enabled) => {
        toggles += 1;
        return entry({ enabled });
      },
    });
    ctl.open(entry());
    // 直接经控制器装配缝置 stale（渲染派生面之外入口绕过防线）
    ctl.setStale(true);
    await ctl.toggleEnabled();
    expect(toggles).toBe(0);
    ctl.setStale(false);
    await ctl.toggleEnabled();
    expect(toggles).toBe(1);
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

  it("bug e234f626: A 在途保存 → close → open B → A 迟到回包不污染 B（代际失效）", async () => {
    let release!: (expert: ExpertView) => void;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: () =>
        new Promise<ExpertView>((resolve) => {
          release = resolve;
        }),
    });
    ctl.open(entry());
    ctl.startEdit();
    const saving = ctl.save();
    ctl.close();
    const expertB = entry({ name: "b-reviewer", title: "B 评审" });
    ctl.open(expertB);
    release(entry({ title: "迟到的 A" }));
    await saving;
    expect(ctl.getSnapshot().open).toBe(true);
    expect(ctl.getSnapshot().expert.name).toBe("b-reviewer");
    expect(ctl.getSnapshot().toast).toBeUndefined();
  });

  it("bug e234f626: 关闭态迟到回包不破坏 IDLE 快照单例契约", async () => {
    let release!: (expert: ExpertView) => void;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: () =>
        new Promise<ExpertView>((resolve) => {
          release = resolve;
        }),
    });
    ctl.open(entry());
    ctl.startEdit();
    const saving = ctl.save();
    ctl.close();
    release(entry());
    await saving;
    expect(ctl.getSnapshot().open).toBe(false);
    expect(ctl.getSnapshot()).toBe(ctl.getSnapshot());
  });

  it("bug e234f626: A 在途启停 → close → A 迟到回包不落态（IDLE 单例保持）", async () => {
    let release!: (expert: ExpertView) => void;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      setEnabled: () =>
        new Promise<ExpertView>((resolve) => {
          release = resolve;
        }),
    });
    ctl.open(entry());
    const toggling = ctl.toggleEnabled();
    ctl.close();
    release(entry({ enabled: false }));
    await toggling;
    expect(ctl.getSnapshot().open).toBe(false);
    expect(ctl.getSnapshot()).toBe(ctl.getSnapshot());
  });
});

// ---- provider/model 成对编辑（expert-squad-forge-2 1.10）---------------------

describe("provider/model 成对编辑（1.10）", () => {
  it("校验：只填其一 → 成对错误落对应字段；都填/都空 → 通过", () => {
    const base = draftOf(entry());
    expect(validateDraft({ ...base, provider: "deepseek", model: "" })).toEqual({
      provider: "provider 与 model 须成对填写（或同时清空回落继承）",
    });
    expect(validateDraft({ ...base, provider: "  ", model: "sonnet" })).toEqual({
      model: "provider 与 model 须成对填写（或同时清空回落继承）",
    });
    expect(validateDraft({ ...base, provider: "deepseek", model: "sonnet" })).toEqual({});
    expect(validateDraft({ ...base, provider: "", model: "" })).toEqual({});
  });

  it("draftOf 携带档案 provider/model（编辑预填）", () => {
    const draft = draftOf(entry({ provider: "deepseek", model: "reasoner" }));
    expect(draft.provider).toBe("deepseek");
    expect(draft.model).toBe("reasoner");
    expect(draftOf(entry()).provider).toBe("");
  });

  it("负向：只填 provider 保存 → 不落半组（update 不被调用）+ 字段级错误", async () => {
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
    ctl.setField("provider", "deepseek");
    await ctl.save();
    expect(called).toBe(0);
    expect(ctl.getSnapshot().errors.provider).toContain("成对");
    expect(ctl.getSnapshot().mode).toBe("edit");
  });

  it("成对保存：整组进 update 载荷（热刷新 Toast 语义不变）", async () => {
    let payload: ExpertDraft | undefined;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async (_name, draft) => {
        payload = draft;
        return entry();
      },
    });
    ctl.open(entry());
    ctl.startEdit();
    ctl.setField("provider", " deepseek ");
    ctl.setField("model", "reasoner");
    await ctl.save();
    expect(payload?.provider).toBe("deepseek");
    expect(payload?.model).toBe("reasoner");
    expect(ctl.getSnapshot().toast).toContain("热刷新生效");
  });

  it("清空两字段保存 → 载荷两键归缺（frontmatter 无键回落继承）", async () => {
    let payload: ExpertDraft | undefined;
    const ctl = new ExpertDetailController({
      ...noMutations(),
      update: async (_name, draft) => {
        payload = draft;
        return entry();
      },
    });
    ctl.open(entry({ provider: "deepseek", model: "reasoner" }));
    ctl.startEdit();
    ctl.setField("provider", "");
    ctl.setField("model", "  ");
    await ctl.save();
    expect(payload).toBeDefined();
    expect("provider" in (payload as object)).toBe(false);
    expect("model" in (payload as object)).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('"provider"');
  });

  it("编辑态 SSR：provider/model 单选下拉在场（成对相邻；box 显当前值）", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry({ provider: "deepseek", model: "reasoner" }));
    ctl.startEdit();
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, { controller: ctl, allSkills: [] }),
    );
    expect(html).toContain('data-field="provider"');
    expect(html).toContain('data-field="model"');
    expect(html).toContain('aria-label="Provider"');
    expect(html).toContain('aria-label="Model"');
    expect(html.indexOf('data-field="provider"')).toBeLessThan(html.indexOf('data-field="model"'));
    // 同行双列（dswf-dlg-row 包裹——provider/model 成对并排）
    expect(html).toContain('data-field="provider-model"');
    // box 显当前档案值（菜单收起 = 选项不在 SSR 标记——FilterSelect 条件渲染语义）
    expect(html).toContain('data-select="dswf-dlg-provider"');
    expect(html).toContain('data-select="dswf-dlg-model"');
    expect(html).toContain('data-select-value="deepseek"');
    expect(html).toContain('data-select-value="reasoner"');
  });

  it("model 选项随所选 provider 联动（仅该 provider 的模型）", () => {
    const catalog = [
      { provider: "deepseek", models: ["deepseek-chat", "deepseek-reasoner"] },
      { provider: "zai-coding-cn", models: ["glm-4.6"] },
    ];
    expect(modelOptionsOf(catalog, "zai-coding-cn")).toEqual([
      { value: "", label: "（回落继承）" },
      { value: "glm-4.6", label: "glm-4.6" },
    ]);
    // provider 未选/不在目录 = 仅继承项
    expect(modelOptionsOf(catalog, "")).toEqual([{ value: "", label: "（回落继承）" }]);
    expect(modelOptionsOf(undefined, "deepseek")).toEqual([{ value: "", label: "（回落继承）" }]);
    expect(providerOptionsOf(catalog).map((o) => o.value)).toEqual(["", "deepseek", "zai-coding-cn"]);
    expect(providerOptionsOf(undefined)).toEqual([{ value: "", label: "（回落继承）" }]);
  });

  it("modelCatalogOfEnvelope：官方 ModelCatalog 信封解包（!ok/缺 groups/畸形 = undefined）", () => {
    const envelope = {
      ok: true,
      value: { groups: [{ id: "deepseek", models: [{ id: "deepseek-chat" }] }, { id: "", models: [] }, "junk"] },
    };
    expect(modelCatalogOfEnvelope(envelope)).toEqual([
      { provider: "deepseek", models: ["deepseek-chat"] },
    ]);
    expect(modelCatalogOfEnvelope({ ok: false })).toBeUndefined();
    expect(modelCatalogOfEnvelope({ ok: true, value: {} })).toBeUndefined();
    expect(modelCatalogOfEnvelope(null)).toBeUndefined();
  });

  it("modelCatalogLoaderOf：remote.session 惰性反射双径 + 解信封；缺席/拒绝 = undefined", async () => {
    const envelope = { ok: true, value: { groups: [{ id: "p", models: [{ id: "m" }] }] } };
    const direct = modelCatalogLoaderOf({
      reflect: { get: (name) => (name === "remote.session" ? { modelCatalog: () => Promise.resolve(envelope) } : undefined) },
    });
    await expect(direct()).resolves.toEqual([{ provider: "p", models: ["m"] }]);
    const nested = modelCatalogLoaderOf({
      reflect: { get: (name) => (name === "remote" ? { session: { modelCatalog: () => Promise.resolve(envelope) } } : undefined) },
    });
    await expect(nested()).resolves.toEqual([{ provider: "p", models: ["m"] }]);
    const absent = modelCatalogLoaderOf({ reflect: { get: () => undefined } });
    await expect(absent()).resolves.toBeUndefined();
    const rejected = modelCatalogLoaderOf({
      reflect: { get: () => ({ modelCatalog: () => Promise.reject(new Error("boom")) }) },
    });
    await expect(rejected()).resolves.toBeUndefined();
  });

  it("dialogDragPos：头部拖拽位移纯决策（起点锚 + 指针增量）；INHERIT_OPTION 语义", () => {
    const start = { px: 100, py: 80, left: 300, top: 120 };
    expect(dialogDragPos(start, 140, 60)).toEqual({ left: 340, top: 100 });
    expect(dialogDragPos(start, 100, 80)).toEqual({ left: 300, top: 120 });
    expect(INHERIT_OPTION).toEqual({ value: "", label: "（回落继承）" });
  });
});

// ---- SSR 静态渲染（F2 组件树逐位） -----------------------------------------

function renderDialog(overrides: {
  mode?: "view" | "edit";
  enabled?: boolean;
  personaMd?: string;
  errors?: Partial<ExpertDraft extends never ? never : Record<string, string | undefined>>;
} = {}): string {
  const ctl = new ExpertDetailController(noMutations());
  ctl.open(entry({ enabled: overrides.enabled ?? true, ...(overrides.personaMd !== undefined ? { personaMd: overrides.personaMd } : {}) }));
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

  it("查看态分段：简介/人设（Markdown 渲染）/工具 chips/派发路由/技能 chips", () => {
    const html = renderDialog();
    expect(html).toContain("简介（何时委派我）");
    expect(html).toContain("人设（Persona · 派发时注入子会话）");
    expect(html).toContain('<strong class="dswf-dlg-md-h"><span>职责</span></strong>');
    expect(html).toContain("<code>pnpm lint</code>");
    expect(html).toContain("<li><span>评审 diff 与正确性</span></li>");
    expect(html).toContain("工具（子会话强制生效）");
    expect(html).toContain("技能"); // 1.69 裁决：详情 Dialog「技能标签」→「技能」
    expect(html).toContain('class="chip tool"');
    // 派发路由（成对在场 = 值对；缺省 = 回落继承）
    expect(html).toContain("派发路由（Provider · Model）");
    expect(html).toContain("（回落继承）");
    const pairedCtl = new ExpertDetailController(noMutations());
    pairedCtl.open(entry({ provider: "deepseek", model: "reasoner" }));
    const paired = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, { controller: pairedCtl, allSkills: [] }),
    );
    expect(paired).toContain("deepseek · reasoner");
  });

  // bug b29f77e7：人设围栏 → 官方 .md-code-block 结构（data-code-block-content 锚 +
  // pre>code 源）——md-mermaid 全局 DOM 增强器（壳 apply 期启动、观察 body 子树）
  // 按此结构出图（mermaid fence → 旁插 figure + 隐藏原块）；非 mermaid 围栏 = 普通代码块。
  it("bug b29f77e7: 人设围栏渲染为官方 .md-code-block 结构（增强器出图契约面）", () => {
    const html = renderDialog({
      personaMd: "## 信条\n```mermaid\nflowchart LR\n  A-->B\n```\n```bash\npnpm lint\n```",
    });
    // 增强器结构契约：块选择器 + 内容锚 + pre（源 = textContent）
    expect(html).toContain('class="md-code-block"');
    expect(html).toContain("data-code-block-content");
    expect(html).toContain("<pre><code>flowchart LR\n  A--&gt;B</code></pre>");
    expect(html).toContain("<pre><code>pnpm lint</code></pre>");
    // mermaid 块带 infostring 标记（非 mermaid 同构——判据纯内容在增强器侧）
    expect(html.match(/md-code-block/g)?.length).toBe(2);
  });

  it("头部启停钮：查看态在场（启用中 → 禁用；已禁 → 启用 + meta 同步）；编辑态隐藏；foot 区移除", () => {
    const html = renderDialog();
    expect(html).toContain(">禁用<");
    expect(html).not.toContain("dswf-dlg-foot");
    const off = renderDialog({ enabled: false });
    expect(off).toContain("dot off");
    expect(off).toContain("已禁用");
    expect(off).toContain(">启用<");
    const edit = renderDialog({ mode: "edit" });
    expect(edit).not.toContain(">禁用<");
    expect(edit).not.toContain(">启用<");
  });
});

describe("ExpertDetailDialog 编辑态（F2 字段集）", () => {
  it("岗位 Input + 简介 textarea（120 上限）+ 人设 textarea + 保存钮", () => {
    const html = renderDialog({ mode: "edit" });
    expect(html).toContain('data-field="title"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain("min-height:46px");
    expect(html).toContain("max-height:134px");
    expect(html).toContain("min-height:266px");
    expect(html).toContain("max-height:2202px");
    expect(html).toContain('data-field="personaMd"');
    expect(html).toContain(">保存<");
    expect(html).toContain("简介（模型选人依据：何时委派我");
    expect(html).toContain("Markdown 自由输入");
  });

  it("multi-select：工具白名单在上、技能在下，box 显已选 chips", () => {
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

describe("MultiSelect 开合交互（原型 mountMsel 语义：默认收起 + box 开合 + 外点收起）", () => {
  it("bug: 默认收起——编辑态 markup 不渲染下拉菜单（恒展开缺陷在场则失败）", () => {
    const html = renderDialog({ mode: "edit" });
    expect(html).not.toContain("dswf-msel-menu");
  });

  it("开合纯决策：box 点击开合、点击外部收起、内部点击（勾选）保持展开", () => {
    expect(mselNextOpen(false, "box")).toBe(true);
    expect(mselNextOpen(true, "box")).toBe(false);
    expect(mselNextOpen(true, "outside")).toBe(false);
    expect(mselNextOpen(true, "inside")).toBe(true);
  });

  it("展开态渲染菜单：box caret 在场；空已选时占位「点击选择」语义保持", () => {
    const html = renderDialog({ mode: "edit" });
    expect(html).toContain("dswf-msel-caret");
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry({ tools: [], skills: [] }));
    ctl.startEdit();
    const emptyHtml = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, { controller: ctl, allSkills: [] }),
    );
    expect(emptyHtml).toContain("点击选择");
  });

  it("defaultOpen 展开态：菜单 + 勾选行 + data-msel-open 标记在场", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry());
    ctl.startEdit();
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, {
        controller: ctl,
        allSkills: [],
        mselDefaultOpen: true,
      }),
    );
    expect(html).toContain("dswf-msel-menu");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-msel-open=""');
  });

  it("bug 25c91ebd 回归：菜单 placement 纯决策——fixed 视口锚定坐标；下方空间不足且上方更宽裕时翻转到上方", () => {
    // 正常：box 在视口中部，下方空间充足 → below，菜单位 box 底 +4px，封顶 maxMenuPx
    const below = mselMenuPlacement(
      { top: 300, bottom: 340, left: 120, width: 600 },
      800,
    );
    expect(below.side).toBe("below");
    expect(below.style).toEqual({ left: 120, width: 600, maxHeight: 220, top: 344 });
    // box 贴近视口下缘（编辑态字段撑高 Dialog，box bottom ≈ 视口 - 60）→ 上方更宽裕 → above
    const above = mselMenuPlacement(
      { top: 660, bottom: 700, left: 120, width: 600 },
      800,
    );
    expect(above.side).toBe("above");
    expect(above.style).toEqual({ left: 120, width: 600, maxHeight: 220, bottom: 144 });
  });

  it("m1: 菜单未测量首帧不落 static 位置——markup 以 visibility:hidden 先渲染（paint 前定位兜底）", () => {
    const ctl = new ExpertDetailController(noMutations());
    ctl.open(entry());
    ctl.startEdit();
    const html = renderToStaticMarkup(
      React.createElement(ExpertDetailDialog, {
        controller: ctl,
        allSkills: [],
        mselDefaultOpen: true,
      }),
    );
    expect(html).toMatch(/class="dswf-msel-menu" style="visibility:hidden"/);
  });

  it("m2: 双侧空间不足——取更宽裕侧且 maxHeight 封顶扣减，菜单完整落在视口内", () => {
    // 双侧均 < maxMenuPx：above(500) > below(100) → above，maxHeight = above - 4
    const aboveClamped = mselMenuPlacement(
      { top: 300, bottom: 700, left: 120, width: 600 },
      800,
    );
    expect(aboveClamped.side).toBe("above");
    expect(aboveClamped.style.maxHeight).toBe(220); // min(maxMenuPx, above-4) = min(220, 296)
    // 双侧均不足且 below 更宽裕 → 维持 below，maxHeight = below - 4（视口封顶）
    const belowClamped = mselMenuPlacement(
      { top: 20, bottom: 730, left: 120, width: 600 },
      800,
    );
    expect(belowClamped.side).toBe("below");
    expect(belowClamped.style.maxHeight).toBe(66);
    // 1000 高菜单需求 > 视口：不溢出视口（top+maxHeight ≤ 视口底）
    expect(belowClamped.style.top! + belowClamped.style.maxHeight).toBeLessThanOrEqual(800);
  });

  it("bug 207b7579：极小视口判向兜底——双侧均负或上方无正可用空间时不翻 above（0 高菜单不落 above 展开态）", () => {
    // above(-5) > below(-15) 且双侧均负：旧行为翻 above 渲染 0 高展开菜单；兜底 below
    const bothNegative = mselMenuPlacement(
      { top: -5, bottom: 115, left: 120, width: 600 },
      100,
    );
    expect(bothNegative.side).toBe("below");
    expect(bothNegative.style.top).toBe(119);
    expect(bothNegative.style.bottom).toBeUndefined();
    expect(bothNegative.style.maxHeight).toBe(0);
    // above 为正但扣 4 后 ≤ 0：同样不翻 above
    const aboveTiny = mselMenuPlacement(
      { top: 2, bottom: 99, left: 120, width: 600 },
      100,
    );
    expect(aboveTiny.side).toBe("below");
    expect(aboveTiny.style.bottom).toBeUndefined();
  });

  it("m3: mselMenuStyleEqual 等值短路判据——坐标全等才跳过 setState", () => {
    const a = { left: 10, width: 200, maxHeight: 220, top: 40 };
    expect(mselMenuStyleEqual(a, { ...a })).toBe(true);
    expect(mselMenuStyleEqual(a, { ...a, top: 41 })).toBe(false);
    expect(
      mselMenuStyleEqual(a, { left: 10, width: 200, maxHeight: 220, bottom: 40 }),
    ).toBe(false);
  });

  it("bug 1e1e30b5: 外点收起监听以捕获阶段挂载（Dialog 内 React 合成 stopPropagation 截停冒泡——冒泡期监听收不到 Dialog 内点击）", () => {
    const registered: { type: string; capture: boolean }[] = [];
    const removed: { type: string; capture: boolean }[] = [];
    const doc = {
      addEventListener: (type: string, _fn: unknown, capture: boolean): void => {
        registered.push({ type, capture });
      },
      removeEventListener: (type: string, _fn: unknown, capture: boolean): void => {
        removed.push({ type, capture });
      },
    };
    const dispose = attachMselCollapse(doc, () => null, () => undefined);
    // 装配即挂 document click 捕获监听；收起后按同 capture 形态摘除
    expect(registered).toContainEqual({ type: "click", capture: true });
    dispose();
    expect(removed).toContainEqual({ type: "click", capture: true });
  });

  it("bug 1e1e30b5: Dialog 内非 msel 点击（root 外）→ 收起（outside）；msel 内部点击（root 内）→ 保持展开（inside）", () => {
    let captured: ((event: { target: unknown }) => void) | undefined;
    const doc = {
      addEventListener: (_type: string, fn: (event: { target: unknown }) => void): void => {
        captured = fn;
      },
      removeEventListener: (): void => undefined,
    };
    const root = { contains: (target: unknown): boolean => target === "in-root" };
    let open = true;
    attachMselCollapse(doc, () => root, (updater) => {
      open = updater(open);
    });
    expect(captured).toBeTypeOf("function");
    // Dialog 内点击（如头部名称、底部钮）：target 在 msel root 外 → 收起
    captured!({ target: "dialog-body" });
    expect(open).toBe(false);
    // msel 内部点击（勾选行/新增输入）：保持展开（收起态内部点击不误开——box 才开合）
    open = true;
    captured!({ target: "in-root" });
    expect(open).toBe(true);
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
