---
id: "fix-41"
title: "Fix: 项目树收起后无法展开——行点击不翻转（DisclosureRow 缺省 expandOnRowClick=false，点标题无反应）；原生行为 = 整行 treeitem onClick 翻转"
priority: "P1"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 左侧项目树收起后无法展开（用户验收 2026-10-05 报障③）

## 症状（用户原话）

「左侧项目树被收起后，无法展开。」

## 根因（本会话源码勘察钉死）

**产品项目行用官方 DisclosureRow 的缺省形态——行点击不翻转，唯一翻转面 = 左侧图标+chevron 小按钮（约 24px）；用户点项目标题 → 无反应 → 「收起后无法展开」。**

对照证据：

1. 产品消费面：`apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx` ProjectBlock（:117-143）`<DisclosureRow icon title open expandable onToggle ...>` —— **未传 `expandOnRowClick`**（官方缺省 false）。
2. 官方 DisclosureRow 语义（primitives lib/index.js）：`expandOnRowClick=false` 时行本体 `onClick=undefined`、无 `role=button`、无 `aria-expanded`、无键盘翻转（Enter/Space 只在 rowExpands 时挂）；唯一触发面 = leading 钮（`toggleFromLeading`，icon+chevron，stopPropagation）。
3. **原生 dsh 工作区行**（ui-workspace Rows：ownRow）：`role="treeitem"` + `aria-expanded` + **`onClick: onToggle`（整行翻转）**；hover 时 folder↔chevron 图标互换；行尾动作钮 stopPropagation（menu/新会话）。
4. 次级嫌疑（同一体验复合，核查收尾）：整侧栏收起（官方 toggle）后的展开回路——产品 ForgeWorkspacePanel rail 态渲染**空轨道 div**（:462-465），且 ForgeSidebarSlot 传入的 `expandSidebar` 壳回调**被 ForgeWorkspacePanel props 丢弃**（:440-452 未声明）；rail 态唯一展开钮 = 官方 logoRow toggle（e2e Step1b 证可往返，但可发现性差——chevron 图标隐藏、显示品牌标）。

## 修复方案

### A. 树行整行翻转（主修复）

- ProjectBlock 的 DisclosureRow 传 **`expandOnRowClick`**（官方开关直接生效：整行 onClick + role=button + aria-expanded + Enter/Space 键盘翻转——零自绘，官方语义即原生语义）；
- 零会话项目（`expandable=false`）行为不变（无可展开内容；「暂无会话」提示行如常）；
- 会话行点击 = 打开会话（现行 onActivate）不受影响——DisclosureRow children 区点击不冒泡到行翻转（官方 children 渲染在行外层，`open && children` 平级）。

### B. rail 态展开回路收尾（核查 + 最小修）

- ForgeWorkspacePanel 接回 `expandSidebar` prop（至少消费为 rail 态空轨道的点击展开——rail 图标列细化归 fix-42 对齐任务）；
- 验证协议（活体）：起 app → 点官方「收起侧边栏」→ rail 态确认「打开侧边栏」钮在场/可点/`elementFromPoint` 命中自身（排查 WCO 带遮挡——fix-40 落地前后各测一遍：titlebar 模式下 rail 列宽 0 + 浮动钮，几何完全不同）；展开往返 + 树行点击翻转 + Enter/Space 键盘翻转各断言一次。

## 验收

1. 点击项目行**任意位置**（标题/图标/行空白）→ 翻转收展；键盘 Enter/Space 同效；`aria-expanded` 在场；
2. 行尾动作（＋添加项目等）与标题点击互不干扰（stopPropagation 语义不破）；
3. 整侧栏收起→展开往返可用（官方 toggle + rail 回路）；树行收展状态在过滤开关后保持（现行 collapsedIds 语义不变）；
4. 单测：ForgeWorkspacePanel 渲染面（expandOnRowClick 传入 + aria）；e2e：session-workbench Step1b 附近补树行点击翻转断言（现有 Step1b 只测侧栏收展往返）。

## Reference Files

- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx（:117-143 ProjectBlock——修改点；:337-347 collapsedIds 态机——不动；:440-489 面板本体/rail 早退——B 步）
- 官方 DisclosureRow：dsh-client-ui-primitives lib/index.js（expandOnRowClick/rowExpands/toggleFromLeading/键盘翻转全语义）
- 原生行母本：dsh-client-ui-workspace client.js ownRow（role=treeitem + aria-expanded + onClick=onToggle + hover 图标互换 + 行尾 stopPropagation 动作）
- e2e/specs/p1mvp/session-workbench.spec.ts:286-309（Step1b rail 往返——现有覆盖面）
- 官方 SidebarRoot regionArea share（ui-sidebar client.js：`renderSlot("sidebar.workspaces", { wide, expandSidebar })`——B 步回调来源）
- 关联：fix-40（Windows 壳模式——rail 几何在 titlebar 模式下整体不同，B 步验证双态跑）、fix-42（树/列表对齐原生——A 步是其行交互子集先行修复）

## 边界与不做

- 不自绘树行/不换组件族（DisclosureRow 官方开关即达原生语义——官方优先红线）；
- 不动 collapsedIds 态机与过滤语义（纯交互触发面修复）；
- rail 图标列完整形态（项目图标/搜索钮入轨）归 fix-42，本任务只保展开回路通。
