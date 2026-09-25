---
journey: "dual-form-transition"
step: 1
step-action: "未注册项目全程 CLI 照旧"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/dual-form-transition/journey.md
anchors:
  web: {}
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: dual-form-transition / Step 1: 未注册项目全程 CLI 照旧

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->
<!-- anchor note: 本步为终端 CLI 形态(测试 harness 以子进程驱动 forge CLI 并断言输出/退出码/落盘数据),无浏览器页面锚点可匹配 —— web 锚点留空不猜值 -->

## Outcome "success"
- Preconditions: "同一机器备一个未注册 forge 项目(临时目录 fixture,终端 + 冻结 CC 插件形态);pre-M3 冻结 forge CLI 构建可用;M3-之前行为基线 golden 对照集已预录制(init/add/claim/transition/submit 的命令输出、任务数据格式、CC 插件指令清单)"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
          - field: "cliAvailable"
            value: "冻结 pre-M3 构建"
      - entity_type: "GoldenBaselineSet"
        min_count: 1
        field_constraints:
          - field: "content"
            value: "init/add/claim/transition/submit 命令输出 + 任务数据格式 + CC 插件指令清单的逐字基线"
- Input: "用户在终端对未注册项目执行三段任务管线:初始化(init)→ 新增并领取一个任务(add → claim)→ 完成后提交(transition → submit)"
- Output: "各段命令输出与任务数据格式与 M3-之前基线 golden 集逐字一致(harness 级对拍)"
- State: "任务数据落仓内 forge 文件(CLI 通道照旧);应用不干预该项目"
- Side-effect: "none"
- Invariants: "未注册项目 CLI 行为零变化(与 M3-之前基线 golden 集逐字一致)"

## Outcome "cc-plugin-frozen-works"
- Preconditions: "未注册项目的日常管线由冻结 CC 插件承载(/run-tasks 等指令可用)"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "FrozenCCPlugin"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UnregisteredForgeProject"
        field_constraints:
          - field: "commands"
            value: "/run-tasks 等指令集可用"
- Input: "用户在 CC 插件内执行任务工作流(领取 → 执行 → 提交)"
- Output: "照旧可用(过渡期);数据与行为与 M3-之前基线一致;不受应用通道演进影响"
- State: "任务数据落仓内 forge 文件;应用零介入"
- Side-effect: "none"
- Invariants: "过渡期由双形态承载,CLI 留机器"

## Outcome "illegal-submit-rejected"
- Preconditions: "终端管线进行中,存在一笔触发非法状态迁移的提交(如对 completed 任务 claim,状态机拒绝)"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UnregisteredForgeProject"
        field_constraints:
          - field: "status"
            value: "completed 或其他不允许目标迁移的状态"
- Input: "用户在终端执行该笔非法提交,查看任务状态后重试合法提交"
- Output: "CLI 呈现拒绝与原因;重试合法提交成功;错误呈现与 M3-之前基线一致(基线 golden 集对拍)"
- State: "任务状态不被破坏(无半状态);重试后按合法迁移落仓内 forge 文件"
- Side-effect: "none"
- Invariants: "状态机拒绝非法迁移 = forge CLI 原生行为(M3 不改未注册路径)"

## Outcome "app-invisibility"
<!-- source: inferred -->
<!-- reasoning: journey Step 1/3 预期「应用恒不可见该项目」+ PRD Security 边界(应用仅作用于已注册项目路径);未注册项目不出现在工作台注册表是可独立断言的浏览器面/内核面事实 -->
- Preconditions: "未注册 forge 项目存在于本机;应用已启动"
  fixture_spec:
    entities:
      - entity_type: "UnregisteredForgeProject"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: false
      - entity_type: "RegisteredProjectList"
        min_count: 1
        field_constraints:
          - field: "contains"
            value: "不含该未注册项目代码根"
- Input: "用户在应用工作台查看项目注册表/项目切换器"
- Output: "该项目不出现在工作台注册表内(应用不可见)"
- State: "内核注册表零变更;未注册项目数据零接触"
- Side-effect: "none"
- Invariants: "未注册 = 不经注册,应用不可见"

## Journey Invariants

- 未注册项目 CLI 行为零变化(与 M3-之前基线 golden 集逐字一致)
- 已注册项目「应用通道日常管线(派发 → 执行 → 提交)」零冻结 CC 插件 spawn、零 forge CLI 调用(进程/日志级断言;口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线)
- 双形态数据互不破坏:每个项目唯一权威写者(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核);已注册项目的外部会话写不构成第二写路径 —— 经 T3 watcher 重摄入回收并置偏离,读路由恒经内核,单一事实源恒成立
- 外部会话过渡期兼容,永不硬阻断(偏离仅呈现)
- 回流时效口径:本地 ≤5s 免手动刷新;CI 计时用宽松阈值防抖动(BIZ-workbench-005)
