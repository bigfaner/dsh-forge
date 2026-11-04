---
title: worktree 清单仲裁不变式三件套——INV-L 活性过滤 + INV-U 选主谓词 + INV-B cwd 绑定
summary: >-
  worktree 清单消费面修复范式：INV-L 活性过滤（归档残留行不入命中集）+ INV-U 选主谓词（禁裸 find 首命中）+ INV-B cwd
  绑定（normalizeFsPath 精确匹配，成员位 sessionIds 只作投影缓存退路）。已知残余：INV-U 双轨分叉（bug
  0c677db2）与 INV-B 契约锚未登记（bug bae86480）修复中。
keywords:
  - worktree
  - invariants
  - INV-L
  - INV-U
  - INV-B
  - 清单
status: unconfirmed
source_container: e2e-known-reds-triage
source_task: fix-1 (commit 532318d9)
source_bug: 8c7e847f
id: worktree-manifest-invariants-lub
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 清单仲裁不变式三件套

## 三条不变式

| 不变式 | 内容 | 反面（被禁止的形态） |
|---|---|---|
| INV-L 活性过滤 | 归档残留行不得进入命中集 | 不过滤直接消费全量清单 |
| INV-U 选主谓词 | 主选中须显式谓词裁定 | 裸 find 取首命中当选中 |
| INV-B cwd 绑定 | `normalizeFsPath` 精确匹配绑定 cwd；成员位 `sessionIds` 只作投影缓存退路，不作主判定 | 用缓存字段顶替精确路径匹配 |

## 已知残余

- INV-U 双轨分叉：bug 0c677db2（修复中）。
- INV-B 契约锚未登记：bug bae86480（修复中）。

## 边界

适用于 worktree 清单类消费面（读取/过滤/选中链）；其他列表消费面可类比但不变式需按域重定义。
