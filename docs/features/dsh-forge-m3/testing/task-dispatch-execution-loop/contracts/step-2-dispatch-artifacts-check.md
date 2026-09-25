---
journey: "task-dispatch-execution-loop"
step: 2
step-action: "发起派发并过阶段产物齐全性检查"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(派发入口 → 派发警告/确认对话框链)"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → DispatchWarning/DispatchConfirm 浮层"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 2: 发起派发并过阶段产物齐全性检查

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "artifacts-complete"
- Preconditions: "所选任务的 feature 当前阶段期望产物齐全(累计式期望矩阵全满足:manifest 存在且 status 在词表内、prd/prd-spec.md 在场、design 与 tasks 阶段相应文档/任务集在位、依赖引用闭合)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "in-progress"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "用户点击任务工具栏「派发」"
- Output: "系统对 feature 当前阶段执行期望产物齐全性检查(确定性代码,断言无模型参与);产物齐全 → 无警告,直接进入派发确认对话框(三要素说明呈现)"
- State: "检查为纯读(fs + SQLite 查询),零写入;检查结果 satisfied 为真"
- Side-effect: "none"
- Invariants: "门校验与产物检查均为确定性代码(断言无模型参与)"

## Outcome "artifacts-missing-warning"
- Preconditions: "feature 当前阶段期望产物缺失(如 tasks/ 阶段任务 md 缺失、manifest 状态不一致、被派发任务描述 md 为空等);用户尚未确认缺失清单"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "tasks"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
    state_requirements:
      - description: "feature 当前阶段期望产物存在至少一项缺失(缺 manifest 或缺 prd/prd-spec.md 等)"
        prerequisite_entity: "Feature"
- Input: "用户点击「派发」"
- Output: "呈现警告 + 缺失清单(MissingItem 逐项:阶段/规则/产物/原因);用户可确认后继续派发,或取消;不因缺失硬阻断(检查仅警告)"
- State: "派发动作被 blocked 于 artifacts-missing 联合返回,零派发行落库;数据内核零写入"
- Side-effect: "none"
- Invariants: "缺失 = 警告清单,非异常路径;硬阻断逻辑以用户确认为表达"

## Outcome "acknowledged-continue"
- Preconditions: "同 artifacts-missing-warning 的缺失状态,但用户已在警告对话框显式确认继续(acknowledgeMissing 表达)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
    state_requirements:
      - description: "缺失清单已呈现且用户确认继续(确认态为会话期内存表达)"
        prerequisite_entity: "Feature"
- Input: "用户在警告对话框点击「确认继续派发」"
- Output: "跳过产物齐全性阻断,进入派发确认并继续派发流程(后续行为与产物齐全路径一致)"
- State: "确认标志随派发请求传入内核;派发行按 Step 3 语义落库"
- Side-effect: "none"
- Invariants: "warn 不阻断:确认面是唯一继续通道"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
