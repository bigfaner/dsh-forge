# 提案：循环消息收敛飞轮硬化 wave2（loop-consol-flywheel-hardening）

- **parent_proposal_id**: loop-consol-flywheel-improvement（注册时由 createProposal 填写源提案 id）
- 来源：loop-consol-flywheel-improvement first-pass 复盘（任务 1.9）

## 1. 背景与指标

first-pass 快照：一次通过率 1、返工增量比 0.0%、**修正波次 19（≥ 阈值 6，越阈）**、fix 密度 55.6%。

结构性返工连续两轮保持 0（评审前置有效）；本轮恶化集中在**真机取证面**——修正波次与 fix 密度的增量主要产生于取证环境干扰（夹具内归属模型自主处置）与探针方法返工（仪表化引发错误风暴），非产品码缺陷密度上升。本轮取取证方法视角改进。

## 2. 改进项

### 2.1 真机走查预案的状态窗口保障（压修正波次）

- 翻车点：1.5 三轮走查均无法稳定捕获 suspended/终态徽标——归属模型对 followup 消息自作处置（`taskStats` 误判、`stopTaskLoop` 停循环、自行 `dispatchTask` 重启），002 轮 8 分钟 103 次回翻；已尝试的压制（模型切换、owner 轮掐断）均不彻底。
- 改进：走查编排纪律新增一条——凡断言依赖**状态窗口稳定**的真机走查（三态徽标、进度态等），预案必须声明归属模型约束方式（强指令遵循模型档，或人工值守会话 + 暂停 ask 应答路径），未声明 = 走查前整改。
- 落点：`packages/plugin-forge/experts/test-runner.md`「执行约束」段 +1（走查编排纪律的现役承载面——run-tests 技能已退役，本项不再引用技能面，直接落档案正文）。

### 2.2 CDP 探针先零仪表化对照（压探针方法返工）

- 翻车点：1.4 仪表化 v1（patch scrollTop setter，defineProperty 自有属性）引发官方渲染器错误风暴（2419 例）并阻断组卡渲染，一轮探测整轮作废。
- 改进：CDP 探针脚本规范新增——凡需观测官方组件内部行为的探针，第一轮必须为零仪表化对照轮（确认基线行为与脚本侧无害），仪表化只能在对照轮之后叠加。
- 落点：`AGENTS.md` §2「CDP 调试脚本统一放 `cdp/` 目录」条目扩一句纪律（或其引用的 cdp 规范正本，以评审定落点）。

### 2.3 等效证据口径 convention 晋升裁决

- `.knowledge/conventions/equivalent-evidence-over-visual-artifact.md` 与 `.knowledge/conventions/review-note-deferred-fact-backfill-gate.md` 申请晋升 `docs/conventions/` 正本（随本提案裁决，不直改技能检查项之外的正本）。前者已在本特性 1.5 走查被主会话终裁实际采用（AC4 等效证据口径），具备晋升事实基础。

#### 2.4 实施过程复盘提取（主会话全程复盘 2026-10-29）

#### 2.4.1 官方 view Definition 增量契约前置核销（withdrew 三连翻车的根治）

- 翻车点：组卡接管 progress 渲染后连续三个 bug（b4861a60 → 79589cd8 复发 → 才彻底收敛；台账核销：两主记录在册，修复落在复发记录 bffcbe63/80b3f129 @ 0c48a365 与 f511c6a7 @ 0520e5ab，两主记录终态未回填属台账欠账）——根因是接线的 definition 违反官方契约「已物化 Context 的 buildViewNode 回 null = withdrew materialized target」（dsh-client-ui-conversation client.js:2505），该契约在首次接线时未被核销，症状先被误判为面板问题，两轮修复才定罪。
- 改进：①契约沉淀 lesson（「物化后不得回 null，hidden 同 key 同 id 保底」+ 先例 client.js:17082）入 `.knowledge/`；②review-proposal 检查项 +1——凡提案含「新增/改造 conversation view definition」类任务，AC 必含该契约核销项与 withdrew=0 断言。
- 落点：`.knowledge/lessons/`（新 lesson）、`packages/plugin-forge/experts/proposal-reviewer.md` 档案正文（review-proposal 技能已随 expert-squad-forge-2 退役，提案评审职责由该档案承接；原 D3 决策点就此定案，不再单列裁决）。

#### 2.4.2 接管型改造的旧渲染面退役清单（双轨渲染根治）

