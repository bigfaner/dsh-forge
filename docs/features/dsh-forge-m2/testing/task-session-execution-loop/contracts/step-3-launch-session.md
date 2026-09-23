---
journey: "task-session-execution-loop"
step: 3
step-action: "一键发起会话"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md

anchors:
  web:
    page: "workbench/tasks"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage → TaskDetailPanel 发起入口 + workbench/dialog 确认/错误浮层"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: task-session-execution-loop / Step 3: 一键发起会话

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "所选任务存在执行 prompt(getTaskPrompt 探测 available,promptText 已按字节缓存);dsh 宿主可用(凭据就绪),主窗口会话界面可进入;任务详情已打开;该任务当前无进行中(active)挂接会话(首次发起;重复发起腿见 duplicate-launch-supersede)"
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
    state_requirements:
      - description: "dsh 宿主可用、凭据就绪;stub 会话通道按 env 缝可用(会话通道 env-seamed)"
        prerequisite_entity: "Project"
- Input: "用户在任务详情点击「发起会话」,在确认面板(预览默认折叠、确认为默认焦点)确认发起——合计不超过 1 次有效点击口径,发起中显示发起中指示(正在发起会话…)"
- Output: "发起到会话界面可交互不超过 3 秒;成功后切入主窗口会话界面;任务卡呈现会话运行中徽标;挂接关系写入工作台自有状态(挂接索引)"
- State: "会话经宿主通道创建(调用方铸造的会话标识,cwd = 注册项目代码根目录)且首条用户消息按队列模式持久化;session_links 写入新的 active 行(task_key = 限定地址);发起侧收敛将该任务其余 active 挂接行置 ended(保留历史行)"
- Side-effect: "宿主侧创建 dsh 会话 + 首条用户消息入队(消息含完整 prompt 输出 + 追加一行 FORGE_ACTOR 归因指令);挂接写入后置于会话创建成功(persistence 失败不回滚已创建会话)"
- Invariants: "挂接仅在会话创建成功后写入;不写 forge 数据"

## Outcome "no-prompt-disabled"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,按 UF5 校验规则映射为前置不满足的入口禁用 + 原因说明(字面表单校验错误不适用) -->
- Preconditions: "所选任务不存在执行 prompt(getTaskPrompt 探测 unavailable,原因码 ERR_NO_PROMPT——任务键合法但 forge prompt get-by-task-id 无输出/非零退出,或键方言非法即不 spawn)"
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
            value: false
- Input: "用户打开该任务详情并寻找「发起会话」入口(尝试点击)"
- Output: "发起入口禁用并说明原因(tooltip:该任务没有执行 prompt,无法从它发起会话);不呈现错误弹窗;探测失败不是错误面"
- State: "无会话创建、无挂接索引写入;探测状态在入口上可见(data-probe 属性呈现 unavailable)"
- Side-effect: "none(非法任务键场景下连 forge CLI 都不 spawn)"

## Outcome "launch-channel-failure"
<!-- surface-web required_outcomes 映射:session-expired → 宿主不可用/凭据失效使会话通道不可用,呈现为 UF5 error(发起失败)态 + 恢复引导 -->
<!-- source: inferred:「不残留半初始化的挂接记录」推自 Interface 5 成功链序(launch → sessionId → recordSessionLink)——挂接写入后置于会话创建成功,失败先于写入 -->
- Preconditions: "dsh 宿主不可用或凭据异常:发起链各通道腿失败(宿主通道缺位/腿失败超时 + 渲染侧通道重试失败),且降级腿以失败终态收束(剪贴板被拒)或链路抛出异常——三终态齐备、无静默"
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
    state_requirements:
      - description: "dsh 宿主不可用或凭据异常(stub 通道按 env 缝注入失败形态)"
        prerequisite_entity: "Project"
- Input: "用户点击「发起会话」并确认发起"
- Output: "错误提示与恢复引导(发起失败错误对话框:错误映射文案 + 原因明细 + 重试入口;沿用 M1 崩溃恢复/配置引导模式);若降级腿(剪贴板)可用则呈现降级引导 toast(提示已复制、手动粘贴发起)——两种呈现均非静默;返回工作台后可重试"
- State: "不残留半初始化的挂接记录(挂接行仅在会话创建成功后写入);无会话可交互面切入"
- Side-effect: "降级腿可能将完整 prompt 写入剪贴板(tier 3 冻结回退);不写挂接索引"

## Outcome "duplicate-launch-supersede"
<!-- source: inferred:并发再发起无 PRD 明文;依据 = 挂接索引允许多行(UNIQUE(project_id, task_key, session_id),tech-design)+ UF5/UF3 挂接历史列表模型;旧 active 行置 ended 不删行 = 已落地 4.2 supersede(e2e sc3 断言) -->
- Preconditions: "该任务已有一个进行中的挂接会话(session_links 存在 status = active 的行),宿主可用"
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
- Input: "用户从同一任务卡片/详情再次点击「发起会话」并确认"
- Output: "可再次发起成功并切入新会话;任务详情可区分多个挂接条目(新 active 与已 ended 条目并列可辨)"
- State: "挂接索引为该任务记录多条挂接;既有进行中挂接转为结束(ended)态、行保留(ended_at 写入);新挂接行为 active;forge 数据不受影响(挂接为工作台自有状态)"
- Side-effect: "旧挂接会话本体不被强制结束(仅挂接行状态迁移);发起侧收敛只作用于该任务的挂接行"

## Outcome "interrupted-launch"
- Preconditions: "发起链进行中(会话创建/挂接写入未完成)时应用被强制退出或崩溃"
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
    state_requirements:
      - description: "测试进程在发起链中途杀掉应用进程(会话创建/挂接写入未完成)"
        prerequisite_entity: "Project"
- Input: "重启应用,重新打开该任务详情"
- Output: "应用正常启动(沿用 M1 崩溃恢复);任务详情无半初始化挂接记录;可重新发起会话"
- State: "挂接表与实际会话状态一致:要么挂接行完整(会话创建成功后写入),要么无行;不存在指向不存在会话的 active 行残留"
- Side-effect: "none(重启只读回溯)"

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
