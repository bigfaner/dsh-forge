---
title: worker 子会话三环境限制（专家池/addTask/sessions 直读）
summary: >-
  loop 派发的 worker 子会话：①专家池只见用户层档案，20 预设档案不在其中，delegate_expert 调预设键 loud 报 not
  found；②addTask 被拒（ERR_WORKER_ADDTASK_DENIED）；③sessions\ 目录直读
  UnauthorizedAccess，取证走 storages/session_projcache/sessions/<id>.json。
keywords:
  - worker
  - 专家池
  - addTask
  - projcache
  - 环境限制
  - maxDepth
  - createProposal
domainPath: .knowledge/lessons/
来源容器: expert-squad-forge；loop-consol-flywheel-improvement
来源任务: first-pass 复盘（1.7）；first-pass 复盘（1.9，loop-consol-flywheel-improvement）
bug id: 无
id: worker-session-environment-limits
status: unconfirmed
type: facts
version_ts: '2026-11-05T00:00:00.000Z'
---

# worker 子会话三环境限制

1. **专家池不含预设档案**：`delegate_expert` 只见用户层注册档案（code-reviewer）；预设 20 档案消费路径只能在 loop 派发面（映射表 → ctx.experts.get）验证。两次实证：walkthrough/1.5 负向实测、1.7 复盘交叉核验派发复现。追加实证（loop-consol-flywheel-improvement 1.9 复盘）：专家池随会话状态可能整体为空（`list_experts` 返回 none），第二视角核验完全不可达。
2. **addTask 不可用**：worker 会话调用报 `ERR_WORKER_ADDTASK_DENIED`。
3. **会话记录取证路径**：`sessions\` 直读被拒；经 `storages/session_projcache/sessions/<id>.json` 取证成功。

## 追加限制（loop-consol-flywheel-improvement 1.9 实证）

4. **worker 内 subagent 派发受 maxDepth=1 限制**：worker 再派 subagent 实测报超深度上限错误——双 agent 交叉核验在 worker 内不可达，以双视角结构化自查替代。
5. **worker 面无 createProposal**：FORGE_DENY 契约拒绝——改进提案的管线注册须回主会话完成（文档可在 worker 成稿）。

影响：凡 worker 内需要跨任务建链、调预设专家、派发 subagent 或注册提案的场景，须回主会话/loop 面完成。
