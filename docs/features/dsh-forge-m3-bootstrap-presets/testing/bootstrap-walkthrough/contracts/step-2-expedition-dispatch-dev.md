---
journey: "bootstrap-walkthrough"
step: 2
step-action: "远征会话派发开发"
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

# Contract: bootstrap-walkthrough / Step 2: 远征会话派发开发

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（本步为派发执行链，无表单提交面；worker 结算校验归 gate-and-submit-discipline 旅程）; session-expired = N/A（无登录态；中断恢复由 Outcome "interrupted-recovery" 承载——本地化连续性形态） -->

## Outcome "success"
- Preconditions: "M3.5 提案已 accepted 且 feature 成链；M3.5 任务已建（DAG 依赖关系落库）；远征会话在场（registry 默认或显式选择）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "has_many"
        parent_entity: "Proposal"
        field_constraints:
          - field: "feature_status"
            value: "进行中（任务阶段）"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "task_status"
            value: "pending（依赖关系构成 DAG）"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition（规格技能全集挂载）"
- Input: "在 dsh-forge 自身里用远征会话开发 dsh-forge——M3.5 任务经 run-tasks 派发执行"
- Output: "远征会话派发开发链运行：按 DAG 顺序领取 → worker 执行 → AC gate → commit → submitTask；管线纪律照旧（自举不豁免）"
- State: "任务依 DAG 顺序推进至终态；执行记录与提交哈希入自身 forge.db"
- Side-effect: "in-process worker spawn；task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl；工作区代码提交（commit_hash 落记录）"
- Invariants: "自举不豁免管线纪律——单写路径 / 执行记录 / 提交规范 / 验证门原样"

## Outcome "manifest-md-appears"
- Preconditions: "走查运行期间文件系统出现 manifest.md（违规记账形态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "manifest_md_present"
            value: true
- Input: "文件系统断言检查（工作区树内 manifest.md 存在性）"
- Output: "断言红（零 manifest 纪律）——即时发现并修正；走查不得以 manifest 记账替代库记账"
- State: "违规态被识别（测试断言面）；修正后文件系统回到零 manifest"
- Side-effect: "none（断言通道）"

## Outcome "interrupted-recovery"
- Preconditions: "走查中某任务受阻（blocked）或需修复"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "blocked（reason 落审计）"
- Input: "走 blocked / fix 链机制处置（worker submit blocked 或 addTask 追加 fix-N）"
- Output: "机制照旧：blocked + reason 落审计；fix 链自动恢复（block_source 单事务、链深 ≤6、恢复钩子——M2 机制回归）"
- State: "源任务 blocked；fix 任务入链；修复完成后源任务自动恢复 pending"
- Side-effect: "fix 链审计行与事件落库"
- Invariants: "自举不豁免管线纪律（M2 恢复机制原样可用）"

## Journey Invariants
- 全程零 manifest.md 生成（文件系统断言）——库记账是唯一记账通道
- 任务/执行记录 100% 入自身 forge.db（自举飞轮第一批真实数据入库，无漂移）
- 走查即 M3.5 立项启动（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
