---
feature: "dsh-forge-m4"
---

# User Stories: dsh-forge M4 — 项目中心工作台

> 角色来自 PRD Background:编排者(人,单人产品线作者)与执行 agent(会话内任务执行主体)。

## Story 1: 项目一页可见

**As a** 编排者(人)
**I want to** 启动应用直接进入项目工作台,经左栏全项目树切换项目,在一个项目工作台页内同时看到代码区(会话/worktree 状态)与 forge 文件区(feature/提案/管线入口)
**So that** 项目相关内容汇总一处,不用在会话列表、看板、文档根之间来回切换

**Acceptance Criteria:**
- Given 已注册至少一个项目,When 启动应用,Then 首屏为项目工作台(恢复上次活跃项目),左栏全项目树可枚举/切换全部项目(独立项目列表页不存在;2026-09-27 裁决)
- Given 进入项目工作台,When 页面渲染完成,Then 代码区与 forge 文件区同页可见,知识区无空占位(e2e 断言)
- Given 应用内任意 forge 视图,When 检查其导航归属,Then 均处于项目上下文,孤儿视图为 0(e2e 断言)

---

## Story 2: 从任务直达执行会话(含 subagent)

**As a** 编排者(人)
**I want to** 在任务详情看到绑定会话(含会话内执行的 subagent 会话)并一键打开
**So that** 任务出问题时我能立刻看到 agent 当时在会话里做了什么,不用反查时间线

**Acceptance Criteria:**
- Given 任务存在挂接历史(active 与 ended),When 打开任务详情,Then 呈现完整挂接历史与新→旧排序
- Given 任务存在 active 挂接且其顶层会话血缘内有 subagent 会话,When 查看任务详情,Then 执行 subagent 会话被标识(任务 id+title 命名 + 血缘推断)
- Given 任务有绑定会话,When 点击打开,Then 顶层会话经 session-focus 打开、subagent 会话经 SubagentAddress 打开(e2e 断言)
- Given subagent 会话被打开,When 查看会话视图,Then 展示所执行任务的元数据(任务号/标题/状态)(断言)

---

## Story 3: feature 执行态聚焦【2026-09-27 裁决 #27 裁撤】

UF4 feature 阶段感知视图裁撤:阶段重点信息矩阵与执行态聚焦不再交付。其可保留价值已由其他故事承载——「点击执行中任务打开 subagent 会话」= Story 2(任务详情 dock 绑定会话);「未挂接会话」标注 = Story 2/UF5 dock 状态。编号保留以维持故事追溯。

---

## Story 4: 注册即归组(投影)

**As a** 编排者(人)
**I want to** 在注册向导里用文件选择器选定代码区与 forge 文件区位置,注册后 dsh 原生 UI 自动出现同名工作区、派发会话自动归组
**So that** 两侧项目归属一致,forge 派发的会话不再落入「未分组」

**Acceptance Criteria:**
- Given 注册向导中选择了非法路径(不存在/不可写/重复注册),When 提交,Then 即时提示具体原因且可修正,不静默失败
- Given 注册成功,When 检查 dsh 侧 workspaceRegistry,Then 存在同名条目且与项目列表顺序一致(断言)
- Given forge 派发会话(项目 cwd),When 在 dsh 原生 UI 查看会话列表,Then 该会话归组到对应 workspace(断言)
- Given 投影写入失败,When 注册流程执行,Then 注册不被阻断,降级为无投影并提示可重试(e2e 断言)

---

## Story 5: 归档不丢历史、改名不丢归组

**As a** 编排者(人)
**I want to** 归档项目后其会话仍按项目分组(dsh 侧),项目改名后分组保持,删除项目才解除投影
**So that** 归档 ≠ 删除,历史会话始终可按项目找回

**Acceptance Criteria:**
- Given 项目已归档,When 在 dsh 侧查看会话,Then 会话仍按该项目 workspace 分组(断言)
- Given 项目已归档,When 在 forge 工作台查看项目列表,Then 该项目处于归档分区,项目会话列表不再展示(断言)
- Given 项目改名,When 投影同步完成,Then dsh 侧 workspace 同名(断言)
- Given 删除项目,When 投影同步完成,Then dsh 侧 workspace 移除,会话退为未分组且历史不删除(断言)
- Given dsh 侧手工改名/删除 workspace,When forge 侧刷新,Then 不回流仅呈现偏差提示(断言)

---

## Story 6: 分屏观察与布局记忆

**As a** 编排者(人)
**I want to** 在项目工作台内分屏同屏观察(如左会话右任务面板),必要时把视图拆出为独立窗口,且布局随项目记忆
**So that** 重进项目时工作台恢复我上次的观察姿态,不用重新摆布局

**Acceptance Criteria:**
- Given 在项目工作台内,When 添加分屏(会话 + 看板组合),Then 两视图同屏可操作(e2e 断言)
- Given 调整 pane 比例与 subagent 收起状态后离开,When 重进该项目,Then 布局状态恢复(e2e 断言)
- Given 将某视图拆出为独立窗口,When 主窗口与独立窗口并行操作,Then 互不干扰且同属单实例(e2e 断言)

---

## Story 7: 执行 agent 的任务身份可见

**As a** 执行 agent(forge:task-executor 等会话内执行体)
**I want to** 我作为 subagent 执行任务时以任务标识(id + title)命名、我的会话呈现所执行任务的元数据
**So that** 编排者(人与上层 agent)能从任务与我两侧相互识别,过程可追溯

**Acceptance Criteria:**
- Given 任务派发 prompt 已注入命名约定,When 执行体 spawn subagent,Then subagent 会话以「任务 id + title」命名(约定遵循率在 e2e 以固定桩验证)
- Given subagent 会话按约定命名且血缘归属正确,When 反查展示,Then 会话树徽标与任务详情两侧均能识别该绑定(断言)
- Given 命名与血缘冲突(如手工改名会话),When 反查展示,Then 以血缘推断为准,命名仅作辅助展示
