// 1.61 UI 裁决补充：Dialog 来源置顶 + 列表来源筛选 + 两两对比（TDD RED 先行）。
// 覆盖六项裁决：①来源徽标条 ②来源筛选 AND 叠加 ③Dialog 两两对比 ④项目具名
// ⑤聚组展开对比两两口径（生效卡 vs 点选行，来源 chips 单选，禁三列）⑥对比宽体+差异默认。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filterExperts,
  filterGroups,
  matchesOrigin,
  originLabel,
  projectNameOf,
  type ExpertView,
  type OriginFilter,
} from "../src-client/panel/filter.js";
import { ExpertDetailController } from "../src-client/panel/detail-source.js";
import { ExpertDetailDialog } from "../src-client/panel/detail-dialog.js";
import { ExpertGroupView, ExpertPanel, type ExpertPanelProps } from "../src-client/panel/expert-panel.js";

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

  it("startCompare(shadow) → mode=compare + compareTarget；selectCompareTarget 单选切换", () => {
    const c = ctl();
    c.startCompare(shadow);
    expect(c.getSnapshot().mode).toBe("compare");
    expect(c.getSnapshot().compareTarget).toEqual(shadow);
    const other = entry({ origin: "plugin", effective: false, title: "内置评审" });
    c.selectCompareTarget(other);
    expect(c.getSnapshot().compareTarget?.origin).toBe("plugin");
    // 单选：compareTarget 单值无列表——禁三列并排的数据面
    expect(c.getSnapshot().mode).toBe("compare");
  });

  it("exitCompare 回查看态且 compareTarget 清空；Esc close 语义不变", () => {
    const c = ctl();
    c.startCompare(shadow);
    c.exitCompare();
    expect(c.getSnapshot().mode).toBe("view");
    expect(c.getSnapshot().compareTarget).toBeUndefined();
  });

  it("编辑态不可进入对比；对比态 startEdit 先回查看语义（守卫）", () => {
    const c = ctl();
    c.startEdit();
    c.startCompare(shadow);
    expect(c.getSnapshot().mode).toBe("edit");
    expect(c.getSnapshot().compareTarget).toBeUndefined();
    c.cancelEdit();
    c.startCompare(shadow);
    c.startEdit();
    expect(c.getSnapshot().mode).toBe("edit");
    expect(c.getSnapshot().compareTarget).toBeUndefined();
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

describe("ExpertDetailDialog 来源置顶徽标条（①）", () => {
  const shadow = entry({ origin: "user", effective: false, title: "用户评审" });
  const effective = entry({ origin: "project", effective: true });

  it("查看态：来源条（来源 lead + 具名角标 + 生效标 + 被遮蔽同名提示）", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    const html = renderDialog(c, { sameKeyEntries: [shadow, effective], projectName: "dsh-forge" });
    expect(html).toContain("dswf-dlg-origin-bar");
    expect(html).toContain(">来源</span>");
    expect(html).toContain("项目 · dsh-forge");
    expect(html).toContain("eff-badge");
    expect(html).toContain("遮蔽同名：用户");
  });

  it("编辑态来源条同样呈现；唯一来源无遮蔽提示", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    const viewHtml = renderDialog(c, { sameKeyEntries: [effective] });
    expect(viewHtml).toContain("dswf-dlg-origin-bar");
    expect(viewHtml).not.toContain("遮蔽同名");
    c.startEdit();
    expect(renderDialog(c, { sameKeyEntries: [effective] })).toContain("dswf-dlg-origin-bar");
  });

  it("无 sameKeyEntries 注入（旧装配）不炸：无来源条", () => {
    const c = new ExpertDetailController({
      update: async () => effective,
      setEnabled: async () => effective,
    });
    c.open(effective);
    expect(renderDialog(c)).not.toContain("dswf-dlg-origin-bar");
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

  it("对比态：宽体 Dialog + 对比对象单选列表（chips）+ 两列表（禁三列）", () => {
    const html = renderDialog(compareCtl(), { sameKeyEntries: [shadowUser, shadowPlugin, effective] });
    expect(html).toContain("dswf-dlg wide");
    expect(html).toContain("dswf-cmp-pick");
    // 单选候选 = 两枚被遮蔽来源 chips；无三列并排（仅 生效 vs target 两数据列）
    expect(html).toContain('data-cmp-target="user"');
    expect(html).toContain('data-cmp-target="plugin"');
    expect(html.match(/<th class="cmp-eff">/g)?.length).toBe(1);
    expect(html.match(/<th class="cmp-tgt">/g)?.length).toBe(1);
    // 退出回查看态入口
    expect(html).toContain('aria-label="退出对比"');
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

// ---- ⑤ 聚组展开对比两两口径 ---------------------------------------------------

describe("ExpertGroupView 展开对比两两口径（⑤）", () => {
  function renderGroup(defaultExpanded?: boolean): string {
    const groups = filterGroups(layered, "", "all", "all");
    return renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group: groups[0]!.group,
        ...(defaultExpanded !== undefined ? { defaultExpanded } : {}),
      }),
    );
  }

  it("展开对比 = 生效卡 vs 单一被遮蔽行（默认首个 shadow）：来源选择 chips 单选切换", () => {
    const html = renderGroup(true);
    expect(html).toContain("dswf-xcompare");
    // chips 单选：两枚候选来源 chip，当前选中带 data-selected
    expect(html).toContain('data-cmp-chip="user"');
    expect(html).toContain('data-cmp-chip="plugin"');
    expect(html.match(/data-cmp-selected="true"/g)?.length).toBe(1);
    // 两列表：生效列 + 对比列各一（禁三列并排）
    expect(html.match(/<th class="cmp-eff">/g)?.length).toBe(1);
    expect(html.match(/<th class="cmp-tgt">/g)?.length).toBe(1);
    // 仅渲染一个对比表（点选对象单值）
    expect(html.match(/dswf-xcompare/g)?.length).toBe(1);
  });

  it("对比视图随选中 shadow 换右列（defaultSelectedOrigin 切面）", () => {
    const groups = filterGroups(layered, "", "all", "all");
    const html = renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group: groups[0]!.group,
        defaultExpanded: true,
        defaultSelectedOrigin: "plugin",
      }),
    );
    expect(html.match(/data-cmp-selected="true"/g)?.length).toBe(1);
    const userChip = html.indexOf('data-cmp-chip="user"');
    const pluginChip = html.indexOf('data-cmp-chip="plugin"');
    expect(html.indexOf('data-cmp-selected="true"')).toBeGreaterThan(Math.min(userChip, pluginChip));
    // 右列表头为 plugin 来源角标
    expect(html).toContain("origin-plugin");
  });

  it("折叠态不渲染对比表；「展开对比」钮语义保持", () => {
    expect(renderGroup()).not.toContain("dswf-xcompare");
    expect(renderGroup()).toContain("展开对比");
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

  it("来源 select（aria-label 来源筛选）四态：全部来源/项目/用户/内置；project 选项具名", () => {
    const html = renderPanel({ projectName: "dsh-forge" });
    expect(html).toContain('aria-label="来源筛选"');
    expect(html).toContain(">全部来源</option>");
    expect(html).toContain(">项目 · dsh-forge</option>");
    expect(html).toContain(">用户</option>");
    expect(html).toContain(">内置</option>");
  });

  it("组头隐藏数标注：user 来源筛选下 group 头标注「隐藏 1 条未命中」", () => {
    const html = renderPanel({ origin: "user" });
    expect(html).toContain("隐藏 1 条未命中");
  });

  it("filterGroups 驱动网格（无匹配 → 无匹配空态）", () => {
    expect(renderPanel({ origin: "plugin", query: ".nomatch" })).toContain("无匹配专家");
  });
});
