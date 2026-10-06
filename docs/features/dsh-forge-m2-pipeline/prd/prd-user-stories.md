---
feature: "dsh-forge M2：forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）"
---

# User Stories: dsh-forge M2：forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）

> 角色 derives from PRD Background：单人开发者（唯一人类用户）；dsh agent 会话为系统协作者（dispatcher / executor，非用户故事角色——其行为经 Story 2/3/4 的系统侧断言覆盖）。

## Story 1: 在概览页签浏览任务并做人工状态决策

**As a** 单人开发者
**I want to** 在概览页签按 feature 绑定浏览任务列表、用七态 chips 过滤、在任务行直接做人工决策（跳过 / 否决 / 挂起 / 重开，需填原因）
**So that** 不打开终端也能掌握任务域全貌并纠偏，agent 与我在同一个状态源上工作

**Acceptance Criteria:**

- Given 已注册工作区且库中有某 feature 的多态任务
- When 打开概览页签并选择该 feature、点击某状态 chip
- Then 列表仅显示该 feature 该状态的任务；数据全部直读每工作区库（数据来源断言，无第二来源）

- Given 某任务卡死需人工重置（如 in_progress 悬置）
- When 在任务行选择人工转移（from≠to）并填写原因
- Then 状态转移落库 + 审计记录（reason 必带）；原因缺席时拒绝提交

- Given 概览首屏含 500 条任务的压力数据集
- When 打开概览页签
- Then 首屏呈现 ≤2s（机械判据）；列表无 watch / 回流 / 快照同步模块（代码审计 0 个）

---

## Story 2: 一句话让任务管线跑起来（派发链 dogfood）

**As a** 单人开发者
**I want to** 在项目会话里发起 run-tasks，管线自动领任务 → 派发执行 → 质量门通过后落账并提交
**So that** 我只表达意图，任务状态层自动推进，概览列表实时反映

**Acceptance Criteria:**

- Given 库中有就绪任务（前置全部终态）
- When 会话内发起 run-tasks
- Then dispatcher 经 claimTask tool 领取（pending→in_progress，审计含派发会话 id + 挂接行）；返回的 dispatchPrompt 构成：人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 依赖快照）+ 类型策略块（断言）

- Given executor（匿名 subagent，初始提示词 = dispatchPrompt）已完成执行且质量门（编译→格式→lint→测试）全过
- When executor 调 submitTask
- Then 任务 completed + 审计记录（gate 结果 / 执行摘要 / 提交哈希 / 执行会话 id）+ git 提交；概览列表在写入返回后单次重取即见新值（e2e 断言「即时」判据）

- Given 质量门未通过或执行受阻
- When executor 调 submitTask result=blocked
- Then 任务 in_progress→blocked（reason 必带，缺席拒绝）；应用自身不发起任何编排动作（web 无编排逻辑，代码审计断言）；插件不注册人类通道 tool（transitionTask / transitionFeature——代码审计 0 注册）

---

## Story 3: 受阻任务自动修复（fix 链）

**As a** 单人开发者
**I want to** executor 受阻时管线自动创建修复任务、修复完成后原任务自动恢复
**So that** 单点失败不断链，我不必手工搬移状态

**Acceptance Criteria:**

- Given 任务 X 执行受阻且 executor 提交 blocked
- When fix 任务经 addTask（block-source）创建
- Then 单事务完成：fix 任务行 + 依赖边 + 源任务置 blocked（审计 verb='auto-block'）——三者原子，无半成品

- Given 阻塞源 fix 任务已完成（或被人工跳过）
- When 恢复钩子触发
- Then 源任务前置全满足时 blocked→pending（审计 verb='auto-restore'，边保留不删）；e2e 断言恢复行在场

- Given 试图构造会成环的依赖（addTask 双 flag 组合）
- When 提交
- Then 拒绝并回报完整环路径；fix 链深度超上限（≤6）时拒绝并提示人工介入

---

## Story 4: 会话中断后任务不丢（幂等重入恢复）

**As a** 单人开发者
**I want to** executor 子会话中断后，dispatcher 重新领取同一任务并拿到重新合成的执行简报
**So that** 中断只损失时间不损失状态，无需人工清理

**Acceptance Criteria:**

- Given 任务 in_progress 但执行记录缺失（模拟子会话中断）
- When dispatcher 外环再次 claimTask 同一任务
- Then 无状态转移（仍 in_progress），返回按当前状态重新合成的 dispatchPrompt（digest 新值）；e2e / dogfood 走查含此场景一次

---

## Story 5: 浏览 feature 与提案文档（含仓外项目）

**As a** 单人开发者
**I want to** 在概览页签的提案/feature 子 tab 浏览项目文档，点开只读文档 chip 核对规格，并可跳转编辑器打开
**So that** 不切出工作台即可核对规格与设计上下文

**Acceptance Criteria:**

- Given 仓内项目（按目录约定组织文档的注册工作区）
- When 在概览 feature 子 tab 点开一篇 design 文档
- Then 右侧只读抽屉呈现正文只读渲染 + canonical 路径栏 + 只读徽标；「在编辑器中打开」跳转系统关联编辑器（e2e 仓内一条）

- Given 仓外项目（夹具按约定预置目录结构）
- When 浏览其概览提案/feature 子 tab
- Then 经真实发现链建行后同构呈现（e2e 仓外一条）；零命中的项目呈现空态（一等展示，非错误）

- Given 文档引用悬空（模拟分支切换后文件不在当前分支）
- When 打开对应文档条目
- Then 只读缺省渲染并标注悬空，不崩溃、不写入、不删行（e2e 断言）

- Given 应用对代码仓与文档位置的写权限
- When 走查一次全流程
- Then 文件系统级监控证明零写入（SC3 回归；显式「在编辑器中打开」跳转除外——跳转不写文件）

---

## Story 6: 看见任务与会话的挂接（双侧）

**As a** 单人开发者
**I want to** 在会话头部看到该会话挂接的任务、在任务行看到挂接的会话
**So that** 执行痕迹可追溯——哪个任务在哪个会话里做过，一目了然

**Acceptance Criteria:**

- Given 一次完整派发（dispatcher 会话 claim + executor 子会话 submit）
- When 查看该任务行
- Then 挂接会话展示两类且与库一致：派发会话（挂接表）与执行会话（审计记录会话 id）——双数据源分别断言；两侧会话 id 相异可判（S8 实证子会话 id 形态可得）

- Given 会话头部挂接展示缝
- When 该会话 claim 过任务后查看会话头部
- Then 头部展示挂接任务且与库中挂接行一致（e2e 断言）

---

## Story 7: 注册时看到任务数据的真实位置（并受移动保护）

**As a** 单人开发者
**I want to** 注册表单的任务清单只读行显示实际存储位置（含消歧后缀），疑似目录移动时得到明确指引而非静默出错
**So that** 表单不撒谎，数据位置与展示一致，移动场景有确定性出路

**Acceptance Criteria:**

- Given 注册表单已选定工作区目录
- When 查看任务清单只读行
- Then 展示 `{dsh-forge-home}/{扁平化}@{hash8}`，且该串由应用侧单一来源下发（与实际建库位置逐字一致——SC2 单源断言）

- Given 目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）
- When 确认注册
- Then 拒绝注册并给出手工指引（删除孤儿目录或改回原名）；不清理、不认领、不崩溃（e2e 断言）
