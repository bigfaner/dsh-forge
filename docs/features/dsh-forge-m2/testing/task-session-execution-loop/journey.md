---
feature: "dsh-forge-m2"
journey: "task-session-execution-loop"
risk_level: "High"
golden_path: true
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-m2/prd/prd-user-stories.md
  - docs/features/dsh-forge-m2/prd/prd-spec.md
  - docs/features/dsh-forge-m2/prd/prd-ui-functions.md
generated: "2026-09-23"
---

# Journey: task-session-execution-loop

**Risk Level**: High

## Overview

SDD 开发者在应用内完成"浏览任务看板 → 查看任务详情 → 一键发起带任务上下文的 dsh 会话 → agent 在会话中执行任务操作 → 状态回流看板 → 重启后回溯挂接 → 从挂接条目重入会话"的零终端闭环——这是 dsh-forge-m2 需求与会话工作台的主线用户工作流(本 feature 的 Golden Path)。

> PRD Traceability: Story 1(任务可视化浏览)、Story 2(一键发起带任务上下文的会话)、Story 3(状态回流与来源标识);SC2(零终端只读闭环)、SC3(会话注入链路);UF2/UF3/UF5。

## Setup

- 应用已安装并启动,已注册并激活一个含 ≥10 个任务、含依赖关系的 forge 项目(测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理;本旅程含任务状态变更(claim),不得以生产仓为承载)
- 任务看板可正常加载,存在至少一个处于可执行状态且有执行 prompt 的任务
- dsh 宿主可用(凭据就绪),主窗口会话界面可进入
- 跨面断言口径:与 `forge task list` 输出一致/注入消息内容/最终状态一致的校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)

## Happy Path

### Step 1: 打开任务看板浏览依赖树

**User Action**: 用户进入工作台·任务看板,浏览激活项目的任务依赖树视图

**Expected Result**: 依赖树图形化展示 blocker 关系;任务数/状态/依赖与 `forge task list` 输出一致(校验通道见 Setup);首屏 ≤2 秒(计时口径 = Setup 实际任务规模;500 任务规模上限的性能口径属 SC1 性能腿,不在本旅程 Setup 内)

### Step 2: 打开任务详情

**Precondition**: 看板上存在处于可执行状态的任务卡片/节点

**User Action**: 点击该任务卡片/节点

**Expected Result**: 详情面板展开,描述、依赖链(上游 blocker 链)、执行记录均可读;若任务在非默认 worktree 有执行痕迹,worktree 标识可见

### Step 3: 一键发起会话

**Precondition**: 所选任务存在执行 prompt(满足发起条件)

**User Action**: 在任务详情点击"发起会话"(1 次点击)

**Expected Result**: ≤1 次点击进入会话界面,发起到会话界面可交互 ≤3 秒;发起中显示发起中指示(initiating);挂接关系写入工作台自有状态(挂接索引)

### Step 4: 确认任务执行 prompt 自动注入

**User Action**: 查看该会话中 agent 收到的首条用户消息

**Expected Result**: 消息包含 `forge prompt get-by-task-id` 的完整输出,零手工粘贴

### Step 5: agent 执行任务操作并回流看板

**Precondition**: 挂接会话运行中,agent 在会话中提出执行一次任务 claim(经 forge CLI)

**User Action**: 用户在会话界面对该 claim 操作进行审批(审批走主窗口现有会话 UI)

**Expected Result**: 审批通过后 agent 完成 claim,看板 ≤5 秒内免手动刷新更新任务状态,该笔变更标记来源[会话]

> e2e 驱动面注记:agent 动作不由 web 面驱动;以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟 agent 的 claim(tech-design SC2/SC3 e2e 腿口径),回流与来源断言不受模拟方式影响

### Step 6: 重启应用后回溯挂接

**User Action**: 重启应用,重新打开该任务详情,查看挂接状态与历史

**Expected Result**: 任务↔会话挂接关系仍然存在;任务卡显示挂接状态;历史挂接列表可回溯(会话标识/时间)

### Step 7: 从挂接条目重入会话

**Precondition**: 该任务存在进行中(active)的挂接会话

**User Action**: 在任务详情的挂接条目点击"进入会话"

**Expected Result**: 跳转主窗口会话界面并定位到该挂接会话(UF5 active 态"进入会话");从会话界面返回时回到任务看板(返回来源)

## Edge Cases

### Step 3b: 任务无执行 prompt 时发起入口禁用

<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,按 UF5 校验规则映射为前置不满足的入口禁用 + 原因说明(字面表单校验错误不适用) -->

