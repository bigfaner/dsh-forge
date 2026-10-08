---
journey: "worker-provisioning"
step: 3
step-action: "按任务类型族派发（收窄矩阵）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 派发入口——契约面断言由 pin 契约测试承载）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: worker-provisioning / Step 3: 按任务类型族派发（收窄矩阵）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（本步为契约面工具断言，无表单交互面）; session-expired = N/A（无登录态；矩阵收窄为 spawn 参数静态派生，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "任务库含收窄矩阵各类型族代表任务（coding 族 / doc 族 / gate / 验证类——Setup）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 4
        field_constraints:
          - field: "task_type"
            value: "四族各有代表（coding 族 / doc 族 / gate / 验证类）"
          - field: "task_status"
            value: "pending（依序可派发）"
- Input: "依次派发 coding 族 / doc 族 / gate / 验证类任务"
- Output: "worker tool 面仅含矩阵放行列工具（fs 与 shell 全放；jobs = gate+验证；read-image = coding+验证；web = 仅验证）；全局拒绝集（ask-user / delegation / todo / present）对所有 worker 生效；worker 携带 submitTask + addTask（claimTask / queryTask 不入）"
- State: "各 worker 按 deny 面 spawn（toolFilter 携带矩阵派生拒绝集）；任务推进结算"
- Side-effect: "in-process spawn；task-spawned 事件（toolFilter 拒绝集清单）落事件日志"
- Invariants: "收窄矩阵 = contracts 常量单源（G0–G2 门两包 tool 面 pin 契约测试承载——Contract 半）"

## Outcome "denied-tool-physically-absent"
- Preconditions: "worker 执行含越权指令的任务 fixture（Setup 夹具——诱导请求全局拒绝集内工具如 ask-user）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_spec"
            value: "含「询问用户确认后继续」类指令（越权诱导——fixture 构造语义）"
          - field: "task_status"
            value: "in_progress（已派发）"
- Input: "worker 尝试调用被拒工具（如 ask-user）"
- Output: "物理不在面——调用不可达（deny 生效，非运行期劝阻）；worker 不问用户、不派生子代"
- State: "worker 会话工具面不含拒绝集工具（deny 收窄在 spawn 时点生效）"
- Side-effect: "none（deny 面——物理边界）"
- Invariants: "worker 永不问用户、不派生子代（安全面收窄与任务类型无关）"

## Journey Invariants
- worker 永不问用户、不派生子代（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（已配置时——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承）
- worker 技能目录 = 组合继承目录（catalog 行级常驻、内容按需加载——token 纪律）
- 零新装载机制：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
