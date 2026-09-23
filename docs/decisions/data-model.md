# Data Model Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-23 | dsh-forge-m3 | 阶段资产 = 文档根 features/<slug>/stages/<stage>.md 单一规范文件(frontmatter + 摘要),元数据入 stage_asset 索引 | 门校验幂等、「最新一份」语义清晰;弃时间戳多份 | dsh-forge-m3/design/tech-design.md §Interface 5 裁决 T4 |
| 2026-09-23 | dsh-forge-m3 | 偏好存储 = 单表 prefs(scope, scope_id, key)三级 scope 化,键集封闭(应用层注册表) | 解析/迁移/编辑面单形态;global 行 scope_id='' 避免 NULL 进 PK | 同上 §Data Models |
