// 1.61 UI 裁决补充：Dialog 来源置顶 + 列表来源筛选 + 两两对比（TDD RED 先行）。
// 覆盖六项裁决：①来源徽标条 ②来源筛选 AND 叠加 ③Dialog 两两对比 ④项目具名
// ⑤聚组展开对比两两口径（生效卡 vs 点选行，来源 chips 单选，禁三列）⑥对比宽体+差异默认。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  entryIdOf,
  filterExperts,
  filterGroups,
  matchesOrigin,
  originLabel,
  projectNameOf,
  type ExpertView,
  type OriginFilter,
} from "../src-client/panel/filter.js";
import { ExpertDetailController, escNext, type DetailMode } from "../src-client/panel/detail-source.js";
import { ExpertDetailDialog } from "../src-client/panel/detail-dialog.js";
import { ExpertGroupView, ExpertPanel, type ExpertPanelProps } from "../src-client/panel/expert-panel.js";
import { PairCompareTable } from "../src-client/panel/compare-table.js";

function entry(overrides: Partial<ExpertView> = {}): ExpertView {
  return {
    name: "code-reviewer",
    title: "资深评审",
    description: "Runs code review",
    personaMd: "## 职责\n- 评审 diff",
    tools: ["read", "edit"],
    skills: ["review"],
    origin: "project",
    enabled: true,
    updatedAt: "2026-10-26T08:30:00.000Z",
    ...overrides,
  };
}

const layered: readonly ExpertView[] = [
  entry({ origin: "plugin", effective: false, title: "内置评审", skills: ["refactor"] }),
  entry({ origin: "user", effective: false, title: "用户评审", skills: ["tsc"] }),
  entry({ origin: "project", effective: true, title: "项目评审" }),
];

// ---- ④ 项目来源具名 ----------------------------------------------------------

describe("projectNameOf（④ 项目来源具名：workspace 路径 → 项目名）", () => {
  it("正斜杠路径取末段；反斜杠路径同样取末段；空值 = undefined", () => {
    expect(projectNameOf("/home/u/dsh-forge")).toBe("dsh-forge");
    expect(projectNameOf("Z:\\project\\dsh-forge")).toBe("dsh-forge");
    expect(projectNameOf(undefined)).toBeUndefined();
    expect(projectNameOf("")).toBeUndefined();
  });
});

describe("originLabel（④ 具名：project + projectName →「项目 · <名>」）", () => {
  it("project 携名具名；user/plugin 不受影响；无名回落旧三态", () => {
    expect(originLabel("project", "dsh-forge")).toBe("项目 · dsh-forge");
    expect(originLabel("project")).toBe("项目");
    expect(originLabel("user", "dsh-forge")).toBe("用户");
    expect(originLabel("plugin", "dsh-forge")).toBe("内置");
  });
});

// ---- ② 来源筛选（与状态筛选、搜索 AND 叠加）----------------------------------

describe("matchesOrigin / filterExperts（② 来源筛选 AND 叠加）", () => {
  it("matchesOrigin：all 恒真；具名 origin 精确匹配", () => {
    expect(matchesOrigin(layered[0]!, "all")).toBe(true);
    expect(matchesOrigin(layered[0]!, "plugin")).toBe(true);
    expect(matchesOrigin(layered[0]!, "user")).toBe(false);
  });

  it("filterExperts 第四参 origin：搜索 × 状态 × 来源 三重 AND", () => {
    expect(filterExperts(layered, "", "all", "user").map((e) => e.origin)).toEqual(["user"]);
    expect(filterExperts(layered, "", "enabled", "plugin")).toHaveLength(1);
    expect(filterExperts(layered, "tsc", "enabled", "user")).toHaveLength(1);
    expect(filterExperts(layered, "", "disabled", "all")).toHaveLength(0);
    // 缺省第四参 = all（向后兼容既有调用）
    expect(filterExperts(layered, "", "all")).toHaveLength(3);
  });
});

