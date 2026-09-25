---
journey: "explicit-sot-migration"
step: 4
step-action: "迁移后终态确认"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md
anchors:
  web:
    page: "工作台 · 项目概览 + 任务看板"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage(done 态 Pill)→ TaskBoardPage"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: explicit-sot-migration / Step 4: 迁移后终态确认

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "迁移已完成(data_authority=sqlite);迁移前任务全集基线已记录"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
          - field: "migrated_at"
            value: "非空"
          - field: "backup_path"
            value: "非空(结果所示备份位置)"
      - entity_type: "ArchivedIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "name"
            value: "index.json.migrated-<时间戳> 形态"
      - entity_type: "TaskMarkdownFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "location"
            value: "原位置 tasks/ 下(未迁移未改动)"
- Input: "用户察看迁移结果终态呈现与任务看板,并经测试通道检查项目文档树(harness 级)"
- Output: "完成态呈现「对拍结果 + index.json 已淘汰」文案(UF3 done 态);任务看板承载全部任务(与迁移前任务全集一致);概览页「可迁移」入口消失"
- State: "harness 级断言:tasks/index.json 不存在(归档为 index.json.migrated-<时间戳>);tasks/*.md 与 tasks/records/*.md 原样留存原位置;内核 task 权威行 = 迁移前任务全集"
- Side-effect: "none"
- Invariants: "结构化状态以 SQLite 为唯一权威;md 永不改动"

## Outcome "wizard-same-confirm"
- Preconditions: "注册一个检出 index.json 的既有 forge 项目(文档位置步骤之后,向导检出 index.json)"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "docTreeContainsIndex"
            value: true
    state_requirements:
      - description: "注册向导进行中且已检出 index.json(条件步骤插入)"
        prerequisite_entity: "ForgeProjectCodeRoot"
- Input: "用户走注册向导,在文档位置步骤后遇到迁移确认步骤并确认"
- Output: "向导内呈现同一迁移确认步骤(含备份说明);确认后完成迁移与注册;结果与概览页路径一致(对拍零差异/index.json 淘汰/md 留存)"
- State: "迁移管线与概览页路径同源(同一内核服务);完成后项目注册 + sqlite 权威一次达成"
- Side-effect: "备份工件与迁移审计同概览页路径"

## Outcome "migration-events-reviewable"
- Preconditions: "迁移已完成(或已失败回滚);应用本地日志通道可查(harness 级)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "MigrationEvent"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "phase"
            value: "backup / ingest / verify / switch / archive / rollback 之一"
- Input: "用户察看迁移结果呈现的结论要素,并经测试通道回查应用本地日志(harness 级)"
- Output: "浏览器面:迁移结果呈现含备份位置与对拍结论,不因当场关闭而无痕;harness 级:本地日志含迁移事件(备份位置/对拍结果/失败原因)逐项可查"
- State: "migration_event 审计行时间正序可回查(可回查面);结果呈现与审计同源"
- Side-effect: "none"
- Invariants: "迁移事件全程留日志(备份/对拍结果);结果可回查"

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,tasks/index.json 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
- 自动备份恒先于摄入/淘汰;备份工件于完成态与失败回滚态均在结果所示位置在场(断言见 Step 3/3b),为不可逆淘汰的唯一恢复锚点;备份保留/清理策略 PRD 未定界,不作断言
