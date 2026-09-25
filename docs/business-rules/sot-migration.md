---
title: "SoT 迁移纪律(显式 · 原子 · 对拍 · 外部写回收)"
domains: [sot-migration, sqlite-authority, atomicity, parity-check, reingest, deviation]
---

# SoT 迁移纪律(显式 · 原子 · 对拍 · 外部写回收)

## Migration

### BIZ-migration-001: 显式迁移纪律(确认 + 备份 + 原子 + 对拍零差异 + 零半迁移)

**Rule**: `tasks/index.json` → SQLite 权威迁移为一次性**显式**操作(M2 已注册项目工作台入口 + 新注册向导内同一迁移确认步骤,弃自动触发):迁移前自动备份(`<userData>/workbench/backups/<projectId>-<ts>/`,库文件 + tasks/ 文档树);管线 = 守卫(在跑编排计数 `dispatch.ended_at IS NULL` > 0 → ERR_MIGRATION_GUARD)→ 备份 → 单事务全量摄入(限定地址合成,字段映射 + task_type/desc_path 推断)→ 对拍(任务全集:限定地址/状态/依赖/标题 vs 派生投影零差异;差异 → 回滚 + ERR_MIGRATION_VERIFY)→ 切读置位(data_authority='sqlite')→ 归档改名(`.migrated-<ts>`);COMMIT 收口在归档改名后,**任一相失败整体回滚(备份恢复),零半迁移态**;中断可重试;`tasks/*.md` 与 `tasks/records/*.md` 不迁移不改动;迁移事件逐相留档(migration_event,可回查)。
**Context**: D1 裁决;旧写者静默丢未知字段的结构风险使原子性与对拍为验收硬口径(SC2/G2);从未扫描项目在 startMigration 前先行同步重扫(6.3 e2e 补齐的生产缺口)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-006(prd/prd-spec.md §PRD 期裁决 D1/DF001/G2/SC2;design/tech-design.md §Interface 4;tasks/records/1.4、6.3)

### BIZ-migration-002: 外部写自动重摄入 + 偏离可观察,不阻断外部会话

**Rule**: 已迁移项目检出 `index.json` 复现/变更(watcher,存在即信号)→ **幂等重摄入**(sha256 指纹集去重 + 单事务 delete-then-insert + 与迁移同一对拍 oracle 校验)→ `projects.deviated=1` + `deviation_detected` 事件 + `migration_event(reingest)` 留档;重摄入失败仅记录(偏离标记保持 + log),**不阻断外部会话**;偏离仅呈现(看板徽标),是否处理由人决定。
**Context**: T3 裁决(弃「仅告警不摄入」——SQLite 与 index.json 持续分叉则权威名存实亡);过渡双形态不破坏(SC7):外部会话(终端/冻结 CC 插件)照旧工作,权威一致性由回收链保证。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-007(prd/prd-spec.md §Flow 迁移线/SC7;design/tech-design.md §Interface 4.7/§Appendix T3;tasks/records/1.5)
