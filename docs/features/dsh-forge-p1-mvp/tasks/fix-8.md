---
id: "fix-8"
title: "Fix: 两处小缺陷——① 知识域树激活标记在视图往返后丢失（数据保持、标记不同步）② dock 调宽手柄键盘步进未生效（待复核：焦点/事件拦截）"
priority: "P2"
estimated_time: "1h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 知识域树激活标记往返丢失 + dock 手柄键盘步进复核

> 来源：全面排查第 5 轮 walk4（[reports/acceptance-round2.md](../reports/acceptance-round2.md) §7）J/H2 两项 FAIL。均为小缺陷/复核项，打包一案。

## ① 域树激活标记在视图往返后丢失

**实测**（walk4-J）：知识视图选域「前端」（过滤生效 entries=3）→ 桥派发 show-session → 再点「知识库」回知识视图 → **卡片仍正确过滤（3 条，过滤态数据保持 ✅）但域树行 `[data-active]` 标记丢失**（active=0）。数据与视觉标记不同步——激活翻转全量重拉（fix-1④）后，`filter.domain` 仍在而树行未再标激活。修复方向：DomainTree 行激活投影与 `state.filter.domain` 的对齐（渲染派生应无条件随 state；疑点为重拉后 nodes 重建路径上 selectedDomain 传递断链）。复现脚本：tmp-ui-review/walk4.mjs 步 J。

## ② dock 调宽手柄键盘步进未生效（待复核定性）

**实测**（walk4-H2）：展开 dock → click 手柄 → `ArrowLeft` → 宽度 341→341 未变。源码接线齐全（[WorkbenchZones.tsx:105-110](../../../apps/web/src/zones/WorkbenchZones.tsx) onKeyDown + tabIndex=0 + CSS `width: var(--dswf-dock-width, 340px)` 消费在 [zones.css:56](../../../apps/web/src/zones/zones.css)），纯函数 8 用例绿。**待复核二选一**：(a) 测法问题——Playwright click 未将焦点落上手柄（复核：`evaluate(handle.focus())` 后再按键）；(b) 真缺陷——官方壳全局键盘层在捕获相拦截方向键（与 fix-5 的键入异常或同源，可并案插桩）。若 (b)，随本任务一并记录拦截面结论。

## Root Cause（fix-8 复核收口——实测证据）

**① 域树激活标记往返丢失 = fix-5 同根（滞后快照消费），已随 fix-5 修复收口，本任务复核 + 回归单测钉死。**
walk4 跑于 fix-5 pending 期——当时 hook 直返装载态（`state.filter` = 装载转移保留的永久滞后快照，恒为空），DomainTree `active` 消费点读它即 `active=0`；任务文件疑点「重拉后 nodes 重建路径 selectedDomain 传递断链」不成立（激活重拉 `applyBrowseLoad {kind:'bundle'}` 经 `...prev` 保留全部旧字段，nodes 重建本身不断链——断的是 filter 快照消费）。fix-5（3b7ba69）`consumedBrowseState` 盖写实时 reducer 过滤态，域树高亮为其点名消费面之一，①随之修复。**walk4-J 复跑 PASS**（tmp-ui-review/fix8probe.mjs，同径夹具：选「前端」entries=3+标记在场 → show-session → 回知识视图 → busy 收敛后 `data-active=1` 且 entries=3；二次往返幂等）。补回归单测：use-knowledge-browse.test.ts 新增「激活翻转全量重拉 × selectedDomain 投影」链路用例（首装→选域过滤落点→hold→激活重拉 bundle 重建 nodes→consumedBrowseState 合成→断言 filter.domain 保持 + 重建行集内选中域行命中；并钉死装载态快照不带域 = walk4-J 症状载体）。

**② dock 手柄键盘步进 = 复核对象已被 fix-10 整体退役，无产品面可修可测——结论「superseded」，非测法问题亦非拦截缺陷。**
fix-10（836a219）以官方 ui-dockkit 基座整体替换 fix-4 自研轨道：调宽手柄/宽度内态/`dock-width.ts`（含 DOCK_RESIZE_KEY_STEP·clamp·8 纯函数用例）全数删除，WorkbenchZones 重写为 DockLayout 装配——任务文件所指 `WorkbenchZones.tsx:105-110,152-163` 键盘接线与 `zones.css:56` 宽度消费已不在场（grep 零残留）。官方面证据：dockkit bundle 内 `ArrowLeft/ArrowRight` 仅用于 chips 焦点导航（`chipToFocus`），divider（`data-dockkit-divider`）仅 `onPointerDown` 拖拽——官方件无键盘步进面；且 P1 `dockCanSplit` 限单窗格（无 divider 可见）。实机探针 `dockSeparators=0`。**处置去向**：闭环为 fix-10 取代；键盘调宽若需，归官方件上游能力诉求（P1 范围外，Hard Rule「dock 机制语义不动 + 官方件复用」不许自研回补）。测法（a）/拦截面（b）二选一就此失效——无产品面可复核。

## Acceptance Criteria

- [x] ① 视图往返（knowledge→session→knowledge）后域树行 `data-active` 与过滤态一致（walk4-J 步复跑 PASS）；补单测（激活重拉后 selectedDomain 投影）——复跑 PASS（fix8probe.mjs J1→J3：activeFe=1/entries=3/busy=false，二次往返 J4 幂等）；单测落地（use-knowledge-browse.test.ts 激活重拉链路用例，25/25 绿）
- [x] ② 键盘步进生效或复核结论入记录（测法修正依据/拦截面结论 + 处置去向）——复核结论入记录：superseded by fix-10（手柄/宽度态/DOCK_RESIZE_KEY_STEP 全数退役，官方件无键盘步进面），见「Root Cause（fix-8 复核收口）」②
- [x] 既有断言零褪色；tsc + lint + 定向单测绿——knowledge 8 文件 79/79 全过（新增 1 例）；tsc -b 0 错；pnpm lint 全绿（ox/imports/tokens/selftest/types）

## Hard Rules

- 未点名元素不变；域过滤语义（前缀透传/服务端执行）不动；dock 机制语义不动。
- 官方件复用 + 令牌唯一。

## Reference Files

- apps/web/src/views/knowledge/DomainTree.tsx / KnowledgeBrowse.tsx — 激活投影链
- apps/web/src/zones/WorkbenchZones.tsx:105-110,152-163 — 键盘接线；zones.css:56 — 宽度消费
- tmp-ui-review/walk4.mjs — 复现（步 J / H2）
