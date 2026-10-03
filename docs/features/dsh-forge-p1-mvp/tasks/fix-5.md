---
id: "fix-5"
title: "Fix: 知识浏览关键词交互缺陷——键入被弹回 + 卡片网格整体消失落「尚无知识」空库面（P1 功能缺陷，实测复现）"
priority: "P1"
estimated_time: "2h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 知识浏览关键词交互缺陷——键入被弹回 + 卡片网格整体消失落「尚无知识」空库面

> 来源：第 2 轮验收（[reports/acceptance-round2.md](../reports/acceptance-round2.md) §5 补录）——M1 知识浏览（UF-6）工具栏关键词搜索在实机交互下完全不可用并破坏浏览面。本会话 CDP 探针四轮实测复现（复现率 4/4）。

## Root Cause（黑盒证据矩阵；根因定位需修复任务内插桩收口）

**复现路径**：注册含知识目录的项目 → 知识视图（卡片正常呈现，域树/计数正常）→ 点击工具栏搜索框 → 键入任意字符（ASCII/CJK 均触发；`keyboard.type` 与 `fill` 均触发）。

**症状矩阵（实测）**：
1. 输入框受控值恒回空（键入/fill 后 `input.value === ''`，清除钮从不在场）
2. 卡片网格容器 `.dswf-kn-cards` **整体从 DOM 消失**（非隐藏——keep-alive 隐藏元素可被 querySelector 计数）
3. 域树与计数**保留**（「全部域 · 1」）、锚点稳定（`data-dswf-kn-anchor` 值不变）
4. 面落「尚无知识」空库引导（空库文案 + 知识目录路径提示在场）
5. 无任何过渡面：无 skeleton / 无 clear-filters / 无 error；无 pageerror（渲染进程存活）
6. 状态**永久停留**（静观 3–40s 不恢复）；重进视图可恢复

**已排除假设**（证据）：
- 渲染进程崩溃/React 卸载 —— 无 pageerror、workbench 常在
- 浏览子树重挂载 —— DOM 种植标记跨键入存活（`[data-dswf-kn-browse][data-probe-marker]` 在场）
- 异步自动会话/锚点漂移 —— 静置 40s 观察全稳（anchorprobe）；锚点值全程不变
- e2e 已覆盖 —— 4.2/3.8 e2e 未走「手动键入关键词」路径，属盲区

**疑点区（修复时插桩定位）**：`use-knowledge-browse` 过滤装载链——键入 → `set-keyword` → 过滤装载路径 `fetchFilteredCards`（不存在的关键词合法返回 `[]`，经 `applyBrowseLoad {kind:'cards'}` 落 `cards:[]` 且保留域树）与观测吻合；**但过滤态随后被复位为 `''`**（清除钮缺席 + 空库面而非无结果面）——复位写入者待查：hook 内 `clear-filters` 派发仅两处（[projectId] effect 与清除钮动作），而锚点稳定与 [projectId] effect 触发条件矛盾；另「受控输入值弹回」表明 `onKeywordChange` 链上 state 未消费键入值——需 React 层插桩（DevTools/临时日志）看 dispatch 是否到达 reducer。两症状（值弹回 + 过滤复位后空库面）可能同源（同一次异常状态转移）也可能两级联，修复任务内判定。

## Root Cause（fix-5 实测收口——插桩证据）

**根因**：`useKnowledgeBrowse` 双状态源不同步——过滤态机（`useReducer`）是过滤态唯一活跃来源，而装载态（`useState<KnowledgeBrowseState>`）内嵌的 `state.filter` 只是**上一次装载转移保留的快照**（`pendingBrowseState`/`applyBrowseLoad` 均取 `prev.filter` 透传，过滤派发不经装载转移），hook 直接 `return [state, actions]`，消费面（工具栏受控值 `value`、清除钮判据、域树高亮、`browseFaceState` 的 `filterActive` 分流）全部读了这份**永久滞后的快照**。两症状同源：

- **受控值弹回**：键入 → reducer 正确消费 `set-keyword`（插桩：`reducer set-keyword prev={"keyword":""} next={"keyword":"z"}`，effect 亦以实时过滤重拉），但 Body 渲染日志 `body render kw=""`——受控 `value=''` 把 DOM input 复位（React 受控恢复）。
- **零命中落空库面且不收敛**：零命中落点 `cards:[]` 后，快照 `filter` 仍为空 → `browseFaceState({cardCount:0, filterActive:false}) = 'empty-library'`（尚无知识引导）而非 `no-results`（无结果 + 清除入口）；无任何后续状态转移，表象即「过滤态被复位 + 卡死」。
- **不存在复位写入者**：插桩期 `clear-filters` 全程仅 mount 一次（幂等同引用）；[projectId] effect 与锚点稳定无矛盾——「复位」是快照滞后的错觉。