describe("filterGroups（② 组级来源筛选：命中组呈现、未命中行隐藏 + 隐藏数）", () => {
  it("命中来源的组呈现；组内未命中 shadow 行隐藏且 hiddenShadows 计数", () => {
    const shown = filterGroups(layered, "", "all", "user");
    expect(shown).toHaveLength(1);
    expect(shown[0]!.group.shadows.map((s) => s.origin)).toEqual(["user"]); // user shadow 命中可见
    expect(shown[0]!.hiddenShadows).toBe(1); // plugin 未命中来源 → 隐藏
  });

  it("搜索仅命中生效卡但 shadow 不命中 → shadow 隐藏计数", () => {
    // 同键同名（name 同串）；query 用生效卡独有技能（alpha）命中生效卡
    const rows: readonly ExpertView[] = [
      entry({ origin: "plugin", effective: false, skills: ["beta"] }),
      entry({ origin: "user", effective: false, skills: ["gamma"] }),
      entry({ origin: "project", effective: true, skills: ["alpha"] }),
    ];
    const shown = filterGroups(rows, "alpha", "all", "all");
    expect(shown).toHaveLength(1);
    expect(shown[0]!.group.shadows).toHaveLength(0);
    expect(shown[0]!.hiddenShadows).toBe(2);
  });

  it("生效卡不命中但 shadow 命中 → 组仍呈现（生效卡为对比基座恒在场）", () => {
    // status=disabled：生效卡 enabled，user shadow 设为 disabled 命中
    const rows: readonly ExpertView[] = [
      ...layered,
      entry({ origin: "user", effective: false, enabled: false, title: "停用评审" }),
    ];
    const shown = filterGroups(rows, "", "disabled", "all");
    expect(shown).toHaveLength(1);
    expect(shown[0]!.group.shadows.map((s) => s.title)).toEqual(["停用评审"]);
    expect(shown[0]!.hiddenShadows).toBe(2);
  });

  it("无任何命中条目的组不呈现", () => {
    expect(filterGroups(layered, "db-migrator", "all", "all")).toHaveLength(0);
  });

  it("OriginFilter 类型枚举齐全（编译面钉）", () => {
    const all: OriginFilter[] = ["all", "project", "user", "plugin"];
    expect(all).toHaveLength(4);
  });
});

// ---- ③⑥ Dialog 两两对比（状态机 + 呈递）-------------------------------------

describe("ExpertDetailController 两两对比模式（③）", () => {
  const shadow = entry({ origin: "user", effective: false, title: "用户评审" });
  const effective = entry({ origin: "project", effective: true });

  function ctl(): ExpertDetailController {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    return c;
  }

  it("startCompare(shadow) → mode=compare + compareTargetOrigin（存 entryIdOf 身份）；selectCompareTarget 单选切换", () => {
    const c = ctl();
    c.startCompare(shadow);
    expect(c.getSnapshot().mode).toBe("compare");
    expect(c.getSnapshot().compareTargetOrigin).toBe(entryIdOf(shadow));
    const other = entry({ origin: "plugin", effective: false, title: "内置评审" });
    c.selectCompareTarget(other);
    expect(c.getSnapshot().compareTargetOrigin).toBe(entryIdOf(other));
    // 单选：compareTargetOrigin 单值无列表——禁三列并排的数据面
    expect(c.getSnapshot().mode).toBe("compare");
  });

  it("exitCompare 回查看态且 compareTargetOrigin 清空；escNext 纯决策：compare 态先退对比，view/edit 态关 Dialog", () => {
    const c = ctl();
    c.startCompare(shadow);
    c.exitCompare();
    expect(c.getSnapshot().mode).toBe("view");
    expect(c.getSnapshot().compareTargetOrigin).toBeUndefined();
    expect(escNext("compare" satisfies DetailMode)).toBe("exitCompare");
    expect(escNext("view" satisfies DetailMode)).toBe("close");
    expect(escNext("edit" satisfies DetailMode)).toBe("close");
  });

  it("编辑态不可进入对比；对比态 startEdit 先回查看语义（守卫）", () => {
    const c = ctl();
    c.startEdit();
    c.startCompare(shadow);
    expect(c.getSnapshot().mode).toBe("edit");
    expect(c.getSnapshot().compareTargetOrigin).toBeUndefined();
    c.cancelEdit();
    c.startCompare(shadow);
    c.startEdit();
    expect(c.getSnapshot().mode).toBe("edit");
    expect(c.getSnapshot().compareTargetOrigin).toBeUndefined();
  });
});

