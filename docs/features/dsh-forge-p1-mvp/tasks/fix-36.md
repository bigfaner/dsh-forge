---
id: "fix-36"
title: "Fix(P2): 客户端整洁批——defaultClient×4/时间标签×3/锚模式×4 三组收敛（~120 行复制）+ fix-25 后注释漂移 5 处 + 复杂度热点（相位链三元/RegisterForm 行件）+ data 锚域前缀"
priority: "P2"
estimated_time: "5h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P2): 客户端整洁批（clean code 客户端路 A- 扣分项清偿）

> 来源：clean code 客户端评审（2026-10-04，A-）。扣分集中：跨视图小件重复未收敛（「同级互禁」被泛化到「公共下层也不许共享」）+ fix-25 后注释漂移。

## 清单

1. **三组重复收敛**（~120 行复制消除）：
   - `defaultClient()` 四处逐字（use-forge-projects:65 / use-knowledge-browse:338 / EntryDrawer:319 / RecallTab:324）+ RpcClientFactory 类型两重一别名 → `rpc/` 单一 `preloadRpcClientFactory` + 类型导出（公共下层不违同级互禁铁律）；
   - relativeTime 桶→中文 switch 三份逐字（sidebar-model:96 / browse-model:118 / recall-model:139）→ 共享 time-label（components/ 或 rpc/ 层）；
   - 「快照 useState + 窄化 + useForgeProjects + 条件 WorkspacesAnchor」15 行模式 ×4（ShellHost:106 / HeroWorkspacePicker:64 / ConversationViews:38 / KnowledgePanel:36）→ `useAnchoredProjects(useWorkspaces?)` 自定义 hook；
   - 顺带 P3：`effectiveNativePick` useMemo ×2 + `EMPTY_REGISTERED` ×3（add-project 族）→ dir-picker `resolveNativePickSource` + 共享常量；错误条/骨架三套近同构 CSS → ErrorBar/SkeletonRows 共享件（EmptyState 先例）；
2. **fix-25 后注释漂移 5 处**：KnowledgeView.tsx:6,30（「归 zones 容器」——已退役，改官方 keyed 面板口径，KnowledgePanel.tsx:31 为范本）、:17（view.center 退役形态）、flow-open.ts:4-5（__DSH_FORGE_WORKBENCH__ 归属错标 sidebar-actions，实在 workbench-bridge）、product-views.ts:39（「知」字标——fix-15 已改书+闪电）、RecallTab.tsx:317（SessionPanel pane 机制引用）；
3. **复杂度热点**：ForgeWorkspacePanel.tsx:344-375 相位链四层三元 → phaseBody 纯函数/早返；RegisterFormView ≈155 行 JSX（92-271）→ 抽 FormRow 行件；AddProjectFlow:218-226 keep-alive 布尔推导 → flow-model 纯函数 formMountedOf；plugin.ts apply() ≈160 行 → 按 sidebar/center/views 拆注册子函数；
4. **一致性与注记**：`data-dswf-skeleton` 三域同值 → 加域前缀与 className 对齐（ForgeWorkspacePanel:147 / DirectoryBrowser:186 / KnowledgeCardGrid:46）；knowledge.css:287 `0.22s` 裸时长补 dsw-raw 注记（全库唯一破纪律点）；main.ts:45 端口兜底魔法值命名常量；
5. **测试与残项**：RecallTab.test:86 标签形态正则 → data 锚断言；child.ts:46 `void shutdownTree()` 补 catch；workbench-bridge publishWorkbenchBridge 标注测试面用途；ForgeWorkspacePanel expandSidebar JSDoc 标「契约占位·当前未消费」。

## 验收

- 三组重复单一来源（grep 逐字拷贝清零）；注释漂移 5 处与 HEAD 机制一致；RegisterFormView <100 行；
- 全部单测 + e2e 锚随迁全绿（data 锚域前缀需同步 e2e 引用点）。

## Reference Files

- 见清单定位；客户端评审报告（本会话 2026-10-04）为规格源

## 边界与不做

- 零行为/零视觉变更（dswf-kn-retry 补样式归 fix-34）；铁律（视图同级互禁）保持——共享仅落公共下层。
