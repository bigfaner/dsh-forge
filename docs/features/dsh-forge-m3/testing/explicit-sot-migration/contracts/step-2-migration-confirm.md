---
journey: "explicit-sot-migration"
step: 2
step-action: "确认迁移(含备份说明)"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md
anchors:
  web:
    page: "工作台 · 概览(迁移确认对话框)"
    route: "workbench/dialog/migrate-confirm"
    requires_auth: false
    layout: "WorkbenchShell → MigrateConfirm 浮层"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: explicit-sot-migration / Step 2: 确认迁移(含备份说明)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "迁移确认对话框呈现(自概览页迁移入口发起);数据内核可用;项目无在跑编排(dispatch.ended_at 为空的行数为 0)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "无在跑派发行(ended_at 全部非空)且无进行中的迁移"
        prerequisite_entity: "Project"
- Input: "用户点击「迁移到 M3 内核」,在确认对话框阅读迁移内容、自动备份、迁移后 index.json 淘汰的说明并确认"
- Output: "确认对话框三要素说明齐备(迁移内容/自动备份/迁移后 index.json 淘汰);仅在显式确认后才进入执行"
- State: "确认后进入迁移管线(Step 3);确认本身零库写"
- Side-effect: "none"
- Invariants: "不存在自动/静默迁移路径"

## Outcome "cancel-confirm"
<!-- source: inferred -->
<!-- reasoning: journey 2b 注:UF3 Validation Rules「迁移必须显式确认,无自动/静默迁移路径」推演——取消即未确认,零执行、回 migratable 态(UF3 未显式定义取消路径) -->
- Preconditions: "迁移确认对话框呈现中(尚未确认)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "用户点击取消(关闭确认对话框)"
- Output: "不执行任何迁移;项目状态与文件零变化;迁移入口仍在,可再次发起"
- State: "数据内核与文档树零变更;项目保持 files 权威"
- Side-effect: "none"

## Outcome "kernel-unavailable"
<!-- surface-web required_outcomes 映射:session-expired → 离线桌面壳无登录会话语义(N/A);类比承载 = 数据内核通道不可用 → failed-rolled-back 呈现 + 恢复重试引导,非静默 -->
<!-- source: inferred -->
<!-- reasoning: journey 2c 注:UF3 States failed-rolled-back(失败呈现回滚状态与重试入口)推广至「内核不可用」成因;PRD 未逐项枚举失败成因 -->
- Preconditions: "发起迁移时数据内核不可用(库文件打开失败/损坏,经测试通道注入)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "数据内核库文件不可用(打开失败/损坏,测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户确认迁移,观察迁移反馈"
- Output: "零摄入/淘汰即失败,呈现失败回滚状态 + 「重试」入口,错误可辨非静默;内核恢复后重试可成功(对拍零差异)"
- State: "失败发生在摄入/淘汰之前,库与文档树保持迁移前态;迁移审计留失败相记录(留档即抛,无 rollback 相需求)"
- Side-effect: "migration_progress 事件推送失败相位"

## Outcome "already-migrated-guard"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-062(pipeline.ts:257-283):data_authority='sqlite' 的项目再发起迁移 → ERR_MIGRATION_GUARD(一次性语义,消息显式说明自备份恢复路径);同因守卫还包括在跑编排计数 > 0 -->
- Preconditions: "目标项目已迁移(data_authority 为 sqlite)或存在在跑编排(ended_at 为空的派发行)或同项目迁移正在进行中"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite(或 files 但存在在跑派发行)"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "ended_at"
            value: "空(在跑)"
- Input: "用户尝试再次发起迁移"
- Output: "迁移被守卫拒绝并呈现明确错误(已迁移一次性语义 / 在跑编排阻断迁移 / 迁移进行中),不进入执行"
- State: "零摄入零淘汰;项目状态不变"
- Side-effect: "none"
- Invariants: "在跑编排阻断迁移(PRD 硬约束)"

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,tasks/index.json 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
- 自动备份恒先于摄入/淘汰;备份工件于完成态与失败回滚态均在结果所示位置在场(断言见 Step 3/3b),为不可逆淘汰的唯一恢复锚点;备份保留/清理策略 PRD 未定界,不作断言