function renderDialog(
  controller: ExpertDetailController,
  extra: { readonly sameKeyEntries?: readonly ExpertView[]; readonly projectName?: string } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(ExpertDetailDialog, {
      controller,
      allSkills: [],
      ...extra,
    }),
  );
}

describe("ExpertDetailDialog 来源行（1.61 ① + 1.67 裁决）", () => {
  const shadow = entry({ origin: "user", effective: false, title: "用户评审" });
  const effective = entry({ origin: "project", effective: true });

  function ctlFor(e: ExpertView): ExpertDetailController {
    const c = new ExpertDetailController({
      update: async () => e,
      setEnabled: async () => e,
    });
    c.open(e);
    return c;
  }

  it("查看态：来源行（来源 lead + 具名角标 + 被遮蔽同名提示）；生效标已去（1.67：生效序判定依赖项目语境）", () => {
    const html = renderDialog(ctlFor(effective), { sameKeyEntries: [shadow, effective], projectName: "dsh-forge" });
    expect(html).toContain("dswf-dlg-origin-bar");
    expect(html).toContain(">来源</span>");
    expect(html).toContain("项目 · dsh-forge");
    expect(html).not.toContain("eff-badge");
    expect(html).toContain("遮蔽同名：用户");
  });

  it("来源行在头部标识行（名称+slug）之下、头部容器内——无双分隔线（1.67）", () => {
    const html = renderDialog(ctlFor(effective), { sameKeyEntries: [shadow, effective], projectName: "dsh-forge" });
    const headAt = html.indexOf('class="dswf-dlg-head"');
    const rowAt = html.indexOf('class="dswf-dlg-head-row"');
    const barAt = html.indexOf("dswf-dlg-origin-bar");
    const bodyAt = html.indexOf('class="dswf-dlg-body"');
    expect(headAt).toBeGreaterThan(-1);
    expect(rowAt).toBeGreaterThan(headAt);
    expect(barAt).toBeGreaterThan(rowAt); // 来源行在标识行之后
    expect(barAt).toBeLessThan(bodyAt); // 且仍在头部容器内
  });

  it("user / plugin 来源尾缀 ? 图标，hover tooltip（dswf-tip 深色气泡——原生 title 退役）解释来源语义；project 无 ?", () => {
    const userHtml = renderDialog(ctlFor(entry({ origin: "user", effective: true })), { sameKeyEntries: [entry({ origin: "user", effective: true })] });
    expect(userHtml).toContain('data-dswf-origin-help="user"');
    expect(userHtml).toContain('data-tip="当前用户全局档案（跨项目共享）"');
    expect(userHtml).not.toContain('title="当前用户全局档案（跨项目共享）"');
    const pluginHtml = renderDialog(ctlFor(entry({ origin: "plugin", effective: true })), { sameKeyEntries: [entry({ origin: "plugin", effective: true })] });
    expect(pluginHtml).toContain('data-dswf-origin-help="plugin"');
    expect(pluginHtml).toContain('data-tip="来源插件贡献的专家档案（随插件分发）"');
    const projectHtml = renderDialog(ctlFor(effective), { sameKeyEntries: [effective] });
    expect(projectHtml).not.toContain("dswf-dlg-origin-help");
  });

  it("编辑态来源行同样呈现；唯一来源无遮蔽提示", () => {
    const c = ctlFor(effective);
    const viewHtml = renderDialog(c, { sameKeyEntries: [effective] });
    expect(viewHtml).toContain("dswf-dlg-origin-bar");
    expect(viewHtml).not.toContain("遮蔽同名");
    c.startEdit();
    expect(renderDialog(c, { sameKeyEntries: [effective] })).toContain("dswf-dlg-origin-bar");
  });

  it("无 sameKeyEntries 注入（旧装配）不炸：无来源行", () => {
    expect(renderDialog(ctlFor(effective))).not.toContain("dswf-dlg-origin-bar");
  });
});

