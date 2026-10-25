# forge-verification-hardening proposal.md — 一致性终审清单

评审对象：`proposals/forge-verification-hardening/proposal.md`（261 行）
评审口径：逻辑一致性 / 术语一致性 / 图文一致 / 历史残留。不评需求与方案本身。

## 结论

**不放行**。发现矛盾 4、术语漂移 3、计数错 1。核心问题是「收口标记」的时点与载体在 §2 内自相矛盾（M5 定义 vs 标记表纯净性约束 vs 生命周期图 vs 时序图），须在裁决前修齐。

---

## A. 矛盾（逻辑断言冲突）

### A1. 收口标记的载体：携带产物引用 vs 纯净表零业务引用字段
- L77：「收口标记：容器全部任务完成（含复盘任务）时打收口标记——容器记录终态时间戳与**复盘产物引用**（knowledge entry_id 清单）」。
- L83：container_marks 表为「**纯净里程碑表**……**零业务引用字段**」。
- L88：retro-done 的 knowledge entry_id 清单「**不入标记表**——纯净表无例外」。
- 矛盾：若收口标记落 container_marks（全文唯一标记持久层），其「产物引用」违反零业务引用约束；若不落该表，则 L100「标记为只追加事件……随容器状态持久化」未覆盖收口标记，且全文未给收口标记任何落点。L197 总图「记录点」清单中也没有收口标记的归属（MK/TR/KN/PR/BL/WK 六项均非收口本体）。
- 需修：明确收口标记落点（容器状态字段 or 标记表第六行 or 复盘任务结算记录），并消除与「纯净表无例外」的冲突。

### A2. 收口标记的时点：retro 后即打 vs 容器尚未终态 vs 越阈阻断
- L77/L133（时序图末行）：复盘结算后即「L→L: 收口标记」。
- L172：越阈且未注册改进提案时「**容器不打收口标记**」——但时序图中收口标记画在 alt 块**之外**，无条件执行；图文冲突。
- 生命周期图 L104-116：RetroDone 之后还有 Waves → Stabilized → Merged，容器在此之后才终态。retro 后即打「**终态**时间戳」与「终态」语义冲突（此时容器还有后续波次与合并）。
- L77 定义「收口」= 容器终态（打收口标记），而打点时点却不在终态。
- 需修：统一收口标记时点（建议：全部任务完成且无越阈阻断时打，或改名为 retro 完成标记），同步修 L133 时序图。

### A3. 走查会/返工波与 first-pass 的先后次序冲突
- M2 L61：真机走查会 = 「**批次末**显式任务（任务拆解时建）」，其裁决引发返工波（review-wave-N）。
- M5 L87：first-pass-complete = 任务循环「首次无可派任务（**全部任务**完成）」——走查会任务也是任务，first-pass 必然晚于走查会及其返工波。
- 但生命周期图 L110-111：`RetroDone --> Waves`——review-wave-N 打点画在**复盘之后**；时序图 L125-133 同序（先 first-pass 打点、派生复盘，无 waves 打点）。
- 矛盾：按 M2 时序，waves（走查返工）发生在 first-pass 之前；按生命周期图，waves 发生在 retro 之后。两图与正文无法同时成立。
- 需修：明确批次末走查会 → 返工波 → first-pass → 复盘 的真实次序，重排 stateDiagram 与 sequenceDiagram。

### A4. M4「批次末文档门」无 AC 覆盖
- L72：doc-review 改为「批次末强制门：规格文档/实现口径/摘要**三方一致性在批次内清零**」。
- §4 中 AC4（L251）只覆盖 M4 的裁决转向收口（旧口径回改 + 处置清单），**未覆盖** doc-review 批次末强制门。§1↔§4 对应关系缺一角：该机制点无验收来源。
- （反向核查：其余 M1-M7 各点均有 AC 对应，见附录映射表，唯此点落空。）

---

## B. 术语漂移（同概念异词 / 同词异义）

### B1.「收口」一词违反自设约定
- L77 自定术语约定：「『收口』**只指容器终态**（打收口标记）」。
- L12：「存在『**任务循环收口**』时点的工作流」；L14：「无**循环收口**点」——两处用「收口」指任务循环的 first-pass 时点，正是约定禁止的混用（first-pass ≠ 收口）。
- 需修：L12/L14 改用「first-pass」或「循环尾」。

