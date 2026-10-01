---
feature: "dsh-forge P1（MVP）：走线架 + 知识飞轮第一圈"
---

# User Stories: dsh-forge P1（MVP）：走线架 + 知识飞轮第一圈

> 角色 derives from PRD Background：单人开发者（唯一人类用户）；dsh agent 会话为系统协作者（非用户故事角色，其行为经 Story 4 的系统侧断言覆盖）。

## Story 1: 注册我的代码项目

**As a** 单人开发者
**I want to** 经文件浏览器选定工作区目录、在注册表单确认 forge 目录与知识库目录（默认值或改选）后把项目注册进工作台，且确认前随时可以取消
**So that** dsh 会话与知识库能挂在项目上，我获得统一的 AI Coding 工作主场

**Acceptance Criteria:**

- Given 零项目的首用状态（hero 空态）
- When 经文件浏览器选定工作区目录（已注册目录带标记）、在注册表单点「确认」
- Then 左栏出现该项目及其 dsh 会话列表（实时读 dsh 账本，零副本），注册记录落应用数据库（含 workspace 外键）

- Given 注册流程进行中（文件浏览器或注册表单任一段）
- When 取消（返回上一步或直接关闭）
- Then 干净退出：未调用 dsh create，dsh 侧与应用侧均无残留（无副作用、无补偿动作）

- Given 本次为同路径重复注册（canonical path 命中既有工作区，幂等挂接）
- When 后续任一步骤失败
- Then 既有工作区不被删除（ownership 保护——幂等命中不是本次新建，不得误删）

- Given 本次为新建工作区且应用库写入步骤失败（模拟）
- When 失败发生
- Then dsh 侧本次新建的工作区被补偿删除（无孤儿注册），目录与会话日志保留，且重复补偿为 no-op（幂等）

---

## Story 2: 在原生工作台进行真实 dsh 会话

**As a** 单人开发者
**I want to** 在中区会话面板发起真实 dsh 会话、恢复既有会话，并在切换项目/视图时不丢失面板状态
**So that** 工作台成为我的 AI Coding 日常主场，不再在上游 home 与工具之间来回切换

**Acceptance Criteria:**

- Given 已注册项目
- When 从工作台发起一个新会话并发送消息
- Then 完成一次真实 agent 往返（e2e 断言：回答呈现于对话 tab）

- Given 存在历史会话
- When 在左栏打开它
- Then 其转录完整呈现（恢复链路 e2e 断言）

- Given 右栏 dock 已展开、知识视图可进入
- When 切换到知识库视图再切回，或切换项目
- Then 知识模式下右栏隐藏且面板状态保留、切回即恢复；dock 可见页签集随项目切换且不打断面板

---

## Story 3: 浏览项目知识库

**As a** 单人开发者
**I want to** 在知识库一等公民视图中按域目录树过滤、浏览知识卡片并打开详情抽屉
**So that** 我能随时查看团队/自己沉淀的知识资产及其使用热度

**Acceptance Criteria:**

- Given 知识目录中有分域组织的前端/后端知识文件（frontmatter 合规）
- When 在浏览页签选择前端域
- Then 仅前端域知识出现在卡片网格（域前缀过滤正确，e2e 断言）

- Given 知识文件含 frontmatter（摘要/关键词/状态/时间等）与正文
- When 点开一张卡片
- Then 详情抽屉呈现摘要块 + 两列元数据 + Markdown 正文，正文区不含 frontmatter（e2e 断言）

- Given 某知识被会话召回过 N 次
- When 查看其卡片或详情
- Then 热度展示与使用事件计数一致（断言）

---

## Story 4: agent 自动召回知识并留下使用痕迹

**As a** 单人开发者
**I want to** agent 在会话中遇到项目问题时自动检索知识库（agentic search），并把每次召回记录下来
**So that** 知识真正被复用，且我能看到「哪些知识在哪些会话被用了」（飞轮第一圈转起来）

**Acceptance Criteria:**

- Given 项目已配置知识目录，会话已建立
- When 检查该会话的系统提示词
- Then 含最简知识段：知识库存在、召回流程指引（先 search 相应域、摘要先行、按需 read-abstract）与工具说明（断言）

- Given 会话中我提出一个前端域的项目问题
- When agent 处理
- Then agent 自主完成 `search` → `read-abstract` 多步检索链（agentic search，e2e 断言），回答基于命中知识

- Given 一次召回发生
- When 召回执行
- Then 使用事件落状态层（事件表可查），会话知识召回 tab 出现对应条目且与事件数据一致，知识卡片热度 +1（断言）

---
