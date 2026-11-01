// panel 视图静态渲染单测（ui-design F1 四态 + 卡片字段集 + 页脚）：SSR 静态标记
// 逐位断言——骨架/空（零专家 & 无匹配）/错误/数据四态、卡片字段（状态灯/名称/标识
// chip/岗位/人设三行截断/技能与白名单 chips/更新时间页脚）、面板页脚计数、禁用卡降级。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpertPanel, ExpertGroupView, routeChipOf, openPluginConfigTab, type ExpertPanelProps } from "../src-client/panel/expert-panel.js";
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

  it("数据态：卡片字段集逐位在场（灯/名称/岗位/人设/工具→技能 chips/更新页脚）", () => {
    const html = renderPanel();
    expect(html).toContain("dswf-xcard");
    expect(html).toContain("dot on");
    expect(html).toContain("code-reviewer"); // 名称与英文标识同源（键正本）
    expect(html).toContain("资深评审"); // 岗位 ← title
    expect(html).toContain("评审 diff 与正确性"); // 人设摘要（Markdown 剥离后）
    // 分段顺序（2026-10-31 裁决）：工具在上、技能在下；「工具白名单（子会话强制）」→「工具」
    const segs = [
      html.indexOf('<div class="xc-seg">工具</div>'),
      html.indexOf('<div class="xc-seg">技能</div>'),
    ];
    expect(segs[0]).toBeGreaterThan(-1);
    expect(segs[1]).toBeGreaterThan(segs[0]!);
    expect(html).not.toContain("工具白名单");
    expect(html).toContain("更新于 2026-10-18"); // 页脚更新时间
    expect(html).toContain("1 位专家 · 显示 1");
  });

  it("禁用卡：状态灯 off、整卡降透明类、无「已禁用」徽标（置灰即禁用语义——启停唯一入口 = Dialog）", () => {
    const html = renderPanel({ entries: [entry({ enabled: false })] });
    expect(html).toContain("dot off");
    expect(html).toContain("dswf-xcard off");
    expect(html).not.toContain("已禁用");
  });

  it("禁用卡无启停按钮：卡片头部零「禁用/启用」动作钮（启停唯一入口 = 详情 Dialog）", () => {
    const html = renderPanel({ entries: [entry({ enabled: false })] });
    expect(html).not.toContain(">禁用<");
    expect(html).not.toContain(">启用<");
  });

  it("计数页脚：总数 × 过滤后显示数", () => {
    const entries = [entry(), entry({ name: "b" }), entry({ name: "c", enabled: false })];
    const html = renderPanel({ entries, status: "enabled" });
    expect(html).toContain("3 位专家 · 显示 2");
  });
});

