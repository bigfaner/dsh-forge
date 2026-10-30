---
title: 排序写回全量重编号——单事务 1..n 覆盖写，幂等无碰撞
summary: 拖拽排序不写局部 delta 也不做 midpoint 插值：取拖拽后完整显示序 σ（含归档行），单事务写 sort_order(pᵢ)=i 覆盖全部 n 行。写后全序恰为 σ（所见即所得），无碰撞、重复执行零网络效果差异（幂等），且永久免除 midpoint 精度耗尽再平衡问题。
keywords: [全量重编号, 幂等, 单事务, 所见即所得, 排序]
domainPath: .knowledge/examples/
来源容器: project-manual-order
来源任务: first-pass 复盘（1.4）
bug id: 无
---

# 排序写回全量重编号（project-manual-order 判例）

需求：列表项手动排序的持久化写回。

方案：一次拖拽 = 一条 update = 一次全量重编号。

1. 前端计算拖拽后完整显示序 σ（含归档等特殊行，无专属分支）。
2. `patch.sortOrders = { projectId → i }`，i = 1..n，host 单事务批量落库。
3. 失败路径：渲染回弹拖拽前序 + emitDiag 失败日志（host 侧同步记录）。

为何不选局部 delta / midpoint：

- 局部 delta 需要碰撞仲裁与级联平移，事务边界复杂。
- midpoint 插值把问题推迟到精度耗尽，最终仍需再平衡——全量重编号 n 是小量，直接消解。
- 覆盖写天然幂等：同 payload 同结果，重放零差异。

落点：`packages/core/src/forge/project-service.ts`（project-manual-order 1.1，commit 6c89a8ab）+ `apps/web/src/views/sidebar/sidebar-actions.ts`（1.2，commit 23b69423）。
