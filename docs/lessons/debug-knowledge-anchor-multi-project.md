# debug- 知识库多项目恒「尚未锚定项目」

- Tags: architecture, interface, testing
- Date: 2026-10-06
- Source: fix-bug 会话（commit a26ba47）

## Problem

用户注册了项目（实测 state.db 有 3 行 projects），知识库页面仍恒显「尚未锚定项目」引导空态，知识页完全不可用；文案还在引导「注册项目后…」，与事实相反。单项目场景 e2e 全绿，问题只在多项目（≥2）台账号下复现。

## Root Cause

双重叠加，且都藏在装配层：

1. **锚定输入恒空**：`ForgeKnowledgePanel` 是官方 `main` keyed 槽的 root 作用域占用者，向 `projectAnchorOf` 硬编码传 `sessionId: null`。该纯函数无会话时只有「恰一项目」才返回锚——多项目即 null。代码注释断言「root 作用域无会话锚可读」，该假设是**错的**。
2. **空态说谎**：`KnowledgeView` 对 projectId null 只有一种空态文案（零项目引导），把「多项目未锚定」也渲染成「尚未注册」。

## Solution

- 面板经 root 标准props `useSessions` 读**主视图会话**：官方 `retainedBy.mainView > 0` 的会话行 id（ui-layout DocumentTitle / ui-workspace 等 8 处官方同型先例）。锚子件 `MainSessionAnchor`（PanelInfoAnchor 同形制：子件内无条件调钩子 + effect 上抛，fix-33 ⑤ 钩子形制合规）。
- 接入 `projectAnchorOf` 既有会话锚定分支（会话归属 workspace 名下项目）——与召回视图同语义，非「猜首个」。
- 无会话 + 多项目保持 null，但空态按台账数分流（`anchorlessCopy`）：≥2 如实说明「打开会话后跟随锚定」。

## Reusable Pattern

- **root 作用域读当前会话**：`Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)?.id` —— 官方 kit 对「主视图正持有哪个会话」的规范口径，任何 root 面板都能用，不必拥有 session 作用域 prop。
- **bug 诊断先查用户实库**：单测/e2e 全绿仍报 bug 时，直接打开 `%APPDATA%/dsh-forge/state.db`（better-sqlite3 只读）看真实台账/日志行，一次查询即把假设空间从 5 个砍到 1 个。
- **官方 kit 契约即文档**：槽位 standardProps（useSessions/useWorkspaces 等自动以 props 递达占用者）与 keyed 槽「只渲染 entryKey 匹配项（非选中即卸载）」都写在 `dsh-cordis-client-runner` 的 CLIENT_SLOT_API 与 renderer 实现里，逆向不确定的装配行为时直接查编译产物。

## Related Files

- apps/web/src/workbench/KnowledgePanel.tsx（MainSessionAnchor / readMainSessionId）
- apps/web/src/workbench/panel-model.ts（projectAnchorOf 会话锚定分支——既有）
- apps/web/src/views/knowledge/KnowledgeView.tsx（anchorlessCopy 空态分流）

## References

- 官方先例：`@deepseek-ai/dsh-client-ui-layout` DocumentTitle（retainedBy.mainView 读法）
- 既有消费面：apps/web/src/views/session/ConversationViews.tsx（召回视图 session 作用域同锚径）
