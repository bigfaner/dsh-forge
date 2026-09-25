---
journey: "explicit-sot-migration"
step: 1
step-action: "概览页发现迁移入口"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(项目卡 + 迁移 Pill)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage(ProjectCard + MigrationPill)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: explicit-sot-migration / Step 1: 概览页发现迁移入口

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "应用已启动并激活一个 M2 已注册项目,其文档树 docs/features/<slug>/tasks/ 下存在 index.json(含 ≥10 任务、覆盖多状态/依赖结构);项目数据权威仍为 files(未迁移)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
          - field: "deviated"
            value: 0
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "taskCount"
            value: "≥10"
      - entity_type: "Task"
        min_count: 10
        relationship_type: "belongs_to"
        parent_entity: "TaskIndexFile"
- Input: "用户进入工作台·项目概览,查看项目卡片区"
- Output: "检出 index.json 的已注册项目呈现「可迁移」标识(warn Pill)与「迁移到 M3 内核」入口"
- State: "纯读取面(getMigrationStatus:authority=files/deviated/migratedAt/lastEvent);零写入"
- Side-effect: "none"

## Outcome "not-migratable-hidden"
- Preconditions: "已注册项目的文档树未检出 index.json(已迁移归档后或从未有结构化索引)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite 或 files 且文档树无 index.json"
    state_requirements:
      - description: "项目文档树下不存在任何 tasks/index.json(未检出或已归档)"
        prerequisite_entity: "Project"
- Input: "用户查看概览页项目卡片区"
- Output: "该项目不呈现迁移入口(无可迁移 Pill 与迁移按钮);已迁移项目呈现已迁移 success Pill"
- State: "纯读取面,零写入"
- Side-effect: "none"
- Invariants: "迁移入口的存在性 = index.json 检出状态(一次性语义:已迁移不再呈现)"

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,tasks/index.json 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
- 自动备份恒先于摄入/淘汰;备份工件于完成态与失败回滚态均在结果所示位置在场(断言见 Step 3/3b),为不可逆淘汰的唯一恢复锚点;备份保留/清理策略 PRD 未定界,不作断言
