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
