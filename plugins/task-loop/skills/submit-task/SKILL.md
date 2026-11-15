---
name: submit-task
description: 通过 `submitTask` 结算你执行的任务——一段经得起审计的如实 summary，带验收判据的任务须逐条给 `ac_results` 证据，并按工作区提交规范（`AGENTS.md`）或常识性 Conventional Commits 附上 commit hash。在执行完任务简报并通过质量门后使用。
user-invocable: false
---

# 结算任务（Submit Task）

只结算你亲手执行的那个任务，以容器 `slug` + `local_id` 定位。只结算一次，且如实结算：`submitTask` 是 agent 唯一能离开 `in_progress` 的出口，而记录是一份审计工件。本技能讲的是工具无法替你做的判断：那些字段里*填什么*。

## 成功路径——组织记录

质量门序列与失败分诊在你的派发简报里，在那里执行。结算时，记录是结构化的——拆进各字段，不要把所有东西塞进自由文本：

- **`summary`**——一句话说明结果。它是记录的首行兼结果行：对照任务的 `brief`（"要达成什么"）说明目标是否及如何达成——评审者不看 diff 也该信这一行。只复述任务标题的 summary 即属失败的 summary。
- **`key_decisions`**——塑造结果的决策，作为独立数组（≤3 条：选了的方案而非备选、遵守的约束、划定的边界）。不要混进 `summary`。
- **`files_created` / `files_modified`**——实际改动的文件，正斜杠路径，按新建/修改分组（扁平 `files` 是并集形式；给分组，不给并集）。包含测试夹具与生成产物——这是供日后审计的 diff 清单。
- **`notes`**——自由语境补充（过程旁注、假设声明、范围外发现）。只承载叙述性内容，不承载证据：判定类事实一律走结构化字段，`notes` 里不埋门禁与 AC 结论。
- **`gate_*`**——跑了什么就报什么。不报没跑过的门，不把失败的门报成通过，不编造 coverage 数字。

### AC 证据——`ac_results` 单数组，逐项给，不要写成散文

带 `acceptance_criteria` 创建的任务，只有当 `gate_test: true` 站在一次叫得出名字的真实测试运行之上时才过证据门。每条标准以**单个数组** `ac_results` 逐项提交（旧 `ac_criteria` / `ac_met` / `ac_evidence` 三平行数组已退役——只给一个数组）：

```text
ac_results: [
  { criterion: "<判据原文——与任务定义逐字一致>", met: true, evidence: "<一行证据>" },
  ...
]
```

- `criterion`——标准字符串，与任务定义同序同措辞；
- `met`——每条标准一个布尔；
- `evidence`（可选）——每条标准一行证据：覆盖用例/命令 + 其结果（"AC-2 由 `dispatch-task.test.ts` 的 describe 块 'pool verdict' 覆盖——通过"）。证据输出过长时，按工件归档约定归档，叙述里只引用子目录路径。

数组与任务定义同数同序；任一条 `met: false` 即拒绝 success——要么补测试，要么以 blocked 结算并点名未覆盖的标准。

### 强制域结算——`runtime_face` 声明与证据两形

**强制域判定**（按交付物性质，不随 AC 文案漂移）：交付物含**运行期装配面**（进程、网络端点、真实调度/时钟、对外部系统/硬件的真实副作用）的任务属强制域——以 `runtime_face` 入参声明其面（`ui` / `api` / `cli` / `tui` / `desktop` / `web-server` / `mq` 为常见示例，非白名单；`library` / `sdk` / `pure-logic` / `docs` 声明豁免域）。旧 `runtime_surface` 参数已退役——误用会被拒并指认改传 `runtime_face`。

强制域任务结算时的口径——**证据两形二选一**：

- **取证完成形**：`runtime_evidence_face` + `runtime_evidence_artifacts`（真机取证工件归档路径：截图/trace/日志）。fake 契约测试全绿不算取证。
- **债务声明形**：`evidence_debt_suite` + `evidence_debt_specs`（可选 `evidence_debt_note`）——实现 + 单测绿、唯一缺口是真机取证时，声明欠账照常结算（实现态），欠账 test-run 任务由循环自动派生。前提如实：声明的只是「尚未取得的真机取证」，不是「不需要取证」。

两形各自可带一个可选 `*_note`（`runtime_evidence_note` / `evidence_debt_note`）——只写取证方式与环境说明/欠账缘由，语境性内容；判定事实不进 note。已取得取证证据的，同时在 `ac_results` 对应条目的 `evidence` 引用归档子目录路径。`result=success` 声明了 `runtime_face` 却两形皆缺，提交即被拒。

### 三类测试任务的证据口径

工作区测试策略文档（结算时探测常规约定目录）在场则遵从其细则，缺席不破环——本节正文自含结算判据，不硬编码任何仓内路径；项目特化由拆解期解析进任务简报。以下只谈结算口径，与工作区策略一致、不分叉：

- **旅程/契约任务（`test-gen-journeys` / `test-gen-contracts`）**：
  - `ac_results` 的 `evidence` 引契约路径（`proposals/<slug>/testing/<旅程名>/` 下的 journey.md 与 contracts/）；
  - 结算证据须列**覆盖的明确行为清单**并逐条标注**分层正当性**——每条旅程回答「为何值得一条 E2E、单元测试为何覆盖不了」（价值标准把门：空契约/恒真断言/单元测试可覆盖的旅程不可 success）。
