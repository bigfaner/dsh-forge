# Todo

## 待研

- **模式 B · 一任务一 worktree**：派发 worker 在独立 worktree 工作、结果收敛回共用基分支。
  - git 硬约束：同一分支不能被两个 worktree 同时检出——并行形态必须每树挂临时分支（`wt/<task-id>`），结算时主会话顺序合并回基分支，冲突判 blocked 派 fix。
  - 前置依赖：改进 4（worker 进程树 Job Object 回收）落地 + commit 水位可控（并行 N 份质量门内存翻倍），第一版限并发 2。
  - 与模式 A（池共用一树串行）同属「worker 文件树隔离」命题，两者一并裁决。
  - 出处：dispatch-loop-hardening 提案（2026-10-17 移出提案，记录待研）。

- **具名 subagent**：收口评审/处置代理等场景，未来使用用户自定义的具名 agent——主会话按任务语义挑选合适的具名 agent 派发（如评审选 reviewer 型、triage 选分析型），替代当前匿名 subagent；依赖 agent 预设/目录机制，另行立项。
  - 出处：dispatch-loop-hardening 提案（2026-10-17 记录待研）。