- 翻车点：1.9 组卡接管 progress 渲染，1.17 遗留 forgeProgressDefinition 注册面未退役 → 双轨渲染 + 成对重复（bug 60461fc5），评审后才定罪。
- 改进：quick-tasks 拆解检查项 +1——凡「接管型改造」任务（新渲染面/新机械替换旧面），AC 必含「旧面退役清单」（旧注册符/组件/发布位 grep 清零），不得只写新面交付。
- 落点：`packages/plugin-forge/skills/quick-tasks/SKILL.md`。

#### 2.4.3 结算声称与台账核验闭环

- 翻车点：1.12 worker 摘要声称「已 resolveBug(fixed)」，台账实际仍 open（主会话核验后补回填）——结算摘要声称的动作与实际执行脱钩。
- 改进：submit-task 纪律 +1——结算摘要声称的台账动词（recordBug/resolveBug/checkpoint）必须实际生效；落法走工具行为层（submitTask 结算时对摘要中出现的台账动词做生效性回查，不符即退回），技能文本只承载判断面，不落「请模型自觉」式抽查。
- 落点：`packages/plugin-forge/skills/submit-task/SKILL.md`。

#### 2.4.4 blocked 裁决-恢复的空转链（机械层欠账，转机械提案）

- 翻车点：blocked 任务经主会话裁决修订 AC 后无轻量恢复原语，每轮被迫立「确认口径在场并触发恢复」的 validation 空转任务（本提案链上 4 次：fix-6/9/10/11 同构）。
- 改进（机械层）：updateTask 修订 blocked 任务 AC 时支持同事务「裁决即恢复」（blocked→pending 附裁决引用），或提供主会话轻量 restore 动词——属 forge 管线机械增强，**远征量级，转独立机械提案**（本提案仅立项不实施）。
- 落点：独立机械提案（出栈登记，随本提案裁决确认转出）。

#### 2.4.5 拆解 scope 伴随件默认纳入

- 翻车点：多任务实际改动超出声明 scope（伴随 css/test/装配面/发布位系统性漏声明）——非越权夹带，纯拆解期核实遗漏。
- 改进：quick-tasks 拆解 scope 模板 +1——scope 清单默认纳入「伴随件」（同目录 css/同名 test/注册与发布面），与 2.4.2 同源同落点。
- 落点：`packages/plugin-forge/skills/quick-tasks/SKILL.md`（与 2.4.2 合并一条）。

#### 2.4.6 用户可见文本形态决策前置收敛

- 翻车点：结算/唤醒消息文本形态经历三轮补裁（按 slug → 分组 → 不过简 + 示例定稿），核心任务 1.1 两次暂停重派改简报——微文案类决策未在访谈期出样稿定稿。
- 改进：grilling/quick-tasks 访谈清单 +1——凡交付物含「用户可见文本」（消息模板/徽标文案/状态词），访谈期必须出样稿并请用户过目定稿，派发后微调走 fix 链不再暂停重派。
- 落点：`resources/runtime/.../skills-blitz/grilling`（突击包访谈清单）与 quick-tasks SKILL.md 各 +1。
  - 落点实核修订（评审 Q1）：grilling 实际在 `packages/plugin-forge/skills-blitz/grilling/SKILL.md`（:32-39 事实查证清单为挂点）；quick-tasks 侧挂第 0 步澄清（同文件 :12 起），不设独立「访谈清单」节。

#### 2.4.7 产品侧 polish backlog（随本提案裁决去留）

- hidden 节点挂载语义核销（官方对 visibility:'hidden' 节点是否 mount 组件——影响 tail-keep 效应税）
- anchorSeq 兜底回 0 的排序安全面核销（state 淘汰 + seq 缺席组合）
- 纯 progress 组组头时间范围缺显；混合组时间范围/计数两口径微差
- 组卡「ForgeProgressNode 同型」悬空注释清理（参照文件已删）
- loop/blocked-pool 三态归属（running vs suspended）映射复核
- **形式化验证发现（2026-10-29，模型与逐条论证见 `verification/model.md` + `findings.md`）**：
  - CE-6（minor，bug 5a245dd1）：pause 径唤醒绕过 wakeupKeys 去重——**已收敛**（fixed @ cf543388；其后去重语义又两轮演进：2055da00 去重键过粗 @ 296ab202、40e3201b pause 径复发 @ cf543388，均 fixed）。不再是待办，仅留档（findings.md §6 已加收敛后记）。
  - DEV-3（bug e4b2d921）：dispose/异常终局遗留 loopSourced in_progress 任务有界滞留（adopt 只领 interrupted），以装配重启为界自愈——**定轨已裁决：reconcile 对账扩展**（判据从装配期扩展到可按需触发时点，不触碰已验证的摘牌/真化配对不变量；两案对比见 findings.md §3），属管线状态机机械小改，从产品 polish backlog 摘出单独定轨交付。
  - 其余 6 条不变量（会话单活/源独占/幂等重入/防线粘住/渲染契约/恢复活性）验证通过，未发现正确性级反例。
