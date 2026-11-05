---
title: 单次真机取证摊销多条验收 + 等价路径抽验 + 环境还原
summary: >-
  真机走查一次派发链同时自证验收 1/2/3/6/7/8（worker 正在用 claim/submitTask
  结算即自证管线用具恒可用）；不可达取证路径（无删除工具→档案遮蔽）以同机制等价路径（禁用/恢复）抽验收口；走查改过的宿主状态（forge-settings.json）取证后还原基线并逐字比对留痕。
keywords:
  - 真机取证
  - 摊销
  - 抽验
  - 等价路径
  - 环境还原
domainPath: .knowledge/examples/
来源容器: expert-squad-forge
来源任务: first-pass 复盘（1.7）
bug id: 无
id: real-machine-walkthrough-three-techniques
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 真机取证三手法（walkthrough/1.5 判例）

1. **自证摊销**：单次真派发链覆盖 6 条验收；「本会话即 loop worker」身份直接自证管线必备用具恒可用（正在用 submitTask 结算本单即证据）。
2. **等价路径抽验**：验收 2 的遮蔽（删除档案）路径无删除工具可达时，以同机制禁用/恢复路径抽验，覆盖验收 2/3/8 各一条即收口——不硬造不可达取证。
3. **环境还原义务**：走查写入的 settings 覆盖（experts.mapping）取证后还原基线，与 baseline 快照逐字比对确认无残留，探针不污染宿主状态。