describe("ExpertDetailDialog 两两对比视图（③⑥）", () => {
  const shadowUser = entry({ origin: "user", effective: false, title: "用户评审", skills: ["tsc"] });
  const shadowPlugin = entry({ origin: "plugin", effective: false, title: "内置评审" });
  const effective = entry({ origin: "project", effective: true });

  function compareCtl(shadow = shadowUser): ExpertDetailController {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    c.startCompare(shadow);
    return c;
  }

  it("查看态「对比」钮在「编辑」旁；无被遮蔽同名时不呈现", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    const withPeers = renderDialog(c, { sameKeyEntries: [shadowUser, effective] });
    const editAt = withPeers.indexOf(">编辑</button>");
    const cmpAt = withPeers.indexOf('aria-label="对比"');
    expect(cmpAt).toBeGreaterThan(-1);
    expect(cmpAt).toBeLessThan(editAt); // 视觉稿正本：对比钮在编辑旁（前位）
    const solo = renderDialog(c, { sameKeyEntries: [effective] });
    expect(solo).not.toContain('aria-label="对比"');
  });

  it("对比态：宽体 Dialog + 对比对象单选列表（pick-list 单一选择控件）+ 两列表（禁三列）", () => {
    const html = renderDialog(compareCtl(), { sameKeyEntries: [shadowUser, shadowPlugin, effective] });
    expect(html).toContain("dswf-dlg wide");
    expect(html).toContain("dswf-cmp-pick-list");
    // bug f4020406 收敛：Dialog 只留 pick-list——chips（聚组展开语汇）不在 Dialog
    expect(html).not.toContain("data-cmp-chip");
    // 单选候选 = 两枚被遮蔽来源行（身份 = entryIdOf）；无三列并排（仅 生效 vs target 两数据列）
    expect(html).toContain('data-cmp-target="user:code-reviewer"');
    expect(html).toContain('data-cmp-target="plugin:code-reviewer"');
    expect(html.match(/<th class="cmp-eff">/g)?.length).toBe(1);
    expect(html.match(/<th class="cmp-tgt">/g)?.length).toBe(1);
    // 退出回查看态入口
    expect(html).toContain('aria-label="退出对比"');
  });

  it("bug f4020406：compareTargetOrigin 渲染时从同键最新条目重解析（轮询换新后对比表不陈旧）", () => {
    // startCompare 时快照为旧 title；渲染注入的 sameKeyEntries 已是轮询换新后的新对象
    const reloaded = entry({ origin: "user", effective: false, title: "评审v2", skills: ["tsc"] });
    const html = renderDialog(compareCtl(), { sameKeyEntries: [reloaded, effective] });
    expect(html).toContain("评审v2"); // pick-list 行与对比右列均来自最新条目
    expect(html).toContain(">评审v2</span>");
  });

  it("bug e1d74589：对比左列同自 sameKeyEntries 按 effective 位重解析（外部改动后无幻影 diff）", () => {
    // open 期快照 title=资深评审；轮询换新后生效层 title 变为 项目评审v2（同键新对象），
    // shadow 与换新后生效层差 title+skills 两字段——左列若读陈旧快照即出幻影 diff
    const reloaded = entry({ origin: "project", effective: true, title: "项目评审v2" });
    const staleShadow = entry({ origin: "user", effective: false, title: "旧评审", skills: ["tsc"] });
    const html = renderDialog(compareCtl(staleShadow), { sameKeyEntries: [staleShadow, reloaded] });
    // bug 207b7579③：断言钉 cmp-eff 列内容段（自表头格起截取）——旧断言可被 pick-list
    // 行单独满足（幻影通过）；左列生效格必须读换新值「项目评审v2」
    const effCol = html.slice(Math.max(0, html.indexOf('<th class="cmp-eff">')));
    expect(effCol).toContain(">项目评审v2</td>"); // 左列 title 行读换新值
    expect((html.match(/class="diff"/g) ?? []).length).toBe(4); // title+skills 两字段 ×2 列
  });

  it("bug 207b7579①：sameKeyEntries 非空但无 effective 位——对比态左列失靶空态，不回落 open 快照", () => {
    // 打开条目在场但缺生效位（旧载荷）；effective 位缺失 ≠ 条目被删（不触发失靶守卫）
    const opened = entry({ origin: "project", title: "项目评审" });
    const shadow = entry({ origin: "user", effective: false, title: "用户评审", skills: ["tsc"] });
    const reloaded = entry({ origin: "project", title: "项目评审v2" }); // 换新后仍无生效位
    const c = new ExpertDetailController({
      update: async () => opened,
      setEnabled: async () => opened,
    });
    c.open(opened);
    c.startCompare(shadow);
    const html = renderDialog(c, { sameKeyEntries: [reloaded, shadow] });
    expect(html).toContain("生效档案已不在");
    expect(html).not.toContain('class="cmp-eff"'); // 不渲染对比表（不回落陈旧快照）
  });

  it("bug 207b7579①：无生效位条目时查看态对比入口禁用", () => {
    const opened = entry({ origin: "project", title: "项目评审" });
    const c = new ExpertDetailController({
      update: async () => opened,
      setEnabled: async () => opened,
    });
    c.open(opened);
    const html = renderDialog(c, {
      sameKeyEntries: [entry({ origin: "project", title: "项目评审v2" }), shadowUser],
    });
    expect(html).toMatch(/aria-label="对比"[^>]*disabled/);
  });

  it("bug 207b7579②：打开的专家被删除（轮询换新 sameKeyEntries 不含该条目）——查看态提示「该专家已不存在」+ 编辑/启停禁用", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    const html = renderDialog(c, {
      sameKeyEntries: [entry({ origin: "user", effective: true, title: "其他专家" })],
    });
    expect(html).toContain("该专家已不存在");
    expect(html).toContain('disabled="">编辑</button>'); // 编辑入口禁用（提示仍在场）
    expect(html).toMatch(/data-dswf-toggle-enabled=""[^>]*disabled/);
  });

  it("bug 207b7579②：轮询换新恢复条目后失靶守卫自动收敛", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    const staleHtml = renderDialog(c, { sameKeyEntries: [] });
    expect(staleHtml).toContain("该专家已不存在");
    const restoredHtml = renderDialog(c, {
      sameKeyEntries: [entry({ origin: "project", effective: true, title: "项目评审v2" })],
    });
    expect(restoredHtml).not.toContain("该专家已不存在");
    expect(restoredHtml).toContain(">编辑</button>"); // 编辑入口恢复可用
  });

  it("对比对象失靶（被删/刷新消失）：渲染「对比对象已不在，请重选」空态（.dswf-cmp-empty）", () => {
    // startCompare 记录的 target origin 在渲染期 sameKeyEntries 中已不存在
    const html = renderDialog(compareCtl(), { sameKeyEntries: [effective] });
    expect(html).toContain("dswf-cmp-empty");
    expect(html).toContain("对比对象已不在，请重选");
    expect(html).not.toContain("dswf-xcompare");
  });

  it("差异默认：默认仅差异行 + 高亮；「显示全部字段」切换标记在场；完全一致空态", () => {
    const diffHtml = renderDialog(compareCtl(), { sameKeyEntries: [shadowUser, effective] });
    expect(diffHtml).toContain("仅显示差异项");
    expect(diffHtml).toContain("显示全部字段");
    // title/skills 异 → 2 行 ×2 列 diff；description/personaMd/tools 同 → 默认隐藏
    const diffRows = diffHtml.match(/class="diff"/g)?.length ?? 0;
    expect(diffRows).toBe(4);

    const same = entry({ origin: "user", effective: false, title: effective.title, skills: effective.skills });
    const sameHtml = renderDialog(compareCtl(same), { sameKeyEntries: [same, effective] });
    expect(sameHtml).toContain("字段完全一致");
  });
});

