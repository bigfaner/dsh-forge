---
title: "多装共存与数据所有权"
domains: [coexistence, profile, dsh-home, credentials, data-ownership, schema]
---

# 多装共存与数据所有权

## Data Ownership

### BIZ-coexistence-001: 多装共存数据所有权

**Rule**: 本壳使用独立 profile 目录 `dsh-forge`(≠ 上游 `desktop`);`$DSH_HOME` 产品数据(会话/设置/凭据)为 CLI/官方桌面/本壳共享,按上游既有格式兼容读写,不新增、不变更任何 schema,不新增凭据存储路径。
**Context**: 多装共存安全(SC8)是社区分发信任基线;三方交替使用 `$DSH_HOME` 互不损坏。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m1 BIZ-001(prd-spec §In Scope/§Security Requirements)

- 单实例锁保证本壳二实例冲突时聚焦既有窗口并退出(ERR_SINGLE_INSTANCE)。
- 数据迁移永远为「无」:不迁移、不变更既有数据 schema(后续里程碑如需变更须显式提案)。

### BIZ-coexistence-002: forge 文件唯一事实源与双形态不破坏

**Rule**: forge 文件(任务/feature/执行记录)为唯一事实源;应用(含 SQLite 数据内核)只读消费,禁止双写 forge 数据、禁止产生第二事实源;过渡期应用、agent 会话、终端/冻结插件交替操作同一项目,共享同一 forge 数据格式、互不破坏(往返断言);应用侧任务/feature 快照定位为派生缓存,可随时弃重建。
**Context**: SC7 双形态交替验收 + forge 数据格式不变、只读消费的存储约束。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-006(prd/prd-spec.md §DF002/DF003/存储约束/SC7;design/tech-design.md §Overview 事实源纪律)

- 双写禁令的直接推演:SQLite 直写 forge 数据(双写)在 M2 tech-design Alternatives 中被明令拒绝(第二事实源)。
