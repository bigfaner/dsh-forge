---
journey: "task-dispatch-execution-loop"
step: 3
step-action: "确认派发,subagent 启动"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(派发确认对话框)"
    route: "workbench/dialog/dispatch-confirm"
    requires_auth: false
    layout: "WorkbenchShell → DispatchConfirm 浮层"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 3: 确认派发,subagent 启动

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "派发确认对话框呈现;所选任务全部通过前置校验(权威/存在/可派发状态/依赖终态);dsh 宿主可用,subagent 会话通道就绪"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "task_type"
            value: "可派发类型键(带模板且非受限/非机制取代)"
- Input: "用户确认派发"
- Output: "内核预合成系统提示词并启动各 subagent;派发 → subagent 可交互 ≤3 秒;各 subagent 独立启动互不串扰;任务卡片/侧板呈现运行态(running)"
- State: "数据内核落派发行:同批单 batch_id、每任务独立行,状态经 starting 回填为 running,session_id 回填,prompt_hash = 组合首条消息的 sha256 随行落库;actor 记录派发发起者"
- Side-effect: "host 半身创建 subagent 会话(create 为 caller-minted 幂等 adopt)+ 注入组合首条消息(queue 模式逐字符交付);dispatch_updated 事件随行推送"
- Invariants: "内核不持会话创建权(启动经 host 回调);每任务一行,并行互不共享"

## Outcome "type-not-dispatchable"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-072(presynth/assemble.ts:111-163):受限 5 类型与被机制取代 2 类型在派发路由面被拒(ERR_TASK_TYPE_NOT_DISPATCHABLE),模板入库不等于可派发;该拒绝发生于派发前,零落行 -->
- Preconditions: "所选任务中至少一个的 task_type 为派发受限类型(协议依赖尚未迁入的技能)或被确定性机制取代的类型(阶段门/阶段总结)"
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
          - field: "status"
            value: "pending"
          - field: "task_type"
            value: "派发受限或机制取代类型键"
- Input: "用户确认派发(集内含受限类型任务)"
- Output: "派发被拒绝并呈现明确错误(ERR_TASK_TYPE_NOT_DISPATCHABLE 语义:外部会话执行或等待技能迁移的引导);不启动 subagent"
- State: "预合成路由拒绝发生在落行之前,零派发行、零任务状态变更"
- Side-effect: "none"

## Outcome "launch-failed"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-073(dispatch-service.ts:338-372):host 启动回调抛错或返回失败 = launch 失败降级链,行转 failed 态 + 原因,动词不拒 -->
- Preconditions: "派发确认通过且派发行已落(starting 态),但 host 启动回调失败(如宿主会话通道创建失败)"
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
          - field: "status"
            value: "pending"
    state_requirements:
      - description: "宿主会话创建通道不可用或启动抛错(测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户确认派发后,host 启动回调返回失败"
- Output: "对应派发行呈现失败态(failed)与原因(ERR_DISPATCH_LAUNCH_FAILED 呈现口径);其余同批任务不受该行失败影响(独立行独立结局)"
- State: "派发行 starting → failed,error 记录原因;任务状态不变(仍待 agent 通道变更)"
- Side-effect: "dispatch_updated 事件推送失败态"
- Invariants: "单行失败不殃及同批;失败呈现可辨不静默"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