**Precondition**: 所选任务不存在执行 prompt(不满足发起条件)

**User Action**: 用户打开该任务详情并寻找"发起会话"入口

**Expected Result**: 按钮禁用并说明原因;不发起任何会话、不写入挂接索引

### Step 3c: 会话发起失败(宿主/凭据异常)

<!-- surface-web required_outcomes 映射:session-expired → 宿主不可用/凭据失效使会话通道不可用,呈现为 UF5 error(发起失败)态 + 恢复引导 -->
<!-- source: inferred:「不残留半初始化的挂接记录」推自 Interface 5 成功链序(launch → sessionId → recordSessionLink)——挂接写入后置于会话创建成功,失败先于写入 -->

**Precondition**: dsh 宿主不可用或凭据异常

**User Action**: 用户点击"发起会话"

**Expected Result**: 错误提示与恢复引导(沿用 M1 崩溃恢复/配置引导模式);返回工作台后可重试;不残留半初始化的挂接记录

### Step 3d: 同一任务重复发起第二个会话

<!-- source: inferred:并发再发起无 PRD 明文;依据 = 挂接索引允许多行(UNIQUE(project_id, task_key, session_id),tech-design)+ UF5/UF3 挂接历史列表模型;旧 active 行置 ended 不删行 = 已落地 4.2 supersede(e2e sc3 断言) -->

**Precondition**: 该任务已有一个进行中的挂接会话

**User Action**: 用户从同一任务卡片/详情再次点击"发起会话"

**Expected Result**: 挂接索引记录多条挂接,任务详情可区分多个挂接条目;既有进行中挂接转为结束(ended)态、记录保留;forge 数据不受影响(挂接为工作台自有状态)

### Step 3e: 发起中途应用被杀

**Precondition**: 发起链进行中(会话创建/挂接写入未完成)时应用被强制退出或崩溃

**User Action**: 重启应用,重新打开该任务详情

**Expected Result**: 无半初始化挂接记录;应用正常启动(沿用 M1 崩溃恢复),可重新发起会话

### Step 5b: 状态回流超时(>5 秒未更新)

<!-- source: inferred:超时指示无来源定义——updating 仅在变更事件到达时点亮(UF2 States/ui-design 回流态/实现记录 5.15);感知链故障的失败面 = sync-error 工具栏指示 + 静默重试、保留最后良好看板(实现记录 5.5) -->

**Precondition**: agent 已在挂接会话中完成 claim 且 forge 文件(唯一事实源)已变更,但看板超过 5 秒仍未显示该更新

**User Action**: 用户察看看板任务卡片与变更提示;必要时重启应用并重开看板

**Expected Result**: 超时本身不触发任何专用看板状态——`updating` 仅在变更事件到达时点亮,而非超时点亮;若破线源于感知链故障(watcher/扫描错误),呈现 sync-error 工具栏指示 + 静默重试,保留最后一次良好看板;变更事件最终到达或重启全量重扫后,看板与 forge 文件一致(看板为派生快照,可重建;校验通道见 Setup)

### Step 5c: agent 连续多笔变更逐笔回流

**Precondition**: 挂接会话中 agent 连续执行多笔任务状态变更(claim → transition → submit)

**User Action**: 用户保持看板打开,观察任务卡片状态

**Expected Result**: 每笔变更 ≤5 秒回流,来源逐笔标记[会话];最终状态与 forge 数据一致(校验通道见 Setup)

### Step 6b: 任务历史上挂接多个会话的回溯

**Precondition**: 一个任务历史上先后挂接过多个会话

**User Action**: 用户打开该任务详情查看挂接历史列表

**Expected Result**: 历史挂接列表完整、按时间可回溯,每条含会话标识/时间;与挂接索引(工作台自有状态)一致

## Journey Invariants

- 看板对人只读:全程任何视图不出现任务状态变更的写操作入口(add/claim/transition/submit/reopen)
- forge 数据为唯一事实源:挂接关系只写入工作台自有状态,不写入 forge 数据,不产生第二事实源
- 每笔任务状态变更在看板标记来源([会话]),且与实际操作通道一致
- 状态回流时效:感知链健康时,每笔会话侧变更 ≤5 秒内免手动刷新可见(G3/SC3 口径);破线为降级情形(见 Step 5b)——无专用超时状态,forge 文件恒为事实源,看板快照经重扫/重启重建收敛
- 挂接索引原子性:挂接行仅在会话创建成功后写入,任何失败或中途中断不残留半初始化记录(source: inferred,推自 Interface 5 成功链序)
