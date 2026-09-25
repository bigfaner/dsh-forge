---
journey: "dual-form-transition"
step: 3
step-action: "双形态交替互不破坏"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/dual-form-transition/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(已注册项目侧)"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: dual-form-transition / Step 3: 双形态交替互不破坏

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "两独立一次性 fixture 项目就绪:一个未注册 forge 项目(终端形态)、一个已注册并完成 SoT 迁移的应用通道项目;两侧各存在可推进任务"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UnregisteredForgeProject"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
- Input: "两轮交替,每轮在两项目各推进一个任务至提交:第 1 轮先终端(未注册项目)后应用(已注册项目),第 2 轮反序"
- Output: "两轮交替后双方数据与行为互不破坏;任务全集按各通道预期一致 —— 已注册项目:看板呈现 = 数据内核权威表(ID/状态/依赖/标题对拍零差异);未注册项目:forge CLI 任务视图 = 仓内 forge 文件,应用恒不可见该项目;无跨项目串扰/覆盖"
- State: "已注册项目任务行经内核迁移;未注册项目任务数据落仓内 forge 文件;两数据域零交叉写"
- Side-effect: "应用侧仅对已注册项目发生内核写与事件推送"
- Invariants: "双形态数据互不破坏;单一事实源恒成立"

## Outcome "in-flight-coexistence"
- Preconditions: "两项目各自存在未提交的进行中变更(在途写入)状态下发生交替操作(与 success 互斥:success = 每轮写入即提交、无在途残留)"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
          - field: "inFlightChange"
            value: true
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
          - field: "inFlightChange"
            value: true
- Input: "交替完成两项目在途变更的提交(先终端提交未注册项目在途变更,再经应用提交已注册项目在途变更),随后回看两项目的任务呈现"
- Output: "各自任务全集一致、无交叉污染"
- State: "单写者纪律未被破坏:未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核权威,外部写经重摄入回收而非第二写路径"
- Side-effect: "none"
- Invariants: "两项目数据域隔离(仓内 forge 文件 vs 内核 SQLite,无共享写面);禁第二事实源(BIZ-coexistence-002)"

## Outcome "channel-unavailable-asymmetric"
<!-- surface-web required_outcomes 映射:session-expired → 交替期间宿主不可用/凭据失效使已注册项目会话通道不可用:看板以错误/失败态呈现 + 恢复引导;未注册项目终端形态不受影响 -->
- Preconditions: "交替操作进行中,已注册项目的宿主/会话通道不可用(宿主异常/凭据失效,经测试通道注入)"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
    state_requirements:
      - description: "已注册项目宿主/会话通道不可用(测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户察看应用看板编排条目状态,同时在终端继续未注册项目操作;通道恢复后回看"
- Output: "通道异常以错误/失败态呈现 + 恢复引导(不静默,沿用 M1/M2 错误呈现模式);未注册项目 CLI 形态完全不受影响;通道恢复后可继续,不残留半状态"
- State: "受影响派发行转 failed 态并记录原因;恢复后经重派发继续;未注册项目 forge 文件持续经 CLI 演进"
- Side-effect: "dispatch_updated 事件推送失败态"
- Invariants: "通道失败永不静默;未注册侧与宿主无耦合"

## Outcome "cross-project-isolation"
<!-- source: inferred -->
<!-- reasoning: journey Step 3 预期「无跨项目串扰/覆盖」为独立断言面;Fact Table FT-097(schema-v2 task 表以 project_id 为主键成分)+ 仓内 forge 文件按项目根寻址 —— 两数据域无共享写面,交叉污染防护可独立断言(在途提交完成后的终局核查) -->
- Preconditions: "交替操作(含在途提交)已全部完成;两项目任务全集各自处于预期终局"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
- Input: "用户经 harness 分别断言两项目任务全集与数据载体归属(内核表查询 + 仓内文件读取)"
- Output: "已注册项目全部任务行仅存在于内核权威表;未注册项目全部任务数据仅存在于其仓内 forge 文件;两集合作业无一行/一文件互相渗入"
- State: "两数据域内容与归属不变(终局核查面)"
- Side-effect: "none"
- Invariants: "每个项目唯一权威写者;无跨项目串扰/覆盖"

## Journey Invariants

- 未注册项目 CLI 行为零变化(与 M3-之前基线 golden 集逐字一致)
- 已注册项目「应用通道日常管线(派发 → 执行 → 提交)」零冻结 CC 插件 spawn、零 forge CLI 调用(进程/日志级断言;口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线)
- 双形态数据互不破坏:每个项目唯一权威写者(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核);已注册项目的外部会话写不构成第二写路径 —— 经 T3 watcher 重摄入回收并置偏离,读路由恒经内核,单一事实源恒成立
- 外部会话过渡期兼容,永不硬阻断(偏离仅呈现)
- 回流时效口径:本地 ≤5s 免手动刷新;CI 计时用宽松阈值防抖动(BIZ-workbench-005)