### B2.「循环尾」vs「first-pass 且代码 review 结束后」
- 标题 L74 与图 L25/L125 用「循环尾/first-pass」；正文 L76、L135 两次写「first-pass **且代码 review 结束后**」。图中无「代码 review」节点，两口径不同（first-pass 时代码 review 可能未结束）。属增补残留：后加的 review 前置条件未回写进图与标题。
- 需修：统一为一个口径并同步图。

### B3.「复盘任务」派生条件重复定义（残留）
- L76 与 L135 各写一遍派生条件与多 agent 交叉核验，两段文字重叠约 80%（「多 agent 交叉核验」L76 括注 vs L135 整段展开）。同概念双口径并存，是多轮增补的典型残留；且 L76 用省略路径 `src/…/driver.ts`、§3 用 `src/loop/driver.ts`，同文件两种写法。
- 需修：合并为一段，路径统一。

---

## C. 计数错

### C1.「四处最小机械」实为五处编号
- L260：「**四处**最小机械（container_marks 纯净里程碑表、proposals 承接字段、循环尾复盘任务派生、submitTask 取证校验兜底）」——列举 4 项，但 §3 机械层编号为 ①②③④⑤ 五组，**④ review-wave-N 打点（settle.ts）被遗漏**，未归入任何域职责句（「标记域管度量、提案域管承接、派发域管强制」也无法覆盖 settle 打点）。要么改「五处」，要么说明 ④ 并入某域。
- 其余计数核对无误：七类强制域（L48=AC1）、五类标记（L86-91=AC6）、四项硬指标（L95-98=L162）、三类沉淀（L139-143=AC5）、三判例（L152-154=AC7）、三技能（L203=AC8）。

---

## 附录：§1 根因 / §2 机制 / §3 落点 / §4 AC 映射

| 根因(§1) | 机制(§2) | 落点(§3) | AC(§4) | 覆盖 |
|---|---|---|---|---|
| 根因1 验收门缺真机 | M1 | write-prd / submit-task / submit.ts(⑤) | AC1、AC10 | ✅ |
| 根因2 判定者错位 | M2 | write-prd / review-prd / quick-tasks | AC2 | ✅ |
| 根因3 官方核销不足 | M3 | review-tech / tech-design | AC3 | ✅ |
| 根因4 经验不回灌 | M4+M5 | review-prd / driver.ts(③) / 知识直写 | AC4、AC5 | ⚠️ M4 文档门半覆盖（A4） |
| —（新增度量） | M5 标记体系 | migrations/container-marks/settle(①④) | AC6 | ✅ |
| 判例制度化 | M6 | write-prd / review-prd | AC7 | ✅ |
| 飞轮 | M7 | proposals(②) / 工具透传 | AC9 | ✅ |
| 双模式 | 突击同步 | grilling / quick-tasks / review-proposal | AC8 | ✅ |

AC 反向逐条有机制来源，无孤儿 AC。§3 每个落点文件均归属编号机制（①-⑤ 标注齐全）；skill 路径经 glob 核销真实存在（含 skills-blitz/grilling、src/loop/driver.ts）。

## 附录：术语表核对结果

稳定无漂移：强制域/豁免域、主交付面、取证/取证方式/取证环境、官方核销（记录）、里程碑标记、evidence_debt、first-pass-complete 等 5 个标记名、lessons/examples/conventions、parent_proposal_id、提炼态/正本层、双模式（远征/突击）、走查会。
漂移项：见 B1-B3。
缩写与引用：AC12、AGENTS 1.2/1.4/3.1/5.1、§6-§8 为工作区内部惯引，全文用法一致，不判漂移。

---

# 终审复评（多轮增补后整体一致性）

评审对象：`proposal.md`（352 行，多轮裁决增补后版本）。复评口径：术语零漂移 / 机制间一致 / 计数一致 / 新增内容完备 / 图文一致。

## 结论

**不放行（小修后可放行）**。历史清单 A1-A4、B1-B3、C1 已全部消解（核对见附注）；本轮新增问题 4 项：矛盾 2、漂移 1、轻微 1，均为局部修改，不动主体结构。

## D. 本轮问题清单

### D1.【矛盾】derived-to-child 与唯一约束冲突（多子提案场景）
- L136：唯一约束 `(proposal_id, mark, wave_seq)`。
- L94-98：`derived-to-child` 落在源提案 checkpoints，时机 =「派生提案注册时」；L100：纯净表零业务引用字段，子提案身份由 `parent_proposal_id` 承载。
- 冲突：同一源提案派生**多个**改进提案时，需落多行 `derived-to-child`，但 mark 相同且 wave_seq 无定义（非 review-wave 标记应为 NULL）→ 违反唯一约束。且行内无子提案标识，「该提案曾派生改进」无法区分指向哪个子提案——L98 的度量用途「配合 parent_proposal_id 反查」只能查到子提案全集，与逐次落锚的语义脱节。
- 修法二选一：① wave_seq 对 derived-to-child 借用递增（需在 L126 注明语义复用）；② 唯一约束放宽/该标记改一次 性聚合锚（整链一行），并在文中写明多子场景的落行规则。

