---
journey: "task-dispatch-execution-loop"
step: 4
step-action: "确认预合成专业化上下文在场"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务详情侧板(编排分区·预合成要素标识)"
    route: "workbench/panel/task-detail"
    requires_auth: false
    layout: "WorkbenchShell → TaskDetailPanel(编排分区置于执行记录之上)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 4: 确认预合成专业化上下文在场

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "Step 3 派发已完成,subagent 已启动;测试通道可直读注入记录/宿主侧产物(浏览器面不自测提示词内容)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "task_type"
            value: "可派发类型键"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "state"
            value: "running"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "用户查看任务卡片/编排条目的预合成要素标识,并经测试通道断言 subagent 系统提示词"
- Output: "系统提示词可断言包含三要素 —— 该任务类型协议、所属 feature 的目标与摘要(阶段资产)、生效运行偏好;任务卡片/侧板呈现预合成要素标识(✓✓✓ 形态);subagent 启动后的调用日志无 forge prompt 类自跑合成调用"
- State: "派发行 prompt_hash = 组合首条消息 sha256(测试通道可对拍核验);预合成内容为模板常量 + 确定性渲染产物(禁 eval、禁模型调用)"
- Side-effect: "none"
- Invariants: "三要素均为文档数据经确定性组装;预铸造 sessionId 与 hash 解耦(重派发不因会话重建漂移)"

## Outcome "summary-updated-new-dispatch"
- Preconditions: "所属 feature 的目标摘要已更新(阶段资产文件被覆盖更新为最新内容);存在一笔摘要更新前的已派发 subagent"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "state"
            value: "running"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "已更新为最新目标与摘要(同阶段覆盖更新)"
- Input: "再次派发同 feature 的任务并经测试通道断言新 subagent 系统提示词"
- Output: "新派发的系统提示词反映最新摘要;既有已派发 subagent 的提示词不受影响(不追溯改写)"
- State: "预合成为派发时点现读三要素(单次派发单次组装,零缓存);既有派发行 prompt_hash 不变"
- Side-effect: "none"
- Invariants: "预合成消费时点 = 派发时;已派发会话不追溯改写"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