// ---- ⑤ 聚组差异入口（内联对比退役——Dialog 对比态承载） -------------------------

describe("ExpertGroupView 差异入口（⑤——内联对比退役）", () => {
  function renderGroup(onCompare?: (key: string, origin: string) => void): string {
    const groups = filterGroups(layered, "", "all", "all");
    return renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group: groups[0]!.group,
        ...(onCompare !== undefined ? { onCompare } : {}),
      }),
    );
  }

  it("聚组零内联对比：对比表/来源切换 chips/展开钮/被遮蔽摘要行全部退役（差异归 Dialog 对比态）", () => {
    const html = renderGroup(() => undefined);
    expect(html).not.toContain("dswf-xcompare");
    expect(html).not.toContain("data-cmp-chip");
    expect(html).not.toContain("展开对比");
    // 摘要行退役：对比入口 = 卡内对比钮（点击面 = 请求打开 Dialog 对比）
    expect(html).not.toContain("dswf-xshadow");
    expect(html).toContain('aria-label="对比 code-reviewer 其它来源"');
  });

  it("bug f4020406 ④（承继）：卡内对比回调以展示层被遮蔽 origin 为靶；来源 chip 为可点按钮", () => {
    const group = {
      key: "code-reviewer",
      effective: entry({ origin: "user", effective: true, title: "用户评审" }),
      shadows: [entry({ origin: "project", effective: false, title: "项目评审" })],
    };
    const calls: Array<[string, string]> = [];
    const html = renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group,
        projectName: "acme",
        onCompare: (key, origin) => calls.push([key, origin]),
      }),
    );
    // 来源 chip = 可点按钮（multi caret 在场——文本节点不再以 </span> 收口）
    expect(html).toContain("xc-origin-switch");
    expect(html).toContain("xc-origin-caret");
    expect(calls).toEqual([]);
  });

  it("PairCompareTable 右列表头具名 + 差异格高亮（Dialog 对比态直渲染钉——去外边框）", () => {
    const html = renderToStaticMarkup(
      React.createElement(PairCompareTable, {
        effective: entry({ origin: "user", effective: true }),
        shadow: entry({ origin: "project", effective: false, title: "项目评审" }),
        showAllFields: true,
        projectName: "acme",
      }),
    );
    expect(html.match(/项目 · acme/g)?.length).toBe(1); // 仅右列表头一枚（左列为 user）
    // 差异承载面断言：差异格 diff 类两列对齐（title 异 → 1 字段 × 2 列）
    expect(html.match(/class="diff"/g)?.length).toBe(2);
  });
});

