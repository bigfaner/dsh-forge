---
feature: "mobile-ui"
journey: "hero-new-session-branch-guard"
risk_level: "High"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-6"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#F5"
generated: "2026-10-17"
---

# Journey：新会话 hero · 乐观分支切换 · host 守卫确认框

**用户故事**：US-6 发起新会话（批次②）。

## 搭建前置条件

- 已配对手机端处于当前分支/worktree 环境；hero 路由 `#/new` 可达。

## Happy Path

1. **用户点顶栏 ＋ 打开 hero** → 预期：初始状态模式=突击、分支=当前所在分支/worktree，无强制切换。
2. **用户保持默认直接开建会话** → 预期：会话在当前分支/worktree + 突击模式下创建并进入对话主视图。
3. **用户切换分支/worktree** → 预期：UI 乐观切换为所选分支（无预检调用、无预检说明文本），选档即时呈现。
4. **host 建会话守卫拒绝切换，用户在确认框中选择动作** → 预期：弹出「选回 / 仍要切换」确认框（数据完全回执驱动）；选「仍要切换」则按用户意志继续创建；选「选回」则回到原分支、不创建会话。

## 边界用例

1. **（引步骤 3）切换未回执时再次操作**：分叉前置 = 乐观切换已呈现、host 回执未达 → UI 保持乐观态，不因重复点击叠加切换或出现中间态闪烁。
2. **（引步骤 4）守卫拒绝且用户无动作**：分叉前置 = 确认框在显 → 后续动作等待用户决定，不自动选回或自动继续。
3. **（引步骤 4）非分支类守卫失败**：分叉前置 = host 校验因其他原因失败 → 只回传确认框/提示数据呈现给用户，手机端不自行重试或降级。
4. **（引步骤 2）快速连开 hero 与返回**：分叉前置 = hero 打开后未建会话即返回 → 无残留半创建会话或状态泄漏。

## Journey Invariants

- hero 初始态恒为：模式=突击、分支=当前所在分支/worktree；不强制用户切环境。
- 分支切换全链回执驱动：无预检调用，UI 无预检说明文本；乐观呈现仅是体验，落点由 host 守卫裁决。
- 创建会话前宿主环境不被改变——被拒绝的切换不落任何 host 侧状态。
