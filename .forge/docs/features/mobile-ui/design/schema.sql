-- mobile-ui：read-state 域表结构声明（host 共享已读游标——不绑定移动端，桌面端可复用
-- 同一域表与通道。载体 = 官方 dsh-storage-domain 域表（JSON backend 落 dsh-home
-- storages），原子写链/损坏边界由存储缝提供，零自持文件。本文件以 DDL 形态冻结键结构
-- 契约，供实现与测试对齐）。

-- domain：read-state（DomainSpec 声明；表见下）
CREATE TABLE session_read_state (
  session_id    TEXT PRIMARY KEY,       -- SessionId（brand 还原为字符串；domain 表键）
  last_read_seq INTEGER NOT NULL        -- 已读游标 = SessionEvent.seq（单调，官方正本）
);

-- 未读计算（对齐 dsh 消息体——seq 单调，无时钟依赖）：
--   host 进程内监听 session append → tailSeq[sessionId] + 可见事件计数（内存，零持久化）
--   unread = tailSeq − lastReadSeq  （O(1)）
--   host 重启后：由 session store 按 seq > last_read_seq 范围重放重建计数

-- 命名映射：DDL 蛇形（session_read_state / last_read_seq）= 域声明驼峰（表 sessionReadState / 值 {lastReadSeq}）——同一契约两视角，实现以 DomainSpec 驼峰为准。
-- 读写契约（forge:remote/read-state 薄方法；写走 KvTable.update 原子 RMW（putIfAfter，单调守卫在此实现）域写链原子落盘）：
--   读  {sessionId}              → {seq: lastReadSeq, unread}（域重建窗口附加 stale:true）
--   写  {sessionId, seq} → KvTable.update 原子 RMW（仅接受 > 当前 lastReadSeq）→ {seq, unread: 0}
--   （单调拒绝回退时不报错：返回 {seq: 保持现值, unread: 现值}——显示层对账语义，见 api-handbook 1.3）
--   （写时机：手机端打开会话/触底、桌面端打开会话——同通道）
-- 完整性：单写者（host）；域数据损坏由官方存储缝损坏边界处理，游标丢失 = unread 全量重算自愈。
