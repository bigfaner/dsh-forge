---
feature: "dsh-forge-m3"
journey: "dual-form-transition"
risk_level: "High"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m3/prd/prd-user-stories.md
  - docs/features/dsh-forge-m3/prd/prd-spec.md
  - docs/features/dsh-forge-m3/prd/prd-ui-functions.md
generated: "2026-09-24"
---

# Journey: dual-form-transition

**Risk Level**: High

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

<!-- Risk = High 依据:两形态均执行状态变更型任务管线(终端 init→add/claim→submit 写任务状态;应用 派发→执行→提交 做 claim/submit 状态迁移),交替一致性失败即跨形态数据破坏 —— Step 3/3b 的存在本身即该风险;承载同一 派发→执行→提交 管线的 task-dispatch-execution-loop 亦为 High。 -->

## Overview

双形态使用者在同一机器并行两种形态:未注册项目在终端全程使用 forge CLI(行为与 M3 之前完全一致),已注册项目切换应用通道后日常任务管线不再依赖冻结 CC 插件(零 spawn 断言);两形态于不同项目交替操作,双方数据与行为互不破坏。

> PRD Traceability: Story 8(过渡双形态不破坏);SC7、SC1;proposal Key Scenarios「过渡双形态」;prd-spec 外围命令归宿表·过渡纪律·归宿分解决议(既有 git hook 不破坏)。外部跨阶段操作的偏离呈现由 stage-gates-cross-phase-context Step 7 承载(委托)。

## Setup

- 同一机器备两个独立一次性 fixture 项目(临时目录 + 隔离 userData、测试后清理;跑测前确认无活跃 dsh-forge 实例持单实例锁,避免 ERR_SINGLE_INSTANCE 污染):一个未注册 forge 项目(终端 + 冻结 CC 插件形态)、一个已注册并完成 SoT 迁移的应用通道项目
- forge CLI 对未注册项目可用;应用通道项目运行环境就绪(应用 + dsh tool + 宿主)
- M3-之前行为基线 = 冻结的 pre-M3 forge CLI 构建,在固定 fixture 任务集上预录制的 golden 对照集(init/add/claim/transition/submit 的命令输出、任务数据格式、CC 插件指令清单);「与 M3 之前一致」断言 = 与该 golden 集逐字对拍(对拍基准须冻结保鲜,proposal Urgency)
- 断言口径:spawn/CLI 断言 = 进程/日志级(forge CLI 调用与冻结 CC 插件 spawn 可观测,脚本断言);终端腿(Steps 1/1b/1c/2d/3b)由测试 harness 以子进程驱动 forge CLI 并断言输出/退出码/落盘数据,浏览器面承载看板侧断言(web 套件经 harness 级进程断言覆盖终端腿)

## Happy Path

### Step 1: 未注册项目全程 CLI 照旧

**User Action**: 用户在终端对未注册项目执行三段任务管线:初始化(init)→ 新增并领取一个任务(add → claim)→ 完成后提交(transition → submit)

**Expected Result**: 各段命令输出与任务数据格式与 M3-之前基线 golden 集逐字一致;应用不干预该项目(未注册项目不在工作台注册表内,应用不可见);任务数据落仓内 forge 文件(CLI 通道照旧)

### Step 2: 已注册项目应用通道日常管线零插件依赖

<!-- surface-web required_outcomes 映射:validation-error → 本旅程看板交互为观察型(浏览/回流/回看),无新增表单输入面;派发输入校验失败(依赖未满足混入)由同应用面的 task-dispatch-execution-loop Step 1b 承载,此处不重复设例 -->

**User Action**: 在应用内对已注册项目执行日常任务管线:看板多选任务并派发 → subagent 执行(经 dsh tool claim/submit)→ 提交后回看看板(管线细则由 task-dispatch-execution-loop 承载,本步断言过渡形态口径)

**Expected Result**: 全程无冻结 CC 插件 spawn(进程/日志级断言,SC7 口径);零 forge CLI 调用(SC1 口径);任务状态回流看板 ≤5s(等待策略 = 感知事件/轮询断言,不用固定 sleep;CI 计时用宽松阈值防抖动,BIZ-workbench-005)

### Step 3: 双形态交替互不破坏

**User Action**: 两轮交替,每轮在两项目各推进一个任务至提交:第 1 轮先终端(未注册项目)后应用(已注册项目),第 2 轮反序

**Expected Result**: 两轮交替后双方数据与行为互不破坏;任务全集按各通道预期一致 —— 已注册项目:看板呈现 = 数据内核权威表(ID/状态/依赖/标题对拍零差异);未注册项目:forge CLI 任务视图 = 仓内 forge 文件,应用恒不可见该项目;无跨项目串扰/覆盖

<!-- source: inferred(各通道预期定义依据 prd-spec §操作主体模型 + §Data storage:已注册 = SQLite 权威、看板为派生快照;未注册 = 不经注册,应用不可见) -->

## Edge Cases

### Step 1b: 未注册项目的冻结 CC 插件照旧可用

**Precondition**: 未注册项目的日常管线由冻结 CC 插件承载(/run-tasks 等指令可用)

**User Action**: 在 CC 插件内执行任务工作流(领取 → 执行 → 提交)

**Expected Result**: 照旧可用(过渡期);数据与行为与 M3-之前基线一致;不受应用通道演进影响

<!-- source: 归宿分解决议(prd-spec 外围命令归宿表注:过渡期由双形态承载,CLI 留机器);「不受应用通道演进影响」= inferred(应用仅作用于已注册项目路径,PRD Security 边界) -->

