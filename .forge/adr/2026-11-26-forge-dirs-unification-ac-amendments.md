# ADR：forge-dirs-unification 验收判据修订备案（6 条）

日期：2026-11-26
状态：已采纳（用户 2026-11-26 裁定：可以改判据，但必须备案，有充足的理由）
关联：Spec `forge-dirs-unification`；四路只读复核（Goal 1 到 8，基线 HEAD 1c6fe88e）

## 背景

Spec `forge-dirs-unification`（forge 系列目录根统一与声明合并登记）的 53 条验收判据在四轮实现与三轮评审之后做正式复核。复核逐条对照已提交代码，结论：

- 完全满足：Goal 2（13 条）、Goal 4（2 条）、Goal 5（4 条）、Goal 8（3 条）。
- 存在真实代码缺口：Goal 1、Goal 3、Goal 7 各有若干条——这些**不改判据，改代码**，已登记缺陷并派修复（bug 55ab9a8f、75cbf10f、14e3a500、a4e19672、0cb51984）。
- 判据文字本身与实现意图或彼此之间存在矛盾、或对现状的描述不准确：共 6 条，见下。前 5 条的实现已满足功能意图，未满足的是判据的字面；第 6 条是用户既有裁决的补充落实，由修复任务同步实现。本 ADR 为这 6 条修订留痕。

修订原则：只改与事实不符或自相矛盾的措辞，不放宽功能要求；每条给出证据。

## 决策

| # | 判据 | 原文（节选） | 修订后（节选） |
|---|---|---|---|
| 1 | Goal 1 AC11 | forge_dirs 与 task-loop 落盘使用**同一次解析**的结果 | 使用**同一解析函数与同一规范化口径**（两者分属互不 import 的插件，各自调用同一函数，同输入必同输出） |
| 2 | Goal 1 AC13 | 输出的**每个**绝对路径在磁盘上存在；**工作树会话与主检出会话**查到同一个任务运行时目录 | 除**按需创建的目录**（forge.project_runtime_dir、forge.task_runtime_dir、expert_squad.experts）外都在磁盘上存在，按需创建的目录逐条记录创建时机；**工作树路径与主检出路径经官方宿主的目录解析归拢到同一项目根与同一任务运行时目录** |
| 3 | Goal 3 AC8 | 现有测试的**断言保持不变**，只改引用来源 | 只改引用来源；**明示例外三处**（钉旧错误码的断言改新码；lib/path 自身新增测试随返回字段命名调整；task-loop 事件落盘用例随行为变更调整）。除此之外断言不改 |
| 4 | Goal 6 AC2 | 界面源码中**不存在写死的目录键清单** | **取数**不得写死目录键清单；显示与隐藏规则以界面层的隐藏集与行标签表表达，不属于取数键清单 |
| 5 | Goal 7 AC4 | **目标目录已存在且无完成标记时拒绝**执行（未区分两种处理） | **整目录搬迁**适用该检查；**运行时目录并入段不适用**（目标目录预先存在是并入的前提） |
| 6 | Goal 1 AC4 | forge.dossier_dir **依赖 forge.docs_root**、参数为 slug 与 localId | forge.dossier_dir **依赖 forge.spec_dir**、参数为 slug 与 localId（落在 `.forge/specs/{slug}/issues/{localId}`） |

## 理由

### 1. Goal 1 AC11「同一次解析」

- 事实：forge_dirs 由 project 插件注册，任务目录落盘由 task-loop 插件执行。两个插件之间零 import 是本方案的结构约束（结构测试 `tests/forge/structure.test.ts` 与各包 boundaries 测试把守）。它们无法共享同一次函数调用的返回值，只能各自调用 `lib/path` 的 `resolveProjectKey`。
- 该函数是纯函数：同一注入事实必得同一输出。要求「同一次」在结构上不可达，且比「同一函数同一口径」不提供任何额外保证。
- 证据：复核报告 Goal 1 AC11 歧义第 3 条；`lib/path/src/project-key.ts`。

### 2. Goal 1 AC13「每个路径存在」与「两个会话各自调工具」

- 按需创建是设计如此，不是缺陷。三个目录不在盘的原因（证据审计第 4 问，读源码得出）：
  - `forge.project_runtime_dir` 与其下的任务运行时目录：没有装配期的创建，首个 forge 事件落盘时（`plugins/task-loop/host/events/log-listener.ts` 约 80 行）或 worker 派发时（`assembly/default-assembly.ts` 约 153 行）才创建。
  - `expert_squad.experts`：只在 `recruit_expert` 写档时创建（`plugins/expert-squad/host/expert-squad` 的 `host/index.ts` 约 492 行），扫描侧只读目录。
  - 真机取证实测 12 条路径中 9 条在盘、3 条不在盘，恰为上述三个（`.forge/probes/forge-dirs-unification/4.2-web-r2/evidence-a/existence-manifest.json`）。
- 要求这些目录在首次使用前就存在，等于要求提前创建空目录，没有功能价值，且与「用完即清、按需创建」的既有口径相悖。
- 判据 (b) 的证据形态：在最终构建上，两个会话各自调用 forge_dirs 工具的输出经界面文本采集时会丢反斜杠，无法逐字比对（上一轮取证的教训，4.2-web 留档）；可逐字验证的是官方宿主的目录解析接口——工作树路径与主检出路径归拢到同一 projectId 与 projectRoot（`evidence-b/worktree-resolve.json`），而任务运行时目录是 projectRoot 的纯函数。因此接受「归拢到同一项目根与同一目录」作为等价证据。功能要求未放宽：仍是真机取证，仍不以单测代替。

