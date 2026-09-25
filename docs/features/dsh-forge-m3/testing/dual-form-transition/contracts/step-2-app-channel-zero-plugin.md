---
journey: "dual-form-transition"
step: 2
step-action: "已注册项目应用通道日常管线零插件依赖"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/dual-form-transition/journey.md
anchors:
  web:
    page: "工作台 · 任务看板"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: dual-form-transition / Step 2: 已注册项目应用通道日常管线零插件依赖

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "已注册并完成 SoT 迁移的应用通道项目就绪(应用 + dsh tool + 宿主);看板存在可派发任务"
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
            value: "可派发类型键"
- Input: "用户在应用内对已注册项目执行日常任务管线:看板多选任务并派发 → subagent 执行(经 dsh tool claim/submit)→ 提交后回看看板"
- Output: "全程无冻结 CC 插件 spawn(进程/日志级断言,SC7 口径);零 forge CLI 调用(SC1 口径);任务状态回流看板 ≤5s(等待策略 = 感知事件/轮询断言,不用固定 sleep;CI 计时用宽松阈值防抖动)"
- State: "任务状态经内核权威行迁移(dsh tool 写通道);看板为派生快照"
- Side-effect: "subagent 会话创建与预合成注入(host 通道);task_updated 事件直发"
- Invariants: "已注册项目应用通道日常管线零冻结 CC 插件 spawn、零 forge CLI 调用"

## Outcome "external-write-reingest"
- Preconditions: "已注册(已迁移)项目存在经外部会话(终端/冻结 CC 插件)执行的任务状态变更(过渡期场景);外部写致 tasks/index.json 复现或变更"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "ReproducedIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "path"
            value: "文档树下 tasks/index.json(外部复现)"
- Input: "用户回看应用看板与项目数据"
- Output: "外部会话不被硬阻断(过渡期兼容,操作可完成);变更回流看板(≤5s 感知口径);项目偏离标记呈现(仅呈现,不阻断)"
- State: "watcher 检出 index.json 复现/变更 → 幂等重摄入(单事务先删后插 + 对拍校验);migration_event 留 reingest 审计;数据内核恒权威(读路由恒经内核),复现文件不构成第二事实源"
- Side-effect: "projects.deviated 置位 + deviation_detected 事件"
- Invariants: "外部会话写不构成第二写路径 —— 经重摄入回收并置偏离"

## Outcome "reingest-perception-failure"
- Preconditions: "外部写发生后,感知/重摄入链路故障(watcher 或重摄入失败)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
          - field: "deviated"
            value: 1
      - entity_type: "ReproducedIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "watcher 或重摄入链路故障(测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户回看看板与项目数据,感知链恢复后再次回看"
- Output: "偏离标记保持、错误入结构化 log(不弹错阻断);数据内核权威状态不受感知故障影响(权威数据不丢失);恢复后重摄入幂等完成,看板与内核一致"
- State: "偏离标记保持至重摄入成功;权威行不受感知故障影响"
- Side-effect: "失败原因入结构化日志(reingest fail 审计)"
- Invariants: "感知面失败不弹 UI;静默降级口径(BIZ-resilience-001)"

## Outcome "git-hook-intact"
- Preconditions: "已注册项目仓内存在 M3 之前安装的 verify-task-done git hook"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "GitHook"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "name"
            value: "verify-task-done"
          - field: "installedBefore"
            value: "M3 之前"
- Input: "用户经外部会话在终端完成一笔任务提交(触发 hook),检查 hook 文件与应用侧状态"
- Output: "hook 照旧触发、功能不破坏;注册/迁移/应用通道使用均不改动该 hook;应用侧操作不受 hook 存在影响"
- State: "hook 文件字节与 mtime 原样;应用自有状态零变化"
- Side-effect: "hook 按其自身语义执行(外部会话域)"
- Invariants: "过渡期既有 git hook 不破坏;hook 安装面 M4 收口,M3 不动"

## Outcome "authority-guard"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-059/FT-062(task-service.ts:27-32;dispatch-service.ts:139-150):files 权威项目的任务写集与派发 → ERR_TASK_NOT_AUTHORITATIVE,消息显式提示迁移或走 CLI(双形态纪律);已注册未迁移项目是过渡双形态的现实边界态 -->
- Preconditions: "项目已注册但未迁移(data_authority 为 files);用户在应用内尝试派发或任务写操作"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
- Input: "用户在应用内发起派发(或经 dsh tool 发起任务写)"
- Output: "操作被拒并呈现明确错误:项目尚非 sqlite 权威,提示先迁移或使用 forge CLI(双形态纪律)"
- State: "零写入;项目权威状态不变"
- Side-effect: "none"
- Invariants: "每个项目唯一权威写者;files 项目走 CLI 形态"

## Journey Invariants

- 未注册项目 CLI 行为零变化(与 M3-之前基线 golden 集逐字一致)
- 已注册项目「应用通道日常管线(派发 → 执行 → 提交)」零冻结 CC 插件 spawn、零 forge CLI 调用(进程/日志级断言;口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线)
- 双形态数据互不破坏:每个项目唯一权威写者(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核);已注册项目的外部会话写不构成第二写路径 —— 经 T3 watcher 重摄入回收并置偏离,读路由恒经内核,单一事实源恒成立
- 外部会话过渡期兼容,永不硬阻断(偏离仅呈现)
- 回流时效口径:本地 ≤5s 免手动刷新;CI 计时用宽松阈值防抖动(BIZ-workbench-005)