### D2.【矛盾·覆盖缺口】M2 批次末真机走查会无 AC 覆盖
- L62：走查会 =「批次末显式任务（任务拆解时建，独立于编码任务）」；L300：quick-tasks 同步「M2 走查会显式建任务」。
- AC1-12（L337-348）逐条核对：AC2 只覆盖「待用户裁决清单」段，**无任何 AC 覆盖走查会的建立与执行**。与旧 A4（M4 文档门无 AC）同型缺口，系增补后未回写验收面。
- 修法：AC2 补「涉 UI 批次末走查会作为显式任务存在且裁决即时回写规格」判定项，或新增一条。

### D3.【漂移】erDiagram 实体名 journal 残留
- L115 / L122：实体名 `IMPLEMENTATION_JOURNAL`——旧「journal/流水」命名残留，全文其余 19 处均为 `implementation_checkpoints`（实现检查点流水）。应改为 `IMPLEMENTATION_CHECKPOINTS`（L84 既有正名）。mermaid 图内其余字段与正文实体设计逐列一致，仅此名漂移。

### D4.【轻微】stabilized 自动判定 vs 差值异常出口的优先关系
- L91：stabilized「标记机械自动判定」（48h 零新增）；L258：「checkpoints 差值异常……→ stabilized **不标记**、强制追加专项复盘」。
- 两处可共存（出口覆盖自动判定），但谁优先、由谁判定「差值异常」未写明——机械自动判定与复盘出口的裁决主体冲突未消。建议 L258 补一句判定主体（复盘任务/机械），或注明该出口为 M7 复盘触发的例外路径。

## 附注：历史问题消解核对

| 历史项 | 现状 | 证据 |
|---|---|---|
| A1 收口载体矛盾 | ✅ 消解：merged 标记行=收口凭证，产物引用落 ac_evidence 不入表 | L78、L89、L146 |
| A2 收口时点矛盾 | ✅ 消解：收口前置=复盘已结算（含 AC 硬门），时序图 note 一致 | L78、L159、L185、L229 |
| A3 waves/first-pass 次序 | ✅ 消解：生命周期图 waves「first-pass 前后皆可」 | L152-154 |
| A4 M4 文档门无 AC | ✅ 消解：AC4 补批次末文档门 | L340 |
| B1 收口/first-pass 混用 | ✅ 消解：L14 改用「first-pass」 | L14 |
| B2 review 前置未入图 | ✅ 消解：生命周期图含 Review 节点 | L156-158 |
| B3 派生条件双口径/路径 | ✅ 消解：单口径，全路径 `packages/plugin-forge/src/loop/driver.ts` | L77 |
| C1 机械处数 | ✅ 消解：七处 ①-⑦ 与 §3 落点编号一致 | L255、L305-323 |

## 附注：本轮通过项

- **术语**：checkpoint 体系（implementation_checkpoints / record_impl_checkpoint / query_impl_checkpoint / list_impl_checkpoints / derived-to-child / base_commit_hash）正文、表格、五张 mermaid 图全部统一；无 journal（除 D3）/过程志/marks/打点/spawned 残留；「收口」仅指 merged 终态，约定自守（L78、L163、L185）。
- **机制间**：M5 learn 统一入口（L198）与 AC5（L341）、时序图直写径（L179）一致；M7 同分支默认三处一致（L234、L245、L342）；checkpoints 纯净表在 L84/L89/L100/L146/L230/L233 六处口径一致；M5 复盘前置 review、M7 越阈 AC 硬门、真机查证前置（L243/L256）、覆盖对账①-⑥（L257）相互引用无冲突。
- **计数**：七处机械=①-⑦ 逐项落 §3；标记 5+1；工具三个（L347）；AC 12 条编号连续且各有机制来源（D2 缺口除外）；强制域七类两处一致（L48=L337）；四项硬指标三处一致（L102-107=L219=L342）；三类沉淀、三判例、三技能一致。
- **图文**：stateDiagram / sequenceDiagram / 三张 flowchart / erDiagram 与正文一致（D3 实体名除外）；erDiagram 计数快照列与实体设计逐列对齐。
