// panel 视图静态渲染单测（ui-design F1 四态 + 卡片字段集 + 页脚）：SSR 静态标记
// 逐位断言——骨架/空（零专家 & 无匹配）/错误/数据四态、卡片字段（状态灯/名称/标识
// chip/岗位/人设三行截断/技能与白名单 chips/更新时间页脚）、面板页脚计数、禁用卡降级。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpertPanel, ExpertGroupView, type ExpertPanelProps } from "../src-client/panel/expert-panel.js";
import type { ExpertView } from "../src-client/panel/filter.js";
import { groupExperts } from "../src-client/panel/filter.js";

function entry(overrides: Partial<ExpertView> = {}): ExpertView {
  return {
    name: "code-reviewer",
    title: "资深评审",
    description: "Runs code review",
    personaMd: "## 职责\n- 评审 diff 与正确性\n- 意见按严重度分级",
    tools: ["read", "edit"],
    skills: ["review", "tsc"],
    origin: "project",
    enabled: true,
    updatedAt: "2026-10-18T08:30:00.000Z",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<ExpertPanelProps> = {}): string {
  const props: ExpertPanelProps = {
    phase: "ready",
    entries: [entry()],
    query: "",
    status: "all",
    onQueryChange: () => undefined,
    onStatusChange: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(ExpertPanel, props));
}

describe("ExpertPanel 四态（ui-design F1）", () => {
  it("骨架态：6 张骨架卡 + 页脚「扫描专家目录…」", () => {
    const html = renderPanel({ phase: "loading", entries: [] });
    expect(html.match(/dswf-skeleton-card/g)?.length).toBe(6);
    expect(html).toContain("扫描专家目录…");
  });

  it("错误态：ErrorBar（role=alert）+ 重试入口，页脚计数空", () => {
    let retried = 0;
    const html = renderPanel({
      phase: "error",
      entries: [],
      errorMessage: "boom",
      onRetry: () => {
        retried += 1;
      },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("重试");
    expect(html).toContain("boom");
    expect(html).not.toContain("位专家");
    expect(retried).toBe(0); // SSR 静态：动作面在挂载期
  });

  it("空态（零专家）：建档引导文案，页脚 0 位专家", () => {
    const html = renderPanel({ entries: [] });
    expect(html).toContain("还没有专家");
    expect(html).toContain("招募一个专家");
    expect(html).toContain("0 位专家");
  });

  it("无匹配空态：搜索过滤清零文案", () => {
    const html = renderPanel({ query: "nope" });
    expect(html).toContain("无匹配专家");
    expect(html).toContain("换个关键词或过滤条件试试");
    expect(html).not.toContain("dswf-xcard ");
  });

  it("数据态：卡片字段集逐位在场（灯/名称/标识 chip/岗位/人设/chips/更新页脚）", () => {
    const html = renderPanel();
    expect(html).toContain("dswf-xcard");
    expect(html).toContain("dot on");
    expect(html).toContain("code-reviewer"); // 名称与英文标识 chip 同源（键正本）
    expect(html).toContain("资深评审"); // 岗位 ← title
    expect(html).toContain("评审 diff 与正确性"); // 人设摘要（Markdown 剥离后）
    expect(html).toContain('<div class="xc-seg">技能</div>'); // 1.68 裁决⑤：段标「技能标签」→「技能」
    expect(html).toContain("工具白名单（子会话强制）");
    expect(html).toContain("更新于 2026-10-18"); // 页脚更新时间
    expect(html).toContain("1 位专家 · 显示 1");
  });

  it("禁用卡：状态灯 off、岗位附「· 已禁用」、整卡降透明类", () => {
    const html = renderPanel({ entries: [entry({ enabled: false })] });
    expect(html).toContain("dot off");
    expect(html).toContain("已禁用");
    expect(html).toContain("dswf-xcard off");
  });

  it("计数页脚：总数 × 过滤后显示数", () => {
    const entries = [entry(), entry({ name: "b" }), entry({ name: "c", enabled: false })];
    const html = renderPanel({ entries, status: "enabled" });
    expect(html).toContain("3 位专家 · 显示 2");
  });
});

describe("ExpertPanel 头部交互面", () => {
  it("搜索框回填 query；状态筛选 select 三态选项、选中值随 status", () => {
    const html = renderPanel({ query: "rev", status: "enabled" });
    expect(html).toContain('value="rev"');
    expect(html).toContain("<select");
    expect(html).toContain('aria-label="状态筛选"');
    expect(html).toContain('>状态</label>'); // 1.68 裁决④：筛选 select 左侧 label
    expect(html).toContain('>来源</label>');
    expect(html).toContain('data-status="enabled"');
    expect(html).toContain('>全部</option>');
    expect(html).toContain('>启用</option>');
    expect(html).toContain('>禁用</option>');
    expect(html.match(/ selected/g)?.length).toBe(2); // 状态 + 来源（1.61）两枚 select 各一
    expect(html).toContain('value="enabled" selected');
  });

  it("头部布局：搜索与状态筛选左置（紧随标题）、召唤钮独右（margin-left auto 类）", () => {
    const html = renderPanel({ onSummon: () => undefined });
    const titleAt = html.indexOf("dswf-panel-title");
    const searchAt = html.indexOf("dswf-search");
    const selectAt = html.indexOf("dswf-status-select");
    const summonAt = html.indexOf("dswf-summon-btn");
    expect(titleAt).toBeGreaterThan(-1);
    expect(searchAt).toBeGreaterThan(titleAt);
    expect(selectAt).toBeGreaterThan(searchAt);
    expect(summonAt).toBeGreaterThan(selectAt);
    expect(html).toContain("dswf-summon-btn");
  });

  it("onSummon 在场 = 召唤钮呈现（HR 预设官方会话入口，在途禁用）；缺席不呈现", () => {
    expect(renderPanel({ onSummon: () => undefined })).toContain("召唤");
    expect(renderPanel({ onSummon: () => undefined })).toContain('aria-label="召唤 HR 预设会话"');
    expect(renderPanel({ onSummon: () => undefined, summonBusy: true })).toContain("disabled");
    expect(renderPanel({})).not.toContain(">召唤<");
  });

  it("召唤降级引导条：summonNotice 在场呈现（role=status）；缺席不呈现", () => {
    expect(renderPanel({ onSummon: () => undefined, summonNotice: "HR 预设切换被拒" })).toContain(
      "HR 预设切换被拒",
    );
    expect(renderPanel({ onSummon: () => undefined })).not.toContain("dswf-summon-notice");
  });
});

describe("ExpertPanel 同键聚组展示（1.60 用户裁决）", () => {
  const layered: readonly ExpertView[] = [
    {
      ...entry(),
      origin: "plugin",
      effective: false,
      title: "内置评审",
      tools: ["read"],
      skills: ["review"],
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    entry({ origin: "project", effective: true }),
  ];

  function renderGroup(defaultExpanded?: boolean): string {
    const group = groupExperts(layered)[0]!;
    return renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group,
        ...(defaultExpanded !== undefined ? { defaultExpanded } : {}),
      }),
    );
  }

  it("组头：键名 + 来源数 + 展开对比钮；卡片无「生效」标（1.68 裁决③）、来源角标在场", () => {
    const html = renderGroup();
    expect(html).toContain("dswf-xgroup multi");
    expect(html).toContain('data-expert-key="code-reviewer"');
    expect(html).toContain("2 个来源");
    expect(html).toContain("展开对比");
    expect(html).not.toContain("eff-badge"); // 1.68 裁决③：卡片「生效」徽标移除
    expect(html).toContain("origin-project");
    expect(html).toContain(">项目</span>");
  });

  it("被遮蔽卡折叠为摘要行：来源角标 + 岗位 + 更新时间 + 只读标记；非卡片非按钮激活面", () => {
    const html = renderGroup();
    expect(html).toContain("dswf-xshadow");
    expect(html).toContain('data-origin="plugin"');
    expect(html).toContain("origin-plugin");
    expect(html).toContain(">内置</span>");
    expect(html).toContain("内置评审");
    expect(html).toContain("2026-10-01");
    expect(html).toContain("被遮蔽 · 只读");
    // 折叠态：对比视图不渲染
    expect(html).not.toContain("dswf-xcompare");
  });

  it("展开对比：字段对齐表 + 差异格 diff 高亮（岗位/人设/工具白名单/技能异、简介同）", () => {
    const html = renderGroup(true);
    expect(html).toContain("dswf-xcompare");
    expect(html).toContain("岗位");
    expect(html).toContain("简介");
    expect(html).toContain("人设");
    expect(html).toContain("工具白名单");
    expect(html).toContain("技能");
    // 差异格：两列同 diff 格对齐（title/personaMd/tools/skills 异、description 同 → 3 字段 × 2 列）
    const diffCount = html.match(/class="diff"/g)?.length ?? 0;
    expect(diffCount).toBe(6);
    expect(html).toContain("3 项");
  });

  it("单来源组：无对比钮、无摘要行（与普通卡同形）；页脚计数按专家键数", () => {
    const html = renderPanel({ entries: [entry()] });
    expect(html).toContain("dswf-xgroup");
    expect(html).not.toContain("展开对比");
    expect(html).not.toContain("dswf-xshadow");
    expect(html).toContain("1 位专家 · 显示 1");
  });

  it("计数按专家键数：同键三层 = 1 位专家 · 显示 1 组", () => {
    const html = renderPanel({ entries: layered });
    expect(html).toContain("1 位专家 · 显示 1");
  });
});