### 3. Goal 3 AC8「断言不改」的三处例外

- 这条判据的目的是「收编 projectKey 计算不改变行为」。复核把测试 diff 里所有 expect 行的变动逐条分类，以下三处不是行为改变的掩护，各有独立且已获授权的成因：
  - 钉旧错误码 `ERR_SPEC_PROJECT_KEY_DERIVATION` 的两条断言改为新码：源于用户 2026-11-26 的裁定「连名字也删掉」，spec 的专属错误码随之退役（提交 d7dc23d3）。原授权已在当时给出，但未写进判据文字。
  - `lib/path/src/project-key.test.ts` 的字段名与期望值调整：该测试是本方案新增的（提交 ea4848a7），返回字段命名按「与现有归拢包装一致」的裁定从 projectKey/mainCheckoutPath 改为 key/mainRoot。它不是「现有测试」。
  - task-loop 事件落盘用例：会话目录缺席时的行为从「静默不记忆」改为「fail-loud 并说明缺少项目主检出」，这是 Goal 3 AC7 要求的行为变更，用例随之调整是必然结果。
- 把它们写成明示例外，比留一句不可能严格成立的「断言不改」更诚实，也防止以后有人以这条判据为由回退上述变更。
- 证据：复核报告 Goal 3 AC8 分类；`git diff 32642467~1..HEAD` 中 expect 行变动的逐条归类。

### 4. Goal 6 AC2 与 AC3 互斥

- AC3 要求界面显示固定的四个键、隐藏另一些键；AC2 要求界面源码里不存在写死的目录键清单。要显示一组确定的键，界面必然要有一份「显示哪些键」的规则。实现用「隐藏集 + 行标签白名单」表达这份规则（`plugins/project/ui/dock-tabs/overview/dir-rows.ts` 约 14 到 27 行）——复核据此判 AC2 字面未满足，同时指出 AC3 正是靠这份白名单才成立。
- 两条判据的本意是：**取值**必须来自目录事实服务、不得在界面里另行拼路径或另列一份键去查询；而不是禁止界面表达显示规则。把「取数」与「显示规则」分开写，消除互斥，功能要求不变（取值仍来自服务，显示键集合仍是确定的）。
- 证据：复核报告 Goal 6 与歧义第 1 条。

### 5. Goal 7 AC4 两种处理未区分

- 迁移段对两类对象做两种事：用户层专家目录是**整目录搬迁**（目标不存在时才搬，目标已在场且无完成标记说明有来历不明的数据，应拒绝）；运行时目录是**并入**（把工作树命名的目录里的日志并进以 projectKey 命名的目录，后者在迁移前已存在是常态——正常使用就会创建它）。
- 原判据把「目标已在场则拒绝」一体适用于两种处理。对并入段照字面执行，会让迁移在正常情况下被拒绝，与「并入」本身矛盾。Spec §2.8 的规则表没有区分这两者，是判据的疏漏。
- 实现现状：experts 搬迁段已实现该检查（`scripts/migrate-state-db.mjs` 约 1776 行），并入段没有。修订后实现与判据一致，不需要改代码。
- 证据：复核报告 Goal 7 AC4 与歧义第 2 条。

### 6. Goal 1 AC4「forge.dossier_dir 依赖 forge.docs_root」

- 该条判据把任务报告卷宗目录定义在文档根下（`docs/proposals/{slug}/issues/{localId}`），沿用提案域下线前的口径。用户 2026-11-25 已明确裁决：「`.forge/docs/proposals/{slug}/issues/{localId}` 更改为 `.forge/specs/{slug}/issues/{localId}`；以后 specs 替代 proposals」。当时该裁决落到了 task-loop 的结算报告回收钩子，目录注册表里的目的地漏改，形成工具报的位置与报告实际位置不一致（bug 14e3a500）。
- 修复把 `forge.dossier_dir` 改为依赖 `forge.spec_dir`（`{工作区}/.forge/specs/{slug}`）、模板 `issues/{localId}`，与回收钩子逐字一致。判据若不同步，修复落地即判不满足，形成「按用户裁决修反而验收不过」的矛盾。
- 这是用户既有裁决的补充落实，不是本次新做的取舍；功能要求（卷宗位置唯一、工具与实现一致）不变。
- 证据：bug 14e3a500；`lib/path/src/forge-dirs.ts` 的 forge.dossier_dir 条目；`plugins/task-loop/host/assembly/tool-family.ts` 约 286 行。

## 影响

- 验收口径：以上 6 条按修订后文字判定；其余 47 条不变。
- 不改实现的：第 1、3、4、5 条——实现已满足修订后的判据。第 6 条由修复任务同步实现（bug 14e3a500）。
- 需要真机补证的：第 2 条的后半（归拢证据）在最终构建上已有（4.2-web-r2）；若后续构建再变，需随构建重取。
- 不受本 ADR 影响、仍按原判据修复的：Goal 1 AC11 的规范化缺口（bug 55ab9a8f）、Goal 3 AC7 的报错措辞（bug 75cbf10f）、Goal 3 AC3 的本地包装重名（任务 7.1）。
- 未修订但已知的近似问题，另案处理：旧包 `packages/plugin-forge` 仍含推式登记缝与旧工具实现的残留（已从编译与测试配置摘出，等待整体退役）；`rescue-task-loop` 技能文档的 dest 示例值过时（bug a4e19672）。