**修复**（surgical）：`use-knowledge-browse.ts` 新增纯函数 `consumedBrowseState(state, filter)`（同引用原样返回，否则盖写实时过滤态），hook 输出改 `return [consumedBrowseState(state, filter), actions]`——装载判定/转移纯函数面（browseLoadPlan/pendingBrowseState/applyBrowseLoad）、五锚装载机制、官方件全部零改动；单测补 `consumedBrowseState` 语义面 5 例（含零命中 → no-results 分流回归）。

**实机验证**（tmp-ui-review/fix5probe.mjs，修复前/后同径对照）：修复后键入 'z' → input value='z'、`_valueTracker='z'`、无结果面（无匹配知识）+ 清除入口在场、2.5s 稳态不落空库面；续键第二字符成 'zz'（不再弹回重打）；Esc → 全量恢复；重进视图健康。

## Reference Files

- apps/web/src/views/knowledge/use-knowledge-browse.ts — 过滤装载链与 effect（:273-314 五锚 effect + clear-filters effect）
- apps/web/src/views/knowledge/KnowledgeToolbar.tsx — 受控输入接线（value/onChange/onKeyDown Esc）
- apps/web/src/views/knowledge/KnowledgeView.tsx / KnowledgeBrowse.tsx — props 传递链（onKeywordChange 挂载核查）
- apps/web/src/workbench/WorkbenchPanel.tsx — projectAnchorOf 注入（锚稳定性已排除，仅复核）
- 复现/诊断脚本（本会话产物，净化 env + CDP 直连）：tmp-ui-review/markerprobe.mjs（含 DOM 标记法）/ finalprobe.mjs（分步 dump）/ anchorprobe.mjs（静置对照）
- 症状截图：tmp-ui-review/q9-input-interaction.png

## Acceptance Criteria

- [x] 键入关键词：受控值即时更新（输入框显示键入内容、清除钮在场）；命中关键词过滤网格、不存在关键词落「无结果 + 清除过滤入口」面（clear-filters 在场）——fix：consumedBrowseState + 实机探针（input='z'/'zz'、无匹配知识面、cf=1）
- [x] 清除过滤（钮/Esc）恢复全量卡片；过滤期间旧卡片缓存先行不闪不丢——实机 Esc 全量恢复；pendingBrowseState 缓存先行面零改动
- [x] 域过滤（select-domain）与关键词组合过滤语义正确、互不复位——reducer 语义零改动；组合过滤单测 + e2e Step2b 硬断言（域+关键词组合零命中 → 清除复位）
- [x] 根因结论入执行记录（插桩证据：复位写入者 + 受控值弹回机制）——见上「Root Cause（fix-5 实测收口）」+ 执行记录
- [x] 补 e2e：向导注册 → 知识视图 → 键入不存在关键词 → 无结果面 → 清除恢复（补 4.2/3.8 盲区；几何/状态锚复用 data-dswf-* 既有全集）——knowledge-browsing.spec.ts 新增「关键词交互回归（fix-5）」用例 + Step2b 缺陷信号 soft 转正（含清除恢复 + 受控值断言）
- [x] 既有单测（browse-model 17 例 / use-knowledge-browse / KnowledgeToolbar 语义面）与 e2e 零褪色；tsc + lint 全绿——knowledge 8 文件 78 例全过（含新增 5 例）；tsc -b 0 错；pnpm lint 全绿

## User Stories

- Story 3（浏览项目知识库）：工具栏关键词细分可用（PRD UF-6 AC2——组合过滤无结果时空结果提示 + 清除入口）。

## Hard Rules

- **修复不得弱化过滤语义**：域前缀透传唯一落点（entriesQueryOf）、服务端执行、UI 零客户端过滤——语义面不动，只修交互链缺陷。
- 未点名元素保持不变：装载判定纯函数面（browseLoadPlan/pendingBrowseState/applyBrowseLoad）语义、五锚装载机制、激活重拉——除非插桩证明缺陷在其中，且改动附单测。
- 官方件复用（Input/Button 原样）；令牌唯一。

## Implementation Notes

- 插桩建议顺序：① KnowledgeView→KnowledgeBrowse→Toolbar 的 onKeywordChange 传递链挂载核查（静态可判）→ ② reducer dispatch 到达性（临时 console 或 React DevTools）→ ③ effect 装载链 seq/plan 快照。
- 复现脚本跑法：`node tmp-ui-review/markerprobe.mjs`（净化 env 构造见脚本头部；本 harness 会话 playwright launch 不可用属环境限制，与本缺陷无关）。
- 关联：walk3 全流程走查其余 16 项 PASS（注册/域过滤/抽屉/上下文保持/召回空态）——缺陷面收敛于关键词交互链。