// ---- ② 面板头部来源筛选 select -----------------------------------------------

describe("ExpertPanel 来源筛选头部（②）", () => {
  function renderPanel(overrides: Partial<ExpertPanelProps> = {}): string {
    const props: ExpertPanelProps = {
      phase: "ready",
      entries: layered,
      query: "",
      status: "all",
      onQueryChange: () => undefined,
      onStatusChange: () => undefined,
      ...overrides,
    };
    return renderToStaticMarkup(React.createElement(ExpertPanel, props));
  }

  it("来源下拉（aria-label 来源筛选）四态：全部来源/项目/用户/内置；project 选项具名", () => {
    const html = renderPanel({ projectName: "dsh-forge", filtersOpen: true });
    expect(html).toContain('aria-label="来源筛选"');
    expect(html).toContain('data-select-option="all"');
    expect(html).toContain(">全部来源</button>");
    expect(html).toContain(">项目 · dsh-forge</button>");
    expect(html).toContain(">用户</button>");
    expect(html).toContain(">内置</button>");
  });

  it("组头隐藏数标注：user 来源筛选下 group 头标注「隐藏 1 条未命中」", () => {
    const html = renderPanel({ origin: "user" });
    expect(html).toContain("隐藏 1 条未命中");
  });

  it("bug f4020406 ⑦ + 风格统一：组头「N 个来源」计数注记改 dswf-tip 悬浮（原生 title 退役）", () => {
    const html = renderPanel({ origin: "user" });
    expect(html).toContain('data-tip="计数含被搜索/筛选隐藏的来源行"');
    expect(html).not.toContain('title="计数含被搜索/筛选隐藏的来源行"');
  });

  it("filterGroups 驱动网格（无匹配 → 无匹配空态）", () => {
    expect(renderPanel({ origin: "plugin", query: ".nomatch" })).toContain("无匹配专家");
  });
});
