---
feature: "mobile-ui"
journey: "worker-session-entry"
risk_level: "High"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-8"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#F7"
generated: "2026-10-17"
---

# Journey：进入 worker 会话（one-shot / continuable 双形态）

**用户故事**：US-8 进入 worker 会话（批次③）。

## 搭建前置条件

- host 上存在任务循环：一个 one-shot worker 会话、一个 continuable worker 会话均有历史消息。

## Happy Path

1. **用户在任务浮层点开 continuable 任务卡** → 预期：进入 `#/worker/:sessionId` worker 会话，可见执行过程消息流；状态徽标同任务面板。
2. **用户查看会话环境信息** → 预期：模式/worktree 只读继承自主会话，手机端不可修改。
3. **用户发送消息** → 预期：消息作为注入下一轮发出，对话延续。
4. **用户点 ← 退出 continuable 会话，再点开 one-shot 任务卡** → 预期：退出返回任务浮层、主会话循环不受影响；one-shot 会话可浏览全部执行过程（只读形态，输入不可用）。

## 边界用例

1. **（引步骤 4）one-shot 会话尝试发送**：分叉前置 = one-shot worker → 输入不可用，消息无法发送（只读形态），界面无诱导发送的控件。
2. **（引步骤 2）尝试修改模式/worktree**：分叉前置 = 用户点模式/worktree 显示区 → 只读呈现（worktree 点看全量：名称与路径分行），无修改入口。
3. **（引步骤 3）发送在途时 worker 会话仍在运行**：分叉前置 = 注入消息尚未落轮 → 消息乐观呈现，最终由会话真实状态收口，不出现重复注入。
4. **（引步骤 4）退出后重新进入**：分叉前置 = 用户退出后再次点同一任务卡 → 会话状态如实恢复，无幽灵输入或状态残留。

## Journey Invariants

- worker 会话形态由 worker 类型决定：one-shot 恒只读；continuable 可发送且注入下一轮——形态差异是用户可感知的第一行为差异。
- 模式/worktree 只读继承自主会话，worker 会话内不可变更。
- 进入/退出 worker 会话不干扰宿主任务循环（← 退出仅是导航，非循环控制）。
