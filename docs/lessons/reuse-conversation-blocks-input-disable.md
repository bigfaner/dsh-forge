# reuse- 第三方禁用会话输入的唯一正道 = conversation.blocks（composer 官方 block 缝）

- Tags: reuse, ui, official-mechanics
- Date: 2026-10-26
- Source: bug 267dcac1 fix 会话（commit 124a39a9/1df949e7）

## Problem

worktree 点选后 `openWorkspace` 异步切换（~1s）期间 composer 仍系旧树 blank，窗口内发送落旧树（WYSIWYG 违约）。首版自造修复：overlay 横条 + document 捕获层键击/指针拦截——形态不对（横条非整框禁输）且属自造机制。

## Root Cause

没找到官方留出的正道：ui-conversation 内部 `ComposerBlockRegistry`（client.js:3747）注释明言「**the one way another plugin stops a session's input**」，经 `ConversationController`（cordis 服务名 `"conversation"`）公开字段 `blocks` 对外可达——`blocks.set(sessionId, { reason } | undefined)`。

## Solution

- pending 置位 → `blocks.set(当前主会话, { reason: '…' })`；敛棋 → 对**置位时点捕获的会话**清（openWorkspace 换主后 `mainReference.sessionId` 已易主，清退必须锚定捕获值）。blocked 会话 composer 由官方渲染为 inert 禁用卡 + reason 占位。
- 服务取法：`ctx.reflect.get('conversation', false).blocks`（root 级服务；非会话作用域 get）。
- 视觉事实：blocked 形态边框**实线**（官方仅 `cardWorkspaceTrigger` 有 dashed 类，条件 = inert+picker，blocked 不可达）。要虚线需自补视觉：官方 overlay 缝（卡片内 overlayAnchor）落零尺寸标记 + `.card:has(标记)::after` 同配方 dashed 规则（选择器含上游哈希类 `uV2eYG_card`——上游改版静默失效，fail-soft 视觉降级可接受）。

## Reusable Pattern

- **禁输入/禁发送先查 `conversation.blocks`，不自造拦截**：捕获层 keydown/pointer 拦截、覆盖层遮挡皆属自造机制；官方 block 同时解决「形态正确」（inert textarea + 占位）与「send 按钮径」。
- **竞速窗口闸与生效链共用同一 promise**：闸置位在触发点同步、敛棋锚定生效调用返回的 promise，配超时 fail-open（3s）防永锁。
- **程序性回填与用户显式动作语义必须拆分**：建树后的自动选中 = 纯显示态（零会话副作用，e2e 口径「建树零新增会话」）；懒物化/开户只随用户点选显式意图走——共用同一回调会让自动路径意外产生副作用。

## Related Files

- apps/web/src/state/worktree-switch-gate.ts（闸状态 + window 锚）
- apps/web/src/client-plugin/worktree-switch-gate-install.ts（pending → blocks.set 翻译面）
- apps/web/src/views/session/WorktreeFaces.tsx（ForgeWorktreeSwitchMarker 视觉锚）
- node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js:3747-3782（ComposerBlockRegistry 正本）
