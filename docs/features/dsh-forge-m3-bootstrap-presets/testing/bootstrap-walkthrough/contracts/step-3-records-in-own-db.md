---
journey: "bootstrap-walkthrough"
step: 3
step-action: "记录入库核查"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/bootstrap-walkthrough/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: bootstrap-walkthrough / Step 3: 记录入库核查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（核查型观测步，无表单交互面）; session-expired = N/A（核查对象为库静态落位，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "M3.5 任务已全部结算（终态）；自身 forge.db 活跃（dsh-forge 自身工作区注册态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: "dsh-forge 自身（自身 forge.db 活跃）"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "task_status"
            value: "终态（completed 为主）"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "核查 M3.5 全部任务与执行记录的落库位置（库读面对账）"
- Output: "任务/执行记录 100% 入自身 forge.db（断言）——每条任务行与执行记录行均在自身库可查"
- State: "库状态不变（只读核查）"
- Side-effect: "none"
- Invariants: "飞轮数据完整性——自举第一批真实数据无漂移到旧线或外部库"

## Outcome "record-drift-detected"
- Preconditions: "某任务/执行记录落到了旧线或外部库（未入自身 forge.db）"
  fixture_spec:
    entities:
      - entity_type: "TaskRecord"
        min_count: 1
        field_constraints:
          - field: "storage"
            value: "旧线或外部库（漂移形态）"
- Input: "100% 入库断言核查（自身库对账）"
- Output: "断言红（记录必须 100% 入自身库）——飞轮数据完整性不受损"
- State: "漂移被识别（测试断言面）；修正后记录全部回自身库"
- Side-effect: "none（断言通道）"

## Journey Invariants
- 全程零 manifest.md 生成（文件系统断言）——库记账是唯一记账通道
- 任务/执行记录 100% 入自身 forge.db（自举飞轮第一批真实数据入库，无漂移）
- 走查即 M3.5 立项启动（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