- 上述各项互相独立、均为小改，随本提案裁决整体纳入或转出（不另立提案）。

### 2.5 待用户裁决清单

| # | 决策点 | 备选 | 裁决（2026-10-31，联合评审后用户裁决） |
|---|---|---|---|
| D1 | 2.2 落点形态 | AGENTS.md 内扩一句（轻）；或独立 cdp 探针规范正本（重） | **AGENTS.md 扩句**，判例留 knowledge |
| D2 | 2.3 双 convention 晋升 | 两件均晋升 / 仅一件 / 均留 .knowledge | **两件均晋升**（走查工件路径泛化为判据） |
| D3 | 2.4.1 检查项落点 | — | **已定案**：随技能退役事实落 `experts/proposal-reviewer.md` 档案正文 |
| D4 | 2.4.4 恢复原语转出 | 立独立机械提案 / 暂缓 | **立独立机械提案** |
| D5 | 2.4.7 产品 polish backlog | 随本提案整体纳入 / 转出 | **整体纳入，唯 DEV-3 摘出单独定轨**（管线状态机机械，随裁决采 reconcile 对账扩展） |

## 3. 改动范围（file 粒度）

- `packages/plugin-forge/experts/test-runner.md`（「执行约束」段状态窗口约束 +1）
- `AGENTS.md`（CDP 探针零仪表化对照纪律 +1 句）
- `docs/conventions/`（晋升后的正本，若 2.3 获裁）
- `.knowledge/lessons/`（withdrew 增量契约 lesson 新增，2.4.1）
- `packages/plugin-forge/experts/proposal-reviewer.md`（withdrew 契约检查项 +1，2.4.1，落点随退役事实修订）
- `packages/plugin-forge/skills/quick-tasks/SKILL.md`（接管型退役清单 + 伴随件 scope 模板，2.4.2/2.4.5）
- `packages/plugin-forge/skills/submit-task/SKILL.md`（台账核验闭环 +1，2.4.3）
- grilling / quick-tasks 访谈清单（用户可见文本样稿定稿前置，2.4.6）
- 恢复原语机械提案（2.4.4 转出，随裁决登记）
- 产品 polish backlog（2.4.7，apps/web 渲染面小改，随 D5 裁决），含形式化验证发现两项（见下）
- 验证产物：`verification/model.md` + `findings.md`（状态机模型、8 条不变量逐条论证）

## 4. 验收标准

1. 状态窗口稳定约束落 `experts/test-runner.md`「执行约束」段（归属模型约束方式声明为前置）。
2. CDP 探针零仪表化对照纪律落在裁决确定的正本位置。
3. 2.3 裁决结果（晋升/不晋升，逐件）落档。
4. 2.4.2/2.4.3/2.4.5 检查项/模板落档于既定落点文件；2.4.6 落档于实核落点（`skills-blitz/grilling/SKILL.md` + quick-tasks 第 0 步澄清）；2.4.1 落 `experts/proposal-reviewer.md`。
5. 2.4.4 转出登记落档（独立机械提案 slug）。
6. 2.4.7 backlog 逐项落档：CE-6 留档不交付；DEV-3 按 reconcile 对账扩展单独定轨交付（含真机取证）；其余纳入项各有小改交付与真机取证。

## 5. 裁决台账

| # | 决策点 | 裁决 | 日期 |
|---|---|---|---|
| 提案裁决 | accept | **accepted**（联合评审 Blocker 0 后修订收口，用户裁决采纳全部 D 项倾向） | 2026-10-31 |
| D1 | CDP 纪律落点 | AGENTS.md §2 cdp 条目扩句 | 2026-10-31 |
| D2 | 双 convention 晋升 | 两件均晋升 `docs/conventions/` | 2026-10-31 |
| D4 | 恢复原语 | 立独立机械提案 | 2026-10-31 |
| D5 + DEV-3 定轨 | backlog 去留 | 整体纳入；DEV-3 摘出，采 reconcile 对账扩展 | 2026-10-31 |

## 指标对比附录（飞轮派生提案必带）

| 指标 | 基线（本提案注册时） | 目标 |
|---|---|---|
| 修正波次 | 19（越阈，阈值 6） | < 6 |
| fix 密度 | 55.6% | 下降 |
| 一次通过率 | 1 | 保持 1 |
| 返工增量比 | 0.0% | 保持 0.0% |
