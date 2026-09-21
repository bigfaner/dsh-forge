---
feature: "dsh-forge-m2"
---

# User Stories: dsh-forge M2 — 需求与会话工作台

> 角色来源(prd-spec Background):SDD 开发者(作者本人/社区实践者)、双形态使用者(终端插件与应用交替)、多项目拥有者(社区实践者)。
> 主体模型约束:看板对人只读;任务状态变更由 agent 会话或终端执行。

## Story 1: 任务可视化浏览

**As a** SDD 开发者
**I want to** 在应用内以图形化看板查看项目的任务/依赖树、状态分组、worktree 标识与任务详情
**So that** 不依赖终端 `forge task list` 就能掌握 feature 全部任务的状态、依赖与执行记录

**Acceptance Criteria:**
- Given 已注册含 ≥10 个任务、含依赖关系的 forge 项目,When 打开任务看板,Then 依赖树图形化展示 blocker 关系,任务数/状态/依赖与 `forge task list` 输出一致
- Given 任务在非默认 worktree 有执行痕迹,When 查看该任务卡片/详情,Then worktree 标识可见
- Given 任务已有执行记录,When 打开任务详情,Then 描述、依赖链、执行记录均可读

---

## Story 2: 一键发起带任务上下文的会话

**As a** SDD 开发者
**I want to** 从任务卡片一次点击发起 dsh 会话,任务执行 prompt 自动注入
**So that** agent 直接按任务执行 prompt 开工,我不需要手工复制粘贴任务上下文

**Acceptance Criteria:**
- Given 任务处于可执行状态,When 点击任务卡片"发起会话",Then ≤1 次点击进入会话界面
- Given 会话已发起,When 查看 agent 收到的首条用户消息,Then 包含 `forge prompt get-by-task-id` 的完整输出,零手工粘贴
- Given 发起过会话,When 重启应用,Then 任务↔会话挂接关系仍然存在

---

## Story 3: 状态回流与来源标识

**As a** SDD 开发者
**I want to** 看板免手动刷新地看到 agent 在会话中的任务操作及其来源,并回溯历史挂接
**So that** 不盯终端也能掌握 agent 执行进展,知道每笔变更是谁做的

**Acceptance Criteria:**
- Given 挂接会话中 agent 即将执行任务操作,When agent 完成 claim,Then 看板 ≤5 秒内状态更新且该变更标记来源[会话]
- Given 终端侧执行了任务变更,When 查看看板,Then 该变更 ≤5 秒内可见且标记来源[终端]
- Given 一个任务历史上挂接过多个会话,When 查看任务详情,Then 历史挂接列表可回溯

---

## Story 4: 双形态一致

**As a** 双形态使用者(终端插件与应用交替)
**I want to** 终端/冻结插件与应用交替操作同一项目时互不破坏
**So that** 过渡期工作流可自由选择形态,不担心数据损坏

**Acceptance Criteria:**
- Given 终端侧刚完成一次任务状态变更,When 回到应用看板,Then ≤5 秒内可见,无需重启应用
- Given 应用侧挂接的会话刚完成任务操作,When 在终端执行 `forge task status`,Then 输出与看板一致
- Given 双形态交替各执行 ≥1 次变更,When 校验 forge 数据,Then 无第二事实源、无数据损坏(SC7 脚本断言)

---

## Story 5: 多项目管理

**As a** 多项目拥有者
**I want to** 注册多个 forge 项目并在应用内快速切换激活项目
**So that** 一套应用管理所有项目的需求与会话

**Acceptance Criteria:**
- Given 应用已有 1 个注册项目,When 注册第 2 个项目,Then ≤3 步完成(选代码根目录 → 选文档位置 → 完成)
- Given ≥2 个注册项目,When 切换激活项目,Then 看板/feature/挂接数据完整切换到目标项目
- Given 移除一个注册项目,When 移除完成,Then 项目仓内文件与 forge 数据不被改动(仅工作台注册信息删除)

---

## Story 6: feature 文档浏览与仓外文档

**As a** SDD 开发者
**I want to** 应用内浏览 feature 状态机与五类过程文档,并把过程文档放在仓外路径注册项目
**So that** 需求上下文应用内可查,过程资产不必进代码仓

**Acceptance Criteria:**
- Given 本仓含 dsh-forge-m1(completed),When 打开 feature 看板,Then 状态机显示正确,manifest/prd/design/ui/tasks 五类文档可读渲染
- Given forge 项目的过程文档位于仓外本地路径,When 以该路径注册,Then 看板/feature/文档功能完整,文档格式与仓内一致
- Given 注册向导中未显式选择仓外路径,Then 默认文档位置为仓内(外置默认关闭)