describe("ExpertPanel 头部交互面", () => {
  it("搜索框回填 query；筛选下拉自绘面（dsh 菜单词汇——box 显当前值 + 展开菜单选项/选中态）", () => {
    const html = renderPanel({ query: "rev", status: "enabled", filtersOpen: true });
    expect(html).toContain('value="rev"');
    // 自绘下拉（native select 退役——官方 select 组件不在插件 classic-script 外置表，
    // 面板内已批准 msel 视觉词汇统一承载）
    expect(html).not.toContain("<select");
    expect(html).toContain('aria-label="状态筛选"');
    expect(html).toContain(">状态</label>"); // 1.68 裁决④：筛选下拉左侧 label
    expect(html).toContain(">来源</label>");
    expect(html).toContain('data-select="dswf-status-select"');
    // box 显当前值 + 菜单三态选项、选中态 aria-selected
    expect(html).toContain('data-select-option="enabled"');
    expect(html.match(/aria-selected="true"[^>]*data-select-option="enabled"|data-select-option="enabled"[^>]*aria-selected="true"/)).not.toBeNull();
    expect(html).toContain('data-select-option="all"');
    expect(html).toContain('data-select-option="disabled"');
    // 收起态（缺省）：零菜单、box 显当前值
    const closed = renderPanel({ query: "rev", status: "enabled" });
    expect(closed).not.toContain("dswf-select-menu");
    expect(closed).toContain('data-select-value="enabled"');
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

  function renderGroup(onCompare?: (key: string, origin: string) => void): string {
    const group = groupExperts(layered)[0]!;
    return renderToStaticMarkup(
      React.createElement(ExpertGroupView, {
        group,
        ...(onCompare !== undefined ? { onCompare } : {}),
      }),
    );
  }

  // 差异承载面裁决（2026-10-26）：聚组内联对比退役——差异一律由详情 Dialog 对比态
  // 呈现（点被遮蔽行 = 请求打开 Dialog 对比，onCompare(key, origin) 出面）。
  it("组头：键名 + 来源数（内联对比钮退役）；卡片无「生效」标、来源角标在场", () => {
    const html = renderGroup();
    expect(html).toContain("dswf-xgroup multi");
    expect(html).toContain('data-expert-key="code-reviewer"');
    expect(html).toContain("2 个来源");
    expect(html).not.toContain("展开对比");
    expect(html).not.toContain("eff-badge"); // 1.68 裁决③：卡片「生效」徽标移除
    expect(html).toContain("origin-project");
    // 来源 chip 为可点按钮（multi），不再是被遮蔽摘要行的静态 span
    expect(html).toContain("xc-origin-switch");
  });

  it("被遮蔽摘要行退役：多来源 = 卡内对比钮（点开 Dialog 内切版本）；卡片名后无同名 chip", () => {
    const html = renderGroup(() => undefined);
    // 摘要行退役：无 xshadow 行、无只读标记
    expect(html).not.toContain("dswf-xshadow");
    expect(html).not.toContain("被遮蔽 · 只读");
    // 卡内对比钮（aria-label 锚；点击 = onCompare(key, 首个被遮蔽 origin)——由 Dialog pick-list 切换）
    expect(html).toContain('aria-label="对比 code-reviewer 其它来源"');
    // 内联对比退役：聚组零对比表/零来源切换 chips
    expect(html).not.toContain("dswf-xcompare");
    expect(html).not.toContain("data-cmp-chip");
    // 同名 chip 退役：卡头不再重复渲染专家键名 chip
    expect(html).not.toContain('<span class="chip tool">code-reviewer</span>');
  });

  it("单来源组：无对比钮（与普通卡同形）；页脚计数按专家键数", () => {
    const html = renderPanel({ entries: [entry()] });
    expect(html).toContain("dswf-xgroup");
    expect(html).not.toContain("展开对比");
    expect(html).not.toContain("dswf-xshadow");
    expect(html).not.toContain("其它来源");
    expect(html).toContain("1 位专家 · 显示 1");
  });

  it("计数按专家键数：同键三层 = 1 位专家 · 显示 1 组", () => {
    const html = renderPanel({ entries: layered });
    expect(html).toContain("1 位专家 · 显示 1");
  });
});

// ── 卡片路由 chip 二态（expert-squad-default-routing AC3）────────────────────
describe("卡片路由 chip 二态（routeChipOf 纯逻辑）", () => {
  it("生效路由（provider+model 成对）→ 模型名 chip：tooltip 展开 provider 与 reasoning 档位，不标来源与层级", () => {
    expect(routeChipOf({ provider: "deepseek-official", model: "deepseek-reasoner", reasoning: "high" })).toEqual({
      kind: "model",
      model: "deepseek-reasoner",
      tip: "deepseek-official · reasoning 高",
    });
    expect(routeChipOf({ provider: "p1", model: "m1", reasoning: "low" })!.tip).toBe("p1 · reasoning 低");
    expect(routeChipOf({ provider: "p1", model: "m1", reasoning: "medium" })!.tip).toBe("p1 · reasoning 中");
  });

  it("生效路由无 reasoning → tooltip 只展 provider（不下发 effort 位不呈现）", () => {
    expect(routeChipOf({ provider: "p1", model: "m1" })).toEqual({
      kind: "model",
      model: "m1",
      tip: "p1",
    });
  });

  it("皆缺（含不成对半缺）→「继承父Agent」弱化 chip，tooltip 未配置路由文案，零来源/层级标注", () => {
    const inherit = { kind: "inherit", tip: "未配置路由，派发时继承父 Agent 会话模型" };
    expect(routeChipOf({})).toEqual(inherit);
    expect(routeChipOf({ model: "m1" })).toEqual(inherit); // 仅 model 不成对 = 不整组命中
    expect(routeChipOf({ provider: "p1" })).toEqual(inherit);
    expect(JSON.stringify(inherit)).not.toContain("project");
  });
});

describe("卡片路由 chip 渲染（SSR 静态锚）", () => {
  it("模型名 chip：chip.tool + dswf-tip（data-tip 展开 provider/档位），呈模型名不呈 provider", () => {
    const html = renderPanel({ entries: [entry({ provider: "deepseek-official", model: "deepseek-reasoner", reasoning: "high" })] });
    expect(html).toContain('data-xc-route="model"');
    expect(html).toContain("chip tool dswf-tip");
    expect(html).toContain("deepseek-reasoner");
    expect(html).toContain("deepseek-official · reasoning 高");
    expect(html).not.toContain("deepseek-official · deepseek-reasoner"); // 旧「provider · model」双段形态退役
  });

  it("继承态 chip：dswf-chip-muted 弱化 + tooltip 文案，呈「继承父Agent」", () => {
    const html = renderPanel({ entries: [entry()] });
    expect(html).toContain('data-xc-route="inherit"');
    expect(html).toContain("dswf-chip-muted");
    expect(html).toContain("继承父Agent");
    expect(html).toContain("未配置路由，派发时继承父 Agent 会话模型");
  });
});

// ── 面板工具行「配置」跳转按钮（D2：召唤按钮右侧 → 本插件配置 tab）──────────
describe("面板工具行配置跳转按钮", () => {
  it("onOpenConfig 在场 = ghost「⚙ 配置」钮呈现（aria-label + tooltip 微文案），落召唤钮之后", () => {
    const html = renderPanel({ onSummon: () => undefined, onOpenConfig: () => undefined });
    const summonAt = html.indexOf("dswf-summon-btn");
    const cfgAt = html.indexOf("dswf-cfg-jump-btn");
    expect(cfgAt).toBeGreaterThan(-1);
    expect(cfgAt).toBeGreaterThan(summonAt);
    expect(html).toContain('aria-label="打开插件配置"');
    expect(html).toContain("⚙ 配置");
    expect(html).toContain("默认 Agent 选项（本插件配置）");
    expect(html).toContain("dswf-btn-ghost");
  });

  it("onOpenConfig 缺席 = 零配置钮（不悬空）", () => {
    expect(renderPanel({ onSummon: () => undefined })).not.toContain("dswf-cfg-jump-btn");
  });
});

// ── 配置跳转导航（官方设置壳 DOM 缝：设置触发钮 → 「内置插件」分区 → 本插件 tab）──
describe("openPluginConfigTab 导航序列", () => {
  function fakeDoc(nodes: Record<string, Array<Record<string, unknown>>>) {
    const clicks: string[] = [];
    const make = (node: Record<string, unknown>) => ({
      textContent: node.text as string,
      click: () => {
        clicks.push(node.name as string);
        node.on?.click?.();
      },
    });
    const doc = {
      querySelector: (sel: string) => (nodes[sel]?.[0] !== undefined ? make(nodes[sel]![0]!) : null),
      querySelectorAll: (sel: string) => (nodes[sel] ?? []).map(make),
    };
    return { doc, clicks };
  }

  it("设置触发钮 → 分区导航钮 → 本插件 tab 三连点（tab 缺席 = 单贡献直呈，止于分区）", () => {
    const immediate = (fn: () => void): void => fn();
    const a = fakeDoc({
      '[aria-label="设置"]': [{ name: "trigger", text: "设置" }],
      button: [{ name: "nav", text: "内置插件" }],
      '[role="tab"]': [{ name: "tab", text: "默认 Agent 选项" }],
    });
    openPluginConfigTab(a.doc as unknown as Document, immediate);
    expect(a.clicks).toEqual(["trigger", "nav", "tab"]);

    const b = fakeDoc({
      '[aria-label="设置"]': [{ name: "trigger", text: "设置" }],
      button: [{ name: "nav", text: "内置插件" }],
    });
    openPluginConfigTab(b.doc as unknown as Document, immediate);
    expect(b.clicks).toEqual(["trigger", "nav"]);
  });

  it("设置触发钮缺席（宿主未组 settings 域）= 静默不动作", () => {
    const a = fakeDoc({});
    openPluginConfigTab(a.doc as unknown as Document, () => undefined);
    expect(a.clicks).toEqual([]);
  });
});

// ── 「⚙ 配置」跳转官方导航缝（pluginNavigation.openBundle——插件管理器详情页正门）──
describe("pluginConfigJumpOf 官方导航缝", () => {
  it("缝在场：解析器返回跳转闭包，调用即 openBundle(@dsh-forge/expert-squad)", async () => {
    const { pluginConfigJumpOf } = await import("../src-client/panel/config-jump.js");
    const calls: string[] = [];
    const resolve = pluginConfigJumpOf({
      reflect: {
        get: (name: string) =>
          name === "pluginNavigation"
            ? { openBundle: (pkg: string) => { calls.push(pkg); } }
            : undefined,
      },
    });
    const jump = resolve();
    expect(typeof jump).toBe("function");
    jump!();
    expect(calls).toEqual(["@dsh-forge/expert-squad"]);
  });

  it("缝缺席/形状漂移：解析返回 undefined（降级 DOM 导航先例，不炸）", async () => {
    const { pluginConfigJumpOf } = await import("../src-client/panel/config-jump.js");
    expect(pluginConfigJumpOf({ reflect: { get: () => undefined } })()).toBeUndefined();
    expect(pluginConfigJumpOf({ reflect: { get: () => { throw new Error("absent"); } } })()).toBeUndefined();
    expect(pluginConfigJumpOf({ reflect: { get: () => ({ openBundle: 42 }) } })()).toBeUndefined();
    expect(pluginConfigJumpOf({})()).toBeUndefined();
  });
});

describe("delegate 装配降级提示（run-state 读口观测面）", () => {
  it("degraded：可见提示条（role=status + data 标记），携降级原因与委派不可用文案", () => {
    const html = renderPanel({ delegateNotice: "subagents-absent" });
    expect(html).toContain('data-dswf-delegate-notice=""');
    expect(html).toContain('role="status"');
    expect(html).toContain("delegate_expert 不可用");
    expect(html).toContain("subagents-absent");
  });

  it("registered / 缺省：零提示（不渲染提示条）", () => {
    expect(renderPanel()).not.toContain("dswf-delegate-notice");
    expect(renderPanel({ delegateNotice: undefined })).not.toContain("dswf-delegate-notice");
  });
});
