---
name: submit-task
description: 通过 `submitTask` 结算你执行的任务——一段经得起审计的如实 summary，带 AC 的任务须引用测试证据，并按工作区提交规范（`AGENTS.md`）或常识性 Conventional Commits 附上 commit hash。在执行完任务简报并通过质量门后使用。
user-invocable: false
---

# 结算任务（Submit Task）

只结算你亲手执行的那个任务，以容器 `slug` + `local_id` 定位。只结算一次，且如实结算：
`submitTask` 是 agent 唯一能离开 `in_progress` 的出口，而记录是一份审计工件。工具负责
执行机制——各路径要求哪些字段、gate 布尔量的全有或全无、AC 证据门、gate 任务的
summary——所以本技能讲的是工具无法替你做的判断：那些字段里*填什么*。

## 成功路径——组织记录

质量门序列与失败分诊在你的派发简报里，在那里执行。结算时，记录是结构化的——拆进各
字段，不要把所有东西塞进自由文本：

- **`summary`**——一句话说明结果。它是记录的首行兼结果行：对照任务的 `GOAL`
  （"要达成什么"）说明目标是否及如何达成——评审者不看 diff 也该信这一行。只复述任务
  标题的 summary 即属失败的 summary。
- **`key_decisions`**——塑造结果的决策，作为独立数组（≤3 条：选了的方案而非备选、
  遵守的约束、划定的边界）。不要混进 `summary`。
- **`files_created` / `files_modified`**——实际改动的文件，正斜杠路径，按新建/修改
  分组（扁平 `files` 是并集形式；给分组，不给并集）。包含测试夹具与生成产物——这是
  供日后审计的 diff 清单。
- **`gate_*`**——跑了什么就报什么。不报没跑过的门，不把失败的门报成通过，不编造
  coverage 数字。

### AC 证据——逐条给，不要写成散文

带 `acceptance_criteria` 创建的任务，只有当 `gate_test: true` 站在一次叫得出名字的真实
测试运行之上时才过证据门。每条标准以三元组提交到配对数组 `ac_criteria` / `ac_met` /
`ac_evidence`：

- `ac_criteria`——标准字符串，与任务定义同序同措辞（工具会用定义侧交叉核对镜像）；
- `ac_met`——每条标准一个布尔（带任何 `false` 的 `success` 会被拒绝）；
- `ac_evidence`——每条标准一行证据：覆盖用例/命令 + 其结果（"AC-2 由
  `dispatch-task.test.ts` 的 describe 块 'pool verdict' 覆盖——通过"）。证据输出过长时，
  按工件归档约定归档，叙述里只引用子目录路径。某条 AC 没有覆盖测试即不构成 success——
  要么补测试，要么以 blocked 结算并点名未覆盖的标准。

### 结算清单

1. `submitTask` 前 **todo 全部 `completed`**——提交时不允许残留未关闭的 todo
   （两步以内的琐碎任务可整体跳过 todo 纪律）。
2. 应用工件约定：截图、超长命令输出、探针产物 →
   `logs/{slug}/{task-local-id}/{NNN-issue-key}/`（工作区派生目录下；每任务一目录、
   每事件一子目录，NNN 三位序号按轮追加命名、永不覆盖；细则见该证据目录内 README）——记录
   的叙述部分（summary/证据/notes）**只写子目录路径**，绝不粘贴大段内容。
3. `TASK_ID` 形如 `slug/local_id`——按斜杠拆开填入两个定位字段。
4. 简报列出类型族记录字段时如实填写（doc 族：`referencedDocs` / `reviewStatus` /
   `docMetrics`；test 族：`casesGenerated` / `casesEvaluated` / `scriptsCreated` /
   `testResults`；validation 族：`validationPassed` / `issuesFound`；gate 族：
   `gateChecks`）。

## 提交规范（两种状态）

结算前先提交，让 `commit_hash` 记录改动。适用哪套规范取决于工作区：

1. **存在带提交规范的 `AGENTS.md`** → 遵循它——消息格式、scope 词汇、暂存规则，凡它
   钉死的一律照办。
2. **无此类规范** → 退回常识性 Conventional Commits：
   `<type>(<scope>): <subject>`——subject 小写祈使句、72 字符内，type 取 `feat` /
   `fix` / `docs` / `test` / `refactor` / `chore`，scope 取被改动的包或层。

无论哪种：只暂存**显式文件路径**——绝不 `git add -A` / `git add .` /
`git add --all`（大范围暂存会把无关改动卷进提交）；只提交与本任务相关的文件，绝不提交
无关的既有改动。

**git 缺失**——若 `git` 不可用（命令不存在、不是仓库），不伪造 `commit_hash`：以
reason `git unavailable: <detail>` 结算 `result=blocked`，交给 fix 链或用户处理。状态层
本身从不依赖 git。

## Blocked 路径

`result=blocked`，`reason` 带具体原因，按简报的失败分诊归类（挺过约 3 次内联尝试的
简单/瞬时问题，或复杂/复发问题——不要循环）。组织方式：你尝试了什么、什么失败了、
拿什么证据（命令输出摘录、错误文本）。通常紧随其后派生 fix 任务——fix 链协议正本在
run-tasks 技能中。

修复完成后，其被阻塞的源任务自动恢复——`submitTask` 结果会列出已恢复的任务；无需
再做任何事。

## 禁止操作

| 操作 | 原因 |
|---|---|
| 带着失败、未运行或无依据的门提交 `success` | 伪造记录 |
| 手工编辑状态——数据库、任务记录、索引 | 状态只能经 pipeline 动词变更 |
| 重复提交或流转已结算的任务 | 终态流转仅限人类 |
| 提交一个你没有执行的任务 | 只结算你跑过的东西 |

## 如果 submitTask 调用本身失败

错误文本会写明被违反的预期（缺 summary、标准/AC 证据不匹配、门只给了一半）。按其
所列修好输入后重试。若工具不可达，上报派发方或用户——绝不改用文件编辑作为变通。

