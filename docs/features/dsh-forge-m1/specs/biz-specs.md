---
feature: "dsh-forge-m1"
generated: "2026-09-20"
status: draft
---

# Business Rules: dsh-forge M1 桌面纯壳

## Data Ownership

### BIZ-001: 多装共存数据所有权

**Rule**: 本壳使用独立 profile 目录 `dsh-forge`(≠ 上游 `desktop`);`$DSH_HOME` 产品数据(会话/设置/凭据)为 CLI/官方桌面/本壳共享,按上游既有格式兼容读写,不新增、不变更任何 schema,不新增凭据存储路径。
**Context**: 多装共存安全(SC8)是社区分发信任基线;三方交替使用 `$DSH_HOME` 互不损坏。
**Scope**: [CROSS]
**Source**: prd-spec.md §In Scope(共存)/ §Security Requirements;tech-design §Component Diagram

- 单实例锁保证本壳自身二实例冲突时聚焦既有窗口并退出(ERR_SINGLE_INSTANCE)。
- 数据迁移永远为「无」:不迁移、不变更既有数据 schema(后续里程碑如需变更须显式提案)。

## Resilience

### BIZ-002: 非致命失败静默降级优先(SC2 口径)

**Rule**: 非致命失败(更新检测不可达、通知权限被拒/DND、托盘不可用等)一律静默降级 + 主进程结构化 log,不弹错、不阻断启动;仅宿主崩溃恢复(UF4)走显式用户面 UI。
**Context**: 离线自足(SC2)与免签名社区工具的「不打扰」基线;错误码(ERR_*)收敛于本地 log 文件。
**Scope**: [CROSS]
**Source**: prd-spec.md §Success Criteria SC2;tech-design §Error Handling · Propagation Strategy

- 具体降级矩阵:更新 feed 不可达 → 无 UI;通知被拒 + 托盘可用 → missedCount++ + 一次性 toast;托盘不可用(Linux)→ 无驻留、关窗即退出;全部保留 log。

## Process Footprint

### BIZ-003: 空闲稳态进程足迹 = 2

**Rule**: 空闲稳态自有进程数 = 2(壳主进程 + 宿主子进程;系统 webview 辅助进程不计入)。
**Context**: SC3 资源可控承诺,进程树断言脚本验证。
**Scope**: [LOCAL]
**Source**: prd-spec.md §Success Criteria SC3

## Notification Triggers

### BIZ-004: 两类通知触发与点击聚焦

**Rule**: 仅「等待用户输入」「回合完成」两类事件触发系统通知,点击聚焦对应会话。
**Context**: SC4/SC5 长会话桌面人体工学。
**Scope**: [LOCAL]
**Source**: prd-spec.md §Success Criteria SC4/SC5