### Step 1c: 未注册管线中途提交被拒

**Precondition**: 终端管线进行中,存在一笔触发非法状态迁移的提交(状态机拒绝)

**User Action**: 在终端执行该笔提交,查看任务状态后重试合法提交

**Expected Result**: CLI 呈现拒绝与原因;任务状态不被破坏(无半状态);重试合法提交成功;错误呈现与 M3-之前基线一致

<!-- source: 状态机拒绝非法迁移 = forge CLI 原生行为(prd-spec Solution 2 七态状态机,M3 不改未注册路径);错误口径对拍 = 基线 golden 集 -->

### Step 2b: 已注册项目偶发外部会话任务操作

**Precondition**: 已注册(已迁移)项目存在经外部会话(终端/冻结 CC 插件)执行的任务状态变更(过渡期场景)

**User Action**: 回看应用看板与项目数据

**Expected Result**: 外部会话不被硬阻断(过渡期兼容,操作可完成);外部写致 `tasks/index.json` 复现/变更被 watcher 检出并幂等重摄入,变更回流看板(≤5s 感知口径);数据内核恒权威(读路由恒经内核),复现文件不构成第二事实源(migration_event(reingest) 留档);项目偏离标记呈现(仅呈现,不阻断)

<!-- source: tech-design Interface 4.7(T3 外部写回收:watcher 检出 index.json 复现/变更 → 幂等重摄入 → projects.deviated=1 + migration_event(reingest),不阻断外部会话);读路由按 projects.data_authority = tech-design §Data storage;外部跨阶段操作的 feature 级偏离呈现由 stage-gates-cross-phase-context Step 7 承载(委托,不在此重复设例) -->

### Step 2c: 外部写重摄入失败(感知链故障)

**Precondition**: 外部写发生后,感知/重摄入链路故障(watcher 或重摄入失败)

**User Action**: 回看看板与项目数据,感知链恢复后再次回看

**Expected Result**: 偏离标记保持、错误入结构化 log(不弹错阻断);数据内核权威状态不受感知故障影响(权威数据不丢失);恢复后重摄入幂等完成,看板与内核一致

<!-- source: tech-design §Error Handling 感知面(watcher/indexer 失败不弹 UI;重摄入失败 → 偏离标记保持 + 日志);BIZ-resilience-001 静默降级口径 -->

### Step 2d: 既有 git hook 不破坏

**Precondition**: 已注册项目仓内存在 M3 之前安装的 verify-task-done git hook

**User Action**: 经外部会话在终端完成一笔任务提交(触发 hook),检查 hook 文件与应用侧状态

**Expected Result**: hook 照旧触发、功能不破坏;注册/迁移/应用通道使用均不改动该 hook;应用侧操作不受 hook 存在影响

<!-- source: prd-spec 外围命令归宿表 verify-task-done 行 + 归宿分解决议(过渡期既有 git hook 不破坏;hook 安装面 M4 收口,M3 不动) -->

### Step 3b: 在途变更共存下的交替写入一致性

**Precondition**: 两项目各自存在未提交的进行中变更(在途写入)状态下发生交替操作(与 Step 3 互斥:Step 3 = 每轮写入即提交、无在途残留)

**User Action**: 交替完成两项目在途变更的提交(先终端提交未注册项目在途变更,再经应用提交已注册项目在途变更),随后回看两项目的任务呈现

**Expected Result**: 各自任务全集一致、无交叉污染;单写者纪律未被破坏(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核权威,外部写经重摄入回收而非第二写路径)

<!-- source: 交叉污染防护 = inferred(两项目数据域隔离:仓内 forge 文件 vs 内核 SQLite,无共享写面);BIZ-coexistence-002(禁第二事实源) -->

### Step 3c: 交替期间宿主/会话通道异常

<!-- surface-web required_outcomes 映射:session-expired → 交替期间宿主不可用/凭据失效使已注册项目会话通道不可用:看板以错误/失败态呈现 + 恢复引导;未注册项目终端形态不受影响 -->

**Precondition**: 交替操作进行中,已注册项目的宿主/会话通道不可用(宿主异常/凭据失效)

**User Action**: 察看应用看板编排条目状态,同时在终端继续未注册项目操作;通道恢复后回看

**Expected Result**: 通道异常以错误/失败态呈现 + 恢复引导(不静默,沿用 M1/M2 错误呈现模式);未注册项目 CLI 形态完全不受影响;通道恢复后可继续,不残留半状态

<!-- source: 宿主/会话通道异常呈现 = task-dispatch-execution-loop Step 5c 同族口径;未注册侧不受影响 = inferred(CLI 形态与宿主无耦合) -->

## Journey Invariants

- 未注册项目 CLI 行为零变化(与 M3-之前基线 golden 集逐字一致)
- 已注册项目「应用通道日常管线(派发 → 执行 → 提交)」零冻结 CC 插件 spawn、零 forge CLI 调用(进程/日志级断言;口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线)
- 双形态数据互不破坏:每个项目唯一权威写者(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核);已注册项目的外部会话写不构成第二写路径 —— 经 T3 watcher 重摄入回收并置偏离,读路由恒经内核,单一事实源恒成立
- 外部会话过渡期兼容,永不硬阻断(偏离仅呈现)
- 回流时效口径:本地 ≤5s 免手动刷新;CI 计时用宽松阈值防抖动(BIZ-workbench-005)
