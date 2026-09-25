# Data Model Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-23 | dsh-forge-m3 | 阶段资产 = 文档根 features/<slug>/stages/<stage>.md 单一规范文件(frontmatter + 摘要),元数据入 stage_asset 索引 | 门校验幂等、「最新一份」语义清晰;弃时间戳多份 | dsh-forge-m3/design/tech-design.md §Interface 5 裁决 T4 |
| 2026-09-23 | dsh-forge-m3 | 偏好存储 = 单表 prefs(scope, scope_id, key)三级 scope 化,键集封闭(应用层注册表) | 解析/迁移/编辑面单形态;global 行 scope_id='' 避免 NULL 进 PK | 同上 §Data Models |
| 2026-09-24 | dsh-forge-m4 | subagent 挂接 = 血缘推断(任务→active 挂接顶层会话→血缘树内 origin=subagent 后代;session_links 不扩列、运行时只读推导)+ 派发 prompt 约定「任务 id+title」命名辅助;派发回写后置 M5 | 零新协议面、数据完备可重算;粒度局限仅在多任务共会话场景(降级会话级标注);回写依赖 M5 派发协议重构与事件对账基建 | dsh-forge-m4/prd/prd-spec.md §必答⑥(PRD 期裁决 2) |
| 2026-09-24 | dsh-forge-m4 | workspaceRegistry 单向投影:forge 项目注册表为权威,注册/改名/归档/删除四操作同步(归档=保留投影、会话仍按项目分组,删除=移除投影、会话退未分组);禁反向写,偏差仅提示,失败降级不阻断 | 归档≠删除保历史分组可找回;单向免双写源与冲突合并;降级保注册可用性 | dsh-forge-m4/prd/prd-spec.md §必答④⑤(PRD 期裁决 1) |
