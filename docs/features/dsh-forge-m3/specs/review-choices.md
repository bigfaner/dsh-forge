---
feature: "dsh-forge-m3"
reviewed: "2026-09-25"
---

# Review Choices

> 非交互模式(任务 T-specs-consolidate 指令:自动集成全部 CROSS 项)。重叠项默认 [skip] 保留双方;领域重叠检查无 >50% 告警。

## Approved for Integration

新增条目(项目全局 ID):

- BIZ-001 -> docs/business-rules/workbench.md(新 BIZ-workbench-006:阶段产物齐全性检查 warn 不阻断)
- BIZ-002 -> docs/business-rules/workbench.md(新 BIZ-workbench-007:阶段总结门 + 阶段资产 + 强制注入 + 偏离可观察)
- BIZ-003 -> docs/business-rules/workbench.md(新 BIZ-workbench-008:偏好三级继承,surfaces 除外)
- BIZ-004 -> docs/business-rules/workbench.md(新 BIZ-workbench-009:提案看板只读)
- BIZ-005 -> docs/business-rules/coexistence.md(新 BIZ-coexistence-003:SoT 分治)
- BIZ-006 -> docs/business-rules/sot-migration.md(新文件,新 BIZ-migration-001:显式迁移纪律)
- BIZ-007 -> docs/business-rules/sot-migration.md(新 BIZ-migration-002:外部写自动重摄入)
- TECH-001 -> docs/conventions/host-integration.md(新 TECH-host-003:tool 注册纪律)
- TECH-002 -> docs/conventions/host-integration.md(新 TECH-host-004:renderer 桥接模式)
- TECH-003 -> docs/conventions/host-integration.md(新 TECH-host-005:审批路由)
- TECH-004 -> docs/conventions/host-integration.md(新 TECH-host-006:预合成注入契约)
- TECH-005 -> docs/conventions/data-kernel.md(新 TECH-data-kernel-005:Go 对拍移植纪律)
- TECH-006 -> docs/conventions/data-kernel.md(新 TECH-data-kernel-004:taskKey 形态白名单)
- TECH-007 -> docs/conventions/product-architecture.md(新 TECH-product-arch-008:customSkillDirs 承载)
- TECH-008 -> docs/conventions/testing.md(新文件,新 TECH-testing-001:e2e 纪律)

漂移修订(Step 9/10,保留原 ID,仅更新描述文本):

- BIZ-009 -> BIZ-workbench-001 补 M3 修订块(文档根默认仓外翻转)
- BIZ-010 -> BIZ-workbench-004 补 M3 修订块(预合成取代 forge prompt 注入)
- BIZ-005(关联) -> BIZ-coexistence-002 补 M3 修订注记(「唯一事实源」绝对表述被 SoT 分治收窄)
- TECH-009 -> TECH-electron-ipc-002 上下文数字更新(16 → 51 通道)
- TECH-010 -> TECH-data-kernel-001 表述修正(schema 载体四件套 + 每版本段各自事务)
- TECH-011 -> TECH-host-002 补 M3 退役注记(forge CLI spawn 链删除,纪律保留为通用外部进程纪律)
- TECH-012 -> TECH-product-arch-003/004 补落地状态注记(M3 已交付)

## Skipped

- BIZ-008(操作主体模型 M3 定形)——已被 BIZ-task-ops-001「M3 修订(2026-09-23)」块集成(早于本任务),跳过避免重复条目
- BIZ-011 ~ BIZ-014、TECH-013 ~ TECH-016 —— [LOCAL],留 feature 文档

## Related Existing Entries

重叠扫描(非交互默认 [skip] 保留双方,不替换、不删除):

- decisions/architecture.md row「SoT 分治:任务结构化状态以 SQLite 为权威…」(2026-09-23)——与 BIZ-coexistence-003 重叠:[skip] 保留双方(决策记 WHY,规则记长效约束)
- decisions/architecture.md row「systemPrompt 预合成归内核…」(2026-09-23)——与 TECH-host-006 重叠:[skip] 保留双方
- decisions/data-model.md row「偏好存储 = 单表 prefs 三级 scope 化…」(2026-09-23)——与 BIZ-workbench-008 重叠:[skip] 保留双方(决策记存储形态,规则记继承语义与键集封闭)
- decisions/testing.md row「测试栈定为 vitest + Playwright _electron…」(2026-09-20)——与 TECH-testing-001 重叠:[skip] 保留双方
- docs/lessons/ 目录不存在——lessons 重叠检查无对象

## Domain Overlap Warnings

无(本仓 docs/business-rules 与 docs/conventions 各文件 domains 交集均 < 50%;新增/再推导 domains 见各文件 frontmatter)。
