-- ============================================================================
-- 已作废（2026-10-17 裁决：read-state host 面不建——手机端未读游标 = 手机端
-- localStorage，按配对域隔离；触底/打开会话推进游标，抽屉双级未读本地聚合）。
-- 本 DDL 不再作为实现依据，留档备查。存储缝能力核销见 tech-research R6。
-- ============================================================================

-- domain：read-state（DomainSpec 声明；表见下）
CREATE TABLE session_read_state (
  session_id    TEXT PRIMARY KEY,       -- SessionId（brand 还原为字符串；domain 表键）
  last_read_seq INTEGER NOT NULL        -- 已读游标 = SessionEvent.seq（单调，官方正本）
);