- **脚本任务（`test-gen-scripts`）**：
  - `evidence` 引落盘的 spec 路径；每条断言须带**断言-契约溯源标注**（来源契约条目 id）；
  - 待实现锚已回填实锚并盖 `last_anchor_sync`；契约与实现不一致不上报调和、只走 fix/disc 链——就地调和不可 success。
- **test-runner 收口任务**：
  - 失败一律 `result=blocked`，归因三路——脚本产物 / 实现产物 / 契约文档；执行体不裁决分叉、不改任何一方产物。
  - 提案交付准绳 = **最终一次收口 `success`**——中间收口失败不算失败终点，处置后由新收口任务重跑。

### e2e 取证债——实现态部分结算，不为欠账 blocked

真机 e2e 断言取证是外部依赖装配面的结算门，但它不挂死实现卡：实现 + 单测绿、唯一缺口是真机 e2e 断言取证时，走债务声明形（见上节）照常 `success` 结算——欠账 test-run 任务由循环自动生成（依赖你的实现卡），取证在后继卡完成。前提如实：声明的只是「尚未取得的真机取证」，不是「不需要取证」；单测/门禁没绿就不许走这条路（那是 blocked）。

简报带 `E2E_BASELINE_RED` 行时：清单内 spec 的失败 = e2e 套件入场前既有失败，机械判定为非本任务回归——比对归因，不顺手修；只有清单外的新红灯才可能归因到你的改动。

### 结算清单

1. `submitTask` 前 **todo 全部 `completed`**——提交时不允许残留未关闭的 todo（两步以内的琐碎任务可整体跳过 todo 纪律）。
2. 工件落盘按 worker 基座「产物落盘」约定执行（目录结构与序号命名以该约定为正本）；结算增量：记录的叙述部分（summary/证据/notes）**只写子目录路径**，绝不粘贴大段内容。
3. `TASK_ID` 形如 `slug/local_id`——按斜杠拆开填入两个定位字段。
4. 结算回执列出验收判据时，用 `ac_results` 逐条核对回显（`ac_criteria` / `ac_met` / `ac_evidence` 三数组并行回显——与提交逐位对应）。

## 提交规范（两种状态）

结算前先提交，让 `commit_hash` 记录改动。适用哪套规范取决于工作区：

1. **存在带提交规范的 `AGENTS.md`** → 遵循它——消息格式、scope 词汇、暂存规则，凡它钉死的一律照办。
2. **无此类规范** → 退回常识性 Conventional Commits：`<type>(<scope>): <subject>`——subject 小写祈使句、72 字符内，type 取 `feat` / `fix` / `docs` / `test` / `refactor` / `chore`，scope 取被改动的包或层。

无论哪种：只暂存**显式文件路径**——绝不 `git add -A` / `git add .` / `git add --all`（大范围暂存会把无关改动卷进提交）；只提交与本任务相关的文件，绝不提交无关的既有改动。

**git 缺失**——若 `git` 不可用（命令不存在、不是仓库），不伪造 `commit_hash`：以 reason `git unavailable: <detail>` 结算 `result=blocked`，交给 fix 链或用户处理。

## Blocked 路径

`result=blocked`，`reason` 带具体原因，按简报的失败分诊归类（挺过约 3 次内联尝试的简单/瞬时问题，或复杂/复发问题——不要循环）。组织方式：你尝试了什么、什么失败了、拿什么证据（命令输出摘录、错误文本）。结算按固定三步次序执行：

1. **先提交**——把过质量门的完成部分 git commit（消息带任务键；暂存与提交规范同上「提交规范」节，不含过程文件）；
2. **再写 resume.md**——把 {forge.task_logs_dir}/resume.md 覆盖写为固定三段——「已完成（含 commit hash）／进行中／待办」，仅保留最新状态（commit hash 供接手 worker 从 hash diff 续跑不重做）；
3. **后结算**——`result=blocked`，`reason` 附 commit hash 与剩余范围描述。

**不自派 fix 任务**：任务派生权限归主会话与循环处置层——blocked 只如实结算（原因+证据），后继 fix 任务由处置方派生。执行会话调用 `addTask` 会被拒（`ERR_WORKER_ADDTASK_DENIED`）；这不是需要绕行的错误，是流程边界——正确动作就是本节的 blocked 结算。

修复完成后，其被阻塞的源任务自动恢复——`submitTask` 结果会列出已恢复的任务；无需再做任何事。

## 禁止操作

| 操作 | 原因 |
|---|---|
| 带着失败、未运行或无依据的门提交 `success` | 伪造记录 |
| 手工编辑状态——数据库、任务记录、索引 | 状态只能经 pipeline 动词变更 |
| 重复提交或流转已结算的任务 | 终态流转仅限人类 |
| 提交一个你没有执行的任务 | 只结算你跑过的东西 |

## 如果 submitTask 调用本身失败

错误文本会写明被违反的预期（缺 summary、`ac_results` 形状/条数不符、门只给了一半、`runtime_face` 缺证据两形）。按其所列修好输入后重试。若工具不可达，上报派发方或用户——绝不改用文件编辑作为变通。
