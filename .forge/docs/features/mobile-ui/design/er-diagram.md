---
created: 2026-10-17
status: voided
---

# ER 图：read-state（**已作废**）

> **2026-10-17 裁决**：read-state host 面不建——手机端未读游标 = **localStorage**（按配对域隔离，触底/打开会话推进游标，抽屉双级未读本地聚合）。本文件保留作废登记，原方案不再作为实现依据。

原方案留痕：per-session `lastReadSeq` 已读游标，载体 = 官方 `dsh-storage-domain` 域表（`read-state` domain，表 `sessionReadState`，键 = SessionId，值 = `{lastReadSeq}`；single 布局，JSON backend 落 dsh-home storages），消费经 `forge:remote/read-state` 薄方法（读 `{sessionId}` → `{seq, unread}`；写走 `KvTable.update` 原子 RMW 单调守卫）。存储缝能力核销结论仍见 tech-research R6——仅方案撤销。
