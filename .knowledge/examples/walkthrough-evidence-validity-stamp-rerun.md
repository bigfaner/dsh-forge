---
title: 跨效度域证据全量重跑判例（loop-message-consolidation 1.4）
summary: HEAD 从 1561d7fe 推进到 3310f1c4 后 resume 效度戳失配，上轮全部走查证据跨效度域——旧证据原目录归档（1-4-prev-1561d7fe/），三径 e2e 全量重跑重取（3 passed / 39.1m），新旧目录并存可考、不覆盖。
keywords: [效度戳, 证据重跑, 走查, 归档, e2e]
domainPath: .knowledge/examples/
来源容器: loop-message-consolidation
来源任务: first-pass 复盘（1.8）
bug id: 无
---

# 跨效度域证据全量重跑判例（1.4）

## 背景

1.4 上轮走查后出现 fix 提交，HEAD 1561d7fe → 3310f1c4，resume.validity.json 失配：旧证据不可承重。

## 做法

- 旧证据整体归档 `walkthrough/1-4-prev-1561d7fe/`（含 FAIL 记录——失败轮留盘可考）。
- 当前有效证据落 `walkthrough/1-4/`，rerun 文档首行声明「上轮跨效度域，全量重跑重取」+ HEAD 指针互指。
- run-once spec 重跑三径（正常完成 / 幂等重入 / 异常挂起），逐 AC 判定并给证据文件索引。

## 可复用点

- 失败轮证据不删除——上轮 AC3 FAIL 记录正是本轮确认 fix-3 生效的对照基线。
- 目录名携带 prev-<hash> 即自解释效度域，无需读正文即可判证据新旧。
