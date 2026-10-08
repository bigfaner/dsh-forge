---
journey: "bootstrap-walkthrough"
step: 4
step-action: "全景一致与零 manifest 核查"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/bootstrap-walkthrough/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（三视图 / 文档 / 提案子 tab 跨面核查）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: bootstrap-walkthrough / Step 4: 全景一致与零 manifest 核查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（核查型观测步，无表单交互面）; session-expired = N/A（本地单人工作台无登录态；全景读面即时直读库，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "走查任务链已收口（任务终态、记录入库）；概览 dock tab 可达"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
        field_constraints:
          - field: "feature_status"
            value: "任务收口态"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "task_status"
            value: "终态"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "打开概览三视图 / 文档 / 提案子 tab 核查全景；检查文件系统 manifest.md 存在性"
- Output: "概览三视图 / 文档 / 提案子 tab 全景一致（任务终态、记录、文档、谱系相互印证）；全程零 manifest.md 生成（文件系统断言）"
- State: "库状态不变（只读核查）；文件系统无 manifest.md"
- Side-effect: "none"
- Invariants: "全景一致是走查放行条件（不接受局部绿）；库记账是唯一记账通道"

## Outcome "panorama-inconsistent"
- Preconditions: "三视图 / 文档 / 提案子 tab 数据相互矛盾（如任务终态但该任务的执行记录行缺席——记录缺席为矛盾形态描述，非可装载实体）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "completed（终态）"
          - field: "task_records"
            value: "缺席（矛盾形态——终态无执行记录行）"
- Input: "e2e 一条链断言核查（跨面数据对账）"
- Output: "断言红——全景一致是走查放行条件（不接受局部绿）"
- State: "矛盾被识别（测试断言面）；修正后各面数据一致"
- Side-effect: "none（断言通道）"

## Journey Invariants
- 全程零 manifest.md 生成（文件系统断言）——库记账是唯一记账通道
- 任务/执行记录 100% 入自身 forge.db（自举飞轮第一批真实数据入库，无漂移）
- 走查即 M3.5 立项启动（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
