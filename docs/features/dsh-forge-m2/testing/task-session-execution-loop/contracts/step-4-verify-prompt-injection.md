---
journey: "task-session-execution-loop"
step: 4
step-action: "确认任务执行 prompt 自动注入"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "session"
    route: ""
    requires_auth: false
    layout: "上游会话视图(主窗口,UF5 发起成功的跳转目标)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 4: 确认任务执行 prompt 自动注入

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 3 发起成功的会话已进入;发起时探测缓存的 promptText 为 forge prompt get-by-task-id 的完整输出(stub CLI stdout 逐字节)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "hasPrompt"
            value: true
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
    state_requirements:
      - description: "stub CLI 的 prompt 输出可被测试进程直读(注入消息对拍通道 = stub CLI stdout 全等比较)"
        prerequisite_entity: "Task"
- Input: "用户查看该会话中 agent 收到的首条用户消息(会话界面)"
- Output: "消息包含 forge prompt get-by-task-id 的完整输出——与 stub CLI stdout 逐字符一致(零手工粘贴);prompt 原文之后追加一行 FORGE_ACTOR 归因指令(以会话标识为值的会话来源标记约定);prompt 原文本身不被改写"
- State: "首条用户消息已按队列模式持久化于该会话(确定性的 requestId 保证重放不重复投递)"
- Side-effect: "none(消息持久化已含于发起链;本步只读核验)"
- Invariants: "注入内容为 DATA 端到端:prompt 仅作为消息内容嵌入,不被解析或执行"

## Journey Invariants

- 看板对人只读:全程任何视图不出现任务状态变更的写操作入口(add/claim/transition/submit/reopen)
- forge 数据为唯一事实源:挂接关系只写入工作台自有状态,不写入 forge 数据,不产生第二事实源
- 每笔任务状态变更在看板标记来源([会话]),且与实际操作通道一致
- 状态回流时效:感知链健康时,每笔会话侧变更 ≤5 秒内免手动刷新可见(G3/SC3 口径);破线为降级情形(见 Step 5b)——无专用超时状态,forge 文件恒为事实源,看板快照经重扫/重启重建收敛
- 挂接索引原子性:挂接行仅在会话创建成功后写入,任何失败或中途中断不残留半初始化记录(source: inferred,推自 Interface 5 成功链序)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "SessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
