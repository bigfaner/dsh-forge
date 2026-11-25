---
title: worktree 清单选主「占位即冻结」范式——主树行在场恒裁主树行，后继不得凭 createdAt 翻盘
summary: >-
  候选集存在主树行（祖先前缀判）时恒裁主树行，后继非主树行不得凭 createdAt 更新翻盘（commit f734c29e，bug
  143328f1/0c677db2）。成立域限定：镜像同构前提 = worktree 全在主树子树内；外置 worktree_dir 布局两半边可分叉（台账
  official-face-contract-anchors.md M1 节）。
keywords:
  - worktree
  - 选主
  - INV-U
  - createdAt
  - 占位即冻结
status: unconfirmed
source_container: e2e-known-reds-triage
source_task: 1.14 fix-6
source_bug: 143328f1 / 0c677db2
id: worktree-master-row-freeze-arbitration
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 主树行「占位即冻结」选主范式

## 规则

1. 选主候选集中一旦存在主树行（按祖先前缀判定），恒裁主树行为主，与各行 createdAt 新旧无关。
2. 后到的非主树行不得凭更新的 createdAt 翻盘——「占位即冻结」，时序字段只用于主树行缺席时的次级裁定。
3. **成立域限定**：本范式的镜像同构前提 = 所有 worktree 都在主树子树内；外置 `worktree_dir` 布局下两半边可分叉，判据失效（见台账 `official-face-contract-anchors.md` M1 节）。

## 边界

适用于 worktree 清单 INV-U 选主谓词；一般「时间戳定序」场景不直接适用，需先确认主树锚定前提。
